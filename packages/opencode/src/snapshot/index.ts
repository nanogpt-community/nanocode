import { runPromiseInstance } from "@/effect/runtime"
import { Snapshot as S } from "./service"

export namespace Snapshot {
  export const Patch = S.Patch
  export type Patch = S.Patch

  export const FileDiff = S.FileDiff
  export type FileDiff = S.FileDiff

  export type Interface = S.Interface

  export const Service = S.Service
  export const layer = S.layer
  export const defaultLayer = S.defaultLayer

  async function svc() {
    return (await import("./service")).Snapshot
  }

  export async function cleanup() {
    return runPromiseInstance((await svc()).Service.use((s) => s.cleanup()))
  }

  export async function track() {
    return runPromiseInstance((await svc()).Service.use((s) => s.track()))
  }

  export async function patch(hash: string) {
    return runPromiseInstance((await svc()).Service.use((s) => s.patch(hash)))
  }

  export async function restore(snapshot: string) {
    return runPromiseInstance((await svc()).Service.use((s) => s.restore(snapshot)))
  }

  export async function revert(patches: Patch[]) {
    return runPromiseInstance((await svc()).Service.use((s) => s.revert(patches)))
  }

  export async function diff(hash: string) {
    return runPromiseInstance((await svc()).Service.use((s) => s.diff(hash)))
  }

  export async function diffFull(from: string, to: string) {
    return runPromiseInstance((await svc()).Service.use((s) => s.diffFull(from, to)))
  }
}
