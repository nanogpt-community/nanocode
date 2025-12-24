interface ImportMetaEnv {
  readonly VITE_NANOGPT_SERVER_HOST: string
  readonly VITE_NANOGPT_SERVER_PORT: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
