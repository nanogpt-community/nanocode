import { Context } from "@/util/context"

const ctx = Context.create<{ provider?: string }>("server-request")

export namespace RequestContext {
  export function provide<R>(input: { provider?: string }, fn: () => R) {
    return ctx.provide(input, fn)
  }

  export function provider() {
    try {
      return ctx.use().provider
    } catch {
      return undefined
    }
  }
}
