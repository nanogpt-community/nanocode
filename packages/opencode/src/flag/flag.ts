function truthy(key: string) {
  const value = process.env[key]?.toLowerCase()
  return value === "true" || value === "1"
}

export namespace Flag {
  export const NANOGPT_AUTO_SHARE = truthy("NANOGPT_AUTO_SHARE")
  export const NANOGPT_GIT_BASH_PATH = process.env["NANOGPT_GIT_BASH_PATH"]
  export const NANOGPT_CONFIG = process.env["NANOGPT_CONFIG"]
  export declare const NANOGPT_TUI_CONFIG: string | undefined
  export declare const NANOGPT_CONFIG_DIR: string | undefined
  export const NANOGPT_CONFIG_CONTENT = process.env["NANOGPT_CONFIG_CONTENT"]
  export const NANOGPT_DISABLE_AUTOUPDATE = truthy("NANOGPT_DISABLE_AUTOUPDATE")
  export const NANOGPT_DISABLE_PRUNE = truthy("NANOGPT_DISABLE_PRUNE")
  export const NANOGPT_DISABLE_TERMINAL_TITLE = truthy("NANOGPT_DISABLE_TERMINAL_TITLE")
  export const NANOGPT_PERMISSION = process.env["NANOGPT_PERMISSION"]
  export const NANOGPT_DISABLE_DEFAULT_PLUGINS = truthy("NANOGPT_DISABLE_DEFAULT_PLUGINS")
  export const NANOGPT_DISABLE_LSP_DOWNLOAD = truthy("NANOGPT_DISABLE_LSP_DOWNLOAD")
  export const NANOGPT_ENABLE_EXPERIMENTAL_MODELS = truthy("NANOGPT_ENABLE_EXPERIMENTAL_MODELS")
  export const NANOGPT_DISABLE_AUTOCOMPACT = truthy("NANOGPT_DISABLE_AUTOCOMPACT")
  export const NANOGPT_DISABLE_MODELS_FETCH = truthy("NANOGPT_DISABLE_MODELS_FETCH")
  export const NANOGPT_DISABLE_CLAUDE_CODE = truthy("NANOGPT_DISABLE_CLAUDE_CODE")
  export const NANOGPT_DISABLE_CLAUDE_CODE_PROMPT =
    NANOGPT_DISABLE_CLAUDE_CODE || truthy("NANOGPT_DISABLE_CLAUDE_CODE_PROMPT")
  export const NANOGPT_DISABLE_CLAUDE_CODE_SKILLS =
    NANOGPT_DISABLE_CLAUDE_CODE || truthy("NANOGPT_DISABLE_CLAUDE_CODE_SKILLS")
  export const NANOGPT_DISABLE_EXTERNAL_SKILLS =
    NANOGPT_DISABLE_CLAUDE_CODE_SKILLS || truthy("NANOGPT_DISABLE_EXTERNAL_SKILLS")
  export declare const NANOGPT_DISABLE_PROJECT_CONFIG: boolean
  export const NANOGPT_FAKE_VCS = process.env["NANOGPT_FAKE_VCS"]
  export declare const NANOGPT_CLIENT: string
  export const NANOGPT_SERVER_PASSWORD = process.env["NANOGPT_SERVER_PASSWORD"]
  export const NANOGPT_SERVER_USERNAME = process.env["NANOGPT_SERVER_USERNAME"]
  export const NANOGPT_ENABLE_QUESTION_TOOL = truthy("NANOGPT_ENABLE_QUESTION_TOOL")

  // Experimental
  export const NANOGPT_EXPERIMENTAL = truthy("NANOGPT_EXPERIMENTAL")
  export const NANOGPT_EXPERIMENTAL_FILEWATCHER = truthy("NANOGPT_EXPERIMENTAL_FILEWATCHER")
  export const NANOGPT_EXPERIMENTAL_DISABLE_FILEWATCHER = truthy("NANOGPT_EXPERIMENTAL_DISABLE_FILEWATCHER")
  export const NANOGPT_EXPERIMENTAL_ICON_DISCOVERY =
    NANOGPT_EXPERIMENTAL || truthy("NANOGPT_EXPERIMENTAL_ICON_DISCOVERY")

  const copy = process.env["NANOGPT_EXPERIMENTAL_DISABLE_COPY_ON_SELECT"]
  export const NANOGPT_EXPERIMENTAL_DISABLE_COPY_ON_SELECT =
    copy === undefined ? process.platform === "win32" : truthy("NANOGPT_EXPERIMENTAL_DISABLE_COPY_ON_SELECT")
  export const NANOGPT_ENABLE_EXA =
    truthy("NANOGPT_ENABLE_EXA") || NANOGPT_EXPERIMENTAL || truthy("NANOGPT_EXPERIMENTAL_EXA")
  export const NANOGPT_EXPERIMENTAL_BASH_MAX_OUTPUT_LENGTH = number("NANOGPT_EXPERIMENTAL_BASH_MAX_OUTPUT_LENGTH")
  export const NANOGPT_EXPERIMENTAL_BASH_DEFAULT_TIMEOUT_MS = number("NANOGPT_EXPERIMENTAL_BASH_DEFAULT_TIMEOUT_MS")
  export const NANOGPT_EXPERIMENTAL_OUTPUT_TOKEN_MAX = number("NANOGPT_EXPERIMENTAL_OUTPUT_TOKEN_MAX")
  export const NANOGPT_EXPERIMENTAL_OXFMT = NANOGPT_EXPERIMENTAL || truthy("NANOGPT_EXPERIMENTAL_OXFMT")
  export const NANOGPT_EXPERIMENTAL_LSP_TY = truthy("NANOGPT_EXPERIMENTAL_LSP_TY")
  export const NANOGPT_EXPERIMENTAL_LSP_TOOL = NANOGPT_EXPERIMENTAL || truthy("NANOGPT_EXPERIMENTAL_LSP_TOOL")
  export const NANOGPT_DISABLE_FILETIME_CHECK = truthy("NANOGPT_DISABLE_FILETIME_CHECK")
  export const NANOGPT_EXPERIMENTAL_PLAN_MODE = NANOGPT_EXPERIMENTAL || truthy("NANOGPT_EXPERIMENTAL_PLAN_MODE")
  export const NANOGPT_EXPERIMENTAL_MARKDOWN = truthy("NANOGPT_EXPERIMENTAL_MARKDOWN")
  export const NANOGPT_MODELS_URL = process.env["NANOGPT_MODELS_URL"]
  export const NANOGPT_MODELS_PATH = process.env["NANOGPT_MODELS_PATH"]

  function number(key: string) {
    const value = process.env[key]
    if (!value) return undefined
    const parsed = Number(value)
    return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined
  }
}

// Dynamic getter for NANOGPT_DISABLE_PROJECT_CONFIG
// This must be evaluated at access time, not module load time,
// because external tooling may set this env var at runtime
Object.defineProperty(Flag, "NANOGPT_DISABLE_PROJECT_CONFIG", {
  get() {
    return truthy("NANOGPT_DISABLE_PROJECT_CONFIG")
  },
  enumerable: true,
  configurable: false,
})

// Dynamic getter for NANOGPT_TUI_CONFIG
// This must be evaluated at access time, not module load time,
// because tests and external tooling may set this env var at runtime
Object.defineProperty(Flag, "NANOGPT_TUI_CONFIG", {
  get() {
    return process.env["NANOGPT_TUI_CONFIG"]
  },
  enumerable: true,
  configurable: false,
})

// Dynamic getter for NANOGPT_CONFIG_DIR
// This must be evaluated at access time, not module load time,
// because external tooling may set this env var at runtime
Object.defineProperty(Flag, "NANOGPT_CONFIG_DIR", {
  get() {
    return process.env["NANOGPT_CONFIG_DIR"]
  },
  enumerable: true,
  configurable: false,
})

// Dynamic getter for NANOGPT_CLIENT
// This must be evaluated at access time, not module load time,
// because some commands override the client at runtime
Object.defineProperty(Flag, "NANOGPT_CLIENT", {
  get() {
    return process.env["NANOGPT_CLIENT"] ?? "cli"
  },
  enumerable: true,
  configurable: false,
})
