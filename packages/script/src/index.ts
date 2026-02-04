import { $, semver } from "bun"
import path from "path"

const rootPkgPath = path.resolve(import.meta.dir, "../../../package.json")
const rootPkg = await Bun.file(rootPkgPath).json()
const expectedBunVersion = rootPkg.packageManager?.split("@")[1]

if (!expectedBunVersion) {
  throw new Error("packageManager field not found in root package.json")
}

// relax version requirement
const expectedBunVersionRange = `^${expectedBunVersion}`

if (!semver.satisfies(process.versions.bun, expectedBunVersionRange)) {
  throw new Error(`This script requires bun@${expectedBunVersionRange}, but you are using bun@${process.versions.bun}`)
}

const env = {
  NANOGPT_CHANNEL: process.env["NANOGPT_CHANNEL"],
  NANOGPT_BUMP: process.env["NANOGPT_BUMP"],
  NANOGPT_VERSION: process.env["NANOGPT_VERSION"],
  NANOGPT_RELEASE: process.env["NANOGPT_RELEASE"],
}
const CHANNEL = await (async () => {
  if (env.NANOGPT_CHANNEL) return env.NANOGPT_CHANNEL
  if (env.NANOGPT_BUMP) return "latest"
  if (env.NANOGPT_VERSION && !env.NANOGPT_VERSION.startsWith("0.0.0-")) return "latest"
  return await $`git branch --show-current`.text().then((x) => x.trim())
})()
const IS_PREVIEW = CHANNEL !== "latest"

const pkg = await Bun.file(path.resolve(import.meta.dir, "../../opencode/package.json")).json()

const VERSION = await (async () => {
  if (env.NANOGPT_VERSION) return env.NANOGPT_VERSION
  if (IS_PREVIEW) return pkg.version
  const version = await fetch("https://registry.npmjs.org/nanocode/latest")
    .then((res) => {
      if (!res.ok) throw new Error(res.statusText)
      return res.json()
    })
    .then((data: any) => data.version)
  const [major, minor, patch] = version.split(".").map((x: string) => Number(x) || 0)
  const t = env.NANOGPT_BUMP?.toLowerCase()
  if (t === "major") return `${major + 1}.0.0`
  if (t === "minor") return `${major}.${minor + 1}.0`
  return `${major}.${minor}.${patch + 1}`
})()

const team = [
  "actions-user",
  "nanogpt",
  "nanocode",
  "rekram1-node",
  "thdxr",
  "kommander",
  "jayair",
  "fwang",
  "adamdotdevin",
  "iamdavidhill",
  "nanocode-agent[bot]",
  "R44VC0RP",
]

export const Script = {
  get channel() {
    return CHANNEL
  },
  get version() {
    return VERSION
  },
  get preview() {
    return IS_PREVIEW
  },
  get release() {
    return !!env.NANOGPT_RELEASE
  },
  get team() {
    return team
  },
}
console.log(`nanocode script`, JSON.stringify(Script, null, 2))
