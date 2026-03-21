import { runPromiseInstance } from "@/effect/runtime"
import type { Agent } from "@/agent/agent"
import { pathToFileURL } from "url"
import { Skill as S } from "./service"

export namespace Skill {
  export const Info = S.Info
  export type Info = S.Info

  export const InvalidError = S.InvalidError
  export const NameMismatchError = S.NameMismatchError

  export type Interface = S.Interface

  export const Service = S.Service
  export const layer = S.layer
  export const defaultLayer = S.defaultLayer

  export function fmt(list: Info[], opts: { verbose: boolean }) {
    if (list.length === 0) return "No skills are currently available."
    if (opts.verbose) {
      return [
        "",
        ...list.flatMap((skill) => [" ", ` ${skill.name}`, ` ${skill.description}`, ` ${pathToFileURL(skill.location).href}`, " "]),
        "",
      ].join("\n")
    }
    return ["## Available Skills", ...list.map((skill) => `- **${skill.name}**: ${skill.description}`)].join("\n")
  }

  async function svc() {
    return (await import("./service")).Skill
  }

  export async function get(name: string) {
    return runPromiseInstance((await svc()).Service.use((skill) => skill.get(name)))
  }

  export async function all() {
    return runPromiseInstance((await svc()).Service.use((skill) => skill.all()))
  }

  export async function dirs() {
    return runPromiseInstance((await svc()).Service.use((skill) => skill.dirs()))
  }

  export async function available(agent?: Agent.Info) {
    return runPromiseInstance((await svc()).Service.use((skill) => skill.available(agent)))
  }
}
