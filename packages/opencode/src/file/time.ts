import { runPromiseInstance } from "@/effect/runtime"
import type { SessionID } from "@/session/schema"
import { FileTime as S } from "./time-service"

export namespace FileTime {
  export type Stamp = S.Stamp

  export type Interface = S.Interface

  export const Service = S.Service
  export const layer = S.layer

  async function svc() {
    return (await import("./time-service")).FileTime
  }

  export async function read(sessionID: SessionID, file: string) {
    return runPromiseInstance((await svc()).Service.use((s) => s.read(sessionID, file)))
  }

  export async function get(sessionID: SessionID, file: string) {
    return runPromiseInstance((await svc()).Service.use((s) => s.get(sessionID, file)))
  }

  export async function assert(sessionID: SessionID, filepath: string) {
    return runPromiseInstance((await svc()).Service.use((s) => s.assert(sessionID, filepath)))
  }

  export async function withLock<T>(filepath: string, fn: () => Promise<T>): Promise<T> {
    return runPromiseInstance((await svc()).Service.use((s) => s.withLock(filepath, fn)))
  }
}
