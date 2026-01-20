import { createSignal, Show, For, onMount } from "solid-js"
import { Dialog } from "@nanogpt/ui/dialog"
import { Button } from "@nanogpt/ui/button"
import { Icon } from "@nanogpt/ui/icon"
import { useSDK } from "@/context/sdk"
import { useDialog } from "@nanogpt/ui/context/dialog"

interface ProviderPricing {
  inputPer1kTokens: number
  outputPer1kTokens: number
}

interface ProviderInfo {
  provider: string
  pricing: ProviderPricing
  available: boolean
}

interface ProviderSelectionData {
  canonicalId: string
  displayName: string
  supportsProviderSelection: boolean
  defaultPrice: ProviderPricing
  providers: ProviderInfo[]
}

import { useProviderPreferences } from "@/hooks/use-provider-preferences"

export const DialogProviderSelection = (props: { modelId: string }) => {
  const sdk = useSDK()
  const dialog = useDialog()

  const { getPreferencesForModel, setPreferencesForModel } = useProviderPreferences()

  const [data, setData] = createSignal<ProviderSelectionData | null>(null)
  const [loading, setLoading] = createSignal(true)
  const [saving, setSaving] = createSignal(false)

  // Computed state for the UI
  const [preferredList, setPreferredList] = createSignal<string[]>([])
  const [enableFallback, setEnableFallback] = createSignal(true)

  const fetchData = async () => {
    setLoading(true)
    try {
      const modelRes = await fetch(`${sdk.url}/nanogpt/models/${encodeURIComponent(props.modelId)}/providers`)

      if (!modelRes.ok) throw new Error("Failed to fetch data")

      const modelData = (await modelRes.json()) as ProviderSelectionData
      setData(modelData)

      // Initialize UI state from local preferences
      const prefs = getPreferencesForModel(props.modelId)
      setPreferredList(prefs.preferredProviders)
      setEnableFallback(prefs.enableFallback)
    } catch (err) {
      console.error("Failed to load provider data", err)
    } finally {
      setLoading(false)
    }
  }

  onMount(() => {
    fetchData()
  })

  const handleSave = async () => {
    setSaving(true)
    try {
      setPreferencesForModel(props.modelId, {
        preferredProviders: preferredList(),
        enableFallback: enableFallback(),
      })
      dialog.close()
    } catch (err) {
      console.error("Failed to save preferences", err)
    } finally {
      setSaving(false)
    }
  }

  const moveUp = (index: number) => {
    if (index === 0) return
    const list = [...preferredList()]
    const temp = list[index]
    list[index] = list[index - 1]
    list[index - 1] = temp
    setPreferredList(list)
  }

  const moveDown = (index: number) => {
    if (index === preferredList().length - 1) return
    const list = [...preferredList()]
    const temp = list[index]
    list[index] = list[index + 1]
    list[index + 1] = temp
    setPreferredList(list)
  }

  const toggleFallback = () => {
    setEnableFallback(!enableFallback())
  }

  const toggleProvider = (providerId: string) => {
    const list = [...preferredList()]
    const index = list.indexOf(providerId)
    if (index === -1) {
      list.push(providerId)
    } else {
      list.splice(index, 1)
    }
    setPreferredList(list)
  }

  return (
    <Dialog title="Provider Selection">
      <div class="flex flex-col gap-4 p-1 min-w-[500px]">
        <Show when={!loading()} fallback={<div class="p-4 text-center text-text-subtle">Loading...</div>}>
          <div class="text-sm text-text-subtle">
            Configure upstream providers for <span class="font-bold text-text-primary">{data()?.displayName}</span>.
          </div>

          <div class="flex flex-col gap-2 border border-border-base rounded-md p-2">
            <div class="text-xs font-bold uppercase text-text-subtle mb-1">Available Providers</div>
            <For each={data()?.providers}>
              {(p) => {
                const isSelected = () => preferredList().includes(p.provider)
                const index = () => preferredList().indexOf(p.provider)
                return (
                  <div class="flex items-center justify-between p-2 rounded-md hover:bg-surface-raised-base">
                    <div class="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={isSelected()}
                        onChange={() => toggleProvider(p.provider)}
                        class="cursor-pointer"
                      />
                      <span class={!p.available ? "opacity-50 line-through text-13-medium" : "text-13-medium"}>
                        {p.provider}
                      </span>
                      <span class="text-xs text-text-subtle ml-2">
                        (${p.pricing.inputPer1kTokens.toFixed(4)} / ${p.pricing.outputPer1kTokens.toFixed(4)})
                      </span>
                    </div>
                    <Show when={isSelected()}>
                      <div class="flex gap-1">
                        <Button size="small" variant="ghost" onClick={() => moveUp(index())} disabled={index() === 0}>
                          <Icon name="arrow-up" class="size-3" />
                        </Button>
                        <Button
                          size="small"
                          variant="ghost"
                          onClick={() => moveDown(index())}
                          disabled={index() === preferredList().length - 1}
                        >
                          <Icon name="arrow-up" class="size-3 rotate-180" />
                        </Button>
                      </div>
                    </Show>
                  </div>
                )
              }}
            </For>
          </div>

          <div class="flex items-center gap-2 mt-2">
            <input
              type="checkbox"
              id="fallback"
              checked={enableFallback()}
              onChange={toggleFallback}
              class="cursor-pointer"
            />
            <label for="fallback" class="text-13-medium cursor-pointer select-none">
              Enable fallback to platform default
            </label>
          </div>

          <div class="mt-4 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => dialog.close()}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleSave} disabled={saving()}>
              {saving() ? "Saving..." : "Save Preferences"}
            </Button>
          </div>
        </Show>
      </div>
    </Dialog>
  )
}
