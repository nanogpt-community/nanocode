import { $ } from "bun"

import { copyBinaryToSidecarFolder, getCurrentSidecar, RUST_TARGET as DEFAULT_RUST_TARGET } from "./utils"

const RUST_TARGET = Bun.env.TAURI_ENV_TARGET_TRIPLE || DEFAULT_RUST_TARGET

const sidecarConfig = getCurrentSidecar(RUST_TARGET)

const binaryPath = `../opencode/dist/${sidecarConfig.ocBinary}/bin/nanocode${process.platform === "win32" ? ".exe" : ""}`

await $`cd ../opencode && bun run build --single`

await copyBinaryToSidecarFolder(binaryPath, RUST_TARGET)
