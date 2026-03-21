import { BusEvent } from "@/bus/bus-event"
import path from "path"
import os from "os"
import fs from "fs"
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

  export type Method = "bun" | "npm" | "pnpm" | "yarn" | "gh-release" | "unknown"

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

  async function readInstallMethodMarker(): Promise<string | null> {
    const markerPaths = [
      path.join(path.dirname(process.execPath), ".nanocode-install-method"),
      path.join(os.homedir(), ".config", "nanocode", "install-method"),
    ]
    for (const markerPath of markerPaths) {
      try {
        const content = await fs.promises.readFile(markerPath, "utf-8")
        const method = content.trim()
        if (method) return method
      } catch {}
    }
    return null
  }

  export async function writeInstallMethodMarker(method: string) {
    const markerPath = path.join(os.homedir(), ".config", "nanocode", "install-method")
    const dir = path.dirname(markerPath)
    await fs.promises.mkdir(dir, { recursive: true }).catch((error) => {
      log.warn("write_install_method_marker_failed", { error, path: dir })
    })
    await fs.promises.writeFile(markerPath, method).catch((error) => {
      log.warn("write_install_method_marker_failed", { error, path: markerPath })
    })
  }

  export async function method() {
    const marker = await readInstallMethodMarker()
    if (marker === "gh-release") return "gh-release"

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

    if (!exec.includes("node_modules")) {
      return "gh-release"
    }

    return "unknown"
  }

  export const UpgradeFailedError = NamedError.create(
    "UpgradeFailedError",
    z.object({
      stderr: z.string(),
    }),
  )

  async function getBrewFormula() {
    const tapFormula = await $`brew list --formula nanogpt-community/tap/nanocode`.throws(false).quiet().text()
    if (tapFormula.includes("nanocode")) return "nanogpt-community/tap/nanocode"
    const coreFormula = await $`brew list --formula nanocode`.throws(false).quiet().text()
    if (coreFormula.includes("nanocode")) return "nanocode"
    return "nanocode"
  }

  async function upgradeFromGitHub(target: string) {
    const platformMap: Record<string, string> = {
      darwin: "darwin",
      linux: "linux",
      win32: "windows",
    }
    const archMap: Record<string, string> = {
      x64: "x64",
      arm64: "arm64",
    }

    const platform = platformMap[os.platform()]
    const arch = archMap[os.arch()]
    if (!platform || !arch) {
      throw new Error(`Unsupported platform: ${os.platform()}/${os.arch()}`)
    }

    const isWindows = os.platform() === "win32"
    const ext = isWindows ? "zip" : "tar.gz"
    const assetName = `nanocode-cli-${platform}-${arch}.${ext}`
    const downloadUrl = `https://github.com/nanogpt-community/nanocode/releases/download/v${target}/${assetName}`

    log.info("downloading", { url: downloadUrl })

    const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "nanocode-upgrade-"))
    const archivePath = path.join(tempDir, assetName)
    const binaryName = path.basename(process.execPath)

    try {
      const response = await fetch(downloadUrl)
      if (!response.ok) {
        throw new Error(`Download failed: ${response.status} ${response.statusText}`)
      }

      const file = Bun.file(archivePath)
      const writer = file.writer()
      if (!response.body) {
        throw new Error("No response body")
      }

      for await (const chunk of response.body as any) {
        writer.write(chunk)
      }
      writer.end()

      const binaryDir = path.join(tempDir, "binary")
      await fs.promises.mkdir(binaryDir)

      if (isWindows) {
        await $`unzip -q ${archivePath} -d ${binaryDir}`.quiet().nothrow()
      } else {
        await $`tar -xzf ${archivePath} -C ${binaryDir}`.quiet().nothrow()
      }

      const extractedFiles = await fs.promises.readdir(binaryDir)
      const binaryFile = extractedFiles.find((f) => f.includes(binaryName)) || binaryName
      const tempBinary = path.join(binaryDir, binaryFile)

      if (!isWindows) {
        await fs.promises.chmod(tempBinary, 0o755)
      }

      const backupPath = process.execPath + ".backup"
      try {
        await fs.promises.rename(process.execPath, backupPath)
      } catch (err) {
        log.warn("backup_failed", { error: err })
      }

      try {
        await fs.promises.rename(tempBinary, process.execPath)
      } catch (err) {
        if (backupPath) {
          await fs.promises.rename(backupPath, process.execPath).catch(() => {})
        }
        throw err
      }

      try {
        await fs.promises.rm(backupPath, { force: true })
      } catch {}

      log.info("upgrade_complete", { target, method: "gh-release" })
    } finally {
      try {
        await fs.promises.rm(tempDir, { recursive: true, force: true })
      } catch {}
    }
  }

  export async function upgrade(method: Method, target: string) {
    switch (method) {
      case "bun":
        await $`bun install -g nanocode@${target}`.quiet().throws(true)
        break
      case "npm":
        await $`npm install -g nanocode@${target}`.quiet().throws(true)
        break
      case "yarn":
        await $`yarn global add nanocode@${target}`.quiet().throws(true)
        break
      case "pnpm":
        await $`pnpm install -g nanocode@${target}`.quiet().throws(true)
        break
      case "gh-release":
        await upgradeFromGitHub(target)
        break
      default:
        throw new Error(`Unknown method: ${method}`)
    }
    log.info("upgraded", { method, target })
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

  export async function latest(installMethod?: Method) {
    const detectedMethod = installMethod ?? (await method())

    if (detectedMethod === "npm" || detectedMethod === "bun" || detectedMethod === "pnpm") {
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

    // Fallback to GitHub releases for unknown/yarn install methods
    return fetch("https://api.github.com/repos/nanogpt-community/nanocode/releases/latest")
      .then((res) => {
        if (!res.ok) throw new Error(res.statusText)
        return res.json()
      })
      .then((data: any) => data.tag_name?.replace(/^v/, "") ?? data.name)
  }
}
