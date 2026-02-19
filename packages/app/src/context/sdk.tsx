import type { Event } from "@nanogpt/sdk/v2/client"
import { createSimpleContext } from "@nanogpt/ui/context"
import { createGlobalEmitter } from "@solid-primitives/event-bus"
import { type Accessor, createEffect, createMemo, onCleanup } from "solid-js"
import { useGlobalSDK } from "./global-sdk"

type SDKEventMap = {
  [key in Event["type"]]: Extract<Event, { type: key }>
}

const sdkContext = createSimpleContext({
  name: "SDK",
  init: (props: { directory: Accessor<string> }) => {
    const globalSDK = useGlobalSDK()

    const directory = createMemo(props.directory)
    const client = createMemo(() =>
      globalSDK.createClient({
        directory: directory(),
        throwOnError: true,
      }),
    )

    const emitter = createGlobalEmitter<SDKEventMap>()

    createEffect(() => {
      const unsub = globalSDK.event.on(directory(), (event) => {
        emitter.emit(event.type, event)
      })
      onCleanup(unsub)
    })

    return {
      get directory() {
        return directory()
      },
      get client() {
        return client()
      },
      event: emitter,
      get url() {
        return globalSDK.url
      },
      createClient(opts: Parameters<typeof globalSDK.createClient>[0]) {
        return globalSDK.createClient(opts)
      },
    }
  },
})

export const useSDK: typeof sdkContext.use = sdkContext.use
export const SDKProvider = sdkContext.provider
