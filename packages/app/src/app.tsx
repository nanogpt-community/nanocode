import "@/index.css"
import { ErrorBoundary, Show, type ParentProps } from "solid-js"
import { Router, Route, Navigate } from "@solidjs/router"
import { MetaProvider } from "@solidjs/meta"
import { Font } from "@nanogpt/ui/font"
import { MarkedProvider } from "@nanogpt/ui/context/marked"
import { DiffComponentProvider } from "@nanogpt/ui/context/diff"
import { CodeComponentProvider } from "@nanogpt/ui/context/code"
import { Diff } from "@nanogpt/ui/diff"
import { Code } from "@nanogpt/ui/code"
import { ThemeProvider } from "@nanogpt/ui/theme"
import { GlobalSyncProvider } from "@/context/global-sync"
import { LayoutProvider } from "@/context/layout"
import { GlobalSDKProvider } from "@/context/global-sdk"
import { ServerProvider, useServer } from "@/context/server"
import { TerminalProvider } from "@/context/terminal"
import { PromptProvider } from "@/context/prompt"
import { NotificationProvider } from "@/context/notification"
import { DialogProvider } from "@nanogpt/ui/context/dialog"
import { CommandProvider } from "@/context/command"
import Layout from "@/pages/layout"
import Home from "@/pages/home"
import DirectoryLayout from "@/pages/directory-layout"
import Session from "@/pages/session"
import { ErrorPage } from "./pages/error"
import { iife } from "@nanogpt/util/iife"

declare global {
  interface Window {
    __NANOGPT__?: { updaterEnabled?: boolean; port?: number }
  }
}

const serverDefaults = iife(() => {
  const param = new URLSearchParams(document.location.search).get("url")
  if (param) return { url: param, forced: true }

  if (location.hostname.includes("opencode.ai")) return { url: "http://localhost:4096", forced: false }
  if (window.__NANOGPT__) return { url: `http://127.0.0.1:${window.__NANOGPT__.port}`, forced: false }
  if (import.meta.env.DEV)
    return {
      url: `http://${import.meta.env.VITE_NANOGPT_SERVER_HOST ?? "localhost"}:${import.meta.env.VITE_NANOGPT_SERVER_PORT ?? "4096"}`,
      forced: false,
    }

  return { url: window.location.origin, forced: false }
})

function ServerKey(props: ParentProps) {
  const server = useServer()
  return (
    <Show when={server.url} keyed>
      {props.children}
    </Show>
  )
}

export function App() {
  return (
    <MetaProvider>
      <Font />
      <ThemeProvider>
        <ErrorBoundary fallback={(error) => <ErrorPage error={error} />}>
          <DialogProvider>
            <MarkedProvider>
              <DiffComponentProvider component={Diff}>
                <CodeComponentProvider component={Code}>
                  <ServerProvider defaultUrl={serverDefaults.url} forceUrl={serverDefaults.forced}>
                    <ServerKey>
                      <GlobalSDKProvider>
                        <GlobalSyncProvider>
                          <LayoutProvider>
                            <NotificationProvider>
                              <Router
                                root={(props) => (
                                  <CommandProvider>
                                    <Layout>{props.children}</Layout>
                                  </CommandProvider>
                                )}
                              >
                                <Route path="/" component={Home} />
                                <Route path="/:dir" component={DirectoryLayout}>
                                  <Route path="/" component={() => <Navigate href="session" />} />
                                  <Route
                                    path="/session/:id?"
                                    component={(p) => (
                                      <Show when={p.params.id ?? "new"} keyed>
                                        <TerminalProvider>
                                          <PromptProvider>
                                            <Session />
                                          </PromptProvider>
                                        </TerminalProvider>
                                      </Show>
                                    )}
                                  />
                                </Route>
                              </Router>
                            </NotificationProvider>
                          </LayoutProvider>
                        </GlobalSyncProvider>
                      </GlobalSDKProvider>
                    </ServerKey>
                  </ServerProvider>
                </CodeComponentProvider>
              </DiffComponentProvider>
            </MarkedProvider>
          </DialogProvider>
        </ErrorBoundary>
      </ThemeProvider>
    </MetaProvider>
  )
}
