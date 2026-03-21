import { createSignal, createMemo, onMount, Show } from "solid-js"
import { useDialog } from "@tui/ui/dialog"
import { useSDK } from "../context/sdk"
import { DialogSelect, type DialogSelectOption } from "@tui/ui/dialog-select"
import { Keybind } from "@/util/keybind"
import { map, pipe, sortBy } from "remeda"

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

interface ProviderPreferences {
  preferredProviders?: string[]
  excludedProviders?: string[]
  enableFallback: boolean
  modelOverrides?: Record<
    string,
    {
      preferredProviders?: string[]
      enableFallback?: boolean
    }
  >
}

import { useKV } from "../context/kv"

export function DialogProviderSelection(props: { modelId: string }) {
  const sdk = useSDK()
  const dialog = useDialog()
  const kv = useKV()
  const [data, setData] = createSignal<ProviderSelectionData | null>(null)
  const [loading, setLoading] = createSignal(true)

  // UI State
  const [preferredList, setPreferredList] = createSignal<string[]>([])
  const [enableFallback, setEnableFallback] = createSignal(true)

  const fetchData = async () => {
    setLoading(true)
    try {
      const headers: Record<string, string> = {}
      const directory = sdk.directory ?? process.cwd()
      const encodedDirectory = /[^\x00-\x7F]/.test(directory) ? encodeURIComponent(directory) : directory
      headers["x-opencode-directory"] = encodedDirectory

      // Load local preferences
      const allPrefs = (kv.get("provider_preferences") as ProviderPreferences) || {
        enableFallback: true,
        preferredProviders: [],
        excludedProviders: [],
        modelOverrides: {},
      }
      const urls = [
        `${sdk.url}/@nanogpt/models/${encodeURIComponent(props.modelId)}/providers`,
        `${sdk.url}/@nanogpt/nanogpt/@nanogpt/models/${encodeURIComponent(props.modelId)}/providers`,
      ]
      let modelData: ProviderSelectionData | undefined
      let last = ""

      for (const url of urls) {
        const modelRes = await sdk.fetch(url, { headers })
        const contentType = modelRes.headers.get("content-type") ?? ""
        const text = await modelRes.text()
        if (!modelRes.ok) {
          last = `Model fetch failed: ${modelRes.status} ${text}`
          continue
        }
        if (!contentType.includes("application/json")) {
          last = `Model fetch returned ${contentType || "unknown content-type"}`
          continue
        }
        modelData = JSON.parse(text) as ProviderSelectionData
        break
      }

      if (!modelData) {
        throw new Error(last || "Model fetch failed")
      }

      setData(modelData)

      const modelOverride = allPrefs.modelOverrides?.[props.modelId]
      const globalPreferred = allPrefs.preferredProviders || []

      setPreferredList(modelOverride?.preferredProviders ?? globalPreferred)
      setEnableFallback(modelOverride?.enableFallback ?? allPrefs.enableFallback ?? true)
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
    try {
      const allPrefs = (kv.get("provider_preferences") as ProviderPreferences) || {
        enableFallback: true,
        preferredProviders: [],
        excludedProviders: [],
        modelOverrides: {},
      }

      // Update local preferences
      const newPrefs = {
        ...allPrefs,
        modelOverrides: {
          ...allPrefs.modelOverrides,
          [props.modelId]: {
            preferredProviders: preferredList(),
            enableFallback: enableFallback(),
          },
        },
      }

      kv.set("provider_preferences", newPrefs)
      dialog.clear()
    } catch (err) {
      console.error("Failed to save preferences", err)
    }
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

  const moveProvider = (providerId: string, direction: -1 | 1) => {
    const list = [...preferredList()]
    const index = list.indexOf(providerId)
    if (index === -1) return // Can't move unselected

    // Only moving within the selected list
    const newIndex = index + direction
    if (newIndex < 0 || newIndex >= list.length) return

    const temp = list[index]
    list[index] = list[newIndex]
    list[newIndex] = temp
    setPreferredList(list)
  }

  const options = createMemo(() => {
    if (loading() || !data()) return []

    // We want to show all available providers.
    // Order: Selected ones first (in order), then unselected ones.
    const allProviders = data()?.providers ?? []
    const selected = preferredList()

    return pipe(
      allProviders,
      sortBy(
        (p) => {
          const idx = selected.indexOf(p.provider)
          return idx === -1 ? 999 : idx
        },
        (p) => p.provider,
      ),
      map((p): DialogSelectOption => {
        const isSelected = selected.includes(p.provider)
        const isDefault = false // Logic for "is default" if using global prefs... maybe complex

        return {
          title: p.provider, // No sophisticated rendering yet in title, maybe use gutter
          gutter: <text>{isSelected ? "[x]" : "[ ]"}</text>,
          value: p.provider,
          description: `$${p.pricing.inputPer1kTokens.toFixed(4)} / $${p.pricing.outputPer1kTokens.toFixed(4)}`, // Basic pricing display
          category: isSelected ? "Preferred" : "Available",
          onSelect: () => toggleProvider(p.provider),
        }
      }),
    )
  })

  return (
    <DialogSelect
      title={`Providers: ${data()?.displayName ?? "Loading..."}`}
      placeholder="Filter providers..."
      options={options()}
      keybind={[
        {
          keybind: Keybind.parse("space")[0],
          title: "Toggle",
          onTrigger: (opt) => toggleProvider(opt.value),
        },
        {
          keybind: Keybind.parse("ctrl+up")[0],
          title: "Move Up",
          onTrigger: (opt) => moveProvider(opt.value, -1),
        },
        {
          keybind: Keybind.parse("ctrl+down")[0],
          title: "Move Down",
          onTrigger: (opt) => moveProvider(opt.value, 1),
        },
        {
          keybind: Keybind.parse("ctrl+f")[0],
          title: `Fallback: ${enableFallback() ? "ON" : "OFF"}`,
          onTrigger: () => setEnableFallback(!enableFallback()),
        },
        {
          keybind: Keybind.parse("ctrl+s")[0],
          title: "Save",
          onTrigger: () => handleSave(),
        },
      ]}
    />
  )
}
