import { createOpencodeClient } from "@nanogpt/sdk/v2/client"
import type { ServerConnection } from "@/context/server"

type CreateSdkForServerInput = Omit<NonNullable<Parameters<typeof createOpencodeClient>[0]>, "baseUrl"> & {
  server: ServerConnection.HttpBase
}

export function createSdkForServer({
  server,
  ...config
}: CreateSdkForServerInput): ReturnType<typeof createOpencodeClient> {
  const auth = (() => {
    if (!server.password) return
    return {
      Authorization: `Basic ${btoa(`${server.username ?? "nanocode"}:${server.password}`)}`,
    }
  })()

  return createOpencodeClient({
    ...config,
    headers: { ...config.headers, ...auth },
    baseUrl: server.url,
  })
}
