import { Component, createResource, Show } from "solid-js"
import { Dialog } from "@nanogpt/ui/dialog"
import { useSDK } from "@/context/sdk"
import { Spinner } from "@nanogpt/ui/spinner"

interface Balance {
  usd_balance: string
  nano_balance: string
}

interface SubscriptionUsage {
  state: string
  daily: {
    used: number
    percentUsed: number
  }
  monthly: {
    used: number
    percentUsed: number
  }
  limits: {
    daily: number
    monthly: number
  }
}

interface AccountData {
  balance: Balance | null
  subscription: SubscriptionUsage | null
}

export const DialogNanogpt: Component = () => {
  const sdk = useSDK()

  const [data] = createResource(async (): Promise<AccountData> => {
    const res = await fetch(`${sdk.url}/account`)
    if (!res.ok) {
      return { balance: null, subscription: null }
    }
    return res.json()
  })

  return (
    <Dialog title="NanoGPT Account">
      <div class="flex flex-col gap-6 px-2.5 pb-3 min-w-[400px]">
        <Show when={!data.loading} fallback={
          <div class="flex items-center justify-center py-8">
            <Spinner />
          </div>
        }>
          {/* Balance Section */}
          <div class="flex flex-col gap-2">
            <h3 class="text-14-medium text-text-strong">Balance</h3>
            <Show
              when={data()?.balance}
              fallback={
                <p class="text-14-regular text-text-weak">
                  Not authenticated - set NANOGPT_API_KEY environment variable
                </p>
              }
            >
              {(bal) => (
                <div class="flex items-center gap-2">
                  <span class="size-2 rounded-full bg-text-success-base" />
                  <span class="text-14-regular">
                    <span class="text-text-success-base font-medium">
                      ${parseFloat(bal().usd_balance).toFixed(2)} USD
                    </span>
                    <span class="text-text-weak ml-2">
                      ({parseFloat(bal().nano_balance).toFixed(4)} XNO)
                    </span>
                  </span>
                </div>
              )}
            </Show>
          </div>

          {/* Subscription Section */}
          <div class="flex flex-col gap-2">
            <h3 class="text-14-medium text-text-strong">Subscription</h3>
            <Show
              when={data()?.subscription}
              fallback={
                <p class="text-14-regular text-text-weak">No active subscription</p>
              }
            >
              {(sub) => (
                <div class="flex flex-col gap-1.5">
                  <div class="flex items-center gap-2">
                    <span
                      class="size-2 rounded-full"
                      classList={{
                        "bg-text-success-base": sub().state === "active",
                        "bg-text-warning-base": sub().state !== "active",
                      }}
                    />
                    <span class="text-14-regular text-text-base">
                      Status:{" "}
                      <span
                        classList={{
                          "text-text-success-base": sub().state === "active",
                          "text-text-warning-base": sub().state !== "active",
                        }}
                      >
                        {sub().state}
                      </span>
                    </span>
                  </div>
                  <div class="flex items-center gap-2 pl-4">
                    <span
                      class="text-14-regular"
                      classList={{
                        "text-text-critical-base": sub().daily.percentUsed > 0.9,
                        "text-text-warning-base": sub().daily.percentUsed > 0.7 && sub().daily.percentUsed <= 0.9,
                        "text-text-base": sub().daily.percentUsed <= 0.7,
                      }}
                    >
                      Daily: {sub().daily.used.toLocaleString()}/{sub().limits.daily.toLocaleString()} ({(sub().daily.percentUsed * 100).toFixed(0)}%)
                    </span>
                  </div>
                  <div class="flex items-center gap-2 pl-4">
                    <span
                      class="text-14-regular"
                      classList={{
                        "text-text-critical-base": sub().monthly.percentUsed > 0.9,
                        "text-text-warning-base": sub().monthly.percentUsed > 0.7 && sub().monthly.percentUsed <= 0.9,
                        "text-text-base": sub().monthly.percentUsed <= 0.7,
                      }}
                    >
                      Monthly: {sub().monthly.used.toLocaleString()}/{sub().limits.monthly.toLocaleString()} ({(sub().monthly.percentUsed * 100).toFixed(0)}%)
                    </span>
                  </div>
                </div>
              )}
            </Show>
          </div>
        </Show>
      </div>
    </Dialog>
  )
}
