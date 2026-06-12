/**
 * Configure contexts and render App
 */
import "./sentry";

import { JSX, onMount } from "solid-js";
import { render } from "solid-js/web";

import { attachDevtoolsOverlay } from "@solid-devtools/overlay";
import { Navigate, Route, Router, useParams } from "@solidjs/router";
import { QueryClient, QueryClientProvider } from "@tanstack/solid-query";
// STELLIS: subset Material Symbols (Outlined only, ~298 KB) instead of the
// package's three ~3.6-4.9 MB variable fonts. Kills the "icon names show as
// text" flash on mobile where the 3.6 MB font outran font-display:block.
// See src/material-symbols-subset.css + scripts/subset-icons.sh.
import "./material-symbols-subset.css";
import "mdui/mdui.css";
import { PublicBot, PublicChannelInvite } from "stoat.js";

import FlowCheck from "@revolt/auth/src/flows/FlowCheck";
import FlowConfirmReset from "@revolt/auth/src/flows/FlowConfirmReset";
import FlowCreate from "@revolt/auth/src/flows/FlowCreate";
import FlowDeleteAccount from "@revolt/auth/src/flows/FlowDelete";
import FlowHome from "@revolt/auth/src/flows/FlowHome";
import FlowJoinInvite from "@revolt/auth/src/flows/FlowJoinInvite";
import FlowLogin from "@revolt/auth/src/flows/FlowLogin";
import FlowSSO from "@revolt/auth/src/flows/FlowSSO";
import FlowResend from "@revolt/auth/src/flows/FlowResend";
import FlowReset from "@revolt/auth/src/flows/FlowReset";
import FlowVerify from "@revolt/auth/src/flows/FlowVerify";
import { ClientContext, useClient } from "@revolt/client";
import { I18nProvider } from "@revolt/i18n";
import { KeybindContext } from "@revolt/keybinds";
import { ModalContext, ModalRenderer, useModals } from "@revolt/modal";
import { VoiceContext } from "@revolt/rtc";
import { StateContext, SyncWorker, useState } from "@revolt/state";
import {
  FloatingManager,
  LoadTheme,
  SnackbarController,
  SnackbarProvider,
} from "@revolt/ui";

/* @refresh reload */
import "@revolt/ui/styles";

import AuthPage from "./Auth";
import Interface from "./Interface";
import "./index.css";
import { DevelopmentPage } from "./interface/Development";
import { Discover } from "./interface/Discover";
import { Friends } from "./interface/Friends";
import { HomePage } from "./interface/Home";
import { ServerHome } from "./interface/ServerHome";
import { ChannelPage } from "./interface/channels/ChannelPage";
import "./serviceWorkerInterface";

attachDevtoolsOverlay();

/**
 * Redirect PWA start to the last active path
 */
function PWARedirect() {
  const state = useState();
  return <Navigate href={state.layout.getLastActivePath()} />;
}

/**
 * Open settings and redirect to last active path
 */
function SettingsRedirect() {
  const { openModal } = useModals();

  onMount(() => openModal({ type: "settings", config: "user" }));
  return <PWARedirect />;
}

/**
 * Open invite and redirect to last active path
 */
function InviteRedirect() {
  const params = useParams();
  const client = useClient();
  const { openModal, showError } = useModals();

  onMount(() => {
    if (params.code) {
      client()
        // TODO: add a helper to stoat.js for this
        .api.get(`/invites/${params.code as ""}`)
        .then((invite) => PublicChannelInvite.from(client(), invite))
        .then((invite) => openModal({ type: "invite", invite }))
        .catch(showError);
    }
  });

  return <PWARedirect />;
}

/**
 * Open bot invite and redirect to last active path
 */
function BotRedirect() {
  const params = useParams();
  const client = useClient();
  const { openModal, showError } = useModals();

  onMount(() => {
    if (params.code) {
      client()
        // TODO: add a helper to stoat.js for this
        .api.get(`/bots/${params.code as ""}/invite`)
        .then((invite) => new PublicBot(client(), invite))
        .then((invite) => openModal({ type: "add_bot", invite }))
        .catch(showError);
    }
  });

  return <PWARedirect />;
}

function MountContext(props: { children?: JSX.Element }) {
  const state = useState();

  /**
   * Tanstack Query client
   */
  const client = new QueryClient();

  /**
   * Snackbar controller
   */
  const snackbarController = new SnackbarController();

  return (
    <KeybindContext>
      <ModalContext>
        <ClientContext state={state}>
          <I18nProvider>
            <VoiceContext>
              <QueryClientProvider client={client}>
                <SnackbarProvider controller={snackbarController}>
                  {props.children}
                  <ModalRenderer />
                  <FloatingManager />
                </SnackbarProvider>
              </QueryClientProvider>
            </VoiceContext>
          </I18nProvider>
          <SyncWorker />
        </ClientContext>
      </ModalContext>
    </KeybindContext>
  );
}

// STELLIS: stale-deploy self-heal. After a deploy, rsync --delete removes the
// old hashed chunks. If a client is still running an old index.html (e.g. an
// iOS PWA whose service worker hasn't refreshed yet), its dynamic imports
// 404 → blank black screen. Vite fires `vite:preloadError` on such a failure;
// we reload ONCE (guarded against a loop) so the browser fetches the fresh
// index.html + current chunks. This is the standard fix for "white/black
// screen after deploy".
if (typeof window !== "undefined") {
  window.addEventListener("vite:preloadError", () => {
    const KEY = "stellis-chunk-reload";
    const last = Number(sessionStorage.getItem(KEY) ?? "0");
    // Avoid an infinite reload loop if the chunk is genuinely unfetchable.
    if (Date.now() - last > 15000) {
      sessionStorage.setItem(KEY, String(Date.now()));
      window.location.reload();
    }
  });
}

render(
  () => (
    <StateContext>
      <Router root={MountContext}>
        <Route path="/login" component={AuthPage as never}>
          <Route path="/delete/:token" component={FlowDeleteAccount} />
          <Route path="/check" component={FlowCheck} />
          <Route path="/create" component={FlowCreate} />
          <Route path="/create/:code" component={FlowCreate} />
          {/* STELLIS: grandma-friendly invite redeem — single form (name + password) */}
          <Route path="/join/:code" component={FlowJoinInvite} />
          <Route path="/auth" component={FlowLogin} />
          <Route path="/sso" component={FlowSSO} />
          <Route path="/resend" component={FlowResend} />
          <Route path="/reset" component={FlowReset} />
          <Route path="/verify/:token" component={FlowVerify} />
          <Route path="/reset/:token" component={FlowConfirmReset} />
          <Route path="/*" component={FlowHome} />
        </Route>
        <Route path="/" component={Interface as never}>
          <Route path="/pwa" component={PWARedirect} />
          <Route path="/dev" component={DevelopmentPage} />
          <Route path="/discover/*" component={Discover} />
          <Route path="/settings" component={SettingsRedirect} />
          <Route path="/invite/:code" component={InviteRedirect} />
          <Route path="/bot/:code" component={BotRedirect} />
          <Route path="/friends" component={Friends} />
          <Route path="/server/:server/*">
            <Route path="/channel/:channel/*" component={ChannelPage} />
            <Route path="/*" component={ServerHome} />
          </Route>
          <Route path="/channel/:channel/*" component={ChannelPage} />
          <Route path="/*" component={HomePage} />
        </Route>
      </Router>

      <LoadTheme />
      {/* <ReportBug /> */}
    </StateContext>
  ),
  document.getElementById("root") as HTMLElement,
);

// STELLIS: remove the pre-mount boot screen now that SPA is mounted.
// Belt-and-braces:
//   1. body.spa-mounted → CSS `display:none` on #boot-screen (kills it even
//      if the JS removal path errors out)
//   2. opacity fade + element removal (clean DOM)
{
  document.body.classList.add("spa-mounted");
  const boot = document.getElementById("boot-screen");
  if (boot) {
    requestAnimationFrame(() => {
      boot.style.transition = "opacity 240ms ease-out";
      boot.style.opacity = "0";
      setTimeout(() => boot.remove(), 260);
    });
  }
}
