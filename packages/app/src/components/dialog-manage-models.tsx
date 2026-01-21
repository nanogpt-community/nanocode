import { Dialog } from "@nanogpt/ui/dialog"
import { List } from "@nanogpt/ui/list"
import { Switch } from "@nanogpt/ui/switch"
import { Button } from "@nanogpt/ui/button"
import { Tag } from "@nanogpt/ui/tag"
import { Component, createMemo, createSignal, Show } from "solid-js"
import { useLocal } from "@/context/local"
import { popularProviders } from "@/hooks/use-providers"
import { useLanguage } from "@/context/language"

export const DialogManageModels: Component = () => {
  const local = useLocal()
  const language = useLanguage()
  const [showOnlyIncluded, setShowOnlyIncluded] = createSignal(false)

  const models = createMemo(() => {
    const onlyIncluded = showOnlyIncluded()
    return local.model
      .list()
      .filter((m) => !onlyIncluded || (m as { subscription_included?: boolean }).subscription_included)
  })

  return (
    <Dialog
      title={showOnlyIncluded() ? "Manage models (Included only)" : "Manage models"}
      description="Customize which models appear in the model selector."
      action={
        <Button
          class="h-7 -my-1 text-14-medium"
          variant={showOnlyIncluded() ? "primary" : "secondary"}
          onClick={() => setShowOnlyIncluded((prev) => !prev)}
        >
          {showOnlyIncluded() ? "Showing included" : "Show included only"}
        </Button>
      }
    >
      <List
        search={{ placeholder: language.t("dialog.model.search.placeholder"), autofocus: true }}
        emptyMessage={language.t("dialog.model.empty")}
        key={(x) => `${x?.provider?.id}:${x?.id}`}
        items={models()}
        filterKeys={["provider.name", "name", "id"]}
        sortBy={(a, b) => a.name.localeCompare(b.name)}
        groupBy={(x) => x.provider.name}
        sortGroupsBy={(a, b) => {
          const aProvider = a.items[0].provider.id
          const bProvider = b.items[0].provider.id
          if (popularProviders.includes(aProvider) && !popularProviders.includes(bProvider)) return -1
          if (!popularProviders.includes(aProvider) && popularProviders.includes(bProvider)) return 1
          return popularProviders.indexOf(aProvider) - popularProviders.indexOf(bProvider)
        }}
        onSelect={(x) => {
          if (!x) return
          const visible = local.model.visible({
            modelID: x.id,
            providerID: x.provider.id,
          })
          local.model.setVisibility({ modelID: x.id, providerID: x.provider.id }, !visible)
        }}
      >
        {(i) => {
          const model = i as typeof i & { subscription_included?: boolean }
          return (
            <div class="w-full flex items-center justify-between gap-x-3">
              <div class="flex items-center gap-x-2">
                <span>{i.name}</span>
                <Show when={model.subscription_included}>
                  <Tag>Included</Tag>
                </Show>
              </div>
              <div onClick={(e) => e.stopPropagation()}>
                <Switch
                  checked={
                    !!local.model.visible({
                      modelID: i.id,
                      providerID: i.provider.id,
                    })
                  }
                  onChange={(checked) => {
                    local.model.setVisibility({ modelID: i.id, providerID: i.provider.id }, checked)
                  }}
                />
              </div>
            </div>
          )
        }}
      </List>
    </Dialog>
  )
}
