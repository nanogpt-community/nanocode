import { describe, expect, test } from "bun:test"
import { applyPath, backPath, forwardPath, type TitlebarHistory } from "./titlebar-history"

function history(): TitlebarHistory {
  return { stack: [], index: 0, action: undefined }
}

describe("titlebar history", () => {
  test("append and trim keeps max bounded", () => {
    let state = history()
    state = applyPath(state, "/", 3)
    state = applyPath(state, "@nanogpt/a", 3)
    state = applyPath(state, "@nanogpt/b", 3)
    state = applyPath(state, "@nanogpt/c", 3)

    expect(state.stack).toEqual(["@nanogpt/a", "@nanogpt/b", "@nanogpt/c"])
    expect(state.stack.length).toBe(3)
    expect(state.index).toBe(2)
  })

  test("back and forward indexes stay correct after trimming", () => {
    let state = history()
    state = applyPath(state, "/", 3)
    state = applyPath(state, "@nanogpt/a", 3)
    state = applyPath(state, "@nanogpt/b", 3)
    state = applyPath(state, "@nanogpt/c", 3)

    expect(state.stack).toEqual(["@nanogpt/a", "@nanogpt/b", "@nanogpt/c"])
    expect(state.index).toBe(2)

    const back = backPath(state)
    expect(back?.to).toBe("@nanogpt/b")
    expect(back?.state.index).toBe(1)

    const afterBack = applyPath(back!.state, back!.to, 3)
    expect(afterBack.stack).toEqual(["@nanogpt/a", "@nanogpt/b", "@nanogpt/c"])
    expect(afterBack.index).toBe(1)

    const forward = forwardPath(afterBack)
    expect(forward?.to).toBe("@nanogpt/c")
    expect(forward?.state.index).toBe(2)

    const afterForward = applyPath(forward!.state, forward!.to, 3)
    expect(afterForward.stack).toEqual(["@nanogpt/a", "@nanogpt/b", "@nanogpt/c"])
    expect(afterForward.index).toBe(2)
  })

  test("action-driven navigation does not push duplicate history entries", () => {
    const state: TitlebarHistory = {
      stack: ["/", "@nanogpt/a", "@nanogpt/b"],
      index: 2,
      action: undefined,
    }

    const back = backPath(state)
    expect(back?.to).toBe("@nanogpt/a")

    const next = applyPath(back!.state, back!.to, 10)
    expect(next.stack).toEqual(["/", "@nanogpt/a", "@nanogpt/b"])
    expect(next.index).toBe(1)
    expect(next.action).toBeUndefined()
  })
})
