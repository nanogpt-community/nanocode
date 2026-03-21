import { TextAttributes } from "@opentui/core"
import { useTheme } from "../context/theme"
import { useSync } from "@tui/context/sync"
import { Show } from "solid-js"

export function DialogNanogpt() {
  const sync = useSync()
  const { theme } = useTheme()

  const account = () =>
    (
      sync.data as typeof sync.data & {
        account?: {
          balance?: {
            usd_balance: string
            nano_balance: string
          }
          subscription?: {
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
        }
      }
    ).account

  const balance = () => account()?.balance
  const subscription = () => account()?.subscription

  return (
    <box paddingLeft={2} paddingRight={2} gap={1} paddingBottom={1}>
      <box flexDirection="row" justifyContent="space-between">
        <text fg={theme.text} attributes={TextAttributes.BOLD}>
          NanoGPT Account
        </text>
        <text fg={theme.textMuted}>esc</text>
      </box>

      <box>
        <text fg={theme.text} attributes={TextAttributes.BOLD}>
          Balance
        </text>
        <Show when={balance()} fallback={<text fg={theme.textMuted}>  Not authenticated - run: nanocode auth</text>}>
          {(bal) => (
            <box flexDirection="row" gap={1}>
              <text flexShrink={0} style={{ fg: theme.success }}>
                •
              </text>
              <text fg={theme.text}>
                <span style={{ fg: theme.success }}>${parseFloat(bal().usd_balance).toFixed(2)} USD</span>
                <span style={{ fg: theme.textMuted }}> ({parseFloat(bal().nano_balance).toFixed(4)} XNO)</span>
              </text>
            </box>
          )}
        </Show>
      </box>

      <box>
        <text fg={theme.text} attributes={TextAttributes.BOLD}>
          Subscription
        </text>
        <Show when={subscription()} fallback={<text fg={theme.textMuted}>  No active subscription</text>}>
          {(sub) => (
            <>
              <box flexDirection="row" gap={1}>
                <text flexShrink={0} style={{ fg: sub().state === "active" ? theme.success : theme.warning }}>
                  •
                </text>
                <text fg={theme.text}>
                  Status:{" "}
                  <span style={{ fg: sub().state === "active" ? theme.success : theme.warning }}>{sub().state}</span>
                </text>
              </box>
              <box flexDirection="row" gap={1}>
                <text flexShrink={0} style={{ fg: theme.textMuted }}>
                  {" "}
                </text>
                <text
                  fg={
                    sub().daily.percentUsed > 0.9
                      ? theme.error
                      : sub().daily.percentUsed > 0.7
                        ? theme.warning
                        : theme.text
                  }
                >
                  Daily: {sub().daily.used.toLocaleString()}/{sub().limits.daily.toLocaleString()} (
                  {(sub().daily.percentUsed * 100).toFixed(0)}%)
                </text>
              </box>
              <box flexDirection="row" gap={1}>
                <text flexShrink={0} style={{ fg: theme.textMuted }}>
                  {" "}
                </text>
                <text
                  fg={
                    sub().monthly.percentUsed > 0.9
                      ? theme.error
                      : sub().monthly.percentUsed > 0.7
                        ? theme.warning
                        : theme.text
                  }
                >
                  Monthly: {sub().monthly.used.toLocaleString()}/{sub().limits.monthly.toLocaleString()} (
                  {(sub().monthly.percentUsed * 100).toFixed(0)}%)
                </text>
              </box>
            </>
          )}
        </Show>
      </box>
    </box>
  )
}
