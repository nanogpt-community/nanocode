import { Popover as Kobalte } from "@kobalte/core/popover"
import { Component, createMemo, createSignal, JSX, onCleanup, onMount, Show } from "solid-js"
import { useLocal } from "@/context/local"
import { useDialog } from "@nanogpt/ui/context/dialog"
import { popularProviders } from "@/hooks/use-providers"
import { Button } from "@nanogpt/ui/button"
import { Tag } from "@nanogpt/ui/tag"
import { Dialog } from "@nanogpt/ui/dialog"
import { List } from "@nanogpt/ui/list"
import { DialogSelectProvider } from "./dialog-select-provider"
import { DialogManageModels } from "./dialog-manage-models"
import { DialogProviderSelection } from "./dialog-provider-selection"
import { Icon } from "@nanogpt/ui/icon"

const [showOnlyIncluded, setShowOnlyIncluded] = createSignal(false)

const ModelList: Component<{
  provider?: string
  class?: string
  onSelect: () => void
  onConfigureProvider?: (modelId: string) => void
  onHighlight?: (modelId: string | undefined) => void
}> = (props) => {
  const local = useLocal()

  const models = createMemo(() => {
    const onlyIncluded = showOnlyIncluded()
    return local.model
      .list()
      .filter((m) => local.model.visible({ modelID: m.id, providerID: m.provider.id }))
      .filter((m) => (props.provider ? m.provider.id === props.provider : true))
      .filter((m) => !onlyIncluded || (m as { subscription_included?: boolean }).subscription_included)
  })

  return (
    <List
      class={`flex-1 min-h-0 [&_[data-slot=list-scroll]]:flex-1 [&_[data-slot=list-scroll]]:min-h-0 ${props.class ?? ""}`}
      search={{ placeholder: "Search models", autofocus: true }}
      emptyMessage="No model results"
      key={(x) => `${x.provider.id}:${x.id}`}
      items={models}
      current={local.model.current()}
      filterKeys={["provider.name", "name", "id"]}
      sortBy={(a, b) => a.name.localeCompare(b.name)}
      groupBy={(x) => x.provider.name}
      sortGroupsBy={(a, b) => {
        if (a.category === "Recent" && b.category !== "Recent") return -1
        if (b.category === "Recent" && a.category !== "Recent") return 1
        const aProvider = a.items[0].provider.id
        const bProvider = b.items[0].provider.id
        if (popularProviders.includes(aProvider) && !popularProviders.includes(bProvider)) return -1
        if (!popularProviders.includes(aProvider) && popularProviders.includes(bProvider)) return 1
        return popularProviders.indexOf(aProvider) - popularProviders.indexOf(bProvider)
      }}
      onMove={(x) => {
        props.onHighlight?.(x?.id)
      }}
      onSelect={(x) => {
        local.model.set(x ? { modelID: x.id, providerID: x.provider.id } : undefined, {
          recent: true,
        })
        props.onSelect()
      }}
    >
      {(i) => (
        <div class="w-full flex items-center justify-between text-13-regular group">
          <div class="flex items-center gap-x-2 overflow-hidden">
            <span class="truncate">{i.name}</span>
            <Show when={i.provider.id === "nanogpt" && (!i.cost || i.cost?.input === 0)}>
              <Tag>Free</Tag>
            </Show>
            <Show when={i.latest}>
              <Tag>Latest</Tag>
            </Show>
          </div>
          <Show when={(i as any).supportsProviderSelection}>
            <div
              class="opacity-0 group-hover:opacity-100 transition-opacity p-1 text-text-subtle hover:text-text-primary stop-prop"
              onClick={(e) => {
                e.stopPropagation()
                e.preventDefault()
                // We need a way to open the dialog. Since this is inside a list item,
                // we might need to pass a handler or use a context.
                // But actually, we can just use the dialog context here if we were in the component that had access to it.
                // The List uses a callback internally.
                // Let's modify the component structure slightly to allow this.
                props.onConfigureProvider?.(i.id)
              }}
            >
              <Icon name="settings-gear" size="small" />
            </div>
          </Show>
        </div>
      )}
    </List>
  )
}

export const ModelSelectorPopover: Component<{
  provider?: string
  children: JSX.Element
}> = (props) => {
  const [open, setOpen] = createSignal(false)

  return (
    <Kobalte open={open()} onOpenChange={setOpen} placement="top-start" gutter={8}>
      <Kobalte.Trigger as="div">{props.children}</Kobalte.Trigger>
      <Kobalte.Portal>
        <Kobalte.Content class="w-72 h-80 flex flex-col rounded-md border border-border-base bg-surface-raised-stronger-non-alpha shadow-md z-50 outline-none overflow-hidden">
          <Kobalte.Title class="sr-only">Select model</Kobalte.Title>
          <ModelList provider={props.provider} onSelect={() => setOpen(false)} class="p-1" />
        </Kobalte.Content>
      </Kobalte.Portal>
    </Kobalte>
  )
}

export const DialogSelectModel: Component<{ provider?: string }> = (props) => {
  const dialog = useDialog()

  const [selectedModelId, setSelectedModelId] = createSignal<string | undefined>(undefined)

  // ctrl+s to toggle subscription filter, ctrl+g to open provider selection
  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.ctrlKey && e.key === "s") {
      e.preventDefault()
      setShowOnlyIncluded((prev) => !prev)
    }
    if (e.ctrlKey && e.key === "g") {
      e.preventDefault()
      const modelId = selectedModelId()
      if (modelId) {
        dialog.show(() => <DialogProviderSelection modelId={modelId} />)
      }
    }
  }

  onMount(() => {
    document.addEventListener("keydown", handleKeyDown)
    onCleanup(() => document.removeEventListener("keydown", handleKeyDown))
  })

  return (
    <Dialog
      title={showOnlyIncluded() ? "Select model (Included only)" : "Select model"}
      action={
        <div class="flex items-center gap-2">
          <Button
            class="h-7 -my-1 text-14-medium"
            variant={showOnlyIncluded() ? "primary" : "secondary"}
            onClick={() => setShowOnlyIncluded((prev) => !prev)}
          >
            {showOnlyIncluded() ? "Showing included" : "Show included only"}{" "}
            <span class="text-text-subtle ml-1">ctrl+s</span>
          </Button>
          <Button
            class="h-7 -my-1 text-14-medium"
            icon="plus-small"
            tabIndex={-1}
            onClick={() => dialog.show(() => <DialogSelectProvider />)}
          >
            Connect provider
          </Button>
        </div>
      }
    >
      <ModelList
        provider={props.provider}
        onSelect={() => dialog.close()}
        onHighlight={(modelId) => setSelectedModelId(modelId)}
        onConfigureProvider={(modelId) => {
          // Close the select model dialog perhaps? Or stack them?
          // The dialog context might replace the current one if we call show again.
          // Let's allow stacking or replacement.
          dialog.show(() => <DialogProviderSelection modelId={modelId} />)
        }}
      />
      <Button
        variant="ghost"
        class="ml-3 mt-5 mb-6 text-text-base self-start"
        onClick={() => dialog.show(() => <DialogManageModels />)}
      >
        Manage models
      </Button>
    </Dialog>
  )
}
