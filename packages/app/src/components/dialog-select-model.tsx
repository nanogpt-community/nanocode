import { Popover as Kobalte } from "@kobalte/core/popover"
import {
  Component,
  ComponentProps,
  createEffect,
  createMemo,
  createSignal,
  JSX,
  onCleanup,
  onMount,
  Show,
  ValidComponent,
} from "solid-js"
import { createStore } from "solid-js/store"
import { useLocal } from "@/context/local"
import { useDialog } from "@nanogpt/ui/context/dialog"
import { popularProviders } from "@/hooks/use-providers"
import { Button } from "@nanogpt/ui/button"
import { IconButton } from "@nanogpt/ui/icon-button"
import { Tag } from "@nanogpt/ui/tag"
import { Dialog } from "@nanogpt/ui/dialog"
import { List } from "@nanogpt/ui/list"
import { Tooltip } from "@nanogpt/ui/tooltip"
import { DialogSelectProvider } from "./dialog-select-provider"
import { DialogManageModels } from "./dialog-manage-models"
import { DialogProviderSelection } from "./dialog-provider-selection"
import { Icon } from "@nanogpt/ui/icon"
import { ModelTooltip } from "./model-tooltip"
import { useLanguage } from "@/context/language"

const [showOnlyIncluded, setShowOnlyIncluded] = createSignal(false)

const ModelList: Component<{
  provider?: string
  class?: string
  onSelect: () => void
  action?: JSX.Element
  onConfigureProvider?: (modelId: string) => void
  onHighlight?: (modelId: string | undefined) => void
}> = (props) => {
  const local = useLocal()
  const language = useLanguage()

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
      search={{ placeholder: language.t("dialog.model.search.placeholder"), autofocus: true, action: props.action }}
      emptyMessage={language.t("dialog.model.empty")}
      key={(x) => `${x.provider.id}:${x.id}`}
      items={models}
      current={local.model.current()}
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
      itemWrapper={(item, node) => (
        <Tooltip
          class="w-full"
          placement="right-start"
          gutter={12}
          forceMount={false}
          value={
            <ModelTooltip
              model={item}
              latest={item.latest}
              free={item.provider.id === "nanogpt" && (!item.cost || item.cost.input === 0)}
            />
          }
        >
          {node}
        </Tooltip>
      )}
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

export function ModelSelectorPopover<T extends ValidComponent = "div">(props: {
  provider?: string
  children?: JSX.Element | ((open: boolean) => JSX.Element)
  triggerAs?: T
  triggerProps?: ComponentProps<T>
}) {
  const [store, setStore] = createStore<{
    open: boolean
    dismiss: "escape" | "outside" | null
    trigger?: HTMLElement
    content?: HTMLElement
  }>({
    open: false,
    dismiss: null,
    trigger: undefined,
    content: undefined,
  })
  const dialog = useDialog()

  const handleManage = () => {
    setStore("open", false)
    dialog.show(() => <DialogManageModels />)
  }

  const handleConnectProvider = () => {
    setStore("open", false)
    dialog.show(() => <DialogSelectProvider />)
  }
  const language = useLanguage()

  createEffect(() => {
    if (!store.open) return

    const inside = (node: Node | null | undefined) => {
      if (!node) return false
      const el = store.content
      if (el && el.contains(node)) return true
      const anchor = store.trigger
      if (anchor && anchor.contains(node)) return true
      return false
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return
      setStore("dismiss", "escape")
      setStore("open", false)
      event.preventDefault()
      event.stopPropagation()
    }

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target
      if (!(target instanceof Node)) return
      if (inside(target)) return
      setStore("dismiss", "outside")
      setStore("open", false)
    }

    const onFocusIn = (event: FocusEvent) => {
      if (!store.content) return
      const target = event.target
      if (!(target instanceof Node)) return
      if (inside(target)) return
      setStore("dismiss", "outside")
      setStore("open", false)
    }

    window.addEventListener("keydown", onKeyDown, true)
    window.addEventListener("pointerdown", onPointerDown, true)
    window.addEventListener("focusin", onFocusIn, true)

    onCleanup(() => {
      window.removeEventListener("keydown", onKeyDown, true)
      window.removeEventListener("pointerdown", onPointerDown, true)
      window.removeEventListener("focusin", onFocusIn, true)
    })
  })

  return (
    <Kobalte
      open={store.open}
      onOpenChange={(next) => {
        if (next) setStore("dismiss", null)
        setStore("open", next)
      }}
      modal={false}
      placement="top-start"
      gutter={8}
    >
      <Kobalte.Trigger
        ref={(el) => setStore("trigger", el)}
        as={props.triggerAs ?? "div"}
        {...(props.triggerProps as any)}
      >
        {typeof props.children === "function" ? props.children(store.open) : props.children}
      </Kobalte.Trigger>
      <Kobalte.Portal>
        <Kobalte.Content
          class="w-72 h-80 flex flex-col rounded-md border border-border-base bg-surface-raised-stronger-non-alpha shadow-md z-50 outline-none overflow-hidden"
          data-component="model-popover-content"
          ref={(el) => setStore("content", el)}
          onEscapeKeyDown={(event) => {
            setStore("dismiss", "escape")
            setStore("open", false)
            event.preventDefault()
            event.stopPropagation()
          }}
          onPointerDownOutside={() => {
            setStore("dismiss", "outside")
            setStore("open", false)
          }}
          onFocusOutside={() => {
            setStore("dismiss", "outside")
            setStore("open", false)
          }}
          onCloseAutoFocus={(event) => {
            if (store.dismiss === "outside") event.preventDefault()
            setStore("dismiss", null)
          }}
        >
          <Kobalte.Title class="sr-only">{language.t("dialog.model.select.title")}</Kobalte.Title>
          <ModelList
            provider={props.provider}
            onSelect={() => setStore("open", false)}
            class="p-1"
            action={
              <div class="flex items-center gap-1">
                <Tooltip placement="top" forceMount={false} value={language.t("command.provider.connect")}>
                  <IconButton
                    icon="plus-small"
                    variant="ghost"
                    iconSize="normal"
                    class="size-6"
                    aria-label={language.t("command.provider.connect")}
                    onClick={handleConnectProvider}
                  />
                </Tooltip>
                <Tooltip placement="top" forceMount={false} value={language.t("dialog.model.manage")}>
                  <IconButton
                    icon="sliders"
                    variant="ghost"
                    iconSize="normal"
                    class="size-6"
                    aria-label={language.t("dialog.model.manage")}
                    onClick={handleManage}
                  />
                </Tooltip>
              </div>
            }
          />
        </Kobalte.Content>
      </Kobalte.Portal>
    </Kobalte>
  )
}

export const DialogSelectModel: Component<{ provider?: string }> = (props) => {
  const dialog = useDialog()
  const language = useLanguage()

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
        {language.t("dialog.model.manage")}
      </Button>
    </Dialog>
  )
}
