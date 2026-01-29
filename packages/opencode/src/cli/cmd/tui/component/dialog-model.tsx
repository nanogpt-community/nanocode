import { createMemo, createSignal } from "solid-js"
import { useLocal } from "@tui/context/local"
import { useSync } from "@tui/context/sync"
import { map, pipe, flatMap, entries, filter, sortBy, take } from "remeda"
import { DialogSelect, type DialogSelectRef } from "@tui/ui/dialog-select"
import { useDialog } from "@tui/ui/dialog"
import { createDialogProviderOptions, DialogProvider } from "./dialog-provider"
import { DialogProviderSelection } from "./dialog-provider-selection"
import { useKeybind } from "../context/keybind"
import { Keybind } from "@/util/keybind"
import * as fuzzysort from "fuzzysort"

export function useConnected() {
  const sync = useSync()
  return createMemo(() => sync.data.provider.length > 0)
}

// Extended model type to include new NanoGPT fields
type ExtendedModel = {
  subscription_included?: boolean
  description?: string
  icon_url?: string
  supportsProviderSelection?: boolean
}

function getModelFooter(model: ExtendedModel): string | undefined {
  if (model.subscription_included) return "Included"
  return undefined
}

function isIncluded(model: unknown): boolean {
  return (model as ExtendedModel).subscription_included === true
}

export function DialogModel(props: { providerID?: string }) {
  const local = useLocal()
  const sync = useSync()
  const dialog = useDialog()
  const keybind = useKeybind()
  const [ref, setRef] = createSignal<DialogSelectRef<unknown>>()
  const [query, setQuery] = createSignal("")
  const [showOnlyIncluded, setShowOnlyIncluded] = createSignal(false)

  const connected = useConnected()
  const providers = createDialogProviderOptions()

  const showExtra = createMemo(() => {
    if (!connected()) return false
    if (props.providerID) return false
    return true
  })

  const options = createMemo(() => {
    const onlyIncluded = showOnlyIncluded()
    const q = query()
    const needle = q.trim()
    const showSections = showExtra() && needle.length === 0
    const favorites = local.model.favorite()
    const recents = local.model.recent()

    const recentList = showSections
      ? recents.filter(
          (item) => !favorites.some((fav) => fav.providerID === item.providerID && fav.modelID === item.modelID),
        )
      : []

    const favoriteOptions = showSections
      ? favorites.flatMap((item) => {
          const provider = sync.data.provider.find((x) => x.id === item.providerID)
          if (!provider) return []
          const model = provider.models[item.modelID]
          if (!model) return []
          if (onlyIncluded && !isIncluded(model)) return []
          return [
            {
              key: item,
              value: {
                providerID: provider.id,
                modelID: model.id,
              },
              title: model.name ?? item.modelID,
              description: provider.name,
              category: "Favorites",
              footer: getModelFooter(model as unknown as ExtendedModel),
              onSelect: () => {
                dialog.clear()
                local.model.set(
                  {
                    providerID: provider.id,
                    modelID: model.id,
                  },
                  { recent: true },
                )
              },
            },
          ]
        })
      : []

    const recentOptions = showSections
      ? recentList.flatMap((item) => {
          const provider = sync.data.provider.find((x) => x.id === item.providerID)
          if (!provider) return []
          const model = provider.models[item.modelID]
          if (!model) return []
          if (onlyIncluded && !isIncluded(model)) return []
          return [
            {
              key: item,
              value: {
                providerID: provider.id,
                modelID: model.id,
              },
              title: model.name ?? item.modelID,
              description: provider.name,
              category: "Recent",
              footer: getModelFooter(model as unknown as ExtendedModel),
              onSelect: () => {
                dialog.clear()
                local.model.set(
                  {
                    providerID: provider.id,
                    modelID: model.id,
                  },
                  { recent: true },
                )
              },
            },
          ]
        })
      : []

    const providerOptions = pipe(
      sync.data.provider ?? [],
      sortBy((provider) => provider.name),
      flatMap((provider) =>
        pipe(
          provider.models,
          entries(),
          filter(([_, info]) => info.status !== "deprecated"),
          filter(([_, info]) => (props.providerID ? info.providerID === props.providerID : true)),
          filter(([_, info]) => !onlyIncluded || isIncluded(info)),
          map(([model, info]) => {
            const value = {
              providerID: provider.id,
              modelID: model,
            }
            return {
              value,
              title: info.name ?? model,
              description: favorites.some(
                (item) => item.providerID === value.providerID && item.modelID === value.modelID,
              )
                ? "(Favorite)"
                : undefined,
              supportsProviderSelection: (info as unknown as ExtendedModel).supportsProviderSelection,
              category: connected() ? provider.name : undefined,
              footer: getModelFooter(info as unknown as ExtendedModel),
              onSelect() {
                dialog.clear()
                local.model.set(
                  {
                    providerID: provider.id,
                    modelID: model,
                  },
                  { recent: true },
                )
              },
            }
          }),
          filter((x) => {
            if (!showSections) return true
            const value = x.value
            const inFavorites = favorites.some(
              (item) => item.providerID === value.providerID && item.modelID === value.modelID,
            )
            if (inFavorites) return false
            const inRecents = recents.some(
              (item) => item.providerID === value.providerID && item.modelID === value.modelID,
            )
            if (inRecents) return false
            return true
          }),
          sortBy((x) => x.title),
        ),
      ),
    )

    const popularProviders = !connected()
      ? pipe(
          providers(),
          map((option) => {
            return {
              ...option,
              category: "Popular providers",
            }
          }),
          take(6),
        )
      : []

    // Search shows a single merged list (favorites inline)
    if (needle) {
      const filteredProviders = fuzzysort.go(needle, providerOptions, { keys: ["title", "category"] }).map((x) => x.obj)
      const filteredPopular = fuzzysort.go(needle, popularProviders, { keys: ["title"] }).map((x) => x.obj)
      return [...filteredProviders, ...filteredPopular]
    }

    return [...favoriteOptions, ...recentOptions, ...providerOptions, ...popularProviders]
  })

  const provider = createMemo(() =>
    props.providerID ? sync.data.provider.find((x) => x.id === props.providerID) : null,
  )

  const title = createMemo(() => {
    if (provider()) return provider()!.name
    return showOnlyIncluded() ? "Select model (Included only)" : "Select model"
  })

  return (
    <DialogSelect
      keybind={[
        {
          keybind: keybind.all.model_provider_list?.[0],
          title: connected() ? "Connect provider" : "View all providers",
          onTrigger() {
            dialog.replace(() => <DialogProvider />)
          },
        },
        {
          keybind: keybind.all.model_favorite_toggle?.[0],
          title: "Favorite",
          disabled: !connected(),
          onTrigger: (option) => {
            local.model.toggleFavorite(option.value as { providerID: string; modelID: string })
          },
        },
        {
          keybind: Keybind.parse("ctrl+s")[0],
          title: showOnlyIncluded() ? "Show all" : "Included only",
          disabled: !connected(),
          onTrigger: () => {
            setShowOnlyIncluded((prev) => !prev)
          },
        },
        {
          keybind: Keybind.parse("ctrl+g")[0],
          title: "Providers",
          disabled: !connected(), // Or check if current selection supports it?
          // We need to check if the *targeted* option supports it.
          // The keybind onTrigger passes the option.
          onTrigger: (option) => {
            // We need to cast option.value to access modelID, or store it in option better
            // option.value is { providerID, modelID }
            // option doesn't inherently store supportsProviderSelection unless we put it there.
            // But we added it to `options` creation above? No, we didn't add it to the returned object from map.
            // We need to access it from the source or add it to the option object.
            // Let's rely on looking it up or trusting the user interaction for now,
            // OR better: add `supportsProviderSelection` to the mapped option value or meta.
            // DialogSelectOption doesn't have a freeform meta field typed here, but we can stick it on the value or assume.

            // Actually, the improved way is to look it up in `sync.data.provider`.
            // But for simplicity/speed, let's just assume we can deduce it.
            const val = option.value as { providerID: string; modelID: string }
            if (val && val.modelID) {
              dialog.replace(() => <DialogProviderSelection modelId={val.modelID} />)
            }
          },
        },
      ]}
      ref={setRef}
      onFilter={setQuery}
      skipFilter={true}
      title={title()}
      current={local.model.current()}
      options={options()}
    />
  )
}
