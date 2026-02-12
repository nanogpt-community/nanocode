import { $ } from "bun"

import { copyBinaryToSidecarFolder, getCurrentSidecar, RUST_TARGET, windowsify } from "./utils"

const TARGET = Bun.env.TAURI_ENV_TARGET_TRIPLE || RUST_TARGET

const sidecarConfig = getCurrentSidecar(TARGET)

const binaryPath = windowsify(`../opencode/dist/${sidecarConfig.ocBinary}/bin/nanocode`)

await (sidecarConfig.ocBinary.includes("-baseline")
  ? $`cd ../opencode && bun run build --single --baseline`
  : $`cd ../opencode && bun run build --single`)

await copyBinaryToSidecarFolder(binaryPath, TARGET)
