import { BusEvent } from "@/bus/bus-event"
import path from "path"
import { $ } from "bun"
import z from "zod"
import { NamedError } from "@nanogpt/util/error"
import { Log } from "../util/log"
import { iife } from "@/util/iife"
import { Flag } from "../flag/flag"

declare global {
  const NANOGPT_VERSION: string
  const NANOGPT_CHANNEL: string
}

export namespace Installation {
  const log = Log.create({ service: "installation" })

  export type Method = Awaited<ReturnType<typeof method>>

  export const Event = {
    Updated: BusEvent.define(
      "installation.updated",
      z.object({
        version: z.string(),
      }),
    ),
    UpdateAvailable: BusEvent.define(
      "installation.update-available",
      z.object({
        version: z.string(),
      }),
    ),
  }

  export const Info = z
    .object({
      version: z.string(),
      latest: z.string(),
    })
    .meta({
      ref: "InstallationInfo",
    })
  export type Info = z.infer<typeof Info>

  export async function info() {
    return {
      version: VERSION,
      latest: await latest(),
    }
  }

  export function isPreview() {
    return CHANNEL !== "latest"
  }

  export function isLocal() {
    return CHANNEL === "local"
  }

  export async function method() {
    const exec = process.execPath.toLowerCase()

    const checks = [
      {
        name: "bun" as const,
        command: () => $`bun pm ls -g`.throws(false).quiet().text(),
      },
      {
        name: "npm" as const,
        command: () => $`npm list -g --depth=0`.throws(false).quiet().text(),
      },
      {
        name: "yarn" as const,
        command: () => $`yarn global list`.throws(false).quiet().text(),
      },
      {
        name: "pnpm" as const,
        command: () => $`pnpm list -g --depth=0`.throws(false).quiet().text(),
      },
    ]

    // Prioritize based on exec path hints
    checks.sort((a, b) => {
      const aMatches = exec.includes(a.name)
      const bMatches = exec.includes(b.name)
      if (aMatches && !bMatches) return -1
      if (!aMatches && bMatches) return 1
      return 0
    })

    for (const check of checks) {
      const output = await check.command()
      if (output.includes("nanocode")) {
        return check.name
      }
    }

    return "unknown"
  }

  export const UpgradeFailedError = NamedError.create(
    "UpgradeFailedError",
    z.object({
      stderr: z.string(),
    }),
  )

  export async function upgrade(method: Method, target: string) {
    let cmd
    switch (method) {
      case "bun":
        cmd = $`bun install -g nanocode@${target}`
        break
      case "npm":
        cmd = $`npm install -g nanocode@${target}`
        break
      case "yarn":
        cmd = $`yarn global add nanocode@${target}`
        break
      case "pnpm":
        cmd = $`pnpm install -g nanocode@${target}`
        break
      default:
        throw new Error(`Unknown method: ${method}`)
    }
    const result = await cmd.quiet().throws(false)
    log.info("upgraded", {
      method,
      target,
      stdout: result.stdout.toString(),
      stderr: result.stderr.toString(),
    })
    if (result.exitCode !== 0)
      throw new UpgradeFailedError({
        stderr: result.stderr.toString("utf8"),
      })
    await $`${process.execPath} --version`.nothrow().quiet().text()
  }

  // In local dev mode, read version from package.json
  const getLocalVersion = () => {
    try {
      const pkgPath = path.resolve(import.meta.dir, "../../package.json")
      const pkg = require(pkgPath)
      return pkg.version || "local"
    } catch {
      return "local"
    }
  }
  export const VERSION = typeof NANOGPT_VERSION === "string" ? NANOGPT_VERSION : getLocalVersion()
  export const CHANNEL = typeof NANOGPT_CHANNEL === "string" ? NANOGPT_CHANNEL : "local"
  export const USER_AGENT = `nanocode/${CHANNEL}/${VERSION}/${Flag.NANOGPT_CLIENT}`

  export async function latest(_installMethod?: Method) {
    const registry = await iife(async () => {
      const r = (await $`npm config get registry`.quiet().nothrow().text()).trim()
      const reg = r || "https://registry.npmjs.org"
      return reg.endsWith("/") ? reg.slice(0, -1) : reg
    })
    // Use "latest" dist-tag when in local dev mode since "local" doesn't exist on npm
    const channel = CHANNEL === "local" ? "latest" : CHANNEL
    return fetch(`${registry}/nanocode`, {
      headers: {
        Accept: "application/vnd.npm.install-v1+json",
      },
    })
      .then((res) => {
        if (!res.ok) throw new Error(res.statusText)
        return res.json()
      })
      .then((data: any) => data["dist-tags"]?.[channel] ?? data["dist-tags"]?.latest)
  }
}
