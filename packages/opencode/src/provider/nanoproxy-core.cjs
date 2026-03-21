"use strict";

const { randomUUID } = require("node:crypto");

// Marker constants
const TOOL_BLOCK_LABEL = "opencode-tool";
const FINAL_BLOCK_LABEL = "opencode-final";
const TOOL_RESULT_LABEL = "opencode-tool-result";
const TOOL_MODE_MARKER = "[[OPENCODE_TOOL]]";
const FINAL_MODE_MARKER = "[[OPENCODE_FINAL]]";
const TOOL_MODE_END_MARKER = "[[/OPENCODE_TOOL]]";
const FINAL_MODE_END_MARKER = "[[/OPENCODE_FINAL]]";
const CALL_MODE_MARKER = "[[CALL]]";
const CALL_MODE_END_MARKER = "[[/CALL]]";
const MAX_TOOL_CALLS_PER_TURN = 5;

const CALL_MODE_MARKER_ALIASES = ["[CALL]", CALL_MODE_MARKER];
const CALL_MODE_END_MARKER_ALIASES = ["[/CALL]", CALL_MODE_END_MARKER];
const TOOL_MODE_MARKER_ALIASES = ["[OPENCODE_TOOL]", TOOL_MODE_MARKER];
const FINAL_MODE_MARKER_ALIASES = ["[OPENCODE_FINAL]", FINAL_MODE_MARKER];
const TOOL_MODE_END_MARKER_ALIASES = ["[/OPENCODE_TOOL]", TOOL_MODE_END_MARKER];
const FINAL_MODE_END_MARKER_ALIASES = ["[/OPENCODE_FINAL]", FINAL_MODE_END_MARKER];

const LOOSE_TOOL_START_REGEX = /\[?\[{1,2}\s*OPENCODE_TOOLS?\s*\]{1,2}/i;
const LOOSE_TOOL_END_REGEX = /\[?\[{1,2}\s*\/\s*OPENCODE_TOOLS?\s*\]{1,2}/i;
const LOOSE_FINAL_START_REGEX = /\[?\[{1,2}\s*OPENCODE_FINAL\s*\]{1,2}/i;
const LOOSE_FINAL_END_REGEX = /\[?\[{1,2}\s*\/\s*OPENCODE_FINAL\s*\]{1,2}/i;
const LOOSE_CALL_START_REGEX = /\[{1,2}\s*CALL\s*\]{1,2}/i;
const LOOSE_CALL_END_REGEX = /\[{1,2}\s*\/\s*CALL\s*\]{1,2}/i;

// Tracks how many times we've enhanced an edit-not-found error per filePath.
const editRetryEnhanced = new Map();

function getBridgeFlavor(modelId) {
  const lower = String(modelId || "").toLowerCase();
  if (lower.includes("moonshotai/kimi") || lower.includes("kimi-k2.5") || lower.includes("kimi")) {
    return "kimi";
  }
  return "default";
}

function isSingleCallFlavor(flavor) {
  return false;
}


function isEditLikeToolName(name) {
  const lower = String(name || "").toLowerCase();
  return lower === "edit" || lower === "patch";
}
function clone(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

function tryParseJson(text) {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch (error) {
    return { ok: false, error };
  }
}

function closeUnbalancedJson(text) {
  const source = String(text || "");
  const stack = [];
  let inString = false;
  let escaped = false;
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === "\"") inString = false;
      continue;
    }
    if (char === "\"") {
      inString = true;
      continue;
    }
    if (char === "{") stack.push("}");
    else if (char === "[") stack.push("]");
    else if ((char === "}" || char === "]") && stack.length > 0 && stack[stack.length - 1] === char) stack.pop();
  }
  return source + stack.reverse().join("");
}

function escapeRawControlCharsInStrings(text) {
  const source = String(text || "");
  let out = "";
  let inString = false;
  let escaped = false;

  for (let i = 0; i < source.length; i++) {
    const char = source[i];

    if (inString) {
      if (escaped) {
        out += char;
        escaped = false;
        continue;
      }

      if (char === "\\") {
        out += char;
        escaped = true;
        continue;
      }

      if (char === "\"") {
        out += char;
        inString = false;
        continue;
      }

      if (char === "\n") {
        out += "\\n";
        continue;
      }

      if (char === "\r") {
        out += "\\r";
        continue;
      }

      if (char === "\t") {
        out += "\\t";
        continue;
      }

      out += char;
      continue;
    }

    if (char === "\"") {
      inString = true;
    }
    out += char;
  }

  return out;
}

function tryParseJsonLenient(text) {
  const direct = tryParseJson(text);
  if (direct.ok) return direct;

  const sanitized = escapeRawControlCharsInStrings(text);
  if (sanitized !== text) {
    const reparsed = tryParseJson(sanitized);
    if (reparsed.ok) return reparsed;
  }

  const closed = closeUnbalancedJson(sanitized);
  if (closed !== sanitized) {
    const reparsedClosed = tryParseJson(closed);
    if (reparsedClosed.ok) return reparsedClosed;
  }

  return direct;
}

function repairInvalidJsonEscapesInStrings(text) {
  const source = String(text || "");
  let out = "";
  let inString = false;
  let escaped = false;

  for (let i = 0; i < source.length; i++) {
    const char = source[i];

    if (inString) {
      if (escaped) {
        out += char;
        escaped = false;
        continue;
      }

      if (char === "\\") {
        const next = source[i + 1];
        if (next === undefined) {
          out += "\\\\";
          continue;
        }
        if ('"\\/bfnrtu'.includes(next)) {
          out += char;
          escaped = true;
          continue;
        }
        out += "\\\\";
        continue;
      }

      if (char === "\"") {
        out += char;
        inString = false;
        continue;
      }

      out += char;
      continue;
    }

    if (char === "\"") inString = true;
    out += char;
  }

  return out;
}

function decodeJsonStringLiteral(value) {
  try {
    return JSON.parse(`"${String(value || "").replace(/\\/g, "\\\\").replace(/"/g, "\\\"")}"`);
  } catch {
    return String(value || "");
  }
}

function normalizeJsonString(value) {
  if (typeof value === "string") {
    const parsed = tryParseJsonLenient(value);
    return parsed.ok ? JSON.stringify(parsed.value) : value;
  }
  if (value === undefined) return "{}";
  return JSON.stringify(value);
}

function decodeBase64ToolArgs(args) {
  if (!args || typeof args !== "object") return args;
  const mappings = [
    ["command_b64", "command"],
    ["content_b64", "content"],
    ["oldString_b64", "oldString"],
    ["newString_b64", "newString"]
  ];
  let next = args;
  let changed = false;

  for (const [encodedKey, plainKey] of mappings) {
    if (typeof next[plainKey] === "string") continue;
    if (typeof next[encodedKey] !== "string") continue;
    const clean = next[encodedKey].replace(/\s+/g, "");
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(clean)) continue;
    if (clean.length % 4 !== 0) continue;
    let decoded = null;
    try {
      decoded = Buffer.from(clean, "base64").toString("utf8");
    } catch {
      continue;
    }
    if (decoded === null) continue;
    if (!changed) next = { ...next };
    next[plainKey] = decoded;
    delete next[encodedKey];
    changed = true;
  }

  return next;
}

function extractBalancedSegment(text, startIndex, openChar, closeChar) {
  const source = String(text || "");
  if (startIndex < 0 || source[startIndex] !== openChar) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = startIndex; i < source.length; i++) {
    const char = source[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === "\"") inString = false;
      continue;
    }
    if (char === "\"") {
      inString = true;
      continue;
    }
    if (char === openChar) depth++;
    else if (char === closeChar) {
      depth--;
      if (depth === 0) return source.slice(startIndex, i + 1);
    }
  }
  return null;
}

function salvageTodowriteArguments(argumentsText) {
  const todosMatch = /"todos"\s*:\s*\[([\s\S]*?)\]/.exec(String(argumentsText || ""));
  if (!todosMatch) return null;
  const todos = [];
  const itemRegex = /"content"\s*:\s*"((?:\\.|[^"\\])*)"\s*,\s*"status"\s*:\s*"((?:\\.|[^"\\])*)"\s*,\s*"priority"\s*:\s*"((?:\\.|[^"\\])*)"/g;
  let match;
  while ((match = itemRegex.exec(todosMatch[1])) !== null) {
    todos.push({
      content: decodeJsonStringLiteral(match[1]),
      status: decodeJsonStringLiteral(match[2]),
      priority: decodeJsonStringLiteral(match[3])
    });
  }
  return todos.length > 0 ? { todos } : null;
}

function salvageMalformedToolCalls(text) {
  const source = String(text || "");
  const calls = [];
  const nameRegex = /"name"\s*:\s*"([^"]+)"/g;
  let nameMatch;
  while ((nameMatch = nameRegex.exec(source)) !== null) {
    const name = nameMatch[1];
    const tail = source.slice(nameMatch.index);
    const nextNameOffset = tail.slice(1).search(/"name"\s*:\s*"/);
    const scope = nextNameOffset === -1 ? tail : tail.slice(0, nextNameOffset + 1);
    const argsMatch = /"arguments"\s*:\s*/.exec(scope);
    let argsValue = {};
    if (argsMatch) {
      const valueStart = argsMatch.index + argsMatch[0].length;
      const firstChar = scope[valueStart];
      if (firstChar === "{") {
        const argsObjectText = extractBalancedSegment(scope, valueStart, "{", "}") || closeUnbalancedJson(scope.slice(valueStart));
        const parsedArgs = tryParseJsonLenient(argsObjectText);
        if (parsedArgs.ok) {
          argsValue = parsedArgs.value;
        } else if (name === "todowrite") {
          const salvaged = salvageTodowriteArguments(argsObjectText);
          if (salvaged) argsValue = salvaged;
          else continue;
        } else {
          continue;
        }
      } else if (firstChar === "[") {
        const argsArrayText = extractBalancedSegment(scope, valueStart, "[", "]") || closeUnbalancedJson(scope.slice(valueStart));
        const parsedArgs = tryParseJsonLenient(argsArrayText);
        if (!parsedArgs.ok) continue;
        argsValue = parsedArgs.value;
      }
    }
    calls.push({ name, arguments: argsValue });
  }
  return calls.length > 0 ? calls : null;
}

function bestEffortParseToolPayload(text, options = {}) {
  const source = String(text || "").trim();
  const wrappedSource = /^[{\[]/.test(source) ? source : `{${source}}`;
  const extractToolCallsFromParsedValue = (value) => {
    if (!value || typeof value !== "object") return null;
    const normalized = normalizeEmbeddedPayloadShape(value);
    if (!normalized) return null;
    const rawCalls = Array.isArray(normalized.tool_calls)
      ? normalized.tool_calls
      : (normalized.tool_calls && typeof normalized.tool_calls === "object" ? [normalized.tool_calls] : [])
        .concat(normalized.name ? [normalized] : []);
    const toolCalls = normalizeParsedToolCalls(rawCalls, options);
    return toolCalls.length > 0 ? toolCalls : null;
  };

  const parsed = tryParseJsonLenient(source);
  if (parsed.ok && parsed.value && typeof parsed.value === "object") {
    const toolCalls = extractToolCallsFromParsedValue(parsed.value);
    if (toolCalls) return toolCalls;
  }

  if (wrappedSource !== source) {
    const wrappedParsed = tryParseJsonLenient(wrappedSource);
    if (wrappedParsed.ok && wrappedParsed.value && typeof wrappedParsed.value === "object") {
      const toolCalls = extractToolCallsFromParsedValue(wrappedParsed.value);
      if (toolCalls) return toolCalls;
    }
  }

  const parsedClosed = tryParseJsonLenient(closeUnbalancedJson(source));
  if (parsedClosed.ok && parsedClosed.value && typeof parsedClosed.value === "object") {
    const toolCalls = extractToolCallsFromParsedValue(parsedClosed.value);
    if (toolCalls) return toolCalls;
  }

  const repairedTransport = repairInvalidJsonEscapesInStrings(escapeRawControlCharsInStrings(source));
  if (repairedTransport !== source) {
    const repairedParsed = tryParseJson(closeUnbalancedJson(repairedTransport));
    if (repairedParsed.ok && repairedParsed.value && typeof repairedParsed.value === "object") {
      const toolCalls = extractToolCallsFromParsedValue(repairedParsed.value);
      if (toolCalls) return toolCalls;
    }
  }
  const normalized = parseEmbeddedJsonPayload(text);
  if (normalized && (Array.isArray(normalized.tool_calls) || typeof normalized.name === "string")) {
    const rawCalls = Array.isArray(normalized.tool_calls) ? normalized.tool_calls : [normalized];
    const toolCalls = normalizeParsedToolCalls(rawCalls, options);
    if (toolCalls.length > 0) return toolCalls;
  }
  const salvagedCalls = salvageMalformedToolCalls(text);
  if (salvagedCalls) {
    const toolCalls = normalizeParsedToolCalls(salvagedCalls, options);
    if (toolCalls.length > 0) return toolCalls;
  }
  return null;
}

function looksLikeBridgeText(text) {
  return /\[\[\s*\/?\s*OPENCODE_(TOOL|FINAL)\s*\]\]/i.test(text)
    || /\[\[\s*\/?\s*CALL\s*\]\]/i.test(text);
}

function looksLikeToolPayload(text) {
  const trimmed = String(text || "").trim();
  if (!trimmed) return false;
  if (!(trimmed.startsWith("{") || trimmed.startsWith("["))) return false;
  const parsed = tryParseJson(trimmed);
  if (!parsed.ok) return false;
  const value = parsed.value;
  if (Array.isArray(value?.tool_calls) && value.tool_calls.length > 0) return true;
  if (value && typeof value === "object" && typeof value.name === "string" && Object.prototype.hasOwnProperty.call(value, "arguments")) return true;
  return false;
}

function shouldFallbackFromNativeText(text, finishReason) {
  const content = contentPartsToText(text).trim();
  if (finishReason === "tool_calls") return true;
  if (!content) return true;
  if (looksLikeBridgeText(content)) return true;
  if (looksLikeToolPayload(content)) return true;
  return false;
}

function acceptNativeJson(status, payload) {
  if (status < 200 || status >= 300) return false;
  const choice = Array.isArray(payload?.choices) ? payload.choices[0] : null;
  if (!choice) return false;
  const message = choice?.message && typeof choice.message === "object" ? choice.message : {};
  if (Array.isArray(message.tool_calls) && message.tool_calls.length > 0) return true;
  return !shouldFallbackFromNativeText(message.content, choice?.finish_reason ?? null);
}

function acceptNativeSSE(status, streamText) {
  if (status < 200 || status >= 300) return false;
  const aggregate = { content: "", finishReason: null, nativeToolCallsSeen: false };
  const events = String(streamText || "").split(/\n\n+/);
  for (const eventText of events) {
    const data = eventText
      .split(/\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart())
      .join("\n")
      .trim();
    if (!data || data === "[DONE]") continue;
    const parsed = tryParseJson(data);
    if (!parsed.ok) continue;
    
    const choice = Array.isArray(parsed.value?.choices) ? parsed.value.choices[0] : null;
    if (!choice || typeof choice !== "object") continue;
    const delta = choice?.delta && typeof choice.delta === "object" ? choice.delta : {};
    if (Array.isArray(delta.tool_calls) && delta.tool_calls.length > 0) aggregate.nativeToolCallsSeen = true;
    if (Array.isArray(choice?.message?.tool_calls) && choice.message.tool_calls.length > 0) aggregate.nativeToolCallsSeen = true;
    if (delta.content !== undefined) aggregate.content += contentPartsToText(delta.content);
    if (choice?.message?.content !== undefined) aggregate.content += contentPartsToText(choice.message.content);
    if (choice?.finish_reason !== undefined && choice.finish_reason !== null) aggregate.finishReason = choice.finish_reason;
  }
  if (aggregate.nativeToolCallsSeen) return true;
  return !shouldFallbackFromNativeText(aggregate.content, aggregate.finishReason);
}

function modelNeedsBridge(modelId) {
  if (process.env.BRIDGE_MODELS === undefined) {
    return true;
  }
  
  if (process.env.BRIDGE_MODELS.trim() === "") {
    return false;
  }

  const allowlist = process.env.BRIDGE_MODELS.split(",").map(m => m.trim().toLowerCase()).filter(Boolean);
  const lower = String(modelId || "").toLowerCase();
  return allowlist.some(m => lower.includes(m));
}

function requestNeedsBridge(body) {
  return !!(
    body &&
    typeof body === "object" &&
    Array.isArray(body.tools) &&
    body.tools.length > 0 &&
    modelNeedsBridge(body.model)
  );
}

function normalizeToolDefinition(tool, index) {
  const changes = [];
  if (!tool || typeof tool !== "object") return { value: tool, changes };

  const out = clone(tool);
  if (!out.function && out.name) {
    out.type = "function";
    out.function = {
      name: out.name,
      description: out.description || "",
      parameters: out.parameters || { type: "object", properties: {} }
    };
    delete out.name;
    delete out.description;
    delete out.parameters;
    changes.push(`tools[${index}] wrapped into function shape`);
  }

  if (out.function && out.function.input_schema && !out.function.parameters) {
    out.function.parameters = out.function.input_schema;
    delete out.function.input_schema;
    changes.push(`tools[${index}].function.input_schema -> parameters`);
  }

  return { value: out, changes };
}

function normalizeTools(tools) {
  const changes = [];
  const normalized = (tools || []).map((tool, index) => {
    const item = normalizeToolDefinition(tool, index);
    changes.push(...item.changes);
    return item.value;
  });
  return { tools: normalized, changes };
}

function compactToolCatalog(tools) {
  return tools.map((tool) => ({
    name: tool.function.name,
    description: tool.function.description || "",
    parameters: compactSchema(tool.function.parameters || { type: "object", properties: {} })
  }));
}

function buildToolArgumentKeyMap(tools) {
  const map = new Map();
  for (const tool of tools || []) {
    const name = String(tool?.function?.name || "").trim().toLowerCase();
    if (!name) continue;
    const props = tool?.function?.parameters && typeof tool.function.parameters === "object"
      ? tool.function.parameters.properties
      : null;
    const keys = props && typeof props === "object" && !Array.isArray(props)
      ? Object.keys(props)
      : [];
    map.set(name, new Set(keys));
  }
  return map;
}

function buildToolRequiredKeyMap(tools) {
  const map = new Map();
  for (const tool of tools || []) {
    const name = String(tool?.function?.name || "").trim().toLowerCase();
    if (!name) continue;
    const required = tool?.function?.parameters && typeof tool.function.parameters === "object" && Array.isArray(tool.function.parameters.required)
      ? tool.function.parameters.required
      : [];
    map.set(name, new Set(required));
  }
  return map;
}

function getBridgePromptCapabilities(tools) {
  const toolArgKeyMap = buildToolArgumentKeyMap(tools);
  const allKeys = new Set();
  for (const keySet of toolArgKeyMap.values()) {
    for (const key of keySet) allKeys.add(key);
  }
  const hasAny = (...keys) => keys.some((key) => allKeys.has(key));
  const filePathKey = hasAny("filePath", "file_path", "filepath", "filename", "file", "path");

  return {
    hasCommandArg: hasAny("command"),
    hasContentArg: hasAny("content"),
    hasOldStringArg: hasAny("oldString", "old_string", "oldText", "old_text"),
    hasNewStringArg: hasAny("newString", "new_string", "newText", "new_text"),
    hasAnyFilePathArg: filePathKey
  };
}
function compactSchema(schema, depth = 0) {
  if (!schema || typeof schema !== "object") return { type: "object" };

  const out = {};

  if (typeof schema.type === "string") out.type = schema.type;
  if (typeof schema.description === "string" && schema.description.length > 0) out.description = schema.description.slice(0, 200);
  if (Array.isArray(schema.required) && schema.required.length > 0) out.required = schema.required;
  if (Array.isArray(schema.enum) && schema.enum.length > 0) out.enum = schema.enum.slice(0, 20);

  if (schema.properties && typeof schema.properties === "object") {
    out.properties = {};
    for (const [key, value] of Object.entries(schema.properties)) {
      out.properties[key] = compactSchema(value, depth + 1);
    }
  }

  if (schema.items) {
    out.items = compactSchema(schema.items, depth + 1);
  }

  if (Array.isArray(schema.anyOf) && schema.anyOf.length > 0 && depth < 2) {
    out.anyOf = schema.anyOf.slice(0, 4).map((entry) => compactSchema(entry, depth + 1));
  }

  if (Array.isArray(schema.oneOf) && schema.oneOf.length > 0 && depth < 2) {
    out.oneOf = schema.oneOf.slice(0, 4).map((entry) => compactSchema(entry, depth + 1));
  }

  if (Array.isArray(schema.allOf) && schema.allOf.length > 0 && depth < 2) {
    out.allOf = schema.allOf.slice(0, 4).map((entry) => compactSchema(entry, depth + 1));
  }

  if (typeof schema.additionalProperties === "boolean") {
    out.additionalProperties = schema.additionalProperties;
  }

  if (!out.type && !out.properties && !out.items && !out.anyOf && !out.oneOf && !out.allOf) {
    out.type = "object";
  }

  return out;
}

function contentPartsToText(content) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        if (part && typeof part === "object") {
          if (typeof part.text === "string") return part.text;
          if (typeof part.content === "string") return part.content;
        }
        return "";
      })
      .filter(Boolean)
      .join("");
  }
  if (content && typeof content === "object") {
    if (typeof content.text === "string") return content.text;
    if (typeof content.content === "string") return content.content;
  }
  return "";
}

function isEmptyBridgeStopAggregate(aggregate) {
  if (!aggregate || aggregate.finishReason !== "stop") return false;
  return !String(aggregate.reasoning || "").trim() && !String(aggregate.content || "").trim();
}

function buildEmptyStopRecoveryRequest(upstreamRequest) {
  const rewritten = clone(upstreamRequest) || {};
  const messages = Array.isArray(rewritten.messages) ? rewritten.messages.slice() : [];
  messages.push({
    role: "user",
    content: [
      "Your previous reply was empty.",
      "Continue from the current task immediately.",
      `Reply using ${TOOL_MODE_MARKER} ... ${TOOL_MODE_END_MARKER} or ${FINAL_MODE_MARKER} ... ${FINAL_MODE_END_MARKER}.`,
      "Do not return an empty response."
    ].join("\n")
  });
  rewritten.messages = messages;
  return rewritten;
}

function encodeToolCallsBlock(toolCalls, flavor = "default") {
  const callBlocks = toolCalls.map((call) => {
    const parsedArgs = typeof call.function.arguments === "string"
      ? (tryParseJson(call.function.arguments).ok ? tryParseJson(call.function.arguments).value : call.function.arguments)
      : (call.function.arguments || {});
    const payload = { name: call.function.name, arguments: parsedArgs };
    return [
      CALL_MODE_MARKER,
      JSON.stringify(payload, null, 2),
      CALL_MODE_END_MARKER
    ].join("\n");
  });
  return [
    TOOL_MODE_MARKER,
    ...callBlocks,
    TOOL_MODE_END_MARKER
  ].join("\n");
}

function encodeToolResultBlock(message, flavor = "default", toolNames = []) {
  const nextStepRule = isSingleCallFlavor(flavor)
    ? "Reply with exactly one CALL block inside one tool envelope, or one final envelope. Do not batch multiple tool calls in one reply."
    : `If more than one independent tool call is needed, include multiple CALL blocks (up to ${MAX_TOOL_CALLS_PER_TURN} maximum). Do not exceed ${MAX_TOOL_CALLS_PER_TURN} CALL blocks in one reply.`;
  const hasTodo = toolNames.includes("todowrite");
  const rawContent = contentPartsToText(message.content);

  let editRecoveryHint = null;
  if (
    isEditLikeToolName(message.name) &&
    /old.*string.*not found|string to replace|no match|does not contain|oldstring|old_string.*does not|cannot find old/i.test(rawContent)
  ) {
    const retryKey = message.tool_call_id || "";
    const alreadyEnhanced = editRetryEnhanced.get(retryKey);
    if (!alreadyEnhanced) {
      editRetryEnhanced.set(retryKey, true);
      if (editRetryEnhanced.size > 200) {
        const firstKey = editRetryEnhanced.keys().next().value;
        editRetryEnhanced.delete(firstKey);
      }
      editRecoveryHint = [
        "",
        "[EDIT FAILED — oldString mismatch]",
        "The `oldString` you provided does not exist verbatim in the file. This is your one automatic recovery hint:",
        "1. Use the appropriate file-reading tool to re-read the file and fetch its CURRENT exact content.",
        "2. Locate the text you want to change and copy it character-for-character, including all whitespace, comment markers (/* */), and punctuation.",
        "3. Retry the appropriate file-editing call with that exact `oldString`. Do not reconstruct it from memory.",
      ].join("\n");
    }
  }

  const payload = {
    tool_call_id: message.tool_call_id || "",
    content: rawContent
  };
  return [
    "",
    "",
    `\`\`\`${TOOL_RESULT_LABEL}`,
    JSON.stringify(payload, null, 2),
    "```",
    editRecoveryHint,
    "",
    "Continue from this tool result.",
    `Your next reply must use exactly one of these formats: ${TOOL_MODE_MARKER} ... ${TOOL_MODE_END_MARKER} or ${FINAL_MODE_MARKER} ... ${FINAL_MODE_END_MARKER}.`,
    `For tool use, only use ${CALL_MODE_MARKER} ... ${CALL_MODE_END_MARKER} blocks inside ${TOOL_MODE_MARKER}.`,
    isSingleCallFlavor(flavor)
      ? `Always include the outer ${TOOL_MODE_MARKER} ... ${TOOL_MODE_END_MARKER} wrapper.`
      : null,
    "Do not narrate the next step in plain text.",
    "Do not say what you are about to do.",
    "For file-editing calls, oldString must include enough unique surrounding context to match exactly one location.",
    "If an edit could match multiple places, read more context first and then send a larger oldString.",
    "Do not use legacy forms like [toolname] { ... } or raw tool_calls JSON unless recovery is needed.",
    nextStepRule,
    hasTodo ? "For complex features, remember to update your structured plan using the todowrite tool as needed." : null,
    toolNames.includes("task") ? "If this result is from a subagent you launched via the 'task' tool, DO NOT duplicate its work. Trust its summary and proceed to the next step of your plan." : null,
    "If a required detail is genuinely missing or the user must choose between materially different options, prefer the appropriate clarification tool instead of guessing."
  ].filter(Boolean).join("\n");
}

function encodeUserMessageForBridge(content, options = {}) {
  const text = typeof content === "string" ? content : "";
  const firstTurn = Boolean(options.firstTurn);
  const flavor = options.flavor || "default";
  const tools = Array.isArray(options.tools) ? options.tools : [];
  const toolNames = options.toolNames || [];
  const capabilities = getBridgePromptCapabilities(tools);
  const hasTodo = toolNames.includes("todowrite");
  const hasTask = toolNames.includes("task");
  const toolListLine = toolNames.length
    ? `- Available tool names: ${toolNames.join(", ")}`
    : null;
  const callCountRule = isSingleCallFlavor(flavor)
    ? `- Use exactly one ${CALL_MODE_MARKER} block per reply.`
    : `- If several independent operations are immediately needed, you may include multiple ${CALL_MODE_MARKER} blocks in the same tool envelope.`;

  const planningHint = firstTurn
    ? (hasTodo && hasTask
      ? "- If this is a complex task, start by creating a step-by-step plan using the todowrite tool. The 'task' tool is available for genuinely independent subtasks, but prefer doing the work directly."
      : hasTodo
        ? "- If this is a complex task, start by creating a step-by-step todo plan using the todowrite tool. Otherwise, act directly on the task."
        : hasTask
          ? "- Act directly on the task. The 'task' tool is available if a subtask is truly independent."
          : "- Act directly on the task instead of answering with a generic greeting.")
    : (hasTodo
      ? "- Continue with the next concrete action. For complex features, update your structured plan using the todowrite tool as needed."
      : "- Continue with the next concrete action, not a narration step.");

  const taskExample = hasTask
    ? `\n- If you use the 'task' tool, example format: {"name":"task","arguments":{"description":"Write tests for auth.ts","prompt":"Create unit tests for the auth middleware covering edge cases","subagent_type":"general"}}`
    : "";

  return [
    text,
    "",
    "Protocol requirements for your next reply:",
    `- Start with ${TOOL_MODE_MARKER} or ${FINAL_MODE_MARKER}.`,
    `- If you need to inspect, search, read, edit, write, run commands, or plan work, reply with ${TOOL_MODE_MARKER}.`,
    `- Always include the outer ${TOOL_MODE_MARKER} ... ${TOOL_MODE_END_MARKER} wrapper for tool use.`,
    `- Inside ${TOOL_MODE_MARKER}, only use ${CALL_MODE_MARKER} JSON ${CALL_MODE_END_MARKER}.`,
    callCountRule,
    `- If you emit multiple ${CALL_MODE_MARKER} blocks, finish the current CALL JSON object completely before starting the next ${CALL_MODE_MARKER}.`,
    isSingleCallFlavor(flavor)
      ? `- Do not output a second ${CALL_MODE_MARKER} until the first tool result comes back.`
      : null,
    "- For file-editing calls, use an oldString with enough unique surrounding context to match exactly one place.",
    "- If a file-editing target is ambiguous, use the appropriate file-reading tool first instead of guessing a short oldString.",
    "- If you genuinely need clarification before acting, prefer the appropriate clarification tool instead of guessing.",
    "- Do not use [toolname] or any other bracketed legacy tool format.",
    "- Do not narrate what you are about to do in plain text.",
    `- If you are about to inspect, search, read, edit, write, run commands, or fix something, you must use ${TOOL_MODE_MARKER} instead of prose.`,
    capabilities.hasCommandArg
      ? "- For tools that accept a `command` field, prefer `command_b64` (base64 UTF-8) instead of raw `command` when quoting or escaping could be fragile."
      : null,
    (capabilities.hasContentArg || capabilities.hasOldStringArg || capabilities.hasNewStringArg)
      ? "- Only for tools whose schema actually includes these fields: if `content`, `oldString`, or `newString` is multi-line or contains many backslashes, regexes, or code, prefer `content_b64`, `oldString_b64`, or `newString_b64` (base64 UTF-8)."
      : null,
    capabilities.hasAnyFilePathArg
      ? "- For tools that take file paths, always use workspace-relative paths (like `src/file.js`). Never use absolute paths like `C:/...`, `C:\\...`, or `/...`."
      : null,
    toolListLine,
    planningHint,
    taskExample
  ].filter(Boolean).join("\n");
}

function buildBridgeSystemMessage(tools, flavor = "default") {
  const catalog = compactToolCatalog(tools);
  const toolNames = tools.map(t => t.function?.name).filter(Boolean);
  const capabilities = getBridgePromptCapabilities(tools);
  const buildExampleArgs = (schema, depth = 0) => {
    if (!schema || typeof schema !== "object") return { example: true };
    if (depth > 2) return {};
    if (schema.type && schema.type !== "object") return { example: true };
    const props = schema.properties && typeof schema.properties === "object" ? schema.properties : {};
    const required = Array.isArray(schema.required) ? schema.required : [];
    const keys = required.length ? required : Object.keys(props).slice(0, 1);
    const out = {};
    for (const key of keys) {
      const prop = props[key];
      if (prop && typeof prop === "object") {
        if (prop.type === "object") out[key] = buildExampleArgs(prop, depth + 1);
        else if (prop.type === "number" || prop.type === "integer") out[key] = 1;
        else if (prop.type === "boolean") out[key] = true;
        else if (Array.isArray(prop.enum) && prop.enum.length > 0) out[key] = prop.enum[0];
        else out[key] = "example";
      } else {
        out[key] = "example";
      }
    }
    return Object.keys(out).length ? out : { example: true };
  };
  const exampleTool = tools.find(t => t && t.function && typeof t.function.name === "string");
  const exampleToolName = exampleTool?.function?.name || "tool";
  const exampleArgs = buildExampleArgs(exampleTool?.function?.parameters);
  const callExample = { name: exampleToolName, arguments: exampleArgs };
  const callCountRule = isSingleCallFlavor(flavor)
    ? "- Emit exactly one CALL block per tool reply."
    : `- You may batch up to ${MAX_TOOL_CALLS_PER_TURN} independent tool calls per reply. Never emit more than ${MAX_TOOL_CALLS_PER_TURN} CALL blocks. If you need more than ${MAX_TOOL_CALLS_PER_TURN}, do the first ${MAX_TOOL_CALLS_PER_TURN} now and continue after results arrive.`;
  return [
    "Tool bridge mode is enabled.",
    "The upstream provider's native tool calling is disabled for this request.",
    "Your highest priority is protocol compliance.",
    "Only two reply formats are valid.",
    "Do not place tool markers or CALL blocks inside reasoning.",
    `1. Tool format: ${TOOL_MODE_MARKER} ... ${TOOL_MODE_END_MARKER}`,
    `2. Final format: ${FINAL_MODE_MARKER} ... ${FINAL_MODE_END_MARKER}`,
    "Do not output anything before the opening marker.",
    "When you want to use a tool, do not answer in normal prose.",
    `If you are about to inspect, search, read, edit, write, run commands, or fix something, you must use ${TOOL_MODE_MARKER} instead of prose.`,
    "Tool format example:",
    TOOL_MODE_MARKER,
    CALL_MODE_MARKER,
    JSON.stringify(callExample, null, 2),
    CALL_MODE_END_MARKER,
    TOOL_MODE_END_MARKER,
    isSingleCallFlavor(flavor)
      ? "Inside the tool envelope, emit exactly one CALL block. Each CALL block contains one tool call as JSON."
      : "Inside the tool envelope, emit one or more CALL blocks. Each CALL block contains one tool call as JSON.",
    "Rules for tool use:",
    `- Output ${TOOL_MODE_MARKER} first and ${TOOL_MODE_END_MARKER} last.`,
    `- For each tool call, wrap it in ${CALL_MODE_MARKER} and ${CALL_MODE_END_MARKER}.`,
    `- If you emit multiple ${CALL_MODE_MARKER} blocks, fully finish one CALL's JSON object before opening the next ${CALL_MODE_MARKER}.`,
    "- Do not use markdown code fences for tool replies.",
    "- Do not write any explanatory prose before, inside, or after the tool envelope.",
    "- Do not use legacy bracketed formats like [toolname].",
    "- Do not output raw tool_calls JSON unless recovery is needed; CALL blocks are the required format.",
    "- Never invent tool names. Use one of the listed tool names exactly as provided.",
    "- Each CALL JSON object must use name and arguments. Do not use tool_name/tool_input.",
    capabilities.hasCommandArg
      ? "- Only for tools whose schema includes `command`: prefer `command_b64` (base64 UTF-8) instead of raw `command` when quoting or escaping could be fragile."
      : null,
    (capabilities.hasContentArg || capabilities.hasOldStringArg || capabilities.hasNewStringArg)
      ? "- Only for tools whose schema actually includes these fields: if `content`, `oldString`, or `newString` is multi-line or contains many backslashes, regexes, or code, you may use `content_b64`, `oldString_b64`, or `newString_b64` (base64 UTF-8)."
      : null,
    capabilities.hasAnyFilePathArg
      ? "- For tools that take file paths, always use workspace-relative paths (like `src/file.js`). Never use absolute paths like `C:/...`, `C:\\...`, or `/...`."
      : null,
    callCountRule,
    isSingleCallFlavor(flavor)
      ? `- Do not emit ${CALL_MODE_MARKER} without first emitting ${TOOL_MODE_MARKER}.`
      : null,
    "- If sequencing matters, emit only the next required tool call.",
    "- For file-editing calls, oldString must be unique in the target file. Include enough surrounding context to identify one location.",
    "- If a file-editing call would likely match multiple locations, use the appropriate file-reading tool first and then retry with a larger oldString.",
    "- If important clarification is missing, use the appropriate clarification tool instead of inventing requirements.",
    isSingleCallFlavor(flavor)
      ? "- After each tool result, decide the next single tool call or final answer."
      : "- After each tool result, decide the next tool call or CALL batch.",
    toolNames.includes("task") ? "- If you use the 'task' tool, YOU MUST provide both `prompt` and `subagent_type` parameters." : null,
    toolNames.includes("todowrite") ? "- For complex tasks, use the todowrite tool to maintain a structured plan for the code you write directly." : null,
    "- Use tool names exactly as listed.",
    "- arguments must be a valid JSON object.",
    "- The old tool_calls array JSON shape is still accepted only as a compatibility fallback. Prefer CALL blocks.",
    "Invalid response example:",
    "I will inspect the codebase first.",
    "Also invalid:",
    "[toolname] { ... }",
    "{\"tool_calls\":[...]}",
    "Valid response example:",
    TOOL_MODE_MARKER,
    CALL_MODE_MARKER,
    JSON.stringify(callExample, null, 2),
    CALL_MODE_END_MARKER,
    TOOL_MODE_END_MARKER,
    ...(!isSingleCallFlavor(flavor) ? [
      "Valid multi-tool example:",
      TOOL_MODE_MARKER,
      CALL_MODE_MARKER,
      JSON.stringify(callExample, null, 2),
      CALL_MODE_END_MARKER,
      CALL_MODE_MARKER,
      JSON.stringify(callExample, null, 2),
      CALL_MODE_END_MARKER,
      TOOL_MODE_END_MARKER
    ] : []),
    `If you are giving a final answer to the user and no tool is needed, use this exact envelope:`,
    FINAL_MODE_MARKER,
    "Your final answer text goes here.",
    FINAL_MODE_END_MARKER,
    "Rules for final answers:",
    `- Output ${FINAL_MODE_MARKER} first and ${FINAL_MODE_END_MARKER} last.`,
    "- Do not use markdown or JSON for final answers.",
    "- Do not use JSON for final answers unless explicitly required.",
    "- Do not mix normal prose before either marker.",
    "Available tools:",
    JSON.stringify(catalog, null, 2)
  ].filter(Boolean).join("\n\n");
}

function translateMessagesForBridge(messages, tools, modelId) {
  const out = [];
  let bridgeInserted = false;
  let firstUserSeen = false;
  const flavor = getBridgeFlavor(modelId);
  const toolNames = (tools || []).map(t => t.function?.name).filter(Boolean);
  const bridgeSystem = { role: "system", content: buildBridgeSystemMessage(tools, flavor) };

  for (const message of messages || []) {
    if (message.role === "system") {
      out.push({ role: "system", content: contentPartsToText(message.content) });
      continue;
    }

    if (!bridgeInserted) {
      out.push(bridgeSystem);
      bridgeInserted = true;
    }

    if (message.role === "assistant") {
      if (Array.isArray(message.tool_calls) && message.tool_calls.length > 0) {
        out.push({ role: "assistant", content: encodeToolCallsBlock(message.tool_calls, flavor).trim() });
        continue;
      }

      const content = contentPartsToText(message.content);
      const reasoning = typeof message.reasoning_content === "string" ? message.reasoning_content : "";
      out.push({ role: "assistant", content: content || reasoning || "" });
      continue;
    }

    if (message.role === "tool") {
      out.push({ role: "user", content: encodeToolResultBlock(message, flavor, toolNames).trim() });
      continue;
    }

    if (message.role === "user") {
      out.push({
        role: "user",
        content: encodeUserMessageForBridge(contentPartsToText(message.content), { firstTurn: !firstUserSeen, flavor, toolNames, tools })
      });
      firstUserSeen = true;
      continue;
    }

    out.push({ role: message.role, content: contentPartsToText(message.content) });
  }

  if (!bridgeInserted) {
    out.unshift(bridgeSystem);
  }

  return out;
}
function transformRequestForBridge(body, options = {}) {
  const rewritten = clone(body);
  const changes = [];
  const forceBridge = !!options.forceBridge;

  if (!forceBridge && !requestNeedsBridge(rewritten)) {
    return { rewritten, changes, bridgeApplied: false, normalizedTools: [] };
  }

  const normalized = normalizeTools(rewritten.tools);
  changes.push(...normalized.changes);
  rewritten.messages = translateMessagesForBridge(rewritten.messages, normalized.tools, rewritten.model);
  rewritten.tool_choice = undefined;
  rewritten.parallel_tool_calls = undefined;
  if (typeof rewritten.temperature !== "number" || rewritten.temperature > 0.2) {
    rewritten.temperature = 0.2;
    changes.push("temperature capped for bridge compliance");
  }
  if (typeof rewritten.top_p !== "number" || rewritten.top_p > 0.3) {
    rewritten.top_p = 0.3;
    changes.push("top_p capped for bridge compliance");
  }
  delete rewritten.tools;
  delete rewritten.tool_choice;
  delete rewritten.parallel_tool_calls;
  changes.push("tool bridge applied");
  changes.push("native tools removed from upstream request");
  changes.push("bridge system message injected");
  if (forceBridge) {
    changes.push("bridge forced after native-first fallback");
  }

  return {
    rewritten,
    changes,
    bridgeApplied: true,
    normalizedTools: normalized.tools
  };
}

function generateToolCallId() {
  return `call_${randomUUID().replace(/-/g, "").slice(0, 24)}`;
}

function extractFencedBlock(text, label) {
  const regex = new RegExp("```" + label + "\\s*([\\s\\S]*?)```", "i");
  const match = regex.exec(text || "");
  return match ? match[1].trim() : null;
}

function extractAnyFencedBlocks(text) {
  const source = String(text || "");
  const blocks = [];
  const regex = /```([a-zA-Z0-9_-]+)?\s*([\s\S]*?)```/g;
  let match;
  while ((match = regex.exec(source)) !== null) {
    blocks.push({
      label: (match[1] || "").trim().toLowerCase(),
      content: (match[2] || "").trim()
    });
  }
  return blocks;
}

function extractBalancedJsonObjects(text) {
  const source = String(text || "");
  const results = [];

  for (let start = 0; start < source.length; start++) {
    if (source[start] !== "{") continue;

    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let i = start; i < source.length; i++) {
      const char = source[i];

      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (char === "\\") {
          escaped = true;
        } else if (char === "\"") {
          inString = false;
        }
        continue;
      }

      if (char === "\"") {
        inString = true;
        continue;
      }

      if (char === "{") depth++;
      if (char === "}") {
        depth--;
        if (depth === 0) {
          results.push(source.slice(start, i + 1));
          break;
        }
      }
    }
  }

  return results;
}

function extractBalancedJsonArrays(text) {
  const source = String(text || "");
  const results = [];

  for (let start = 0; start < source.length; start++) {
    if (source[start] !== "[") continue;

    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let i = start; i < source.length; i++) {
      const char = source[i];

      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (char === "\\") {
          escaped = true;
        } else if (char === "\"") {
          inString = false;
        }
        continue;
      }

      if (char === "\"") {
        inString = true;
        continue;
      }

      if (char === "[") depth++;
      if (char === "]") {
        depth--;
        if (depth === 0) {
          results.push(source.slice(start, i + 1));
          break;
        }
      }
    }
  }

  return results;
}

function stripCodeFenceMarkers(text) {
  return String(text || "")
    .replace(/^```[a-zA-Z0-9_-]*\s*/g, "")
    .replace(/```$/g, "")
    .trim();
}

function normalizeEmbeddedPayloadShape(value) {
  if (!value) return null;

  const normalizeArgumentKey = (key) => {
    const raw = String(key || "");
    const lower = raw.toLowerCase();
    if (lower === "path" || lower === "file" || lower === "filepath" || lower === "file_path" || lower === "filename") return "filePath";
    if (lower === "oldstring" || lower === "old_string") return "oldString";
    if (lower === "newstring" || lower === "new_string") return "newString";
    return raw;
  };

  const legacyArgsFromValue = (item) => {
    const args = {};
    const reserved = new Set([
      "name",
      "tool",
      "tool_name",
      "function",
      "params",
      "tool_input",
      "arguments",
      "tool_calls",
      "tool_call",
      "call",
      "action",
      "calls",
      "actions",
      "tools",
      "invocations",
      "content",
      "final",
      "answer",
      "response"
    ]);
    if (item && item.params && typeof item.params === "object" && !Array.isArray(item.params)) {
      for (const [key, value] of Object.entries(item.params)) {
        args[normalizeArgumentKey(key)] = value;
      }
    }
    if (item && item.tool_input && typeof item.tool_input === "object" && !Array.isArray(item.tool_input)) {
      for (const [key, value] of Object.entries(item.tool_input)) {
        args[normalizeArgumentKey(key)] = value;
      }
    }
    if (item && item.arguments && typeof item.arguments === "object" && !Array.isArray(item.arguments)) {
      for (const [key, value] of Object.entries(item.arguments)) {
        args[normalizeArgumentKey(key)] = value;
      }
    }
    if (item && typeof item === "object") {
      for (const [key, value] of Object.entries(item)) {
        if (reserved.has(key)) continue;
        args[normalizeArgumentKey(key)] = value;
      }
    }
    if (item && typeof item.purpose === "string" && args.purpose === undefined) {
      args.purpose = item.purpose;
    }
    return args;
  };

  if (Array.isArray(value)) {
    const toolCalls = value
      .filter((item) => item && typeof item === "object")
      .map((item) => {
        if (typeof item.name === "string") return { name: item.name, arguments: item.arguments || {} };
        if (typeof item.tool === "string") return { name: item.tool, arguments: legacyArgsFromValue(item) };
        if (typeof item.tool_name === "string") return { name: item.tool_name, arguments: legacyArgsFromValue(item) };
        if (item.function && typeof item.function.name === "string") {
          return { name: item.function.name, arguments: item.function.arguments || {} };
        }
        return null;
      })
      .filter(Boolean);
    return toolCalls.length > 0 ? { tool_calls: toolCalls } : null;
  }

  if (typeof value !== "object") return null;

  if (Array.isArray(value.tool_calls)) return value;
  if (value.tool_calls && typeof value.tool_calls === "object") {
    return { tool_calls: [value.tool_calls] };
  }
  if (typeof value.name === "string") return value;
  if (typeof value.tool === "string") {
    return {
      name: value.tool,
      arguments: legacyArgsFromValue(value)
    };
  }
  if (typeof value.tool_name === "string") {
    return {
      name: value.tool_name,
      arguments: legacyArgsFromValue(value)
    };
  }
  if (value.function && typeof value.function.name === "string") {
    return {
      name: value.function.name,
      arguments: value.function.arguments || {}
    };
  }
  if (value.tool && typeof value.tool === "object" && typeof value.tool.name === "string") {
    return {
      name: value.tool.name,
      arguments: value.tool.arguments || {}
    };
  }
  if (value.tool_call && typeof value.tool_call === "object") {
    return normalizeEmbeddedPayloadShape(value.tool_call);
  }
  if (value.call && typeof value.call === "object") {
    return normalizeEmbeddedPayloadShape(value.call);
  }
  if (value.action && typeof value.action === "object") {
    return normalizeEmbeddedPayloadShape(value.action);
  }
  if (Array.isArray(value.calls)) return normalizeEmbeddedPayloadShape(value.calls);
  if (Array.isArray(value.actions)) return normalizeEmbeddedPayloadShape(value.actions);
  if (Array.isArray(value.tools)) return normalizeEmbeddedPayloadShape(value.tools);
  if (Array.isArray(value.invocations)) return normalizeEmbeddedPayloadShape(value.invocations);
  if (typeof value.content === "string") return { content: value.content };
  if (typeof value.final === "string") return { content: value.final };
  if (typeof value.answer === "string") return { content: value.answer };
  if (typeof value.response === "string") return { content: value.response };

  return null;
}

function parseEmbeddedJsonPayload(text) {
  const candidates = [
    ...extractBalancedJsonObjects(text),
    ...extractBalancedJsonArrays(text)
  ];

  for (const candidate of candidates) {
    const parsed = tryParseJsonLenient(candidate);
    if (!parsed.ok) continue;

    const normalized = normalizeEmbeddedPayloadShape(parsed.value);
    if (normalized) return normalized;
  }

  return null;
}

function parseAnyFencedJsonPayload(text) {
  const blocks = extractAnyFencedBlocks(text);
  for (const block of blocks) {
    const parsed = tryParseJsonLenient(stripCodeFenceMarkers(block.content));
    if (!parsed.ok) continue;
    const normalized = normalizeEmbeddedPayloadShape(parsed.value);
    if (normalized) return normalized;
  }
  return null;
}

function normalizeParsedToolCalls(rawCalls, options = {}) {
  const shellAliases = new Set(["shell", "sh", "terminal", "command", "commandline", "powershell", "ls", "dir", "find", "cat", "tree", "pwd", "echo", "head", "tail", "mkdir", "rmdir"]);
  const toolAliases = new Map();
  const toolArgKeyMap = options.toolArgKeyMap instanceof Map ? options.toolArgKeyMap : new Map();
  const availableToolNames = new Set(Array.from(toolArgKeyMap.keys(), (k) => String(k || "").toLowerCase()).filter(Boolean));
  const toolRequiredKeyMap = options.toolRequiredKeyMap instanceof Map ? options.toolRequiredKeyMap : new Map();
  const fallbackFileArgTools = new Set(["read", "write", "edit", "patch", "read_file", "write_file", "edit_file"]);

  const resolveToolArgKeySet = (toolName) => {
    const lower = String(toolName || "").toLowerCase();
    return toolArgKeyMap.get(lower) || null;
  };

  const resolveToolRequiredKeySet = (toolName) => {
    const lower = String(toolName || "").toLowerCase();
    return toolRequiredKeyMap.get(lower) || null;
  };

  const choosePreferredKey = (toolName, preferredKeys) => {
    const keySet = resolveToolArgKeySet(toolName);
    if (keySet && keySet.size > 0) {
      for (const candidate of preferredKeys) {
        if (keySet.has(candidate)) return candidate;
      }
      return null;
    }
    return preferredKeys[0] || null;
  };

  const aliasValueForKey = (args, aliases) => {
    for (const alias of aliases) {
      if (typeof args[alias] === "string") return args[alias];
    }
    return undefined;
  };

  const normalizeFilePathValue = (value) => {
    if (typeof value !== "string") return value;
    let next = value.trim();
    if (!next) return next;

    next = next.replace(/\\/g, "/");

    if (/^[A-Za-z]:\//.test(next)) {
      const parts = next.slice(3).split("/").filter(Boolean);
      if (parts.length >= 2) return parts.slice(1).join("/");
      if (parts.length === 1) return parts[0];
      return "";
    }

    return next;
  };

  const normalizeToolName = (name) => {
    const raw = String(name || "").trim();
    const lower = raw.toLowerCase();
    if (availableToolNames.has(lower)) {
      return raw;
    }
    if (toolAliases.has(lower)) {
      return toolAliases.get(lower);
    }
    if (shellAliases.has(lower)) {
      if (availableToolNames.has("bash")) return "bash";
      if (availableToolNames.has("terminal")) return "terminal";
      if (availableToolNames.has("shell")) return "shell";
    }
    return raw;
  };

  const pickNestedArgsCandidate = (toolName, args) => {
    if (!args || typeof args !== "object" || Array.isArray(args)) return null;
    const required = resolveToolRequiredKeySet(toolName);
    const hasOuterRequired = required && required.size > 0
      ? Array.from(required).every((k) => args[k] !== undefined)
      : false;
    if (hasOuterRequired) return null;

    const candidates = ["arguments", "tool_input", "params"];
    for (const key of candidates) {
      const nested = args[key];
      if (!nested || typeof nested !== "object" || Array.isArray(nested)) continue;
      if (!required || required.size === 0) return nested;
      const hasNestedRequired = Array.from(required).every((k) => nested[k] !== undefined);
      if (hasNestedRequired) return nested;
    }
    return null;
  };

  const wrapShellArgs = (toolName, args) => {
    const lower = String(toolName || "").toLowerCase();
    const isGenericWrapper = ["shell", "sh", "terminal", "command", "commandline", "powershell"].includes(lower);
    if (shellAliases.has(lower) && !isGenericWrapper && availableToolNames.has("bash")) {
      const rawPath = args && typeof args === "object"
        ? (args.path || args.filePath || args.directory || args.dir || ".")
        : ".";
      const safePath = String(rawPath).replace(/[;|&$"\r\n]/g, "");
      return { command: `${lower} "${safePath}"`.trim(), description: `Run ${lower}` };
    }
    return args;
  };

  const normalizeArgumentAliasesForTool = (toolName, args) => {
    if (!args || typeof args !== "object" || Array.isArray(args)) return args;
    const out = { ...args };
    const lowerTool = String(toolName || "").toLowerCase();

    const fileKey = choosePreferredKey(toolName, ["filePath", "file_path", "filepath", "filename", "file", "path"]);
    const shouldMapFilePath = fallbackFileArgTools.has(lowerTool) || !!resolveToolArgKeySet(toolName);
    if (shouldMapFilePath && fileKey && typeof out[fileKey] !== "string") {
      const fileValue = aliasValueForKey(out, ["filePath", "file_path", "filepath", "filename", "file", "path"]);
      if (typeof fileValue === "string") out[fileKey] = normalizeFilePathValue(fileValue);
    } else if (shouldMapFilePath && fileKey && typeof out[fileKey] === "string") {
      out[fileKey] = normalizeFilePathValue(out[fileKey]);
    }

    const contentKey = choosePreferredKey(toolName, ["content", "text", "value", "body"]);
    if (contentKey && typeof out[contentKey] !== "string") {
      const contentValue = aliasValueForKey(out, ["content", "contents", "text", "value", "body"]);
      if (typeof contentValue === "string") out[contentKey] = contentValue;
    }

    const oldKey = choosePreferredKey(toolName, ["oldString", "old_string", "oldText", "old_text", "old", "from"]);
    if (oldKey && typeof out[oldKey] !== "string") {
      const oldValue = aliasValueForKey(out, ["oldString", "old_string", "oldstring", "oldText", "old_text", "old", "from"]);
      if (typeof oldValue === "string") out[oldKey] = oldValue;
    }

    const newKey = choosePreferredKey(toolName, ["newString", "new_string", "newText", "new_text", "new", "to"]);
    if (newKey && typeof out[newKey] !== "string") {
      const newValue = aliasValueForKey(out, ["newString", "new_string", "newstring", "newText", "new_text", "new", "to"]);
      if (typeof newValue === "string") out[newKey] = newValue;
    }

    const commandKey = choosePreferredKey(toolName, ["command", "cmd", "script", "input"]);
    if (commandKey && typeof out[commandKey] !== "string") {
      const commandValue = aliasValueForKey(out, ["command", "cmd", "script", "input"]);
      if (typeof commandValue === "string") out[commandKey] = commandValue;
    }

    const descriptionKey = choosePreferredKey(toolName, ["description", "desc", "purpose", "summary"]);
    if (descriptionKey && typeof out[descriptionKey] !== "string") {
      const descriptionValue = aliasValueForKey(out, ["description", "desc", "purpose", "summary"]);
      if (typeof descriptionValue === "string") {
        out[descriptionKey] = descriptionValue;
      } else if (commandKey && typeof out[commandKey] === "string" && out[commandKey].trim()) {
        const preview = out[commandKey].trim().slice(0, 120);
        out[descriptionKey] = `Run shell command: ${preview}`;
      }
    }

    return out;
  };

  return rawCalls
    .filter((call) => call && typeof call === "object")
    .map((call) => {
      const name = typeof call.name === "string" ? call.name :
        typeof call.tool_name === "string" ? call.tool_name : "";

      const args = call.arguments ? call.arguments :
        call.tool_input ? call.tool_input : {};

      if (!name) return null;

      const nestedArgs = pickNestedArgsCandidate(name, args);
      const argsForNormalization = nestedArgs || args;
      const finalArgs = wrapShellArgs(name, argsForNormalization);
      const aliasNormalizedArgs = normalizeArgumentAliasesForTool(name, finalArgs);
      const decodedArgs = decodeBase64ToolArgs(aliasNormalizedArgs);
      const keySet = resolveToolArgKeySet(name);
      const finalDecodedArgs = (keySet && keySet.size > 0)
        ? Object.fromEntries(Object.entries(decodedArgs || {}).filter(([k]) => keySet.has(k)))
        : decodedArgs;
      const requiredSet = resolveToolRequiredKeySet(name);
      if (requiredSet && requiredSet.size > 0) {
        for (const requiredKey of requiredSet) {
          if (finalDecodedArgs == null || finalDecodedArgs[requiredKey] === undefined) {
            return null;
          }
        }
      }

      return {
        id: generateToolCallId(),
        type: "function",
        function: {
          name: normalizeToolName(name),
          arguments: normalizeJsonString(finalDecodedArgs)
        }
      };
    })
    .filter(Boolean);
}
function startsWithMarker(text, marker) {
  return String(text || "").trimStart().startsWith(marker);
}

function startsWithAnyMarker(text, markers) {
  return markers.some((marker) => startsWithMarker(text, marker));
}

function extractMarkerEnvelope(text, startMarker, endMarker) {
  const source = String(text || "");
  const start = source.indexOf(startMarker);
  if (start === -1) return null;
  const afterStart = source.slice(start + startMarker.length);
  const end = afterStart.indexOf(endMarker);
  if (end === -1) {
    return afterStart.trim();
  }
  return afterStart.slice(0, end).trim();
}

function stripMarker(text, marker) {
  const source = String(text || "");
  const trimmed = source.trimStart();
  if (!trimmed.startsWith(marker)) return source;
  return trimmed.slice(marker.length).replace(/^\s+/, "");
}

function stripAnyMarker(text, markers) {
  const source = String(text || "");
  for (const marker of markers) {
    const stripped = stripMarker(source, marker);
    if (stripped !== source) return stripped;
  }
  return source;
}

function stripLeadingMarkerJunk(text) {
  return String(text || "").replace(/^\s*[\]\}\),;:]+\s*/, "");
}

function stripTrailingFinalMarkerFragment(text) {
  const source = String(text || "");
  let bestCut = source.length;

  const canonicalCandidates = [
    "[[OPENCODE_FINAL]]",
    "[[/OPENCODE_FINAL]]",
    "[OPENCODE_FINAL]",
    "[/OPENCODE_FINAL]"
  ];

  for (const marker of canonicalCandidates) {
    for (let i = 1; i < marker.length; i++) {
      const fragment = marker.slice(0, i);
      if (source.endsWith(fragment)) {
        bestCut = Math.min(bestCut, source.length - fragment.length);
      }
    }
  }

  const malformedMatch = source.match(/(?:\[\s*){1,4}\/?\[?\s*\/?\s*OPENCODE_FINAL\s*\]?\]?$/i);
  if (malformedMatch) {
    bestCut = Math.min(bestCut, malformedMatch.index);
  }

  return bestCut === source.length ? source : source.slice(0, bestCut);
}

function stripAllTrailingFinalMarkerJunk(text) {
  let out = String(text || "");
  while (true) {
    const trimmed = out
      .replace(/\s*\[\[\/\[\s*OPENCODE_FINAL\]\s*$/i, "")
      .replace(/\s*\[\[\/OPENCODE_FINAL\]?\s*$/i, "")
      .replace(/\s*\[\/OPENCODE_FINAL\]?\s*$/i, "")
      .replace(/\s*\[\[OPENCODE_FINAL\]?\s*$/i, "");
    const cleaned = stripTrailingFinalMarkerFragment(trimmed);
    if (cleaned === out) return out;
    out = cleaned;
  }
}

function normalizeBridgeMarkers(text) {
  let source = String(text || "");
  source = source.replace(/\[\s*\/+\s*\[\s*OPENCODE_TOOLS?\s*\]?\]?/gi, TOOL_MODE_END_MARKER);
  source = source.replace(/\[\s*\/+\s*\[\s*OPENCODE_FINAL\s*\]?\]?/gi, FINAL_MODE_END_MARKER);
  source = source.replace(/\[\s*\/+\s*\[\s*CALL\s*\]?\]?/gi, CALL_MODE_END_MARKER);
  source = source.replace(/(^|[\r\n])\s*\/\s*OPENCODE_TOOLS?\s*\]?\]?/gi, `$1${TOOL_MODE_END_MARKER}`);
  source = source.replace(/(^|[\r\n])\s*\/\s*OPENCODE_FINAL\s*\]?\]?/gi, `$1${FINAL_MODE_END_MARKER}`);
  source = source.replace(/(^|[\r\n])\s*\/\s*CALL\s*\]?\]?/gi, `$1${CALL_MODE_END_MARKER}`);
  source = source.replace(/\[?\[?\s*OPENCODE_TOOLS?\s*\]?\]?/gi, TOOL_MODE_MARKER);
  source = source.replace(/\[?\[?\s*\/\s*OPENCODE_TOOLS?\s*\]?\]?/gi, TOOL_MODE_END_MARKER);
  source = source.replace(/\[?\[?\s*OPENCODE_FINAL\s*\]?\]?/gi, FINAL_MODE_MARKER);
  source = source.replace(/\[?\[?\s*\/\s*OPENCODE_FINAL\s*\]?\]?/gi, FINAL_MODE_END_MARKER);
  source = source.replace(/(^|[\r\n])\s*\[\[?\s*CALL\s*\]?\]?\s*(?=$|[\r\n])/gim, `$1${CALL_MODE_MARKER}\n`);
  source = source.replace(/(^|[\r\n])\s*\[\[?\s*\/\s*CALL\s*\]?\]?\s*(?=$|[\r\n])/gim, `$1${CALL_MODE_END_MARKER}\n`);
  return source;
}

function extractAnyMarkerEnvelope(text, startMarkers, endMarkers) {
  const source = String(text || "");
  for (const startMarker of startMarkers) {
    const start = source.indexOf(startMarker);
    if (start === -1) continue;
    const afterStart = source.slice(start + startMarker.length);
    let bestEnd = -1;
    for (const endMarker of endMarkers) {
      const idx = afterStart.indexOf(endMarker);
      if (idx !== -1 && (bestEnd === -1 || idx < bestEnd)) bestEnd = idx;
    }
    if (bestEnd === -1) return afterStart.trim();
    return afterStart.slice(0, bestEnd).trim();
  }
  return null;
}

function extractLooseMarkerEnvelope(text, startRegex, endRegex) {
  const source = String(text || "");
  const startMatch = startRegex.exec(source);
  if (!startMatch) return null;
  const afterStart = source.slice(startMatch.index + startMatch[0].length);
  const endMatch = endRegex.exec(afterStart);
  if (!endMatch) return afterStart.trim();
  return afterStart.slice(0, endMatch.index).trim();
}

function findMarkerStart(text, markers, looseRegex) {
  const source = String(text || "");
  let best = null;

  for (const marker of markers) {
    const index = source.indexOf(marker);
    if (index !== -1 && (!best || index < best.index)) {
      best = { index, length: marker.length };
    }
  }

  const looseMatch = looseRegex.exec(source);
  if (looseMatch && (!best || looseMatch.index < best.index)) {
    best = { index: looseMatch.index, length: looseMatch[0].length };
  }

  return best;
}

function findMarkerEnd(text, markers, looseRegex) {
  const source = String(text || "");
  let best = null;

  for (const marker of markers) {
    const index = source.indexOf(marker);
    if (index !== -1 && (!best || index < best.index)) {
      best = { index, length: marker.length };
    }
  }

  const looseMatch = looseRegex.exec(source);
  if (looseMatch && (!best || looseMatch.index < best.index)) {
    best = { index: looseMatch.index, length: looseMatch[0].length };
  }

  return best;
}

function extractPartialToolEnvelope(text) {
  const source = normalizeBridgeMarkers(text);
  const start = findMarkerStart(source, TOOL_MODE_MARKER_ALIASES, LOOSE_TOOL_START_REGEX);
  if (!start) return null;
  const afterStart = source.slice(start.index + start.length);
  const end = findMarkerEnd(afterStart, TOOL_MODE_END_MARKER_ALIASES, LOOSE_TOOL_END_REGEX);
  return end ? afterStart.slice(0, end.index).trim() : afterStart.trim();
}

function extractProgressiveToolSource(text) {
  const normalized = normalizeBridgeMarkers(text);
  const payload = extractPartialToolEnvelope(normalized);
  if (payload !== null) return payload;
  const callStart = findMarkerStart(normalized, CALL_MODE_MARKER_ALIASES, LOOSE_CALL_START_REGEX);
  if (callStart) return normalized.slice(callStart.index).trim();
  return null;
}

function extractCallEnvelopes(text, allowPartial = false, includeMeta = false) {
  const source = String(text || "");
  const out = [];
  let cursor = 0;

  while (cursor < source.length) {
    const next = findMarkerStart(source.slice(cursor), CALL_MODE_MARKER_ALIASES, LOOSE_CALL_START_REGEX);
    if (!next) break;
    const startIndex = cursor + next.index;
    const afterStartIndex = startIndex + next.length;
    const afterStart = source.slice(afterStartIndex);
    const end = findMarkerEnd(afterStart, CALL_MODE_END_MARKER_ALIASES, LOOSE_CALL_END_REGEX);
    if (!end) {
      const nextCall = findMarkerStart(afterStart, CALL_MODE_MARKER_ALIASES, LOOSE_CALL_START_REGEX);
      if (nextCall && nextCall.index > 0) {
        const text = afterStart.slice(0, nextCall.index).trim();
        out.push(includeMeta ? { text, implicitBoundary: true } : text);
        cursor = afterStartIndex + nextCall.index;
        continue;
      }
      const toolEnd = findMarkerEnd(afterStart, TOOL_MODE_END_MARKER_ALIASES, LOOSE_TOOL_END_REGEX);
      if (toolEnd && toolEnd.index > 0) {
        const text = afterStart.slice(0, toolEnd.index).trim();
        out.push(includeMeta ? { text, implicitBoundary: true } : text);
        cursor = afterStartIndex + toolEnd.index + toolEnd.length;
        continue;
      }
      if (allowPartial) {
        const text = afterStart.trim();
        out.push(includeMeta ? { text, implicitBoundary: false } : text);
      }
      break;
    }
    const text = afterStart.slice(0, end.index).trim();
    out.push(includeMeta ? { text, implicitBoundary: false } : text);
    cursor = afterStartIndex + end.index + end.length;
  }

  return out;
}

function salvageBoundaryClosedToolCalls(envelopeText, options = {}) {
  const source = String(envelopeText || "").trim();
  if (!source) return null;

  const attempts = [closeUnbalancedJson(source)];
  const firstObjectStart = source.indexOf("{");
  if (firstObjectStart !== -1) {
    attempts.push(closeUnbalancedJson(source.slice(firstObjectStart)));
  }

  for (const attempt of attempts) {
    const toolCalls = bestEffortParseToolPayload(attempt, options);
    if (toolCalls && toolCalls.length > 0) return toolCalls;
  }

  return null;
}

function parseCallEnvelopeWithFallback(envelopeText, allowSalvage = true, options = {}) {
  let toolCalls = bestEffortParseToolPayload(envelopeText, options);
  if ((!toolCalls || toolCalls.length === 0) && allowSalvage) {
    toolCalls = salvageBoundaryClosedToolCalls(envelopeText, options);
  }
  return toolCalls;
}

function extractCompletedToolCallObjectTexts(text) {
  const source = String(text || "");
  const toolCallsMatch = /"tool_calls"\s*:\s*/.exec(source);
  if (!toolCallsMatch) return [];

  const arrayStart = source.indexOf("[", toolCallsMatch.index + toolCallsMatch[0].length);
  if (arrayStart === -1) return [];

  const out = [];
  let depth = 0;
  let inString = false;
  let escaped = false;
  let objectStart = -1;
  let arrayDepth = 0;

  for (let i = arrayStart; i < source.length; i++) {
    const char = source[i];

    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === "\"") inString = false;
      continue;
    }

    if (char === "\"") {
      inString = true;
      continue;
    }

    if (char === "[") {
      arrayDepth++;
      continue;
    }

    if (char === "]") {
      arrayDepth--;
      if (arrayDepth <= 0) break;
      continue;
    }

    if (arrayDepth !== 1) continue;

    if (char === "{") {
      if (depth === 0) objectStart = i;
      depth++;
      continue;
    }

    if (char === "}") {
      depth--;
      if (depth === 0 && objectStart !== -1) {
        out.push(source.slice(objectStart, i + 1));
        objectStart = -1;
      }
    }
  }

  return out;
}

function extractBracketNamedToolBlock(text) {
  const source = String(text || "").replace(/^\s*[\]\}\),;:]+\s*/, "");
  const match = source.match(/^\s*\[([A-Za-z_][A-Za-z0-9_-]*)\]\s*/);
  if (!match) return null;
  const toolName = match[1];
  const after = source.slice(match[0].length).trimStart();
  if (!after.startsWith("{") && !after.startsWith("[")) return null;
  const openChar = after[0];
  const closeChar = openChar === "{" ? "}" : "]";
  const segment = extractBalancedSegment(after, 0, openChar, closeChar) || closeUnbalancedJson(after);
  const parsed = tryParseJsonLenient(segment);
  if (!parsed.ok) return null;
  return { name: toolName, arguments: parsed.value };
}

function extractProgressiveToolCalls(text, options = {}) {
  const payload = extractProgressiveToolSource(text);
  if (!payload) return [];

  const callEnvelopes = extractCallEnvelopes(payload, false, true);
  if (callEnvelopes.length > 0) {
    const recovered = [];
    for (const envelope of callEnvelopes) {
      const toolCalls = parseCallEnvelopeWithFallback(envelope.text, true, options);
      if (toolCalls && toolCalls.length > 0) recovered.push(...toolCalls);
    }
    if (recovered.length > 0) return recovered;
  }

  const objectTexts = extractCompletedToolCallObjectTexts(payload);
  const recovered = [];
  for (const objectText of objectTexts) {
    const toolCalls = bestEffortParseToolPayload(objectText, options);
    if (toolCalls && toolCalls.length > 0) recovered.push(...toolCalls);
  }
  return recovered;
}

function buildInvalidToolBlockRecoveryRequest(upstreamRequest) {
  const recovered = JSON.parse(JSON.stringify(upstreamRequest || {}));
  if (!Array.isArray(recovered.messages)) recovered.messages = [];
  recovered.messages.push({
    role: "user",
    content: [
      "Parser error: your previous reply contained an unparseable tool envelope.",
      "Retry immediately with a valid tool call envelope only.",
      `Use ${TOOL_MODE_MARKER} ... ${TOOL_MODE_END_MARKER} and ${CALL_MODE_MARKER} ... ${CALL_MODE_END_MARKER}.`,
      "Inside CALL JSON use exactly: {\"name\":\"<tool>\",\"arguments\":{...}}.",
      "For bash, include both command and description when required by schema.",
      "For string-heavy arguments prefer base64 fields (command_b64/content_b64/oldString_b64/newString_b64).",
      "Do not output prose before or after the tool envelope."
    ].join("\n")
  });
  return recovered;
}

function parseBridgeAssistantText(text, options = {}) {
  const normalizedText = normalizeBridgeMarkers(text);
  const canonicalTool = extractAnyMarkerEnvelope(normalizedText, TOOL_MODE_MARKER_ALIASES, TOOL_MODE_END_MARKER_ALIASES);
  if (canonicalTool !== null) {
    const callEnvelopes = extractCallEnvelopes(canonicalTool);
    if (callEnvelopes.length > 0) {
      const recovered = [];
      for (const envelope of callEnvelopes) {
        const toolCalls = parseCallEnvelopeWithFallback(envelope, true, options);
        if (toolCalls && toolCalls.length > 0) recovered.push(...toolCalls);
      }
      if (recovered.length > 0) return { kind: "tool_calls", toolCalls: recovered };
    }
    const toolCalls = bestEffortParseToolPayload(canonicalTool, options);
    if (toolCalls && toolCalls.length > 0) return { kind: "tool_calls", toolCalls };
    return { kind: "invalid_tool_block", raw: normalizedText };
  }

  const looseTool = extractLooseMarkerEnvelope(normalizedText, LOOSE_TOOL_START_REGEX, LOOSE_TOOL_END_REGEX);
  if (looseTool !== null) {
    const callEnvelopes = extractCallEnvelopes(looseTool);
    if (callEnvelopes.length > 0) {
      const recovered = [];
      for (const envelope of callEnvelopes) {
        const toolCalls = parseCallEnvelopeWithFallback(envelope, true, options);
        if (toolCalls && toolCalls.length > 0) recovered.push(...toolCalls);
      }
      if (recovered.length > 0) return { kind: "tool_calls", toolCalls: recovered };
    }
    const toolCalls = bestEffortParseToolPayload(looseTool, options);
    if (toolCalls && toolCalls.length > 0) return { kind: "tool_calls", toolCalls };
    return { kind: "invalid_tool_block", raw: normalizedText };
  }

  const callOnlyEnvelopes = extractCallEnvelopes(normalizedText);
  if (callOnlyEnvelopes.length > 0) {
    const recovered = [];
    for (const envelope of callOnlyEnvelopes) {
      const toolCalls = parseCallEnvelopeWithFallback(envelope, true, options);
      if (toolCalls && toolCalls.length > 0) recovered.push(...toolCalls);
    }
    if (recovered.length > 0) return { kind: "tool_calls", toolCalls: recovered };
  }

  const canonicalFinal = extractAnyMarkerEnvelope(normalizedText, FINAL_MODE_MARKER_ALIASES, FINAL_MODE_END_MARKER_ALIASES);
  if (canonicalFinal !== null) {
    return { kind: "final", content: stripLeadingMarkerJunk(canonicalFinal) };
  }

  const looseFinal = extractLooseMarkerEnvelope(normalizedText, LOOSE_FINAL_START_REGEX, LOOSE_FINAL_END_REGEX);
  if (looseFinal !== null) {
    return { kind: "final", content: stripLeadingMarkerJunk(looseFinal) };
  }

  if (startsWithAnyMarker(normalizedText, TOOL_MODE_MARKER_ALIASES)) {
    return parseBridgeAssistantText(stripAnyMarker(normalizedText, TOOL_MODE_MARKER_ALIASES), options);
  }

  if (startsWithAnyMarker(normalizedText, FINAL_MODE_MARKER_ALIASES)) {
    return { kind: "final", content: stripLeadingMarkerJunk(stripAnyMarker(normalizedText, FINAL_MODE_MARKER_ALIASES)) };
  }

  const toolBlock = extractFencedBlock(normalizedText, TOOL_BLOCK_LABEL);
  if (toolBlock) {
    const toolCalls = bestEffortParseToolPayload(toolBlock, options);
    if (toolCalls && toolCalls.length > 0) return { kind: "tool_calls", toolCalls };
  }

  const finalBlock = extractFencedBlock(normalizedText, FINAL_BLOCK_LABEL);
  if (finalBlock) {
    const parsed = tryParseJsonLenient(finalBlock);
    if (parsed.ok && parsed.value && typeof parsed.value === "object" && typeof parsed.value.content === "string") {
      return { kind: "final", content: stripLeadingMarkerJunk(parsed.value.content) };
    }
    return { kind: "final", content: stripLeadingMarkerJunk(finalBlock) };
  }

  const fencedJson = parseAnyFencedJsonPayload(normalizedText);
  if (fencedJson) {
    if (Array.isArray(fencedJson.tool_calls) || typeof fencedJson.name === "string") {
      const rawCalls = Array.isArray(fencedJson.tool_calls) ? fencedJson.tool_calls : [fencedJson];
      const toolCalls = normalizeParsedToolCalls(rawCalls, options);
      if (toolCalls.length > 0) return { kind: "tool_calls", toolCalls };
    }
    if (typeof fencedJson.content === "string") {
      return { kind: "final", content: stripLeadingMarkerJunk(fencedJson.content) };
    }
  }

  const embedded = parseEmbeddedJsonPayload(normalizedText);
  if (embedded) {
    if (Array.isArray(embedded.tool_calls) || typeof embedded.name === "string") {
      const rawCalls = Array.isArray(embedded.tool_calls)
        ? embedded.tool_calls
        : [embedded];
      const toolCalls = normalizeParsedToolCalls(rawCalls, options);
      if (toolCalls.length > 0) {
        return { kind: "tool_calls", toolCalls };
      }
    }

    if (typeof embedded.content === "string") {
      return { kind: "final", content: stripLeadingMarkerJunk(embedded.content) };
    }
  }

  const bracketNamedTool = extractBracketNamedToolBlock(normalizedText);
  if (bracketNamedTool) {
    const toolCalls = normalizeParsedToolCalls([bracketNamedTool]);
    if (toolCalls.length > 0) return { kind: "tool_calls", toolCalls };
  }

  const hasLooseToolOpen = LOOSE_TOOL_START_REGEX.test(normalizedText);
  const hasLooseToolClose = LOOSE_TOOL_END_REGEX.test(normalizedText);
  const hasStandaloneCallOpen = /(^|[\r\n])\s*\[\[?\s*CALL\s*\]?\]?\s*(?=$|[\r\n])/im.test(normalizedText);
  const hasStandaloneCallClose = /(^|[\r\n])\s*\[\[?\s*\/\s*CALL\s*\]?\]?\s*(?=$|[\r\n])/im.test(normalizedText);
  const looksLikeUnparsedToolEnvelope =
    (hasLooseToolOpen && (hasLooseToolClose || hasStandaloneCallOpen))
    || (hasStandaloneCallOpen && hasStandaloneCallClose);
  if (looksLikeUnparsedToolEnvelope) {
    return { kind: "invalid_tool_block", raw: normalizedText };
  }

  return { kind: "plain", content: normalizedText || "" };
}

function parseSSETranscript(text) {
  const aggregate = {
    id: null,
    model: null,
    created: null,
    reasoning: "",
    content: "",
    finishReason: null,
    usage: undefined
  };

  for (const rawLine of String(text || "").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line.startsWith("data:")) continue;
    const payload = line.slice(5).trim();
    if (!payload || payload === "[DONE]") continue;
    const parsed = tryParseJson(payload);
    if (!parsed.ok) continue;
    const chunk = parsed.value;
    const choice = Array.isArray(chunk.choices) ? chunk.choices[0] : null;
    if (!choice) continue;

    aggregate.id = aggregate.id || chunk.id || `chatcmpl_${randomUUID()}`;
    aggregate.model = aggregate.model || chunk.model || null;
    aggregate.created = aggregate.created || chunk.created || Math.floor(Date.now() / 1000);

    const delta = choice.delta || {};
    if (typeof delta.reasoning === "string") aggregate.reasoning += delta.reasoning;
    if (typeof delta.reasoning_content === "string") aggregate.reasoning += delta.reasoning_content;
    if (typeof delta.content === "string") aggregate.content += delta.content;
    if (choice.finish_reason !== null && choice.finish_reason !== undefined) {
      aggregate.finishReason = choice.finish_reason;
    }
    if (chunk.usage) aggregate.usage = chunk.usage;
  }

  return aggregate;
}

function buildBridgeResultFromText(text, reasoning, options = {}) {
  const parsed = parseBridgeAssistantText(text, options);
  const reasoningText = typeof reasoning === "string" ? reasoning : "";
  const reasoningLooksLikeBridge = /(\[\[?\s*OPENCODE_(?:TOOL|FINAL)|\[\[?\s*CALL)/i.test(reasoningText);
  const reasoningParsed = reasoningLooksLikeBridge
    ? parseBridgeAssistantText(reasoningText, options)
    : null;

  if (parsed.kind === "tool_calls") {
    return {
      kind: "tool_calls",
      message: {
        role: "assistant",
        content: "",
        reasoning_content: reasoning || "",
        tool_calls: parsed.toolCalls
      },
      finishReason: "tool_calls"
    };
  }

  let finalParsed = parsed;
  const parsedHasFinalText = parsed.kind === "final" && String(parsed.content || "").trim().length > 0;
  const reasoningHasFinalText = reasoningParsed && reasoningParsed.kind === "final" && String(reasoningParsed.content || "").trim().length > 0;
  const normalizedReasoning = normalizeBridgeMarkers(reasoningText);
  const reasoningFinalStart = normalizedReasoning.indexOf(FINAL_MODE_MARKER);
  const reasoningFinalEnd = reasoningFinalStart === -1
    ? -1
    : normalizedReasoning.indexOf(FINAL_MODE_END_MARKER, reasoningFinalStart + FINAL_MODE_MARKER.length);
  const reasoningHasClosedFinalBlock = reasoningFinalStart !== -1 && reasoningFinalEnd !== -1;
  if (!parsedHasFinalText && reasoningHasFinalText && reasoningHasClosedFinalBlock) {
    finalParsed = reasoningParsed;
  }

  if (finalParsed.kind === "invalid_tool_block") {
    return {
      kind: "invalid_tool_block",
      message: {
        role: "assistant",
        content: "Tool call payload was malformed and could not be parsed. Retry the same call with base64 fields for code-heavy strings (`command_b64`, `content_b64`, `oldString_b64`, `newString_b64`).",
        reasoning_content: reasoning || ""
      },
      finishReason: "stop"
    };
  }

  return {
    kind: "final",
    message: {
      role: "assistant",
      content: stripAllTrailingFinalMarkerJunk(stripLeadingMarkerJunk(finalParsed.kind === "final" ? finalParsed.content : (finalParsed.content || text || ""))),
      reasoning_content: reasoning || ""
    },
    finishReason: "stop"
  };
}

function buildChatCompletionFromBridge(aggregate, options = {}) {
  const result = buildBridgeResultFromText(aggregate.content, aggregate.reasoning, options);
  const response = {
    id: aggregate.id || `chatcmpl_${randomUUID()}`,
    object: "chat.completion",
    created: aggregate.created || Math.floor(Date.now() / 1000),
    model: aggregate.model || "tool-bridge",
    choices: [
      {
        index: 0,
        finish_reason: result.finishReason,
        message: result.message
      }
    ]
  };
  if (aggregate.usage) response.usage = aggregate.usage;
  return response;
}

function sseLine(payload) {
  return `data: ${JSON.stringify(payload)}\n\n`;
}

function applyChunkToAggregate(aggregate, chunk) {
  const choice = Array.isArray(chunk.choices) ? chunk.choices[0] : null;
  if (!choice) return;

  aggregate.id = aggregate.id || chunk.id || `chatcmpl_${randomUUID()}`;
  aggregate.model = aggregate.model || chunk.model || null;
  aggregate.created = aggregate.created || chunk.created || Math.floor(Date.now() / 1000);

  const delta = choice.delta || {};
  if (typeof delta.reasoning === "string") aggregate.reasoning += delta.reasoning;
  if (typeof delta.reasoning_content === "string") aggregate.reasoning += delta.reasoning_content;
  if (typeof delta.content === "string") aggregate.content += delta.content;
  if (choice.finish_reason !== null && choice.finish_reason !== undefined) {
    aggregate.finishReason = choice.finish_reason;
  }
  if (chunk.usage) aggregate.usage = chunk.usage;
}

function detectBridgeStreamMode(content) {
  if (startsWithMarker(content, TOOL_MODE_MARKER)) return "tool";
  if (startsWithMarker(content, FINAL_MODE_MARKER)) return "final";
  return null;
}

function extractStreamableFinalContent(content) {
  const source = String(content || "");
  const withoutStart = startsWithMarker(source, FINAL_MODE_MARKER)
    ? stripMarker(source, FINAL_MODE_MARKER)
    : source;
  const endIndex = withoutStart.indexOf(FINAL_MODE_END_MARKER);
  const visible = endIndex === -1 ? withoutStart : withoutStart.slice(0, endIndex);
  return stripAllTrailingFinalMarkerJunk(stripLeadingMarkerJunk(visible));
}

function buildSSEFromBridge(aggregate, options = {}) {
  const result = buildBridgeResultFromText(aggregate.content, aggregate.reasoning, options);
  const id = aggregate.id || `chatcmpl_${randomUUID()}`;
  const model = aggregate.model || "tool-bridge";
  const created = aggregate.created || Math.floor(Date.now() / 1000);
  let out = "";

  out += sseLine({
    id,
    object: "chat.completion.chunk",
    created,
    model,
    choices: [{ index: 0, delta: { role: "assistant" }, finish_reason: null }]
  });

  if (aggregate.reasoning) {
    out += sseLine({
      id,
      object: "chat.completion.chunk",
      created,
      model,
      choices: [{ index: 0, delta: { reasoning: aggregate.reasoning }, finish_reason: null }]
    });
  }

  if (result.kind === "tool_calls") {
    for (const [index, call] of result.message.tool_calls.entries()) {
      out += sseLine({
        id,
        object: "chat.completion.chunk",
        created,
        model,
        choices: [{
          index: 0,
          delta: {
            tool_calls: [{
              index,
              id: call.id,
              type: "function",
              function: {
                name: call.function.name,
                arguments: call.function.arguments
              }
            }]
          },
          finish_reason: null
        }]
      });
    }

    out += sseLine({
      id,
      object: "chat.completion.chunk",
      created,
      model,
      choices: [{ index: 0, delta: {}, finish_reason: "tool_calls" }],
      ...(aggregate.usage ? { usage: aggregate.usage } : {})
    });
  } else {
    out += sseLine({
      id,
      object: "chat.completion.chunk",
      created,
      model,
      choices: [{ index: 0, delta: { content: result.message.content }, finish_reason: null }]
    });

    out += sseLine({
      id,
      object: "chat.completion.chunk",
      created,
      model,
      choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
      ...(aggregate.usage ? { usage: aggregate.usage } : {})
    });
  }

  out += "data: [DONE]\n\n";
  return out;
}

// Export all functions for use by both server and plugin
module.exports = {
  // Constants
  TOOL_BLOCK_LABEL,
  FINAL_BLOCK_LABEL,
  TOOL_RESULT_LABEL,
  TOOL_MODE_MARKER,
  FINAL_MODE_MARKER,
  TOOL_MODE_END_MARKER,
  FINAL_MODE_END_MARKER,
  CALL_MODE_MARKER,
  CALL_MODE_END_MARKER,
  MAX_TOOL_CALLS_PER_TURN,

  // Core transformation functions
  getBridgeFlavor,
  isSingleCallFlavor,
  requestNeedsBridge,
  acceptNativeJson,
  acceptNativeSSE,
  normalizeTools,
  normalizeToolDefinition,
  compactToolCatalog,
  buildToolArgumentKeyMap,
  buildToolRequiredKeyMap,
  compactSchema,
  contentPartsToText,
  buildBridgeSystemMessage,
  translateMessagesForBridge,
  transformRequestForBridge,
  encodeToolCallsBlock,
  encodeToolResultBlock,
  encodeUserMessageForBridge,

  // Parsing functions
  parseBridgeAssistantText,
  parseSSETranscript,
  buildBridgeResultFromText,
  buildChatCompletionFromBridge,
  buildSSEFromBridge,
  extractProgressiveToolCalls,
  isEmptyBridgeStopAggregate,
  buildEmptyStopRecoveryRequest,
  buildInvalidToolBlockRecoveryRequest,

  // SSE utilities
  sseLine,
  applyChunkToAggregate,
  detectBridgeStreamMode,
  extractStreamableFinalContent,

  // JSON utilities
  tryParseJson,
  tryParseJsonLenient,
  closeUnbalancedJson,
  escapeRawControlCharsInStrings,
  normalizeJsonString,
  generateToolCallId,

  // Marker utilities
  normalizeBridgeMarkers,
  extractAnyMarkerEnvelope,
  extractLooseMarkerEnvelope,
  findMarkerStart,
  findMarkerEnd,
  startsWithMarker,
  startsWithAnyMarker,
  stripMarker,
  stripAnyMarker,
  stripLeadingMarkerJunk,
  stripTrailingFinalMarkerFragment,
  stripAllTrailingFinalMarkerJunk,

  // Tool call parsing
  extractFencedBlock,
  extractAnyFencedBlocks,
  extractBalancedJsonObjects,
  extractBalancedJsonArrays,
  extractBalancedSegment,
  extractPartialToolEnvelope,
  extractProgressiveToolSource,
  extractCallEnvelopes,
  extractCompletedToolCallObjectTexts,
  extractBracketNamedToolBlock,
  normalizeParsedToolCalls,
  normalizeEmbeddedPayloadShape,
  parseEmbeddedJsonPayload,
  parseAnyFencedJsonPayload,
  bestEffortParseToolPayload,
  parseCallEnvelopeWithFallback,
  salvageMalformedToolCalls,
  salvageTodowriteArguments,
  decodeJsonStringLiteral,

  // Clone utility
  clone
};












