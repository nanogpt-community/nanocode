import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test"
import { SessionProcessor } from "../../src/session/processor"
import { LLM } from "../../src/session/llm"
import { Config } from "../../src/config/config"
import { Session } from "../../src/session"
import { SessionStatus } from "../../src/session/status"
import { MessageV2 } from "../../src/session/message-v2"
import { Plugin } from "../../src/plugin"

function stream(items: unknown[]) {
  return {
    fullStream: (async function* () {
      for (const item of items) {
        yield item
      }
    })(),
  }
}

function assistant() {
  return {
    id: "message_assistant_1",
    sessionID: "session_1",
    role: "assistant",
    time: { created: Date.now() },
    parentID: "message_user_1",
    modelID: "zai-org/glm-5:thinking",
    providerID: "nanogpt",
    mode: "primary",
    agent: "test",
    path: {
      cwd: "/tmp",
      root: "/tmp",
    },
    cost: 0,
    tokens: {
      input: 0,
      output: 0,
      reasoning: 0,
      cache: {
        read: 0,
        write: 0,
      },
    },
  } as any
}

function model(providerID = "nanogpt") {
  return {
    id: "zai-org/glm-5:thinking",
    providerID,
    capabilities: {
      reasoning: true,
      interleaved: { field: "reasoning_content" as const },
    },
  } as any
}

describe("session.processor think tag parsing", () => {
  const calls: Array<{ part: any; delta?: string }> = []
  let streamSpy: any
  let configSpy: any
  let statusSpy: any
  let updatePartSpy: any
  let updateMessageSpy: any
  let partsSpy: any
  let triggerSpy: any

  beforeEach(() => {
    calls.length = 0
    configSpy = spyOn(Config, "get").mockResolvedValue({ experimental: {} } as any)
    statusSpy = spyOn(SessionStatus, "set").mockImplementation(() => undefined)
    updatePartSpy = spyOn(Session, "updatePart").mockImplementation(async (input: any) => {
      const part = "delta" in input ? input.part : input
      const delta = "delta" in input ? input.delta : undefined
      calls.push({
        part: JSON.parse(JSON.stringify(part)),
        delta,
      })
      return part
    })
    updateMessageSpy = spyOn(Session, "updateMessage").mockImplementation(async (msg: any) => msg)
    partsSpy = spyOn(MessageV2, "parts").mockResolvedValue([])
    triggerSpy = spyOn(Plugin, "trigger").mockImplementation(async (_name: string, _ctx: any, data: any) => data)
  })

  afterEach(() => {
    streamSpy?.mockRestore()
    configSpy.mockRestore()
    statusSpy.mockRestore()
    updatePartSpy.mockRestore()
    updateMessageSpy.mockRestore()
    partsSpy.mockRestore()
    triggerSpy.mockRestore()
  })

  test("splits inline <think> blocks into reasoning parts for NanoGPT reasoning models", async () => {
    streamSpy = spyOn(LLM, "stream").mockResolvedValue(
      stream([
        { type: "start" },
        { type: "text-start", id: "txt-1" },
        { type: "text-delta", id: "txt-1", text: "<think>plan</think>answer" },
        { type: "text-end", id: "txt-1" },
        { type: "finish" },
      ]) as any,
    )

    const p = SessionProcessor.create({
      assistantMessage: assistant(),
      sessionID: "session_1",
      model: model(),
      abort: new AbortController().signal,
    })

    const result = await p.process({
      user: {} as any,
      sessionID: "session_1",
      model: model(),
      agent: {} as any,
      system: [],
      abort: new AbortController().signal,
      messages: [],
      tools: {},
    })

    expect(result).toBe("continue")

    const text = calls
      .filter((x) => x.part.type === "text" && x.delta)
      .map((x) => x.delta)
      .join("")
    const reasoning = calls
      .filter((x) => x.part.type === "reasoning" && x.delta)
      .map((x) => x.delta)
      .join("")

    expect(text).toBe("answer")
    expect(reasoning).toBe("plan")
    expect(calls.some((x) => x.delta?.includes("<think>"))).toBe(false)
  })

  test("handles think tags split across streamed chunks", async () => {
    streamSpy = spyOn(LLM, "stream").mockResolvedValue(
      stream([
        { type: "start" },
        { type: "text-start", id: "txt-2" },
        { type: "text-delta", id: "txt-2", text: "<thi" },
        { type: "text-delta", id: "txt-2", text: "nk>step" },
        { type: "text-delta", id: "txt-2", text: "</thi" },
        { type: "text-delta", id: "txt-2", text: "nk>done" },
        { type: "text-end", id: "txt-2" },
        { type: "finish" },
      ]) as any,
    )

    const p = SessionProcessor.create({
      assistantMessage: assistant(),
      sessionID: "session_1",
      model: model(),
      abort: new AbortController().signal,
    })

    await p.process({
      user: {} as any,
      sessionID: "session_1",
      model: model(),
      agent: {} as any,
      system: [],
      abort: new AbortController().signal,
      messages: [],
      tools: {},
    })

    const text = calls
      .filter((x) => x.part.type === "text" && x.delta)
      .map((x) => x.delta)
      .join("")
    const reasoning = calls
      .filter((x) => x.part.type === "reasoning" && x.delta)
      .map((x) => x.delta)
      .join("")

    expect(text).toBe("done")
    expect(reasoning).toBe("step")
  })

  test("keeps literal think tags for non-NanoGPT providers", async () => {
    streamSpy = spyOn(LLM, "stream").mockResolvedValue(
      stream([
        { type: "start" },
        { type: "text-start", id: "txt-3" },
        { type: "text-delta", id: "txt-3", text: "<think>plan</think>answer" },
        { type: "text-end", id: "txt-3" },
        { type: "finish" },
      ]) as any,
    )

    const p = SessionProcessor.create({
      assistantMessage: assistant(),
      sessionID: "session_1",
      model: model("openrouter"),
      abort: new AbortController().signal,
    })

    await p.process({
      user: {} as any,
      sessionID: "session_1",
      model: model("openrouter"),
      agent: {} as any,
      system: [],
      abort: new AbortController().signal,
      messages: [],
      tools: {},
    })

    const text = calls
      .filter((x) => x.part.type === "text" && x.delta)
      .map((x) => x.delta)
      .join("")
    const reasoningCount = calls.filter((x) => x.part.type === "reasoning" && x.delta).length

    expect(text).toContain("<think>plan</think>")
    expect(reasoningCount).toBe(0)
  })
})
