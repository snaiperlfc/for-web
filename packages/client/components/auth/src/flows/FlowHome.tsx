import { Match, Show, Switch } from "solid-js";

import { Trans } from "@lingui-solid/solid/macro";
import { css, cva } from "styled-system/css";

import { useClientLifecycle } from "@revolt/client";
import { TransitionType } from "@revolt/client/Controller";
import { Navigate } from "@revolt/routing";
import { Button, Column } from "@revolt/ui";

import { useState } from "@revolt/state";
import Wordmark from "../../../../public/assets/web/wordmark.svg?component-solid";

/**
 * Flow for logging into an account
 */
export default function FlowHome() {
  const state = useState();
  const { lifecycle, isLoggedIn, isError } = useClientLifecycle();

  return (
    <Switch
      fallback={
        <>
          <Show when={isLoggedIn()}>
            <Navigate href={state.layout.popNextPath() ?? "/app"} />
          </Show>

          <Column gap="xl">
            <Wordmark
              class={css({
                width: "60%",
                margin: "auto",
                fill: "var(--md-sys-color-on-surface)",
              })}
            />

            <Column>
              <b
                style={{
                  "font-weight": 800,
                  "font-size": "1.4em",
                  display: "flex",
                  "flex-direction": "column",
                  "align-items": "center",
                  "text-align": "center",
                }}
              >
                <span>
                  <Trans>
                    Find your com
                    <wbr />
                    munity,
                    <br />
                    connect with the world.
                  </Trans>
                </span>
              </b>
              <span style={{ "text-align": "center", opacity: "0.5" }}>
                <Trans>
                  Stoat is one of the best ways to stay connected with your
                  friends and community, anywhere, anytime.
                </Trans>
              </span>
            </Column>

            <Column>
              <a href="/login/auth">
                <Column>
                  <Button>
                    <Trans>Log In</Trans>
                  </Button>
                </Column>
              </a>
              <a href="/login/create">
                <Column>
                  <Button variant="tonal">
                    <Trans>Sign Up</Trans>
                  </Button>
                </Column>
              </a>
              {/*
                STELLIS: Yandex SSO. MUST be a real navigation to the backend
                bridge (/auth/yandex/start) — a plain <a> gets intercepted by
                Solid Router as an internal SPA route and silently does
                nothing. window.location forces a full page load.
              */}
              <button
                type="button"
                class={yandexButton()}
                style={{ "margin-top": "4px" }}
                onClick={() => window.location.assign("/auth/yandex/start")}
              >
                <span class={yandexBadge()}>Я</span>
                Войти через Яндекс
              </button>
            </Column>
          </Column>
        </>
      }
    >
      <Match when={isError()}>
        <Switch fallback={"an unknown error occurred"}>
          <Match when={lifecycle.permanentError === "InvalidSession"}>
            <h1>
              <Trans>You were logged out!</Trans>
            </h1>
          </Match>
        </Switch>

        <Button
          variant="filled"
          onPress={() =>
            lifecycle.transition({
              type: TransitionType.Dismiss,
            })
          }
        >
          <Trans>OK</Trans>
        </Button>
      </Match>
    </Switch>
  );
}

const yandexButton = cva({
  base: {
    width: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "8px",
    height: "40px",
    borderRadius: "20px",
    border: "none",
    cursor: "pointer",
    background: "#FC3F1D",
    color: "#fff",
    fontWeight: 600,
    fontSize: "0.95em",
    fontFamily: "inherit",
    transition: "filter 120ms",
    "&:active": { filter: "brightness(0.92)" },
  },
});

const yandexBadge = cva({
  base: {
    width: "20px",
    height: "20px",
    borderRadius: "50%",
    background: "#fff",
    color: "#FC3F1D",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: 800,
  },
});
