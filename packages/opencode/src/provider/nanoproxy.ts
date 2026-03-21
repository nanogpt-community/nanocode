type Core = {
  MAX_TOOL_CALLS_PER_TURN: number
  requestNeedsBridge(body: any): boolean
  transformRequestForBridge(body: any, options?: Record<string, unknown>): {
    bridgeApplied: boolean
    rewritten: any
    normalizedTools?: any[]
  }
  tryParseJson(text: string): { ok: true; value: any } | { ok: false }
  acceptNativeJson(status: number, payload: any): boolean
  acceptNativeSSE(status: number, text: string): boolean
  buildChatCompletionFromBridge(
    input: {
      id?: string
      model?: string
      created?: number
      reasoning?: string
      content?: string
      finishReason?: string | null
      usage?: any
    },
    options?: Record<string, unknown>,
  ): any
  buildBridgeResultFromText(text: string, reasoning?: string, options?: Record<string, unknown>): {
    kind: "tool_calls" | "final" | "invalid_tool_block"
    message: {
      content?: string
      tool_calls?: Array<{
        id: string
        type: "function"
        function: { name: string; arguments: string }
      }>
    }
  }
  extractProgressiveToolCalls(text: string, options?: Record<string, unknown>): Array<{
    id: string
    function: { name: string; arguments: string }
  }>
  extractCallEnvelopes(text: string, strict?: boolean, partial?: boolean): unknown[]
  extractStreamableFinalContent(text: string): string
  buildInvalidToolBlockRecoveryRequest(body: any): any
  buildToolArgumentKeyMap(tools: any[]): Map<string, Set<string>>
  buildToolRequiredKeyMap(tools: any[]): Map<string, Set<string>>
  generateToolCallId(): string
  applyChunkToAggregate(
    aggregate: {
      id: string | null
      model: string | null
      created: number | null
      reasoning: string
      content: string
      finishReason: string | null
      usage?: any
    },
    chunk: any,
  ): void
}

let cached: Promise<Core> | undefined

async function core() {
  cached ||= import("./nanoproxy-core.cjs").then((mod) => (mod.default ?? mod) as Core)
  return cached
}

function on(providerID: string, options: Record<string, any>) {
  if (providerID !== "nanogpt") return false
  if (options["nanoproxy"] === false) return false
  if (options["nanoProxy"] === false) return false
  if (process.env.NANOCODE_NANOPROXY === "0") return false
  if (process.env.NANOCODE_NANOPROXY === "false") return false
  return true
}

function clean(headersLike: HeadersInit | undefined, size?: number, type?: string) {
  const headers = new Headers(headersLike ?? {})
  headers.delete("content-length")
  headers.delete("content-encoding")
  headers.delete("transfer-encoding")
  if (type) headers.set("content-type", type)
  if (size !== undefined) headers.set("content-length", String(size))
  return headers
}

async function text(input: RequestInfo | URL, init?: BunFetchRequestInit) {
  const req = input instanceof Request ? input.clone() : undefined
  if (req) return req.text()
  const body = init?.body
  if (typeof body === "string") return body
  if (body instanceof ArrayBuffer) return new TextDecoder().decode(body)
  if (ArrayBuffer.isView(body)) return new TextDecoder().decode(body)
  if (body && typeof body === "object" && "text" in body && typeof body.text === "function") {
    return body.text()
  }
  return undefined
}

async function stream(
  fetchFn: typeof fetch,
  response: Response,
  url: string,
  init: BunFetchRequestInit | undefined,
  headers: Headers,
  body: any,
  options: Record<string, unknown>,
  c: Core,
) {
  let reader = response.body?.getReader()
  if (!reader) return response

  const decoder = new TextDecoder()
  const encoder = new TextEncoder()
  const aggregate = {
    id: null as string | null,
    model: null as string | null,
    created: null as number | null,
    reasoning: "",
    content: "",
    finishReason: null as string | null,
    usage: undefined as any,
  }
  let raw = ""
  let reason = 0
  let final = 0
  let emitted = 0
  let badRetry = false
  let dropRetry = false
  let closed = false
  let last = Date.now()
  const out = new TransformStream()
  const writer = out.writable.getWriter()

  const write = async (value: string) => {
    if (closed) return
    last = Date.now()
    await writer.write(encoder.encode(value))
  }

  const sse = (payload: unknown) => `data: ${JSON.stringify(payload)}\n\n`
  const pulse = setInterval(() => {
    if (closed) return
    if (Date.now() - last < 15_000) return
    void write(": keepalive\n\n")
  }, 15_000)

  const stop = () => clearInterval(pulse)

  const flushReason = async () => {
    if (aggregate.reasoning.length <= reason) return
    const delta = aggregate.reasoning.slice(reason)
    reason = aggregate.reasoning.length
    await write(
      sse({
        id: aggregate.id ?? `chatcmpl_${c.generateToolCallId()}`,
        object: "chat.completion.chunk",
        created: aggregate.created ?? Math.floor(Date.now() / 1000),
        model: aggregate.model ?? "tool-bridge",
        choices: [{ index: 0, delta: { reasoning: delta }, finish_reason: null }],
      }),
    )
  }

  const flushFinal = async () => {
    if (!aggregate.content.includes("OPENCODE_FINAL")) return
    const content = c.extractStreamableFinalContent(aggregate.content)
    if (!content || content.length <= final) return
    const delta = content.slice(final)
    final = content.length
    await write(
      sse({
        id: aggregate.id ?? `chatcmpl_${c.generateToolCallId()}`,
        object: "chat.completion.chunk",
        created: aggregate.created ?? Math.floor(Date.now() / 1000),
        model: aggregate.model ?? "tool-bridge",
        choices: [{ index: 0, delta: { content: delta }, finish_reason: null }],
      }),
    )
  }

  const flushCalls = async () => {
    const calls = c.extractProgressiveToolCalls(aggregate.content, options)
    if (calls.length <= emitted) return
    for (let i = emitted; i < calls.length; i++) {
      const call = calls[i]
      await write(
        sse({
          id: aggregate.id ?? `chatcmpl_${c.generateToolCallId()}`,
          object: "chat.completion.chunk",
          created: aggregate.created ?? Math.floor(Date.now() / 1000),
          model: aggregate.model ?? "tool-bridge",
          choices: [
            {
              index: 0,
              delta: {
                tool_calls: [
                  {
                    index: i,
                    id: call.id,
                    type: "function",
                    function: {
                      name: call.function.name,
                      arguments: call.function.arguments,
                    },
                  },
                ],
              },
              finish_reason: null,
            },
          ],
        }),
      )
    }
    emitted = calls.length
  }

  const retry = async () => {
    const next = c.buildInvalidToolBlockRecoveryRequest(body)
    const data = JSON.stringify(next)
    const bytes = new TextEncoder().encode(data)
    const nextHeaders = new Headers(headers)
    nextHeaders.set("content-length", String(bytes.length))
    return fetchFn(url, {
      ...init,
      method: "POST",
      headers: nextHeaders,
      body: bytes,
    })
  }

  const doneCalls = async () => {
    await write(
      sse({
        id: aggregate.id ?? `chatcmpl_${c.generateToolCallId()}`,
        object: "chat.completion.chunk",
        created: aggregate.created ?? Math.floor(Date.now() / 1000),
        model: aggregate.model ?? "tool-bridge",
        choices: [{ index: 0, delta: {}, finish_reason: "tool_calls" }],
        ...(aggregate.usage ? { usage: aggregate.usage } : {}),
      }),
    )
    await write("data: [DONE]\n\n")
    closed = true
    stop()
    await writer.close()
  }

  void (async () => {
    let capped = false
    try {
      while (true) {
        const next = await reader.read()
        if (next.done) {
          let result = c.buildBridgeResultFromText(aggregate.content, aggregate.reasoning, options)
          if (result.kind === "invalid_tool_block" && !badRetry) {
            const again = await retry()
            if ((again.headers.get("content-type") ?? "").includes("text/event-stream") && again.body) {
              badRetry = true
              reader = again.body.getReader()
              raw = ""
              reason = 0
              final = 0
              emitted = 0
              aggregate.id = null
              aggregate.model = null
              aggregate.created = null
              aggregate.reasoning = ""
              aggregate.content = ""
              aggregate.finishReason = null
              aggregate.usage = undefined
              continue
            }
          }

          let closedCalls = 0
          const parsedCalls = result.kind === "tool_calls" ? (result.message.tool_calls ?? []).length : 0
          try {
            closedCalls = c.extractCallEnvelopes(aggregate.content, false, false).length
          } catch {}
          if (closedCalls > parsedCalls && !dropRetry) {
            const again = await retry()
            if ((again.headers.get("content-type") ?? "").includes("text/event-stream") && again.body) {
              dropRetry = true
              reader = again.body.getReader()
              raw = ""
              reason = 0
              final = 0
              emitted = 0
              aggregate.id = null
              aggregate.model = null
              aggregate.created = null
              aggregate.reasoning = ""
              aggregate.content = ""
              aggregate.finishReason = null
              aggregate.usage = undefined
              continue
            }
          }

          if (result.kind === "tool_calls") {
            const calls = result.message.tool_calls ?? []
            for (let i = emitted; i < calls.length; i++) {
              const call = calls[i]
              await write(
                sse({
                  id: aggregate.id ?? `chatcmpl_${c.generateToolCallId()}`,
                  object: "chat.completion.chunk",
                  created: aggregate.created ?? Math.floor(Date.now() / 1000),
                  model: aggregate.model ?? "tool-bridge",
                  choices: [
                    {
                      index: 0,
                      delta: {
                        tool_calls: [
                          {
                            index: i,
                            id: call.id,
                            type: "function",
                            function: call.function,
                          },
                        ],
                      },
                      finish_reason: null,
                    },
                  ],
                }),
              )
            }
            await doneCalls()
            break
          }

          await flushFinal()
          const content = c.extractStreamableFinalContent(aggregate.content) || result.message.content || ""
          const tail = content.slice(final)
          if (tail) {
            await write(
              sse({
                id: aggregate.id ?? `chatcmpl_${c.generateToolCallId()}`,
                object: "chat.completion.chunk",
                created: aggregate.created ?? Math.floor(Date.now() / 1000),
                model: aggregate.model ?? "tool-bridge",
                choices: [{ index: 0, delta: { content: tail }, finish_reason: null }],
              }),
            )
          }
          await write(
            sse({
              id: aggregate.id ?? `chatcmpl_${c.generateToolCallId()}`,
              object: "chat.completion.chunk",
              created: aggregate.created ?? Math.floor(Date.now() / 1000),
              model: aggregate.model ?? "tool-bridge",
              choices: [{ index: 0, delta: {}, finish_reason: aggregate.finishReason ?? "stop" }],
              ...(aggregate.usage ? { usage: aggregate.usage } : {}),
            }),
          )
          await write("data: [DONE]\n\n")
          closed = true
          stop()
          await writer.close()
          break
        }

        raw += decoder.decode(next.value, { stream: true })
        let cut = raw.indexOf("\n\n")
        while (cut !== -1) {
          const event = raw.slice(0, cut)
          raw = raw.slice(cut + 2)
          cut = raw.indexOf("\n\n")
          const line = event
            .split(/\r?\n/)
            .map((part) => part.trim())
            .find((part) => part.startsWith("data:"))
          if (!line) continue
          const payload = line.slice(5).trim()
          if (!payload || payload === "[DONE]") continue
          const parsed = c.tryParseJson(payload)
          if (!parsed.ok) continue
          c.applyChunkToAggregate(aggregate, parsed.value)
          await flushReason()
          await flushCalls()
          if (emitted >= c.MAX_TOOL_CALLS_PER_TURN) {
            capped = true
            try {
              await reader.cancel()
            } catch {}
            break
          }
          await flushFinal()
        }
        if (capped) {
          await doneCalls()
          break
        }
      }
    } catch (error) {
      try {
        await writer.abort(error)
      } catch {}
    } finally {
      closed = true
      stop()
    }
  })()

  return new Response(out.readable, {
    status: response.status,
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache",
    },
  })
}

export async function wrap(
  fetchFn: typeof fetch,
  providerID: string,
  providerOptions: Record<string, any>,
  input: RequestInfo | URL,
  init?: BunFetchRequestInit,
) {
  if (!on(providerID, providerOptions)) return fetchFn(input, init)

  const url = input instanceof Request ? input.url : String(input)
  const method = String(init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase()
  if (!url.includes("nano-gpt.com")) return fetchFn(input, init)
  if (method !== "POST") return fetchFn(input, init)

  const body = await text(input, init)
  if (!body) return fetchFn(input, init)

  const c = await core()
  const parsed = c.tryParseJson(body)
  const hasTools = parsed.ok && Array.isArray(parsed.value?.tools) && parsed.value.tools.length > 0
  if (!hasTools) return fetchFn(input, init)

  const native = !c.requestNeedsBridge(parsed.value)
  if (native) {
    const first = await fetchFn(input, init)
    const type = first.headers.get("content-type") ?? ""
    if (type.includes("text/event-stream")) {
      const text = await first.text()
      if (c.acceptNativeSSE(first.status, text)) {
        return new Response(text, {
          status: first.status,
          headers: clean(first.headers, Buffer.byteLength(text), "text/event-stream; charset=utf-8"),
        })
      }
    } else if (type.includes("application/json")) {
      const text = await first.text()
      const next = c.tryParseJson(text)
      if (next.ok && c.acceptNativeJson(first.status, next.value)) {
        return new Response(text, {
          status: first.status,
          headers: clean(first.headers, Buffer.byteLength(text), "application/json; charset=utf-8"),
        })
      }
    } else if (first.status >= 200 && first.status < 300) {
      const buf = await first.arrayBuffer()
      return new Response(buf, {
        status: first.status,
        headers: clean(first.headers, buf.byteLength),
      })
    }
  }

  const transformed = c.transformRequestForBridge(parsed.value, { forceBridge: !native })
  if (!transformed.bridgeApplied) return fetchFn(input, init)

  const options = {
    toolArgKeyMap: c.buildToolArgumentKeyMap(Array.isArray(transformed.normalizedTools) ? transformed.normalizedTools : []),
    toolRequiredKeyMap: c.buildToolRequiredKeyMap(
      Array.isArray(transformed.normalizedTools) ? transformed.normalizedTools : [],
    ),
  }
  const nextBody = JSON.stringify(transformed.rewritten)
  const bytes = new TextEncoder().encode(nextBody)
  const headers = new Headers(input instanceof Request ? input.headers : {})
  if (init?.headers) {
    const merge = new Headers(init.headers)
    for (const [key, value] of merge) headers.set(key, value)
  }
  headers.set("content-type", "application/json")
  headers.set("content-length", String(bytes.length))

  const response = await fetchFn(url, {
    ...init,
    method: "POST",
    headers,
    body: bytes,
  })
  const type = response.headers.get("content-type") ?? ""
  if (type.includes("text/event-stream")) {
    return stream(fetchFn, response, url, init, headers, transformed.rewritten, options, c)
  }

  const textBody = await response.text()
  const next = c.tryParseJson(textBody)
  if (!next.ok) {
    return new Response(textBody, {
      status: response.status,
      headers: response.headers,
    })
  }

  const choice = Array.isArray(next.value?.choices) ? next.value.choices[0] : null
  const message = choice?.message ?? {}
  const bridged = c.buildChatCompletionFromBridge(
    {
      id: next.value.id,
      model: next.value.model,
      created: next.value.created,
      reasoning: message.reasoning_content ?? "",
      content: message.content ?? "",
      finishReason: choice?.finish_reason,
      usage: next.value.usage,
    },
    options,
  )
  return new Response(JSON.stringify(bridged), {
    status: response.status,
    headers: { "content-type": "application/json" },
  })
}
