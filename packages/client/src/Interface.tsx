import { JSX, Match, Show, Switch, createEffect, createSignal, onCleanup } from "solid-js";

import { Server } from "stoat.js";
import { styled } from "styled-system/jsx";

import { ChannelContextMenu, ServerContextMenu } from "@revolt/app";
import { MessageCache } from "@revolt/app/interface/channels/text/MessageCache";
import { Titlebar } from "@revolt/app/interface/desktop/Titlebar";
import { useClient, useClientLifecycle } from "@revolt/client";
import { State } from "@revolt/client/Controller";
import { NotificationsWorker } from "@revolt/client/NotificationsWorker";
import { useModals } from "@revolt/modal";
import { Navigate, useBeforeLeave, useLocation } from "@revolt/routing";
import { useState } from "@revolt/state";
import { LAYOUT_SECTIONS } from "@revolt/state/stores/Layout";
import { CircularProgress } from "@revolt/ui";

import { Sidebar } from "./interface/Sidebar";

/**
 * Application layout
 */
const Interface = (props: { children: JSX.Element }) => {
  const state = useState();
  const client = useClient();
  const { openModal } = useModals();
  const { isLoggedIn, lifecycle } = useClientLifecycle();
  const location = useLocation();
  const { pathname } = location;

  useBeforeLeave((e) => {
    if (!e.defaultPrevented) {
      if (e.to === "/settings") {
        e.preventDefault();
        openModal({
          type: "settings",
          config: "user",
        });
      } else if (typeof e.to === "string") {
        state.layout.setLastActivePath(e.to);
      }
    }
  });

  createEffect(() => {
    if (!isLoggedIn()) {
      state.layout.setNextPath(pathname);
      console.debug("WAITING... currently", lifecycle.state());
    }
  });

  // STELLIS: mobile responsiveness — track viewport width and auto-collapse
  // the primary sidebar when navigating to a channel on small screens, so
  // mobile users see one pane at a time (server list / channel list / content).
  const [isMobile, setIsMobile] = createSignal(
    typeof window !== "undefined"
      ? window.matchMedia("(max-width: 767px)").matches
      : false,
  );
  if (typeof window !== "undefined") {
    const mq = window.matchMedia("(max-width: 767px)");
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener("change", handler);
    onCleanup(() => mq.removeEventListener("change", handler));
  }

  // Auto-collapse PRIMARY_SIDEBAR on mobile whenever route changes to a channel.
  // Read location.pathname (not destructured) to guarantee fine-grained reactivity.
  createEffect(() => {
    if (!isMobile()) return;
    const p = location.pathname;
    if (p.startsWith("/channel/") || /^\/server\/[^/]+\/channel\//.test(p)) {
      state.layout.setSectionState(LAYOUT_SECTIONS.PRIMARY_SIDEBAR, false, true);
    }
  });

  // STELLIS mobile: MEMBER_SIDEBAR defaults to open (default true in Sidebar
  // call sites). On mobile that eats half the screen by default. Force-close
  // it whenever we're in mobile mode unless the user explicitly toggled it.
  createEffect(() => {
    if (isMobile()) {
      state.layout.setSectionState(LAYOUT_SECTIONS.MEMBER_SIDEBAR, false, true);
    }
  });

  const sidebarOpen = () =>
    state.layout.getSectionState(LAYOUT_SECTIONS.PRIMARY_SIDEBAR, true);

  // STELLIS mobile: native iOS-style swipe to toggle the navigation pane.
  //
  // Heuristic (kept narrow on purpose to not eat the message-list scroll):
  //   - touchstart records origin + timestamp
  //   - if total horizontal travel > 70px AND |dx| > 2*|dy| AND duration < 500ms,
  //     swipe wins; toggle sidebar based on direction
  //   - vertical-dominant gestures cancel the swipe (no toggle), so scrolling
  //     a code block or message stream isn't hijacked
  //
  // Edge-only would be safer (only register if startX < 20) but it breaks
  // PWAs in landscape where the visible-edge mapping is weird. We rely on the
  // |dx| > 2*|dy| threshold instead.
  let swipeStartX = 0;
  let swipeStartY = 0;
  let swipeStartT = 0;
  let swipeActive = false;
  const handleTouchStart = (e: TouchEvent) => {
    if (!isMobile() || e.touches.length !== 1) {
      swipeActive = false;
      return;
    }
    const t = e.touches[0];
    swipeStartX = t.clientX;
    swipeStartY = t.clientY;
    swipeStartT = Date.now();
    swipeActive = true;
  };
  const handleTouchEnd = (e: TouchEvent) => {
    if (!swipeActive || !isMobile()) return;
    swipeActive = false;
    const t = e.changedTouches[0];
    if (!t) return;
    const dx = t.clientX - swipeStartX;
    const dy = t.clientY - swipeStartY;
    const dt = Date.now() - swipeStartT;
    if (dt > 500) return;
    if (Math.abs(dx) < 70) return;
    if (Math.abs(dx) < Math.abs(dy) * 2) return;
    const open = sidebarOpen();
    if (dx > 0 && !open) {
      // Swipe right → open navigation
      state.layout.setSectionState(LAYOUT_SECTIONS.PRIMARY_SIDEBAR, true, true);
    } else if (dx < 0 && open) {
      // Swipe left → close navigation, back to chat
      state.layout.setSectionState(LAYOUT_SECTIONS.PRIMARY_SIDEBAR, false, true);
    }
  };

  function isDisconnected() {
    return [
      State.Connecting,
      State.Disconnected,
      State.Reconnecting,
      State.Offline,
    ].includes(lifecycle.state());
  }

  return (
    <MessageCache client={client()}>
      <div
        style={{
          display: "flex",
          "flex-direction": "column",
          height: "100%",
        }}
      >
        <Titlebar />
        {/*
          STELLIS recovery: only show when truly stuck — user is authenticated
          (so we expect Layout to render soon) but lifecycle never reached
          loadedOnce. That's the WebSocket-retry-loop case. On /login or
          before-auth states recovery doesn't fire.
        */}
        <Show when={isLoggedIn() && !lifecycle.loadedOnce()}>
          <StellisStuckRecovery />
        </Show>
        <Switch fallback={<CircularProgress />}>
          <Match when={!isLoggedIn()}>
            {/*
              STELLIS: hard-reload to /login instead of SPA <Navigate>.
              Solid Router's <Navigate> changed the URL but didn't unmount
              Interface or mount AuthPage cleanly when transitioning from
              /app → /login (user saw blank #root wrapper, no FlowHome).
              window.location.replace re-bootstraps cleanly.
            */}
            {(() => {
              if (!location.pathname.startsWith("/login")) {
                queueMicrotask(() => window.location.replace("/login"));
              }
              return <CircularProgress />;
            })()}
          </Match>
          <Match when={lifecycle.loadedOnce()}>
            <Layout
              disconnected={isDisconnected()}
              style={{ "flex-grow": 1, "min-height": 0 }}
              data-sidebar={sidebarOpen() ? "open" : "closed"}
              data-mobile={isMobile() ? "true" : "false"}
              onTouchStart={handleTouchStart}
              onTouchEnd={handleTouchEnd}
              onDragOver={(e) => {
                if (e.dataTransfer) e.dataTransfer.dropEffect = "none";
              }}
              onDrop={(e) => e.preventDefault()}
            >
              <Sidebar
                menuGenerator={(target) => ({
                  contextMenu: () => {
                    return (
                      <>
                        {target instanceof Server ? (
                          <ServerContextMenu server={target} />
                        ) : (
                          <ChannelContextMenu channel={target} />
                        )}
                      </>
                    );
                  },
                })}
              />
              <Content
                sidebar={sidebarOpen()}
                data-mobile={isMobile() ? "true" : "false"}
                data-sidebar={sidebarOpen() ? "open" : "closed"}
              >
                {props.children}
              </Content>
            </Layout>
          </Match>
        </Switch>

        <NotificationsWorker />
      </div>
    </MessageCache>
  );
};

/**
 * Parent container
 *
 * STELLIS mobile: when viewport <768px we collapse to one-pane-at-a-time.
 *   data-mobile="true" + data-sidebar="open"   → show navigation (server list + channel list), hide content
 *   data-mobile="true" + data-sidebar="closed" → show content full-width, hide navigation
 * Desktop behaviour is unchanged (all three panes visible).
 */
const Layout = styled("div", {
  base: {
    display: "flex",
    height: "100%",
    minWidth: 0,
    // Mobile: when sidebar closed, hide the Sidebar (first child) to give
    // the channel content the full screen width.
    '&[data-mobile="true"][data-sidebar="closed"] > div:first-child': {
      display: "none",
    },
    // Mobile + sidebar open: expand the channel-list pane to fill remaining
    // width (56px server-icons + rest). Without this, the channel list keeps
    // its fixed 232px and the right half of the screen is empty.
    '&[data-mobile="true"][data-sidebar="open"]': {
      "--layout-width-channel-sidebar": "calc(100vw - 56px)",
    },
    '&[data-mobile="true"][data-sidebar="open"] > div:first-child': {
      width: "100%",
      minWidth: 0,
    },
  },
  variants: {
    disconnected: {
      true: {
        color: "var(--md-sys-color-on-primary-container)",
        background: "var(--md-sys-color-primary-container)",
      },
      false: {
        color: "var(--md-sys-color-outline)",
        background: "var(--md-sys-color-surface-container-high)",
      },
    },
  },
});

/**
 * Main content container
 */
const Content = styled("div", {
  base: {
    background: "var(--md-sys-color-surface-container-low)",

    display: "flex",
    width: "100%",
    minWidth: 0,
    // Mobile: when sidebar open, hide the Content (sidebar takes full screen).
    '&[data-mobile="true"][data-sidebar="open"]': {
      display: "none",
    },
  },
  variants: {
    sidebar: {
      false: {
        borderTopLeftRadius: "var(--borderRadius-lg)",
        borderBottomLeftRadius: "var(--borderRadius-lg)",
        overflow: "hidden",
      },
    },
  },
});

/**
 * STELLIS: visible recovery UI when SPA bootstrap stalls (stuck connecting,
 * stale session, dead network from inside PWA). Shows nothing for the first
 * 10s — then drops a "Сброс" button that nukes all storage and reloads.
 * Lives outside the Switch above so it remains visible regardless of which
 * Match wins. Self-contained: no theme/i18n dependencies (those might be
 * exactly what's broken).
 */
function StellisStuckRecovery() {
  const [stuck, setStuck] = createSignal(false);
  const timer = setTimeout(() => setStuck(true), 10_000);
  onCleanup(() => clearTimeout(timer));

  const handleReset = async () => {
    try {
      localStorage.clear();
      sessionStorage.clear();
    } catch {
      /* noop */
    }
    try {
      const dbs = await indexedDB.databases?.();
      if (dbs) {
        await Promise.all(dbs.map((db) => db.name && indexedDB.deleteDatabase(db.name)));
      } else {
        // Safari < 14 fallback
        indexedDB.deleteDatabase("localforage");
      }
    } catch {
      /* noop */
    }
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    } catch {
      /* noop */
    }
    try {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    } catch {
      /* noop */
    }
    window.location.replace("/login");
  };

  return (
    <Show when={stuck()}>
      <div
        style={{
          position: "fixed",
          inset: "0",
          display: "flex",
          "flex-direction": "column",
          "align-items": "center",
          "justify-content": "center",
          gap: "20px",
          "z-index": "9999",
          background:
            "radial-gradient(circle at 50% 40%, #1A1F2E 0%, #11141C 60%, #07090E 100%)",
          color: "#F4F1E8",
          "font-family":
            "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, system-ui, sans-serif",
          padding: "32px",
          "text-align": "center",
        }}
      >
        <div
          style={{
            "font-size": "32px",
            "font-weight": "700",
            "letter-spacing": "-2px",
          }}
        >
          stell<span style={{ color: "#E5A857" }}>✦</span>s
        </div>
        <div style={{ "font-size": "14px", color: "#A8A399", "max-width": "320px", "line-height": "1.5" }}>
          Загрузка занимает слишком долго. Возможно сессия повисла или сервис недоступен.
        </div>
        <button
          onClick={handleReset}
          style={{
            background: "#E5A857",
            color: "#11141C",
            border: "0",
            padding: "12px 24px",
            "border-radius": "10px",
            "font-size": "15px",
            "font-weight": "600",
            cursor: "pointer",
            "font-family": "inherit",
          }}
        >
          Сбросить и попробовать снова
        </button>
        <div style={{ "font-size": "11px", color: "#5A554D", "letter-spacing": "2px" }}>
          PER ASPERA AD ASTRA
        </div>
      </div>
    </Show>
  );
}

export default Interface;
