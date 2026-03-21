import type { Agent } from "../agent/agent"
import { runtime } from "@/effect/runtime"
import { Truncate as S } from "./truncate-effect"

export namespace Truncate {
  export const MAX_LINES = S.MAX_LINES
  export const MAX_BYTES = S.MAX_BYTES
  export const DIR = S.DIR
  export const GLOB = S.GLOB

  export type Result = S.Result

  export type Options = S.Options

  async function svc() {
    return (await import("./truncate-effect")).Truncate
  }

  export async function output(text: string, options: Options = {}, agent?: Agent.Info): Promise<Result> {
    return runtime.runPromise((await svc()).Service.use((s) => s.output(text, options, agent)))
  }
}
