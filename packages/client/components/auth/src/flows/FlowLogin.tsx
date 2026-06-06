import { Match, Switch, createEffect, onMount } from "solid-js";

import { Trans } from "@lingui-solid/solid/macro";

import { useClientLifecycle } from "@revolt/client";
import { State, TransitionType } from "@revolt/client/Controller";
import { useModals } from "@revolt/modal";
import { Navigate } from "@revolt/routing";
import {
  Button,
  CircularProgress,
  Column,
  Row,
  Text,
  iconSize,
} from "@revolt/ui";

import MdArrowBack from "@material-design-icons/svg/filled/arrow_back.svg?component-solid";

import { useState } from "@revolt/state";
import { FlowTitle } from "./Flow";
import { Fields, Form } from "./Form";

/**
 * Flow for logging into an account
 */
export default function FlowLogin() {
  const state = useState();
  const modals = useModals();
  const { lifecycle, isLoggedIn, login, selectUsername } = useClientLifecycle();

  /*
   * STELLIS: on the login screen, pre-fill the email field from
   * "stellis-cached-email" written by FlowJoinInvite. Auto-generated
   * email addresses (xxx@invite.stellis.local) are impossible to
   * remember; without this older relatives have no way back into
   * their account after browser data is cleared.
   * Use DOM injection (same pattern as the username auto-focus below)
   * because Stoat's Form/Fields wraps the input several layers deep.
   */
  onMount(() => {
    const cached = (() => {
      try {
        return localStorage.getItem("stellis-cached-email");
      } catch {
        return null;
      }
    })();
    if (!cached) return;
    const tryFill = () => {
      const input = document.querySelector<HTMLInputElement>(
        'input[name="email"]',
      );
      if (input && !input.value) {
        input.value = cached;
        input.dispatchEvent(new Event("input", { bubbles: true }));
        const pwd = document.querySelector<HTMLInputElement>(
          'input[name="password"]',
        );
        pwd?.focus();
        return true;
      }
      return false;
    };
    if (!tryFill()) setTimeout(tryFill, 80);
  });

  /**
   * Log into account
   * @param data Form Data
   */
  async function performLogin(data: FormData) {
    const email = data.get("email") as string;
    const password = data.get("password") as string;

    if (!email || !password) return;

    await login(
      {
        email,
        password,
      },
      modals,
    );
  }

  /**
   * Select a new username
   * @param data Form Data
   */
  async function select(data: FormData) {
    const username = data.get("username") as string;
    await selectUsername(username);
  }

  return (
    <>
      <Switch
        fallback={
          <>
            <FlowTitle subtitle={<Trans>Sign into Stoat</Trans>} emoji="wave">
              <Trans>Welcome!</Trans>
            </FlowTitle>
            <Form onSubmit={performLogin}>
              <Fields fields={["email", "password"]} />
              <Column gap="xl" align>
                <a href="/login/reset">
                  <Button variant="text">
                    <Trans>Reset password</Trans>
                  </Button>
                </a>
                <a href="/login/resend">
                  <Button variant="text">
                    <Trans>Resend verification</Trans>
                  </Button>
                </a>
              </Column>
              <Row align justify>
                {/* STELLIS: href=".." doesn't navigate in solid-router — it
                    looks for a literal ".." route, finds none, and silently
                    no-ops. Absolute /login goes back to the buttons screen. */}
                <a href="/login">
                  <Button variant="text">
                    <MdArrowBack {...iconSize("1.2em")} /> <Trans>Back</Trans>
                  </Button>
                </a>
                <Button type="submit">
                  <Trans>Login</Trans>
                </Button>
              </Row>
            </Form>
          </>
        }
      >
        {/*
          STELLIS: Switch order matters. isLoggedIn() now returns true during
          Onboarding/LoggingIn (so Interface.tsx doesn't bounce users to /login
          mid-username-pick). That means we have to check the Onboarding +
          LoggingIn lifecycle states BEFORE the generic isLoggedIn match, or
          the username form is never shown and the user is yanked to /app
          before their account has a username record.
        */}
        <Match when={lifecycle.state() === State.LoggingIn}>
          <CircularProgress />
        </Match>
        <Match when={lifecycle.state() === State.Onboarding}>
          {/*
            STELLIS: previously users hit this screen after first login,
            didn't realise the input was waiting for them, and hit Confirm
            blindly → server validation error → "ничего не работает".
            Fixes: explicit hint, auto-focus the field, native HTML
            required+minlength prevents empty submit.
            Auto-focus + attribute injection runs inside an effect that polls
            the DOM (Stoat's Form/Fields wraps the actual <input> several
            layers down — a ref on Form doesn't reach it).
          */}
          {(() => {
            createEffect(() => {
              if (lifecycle.state() !== State.Onboarding) return;
              const tryFocus = () => {
                const input = document.querySelector<HTMLInputElement>(
                  'input[name="username"]',
                );
                if (input) {
                  input.required = true;
                  input.minLength = 2;
                  input.maxLength = 32;
                  input.pattern = "[A-Za-z0-9_]{2,32}";
                  if (!input.placeholder) input.placeholder = "ваш_никнейм";
                  input.focus();
                  return true;
                }
                return false;
              };
              if (!tryFocus()) {
                // Form rendering can be async (Fields component); retry once.
                setTimeout(tryFocus, 50);
              }
            });
            return null;
          })()}

          <FlowTitle>
            <Trans>Choose a username</Trans>
          </FlowTitle>

          <Text>
            <Trans>
              Last registration step. Pick a username people will see —
              latin letters, digits, underscore, at least 2 characters.
              You can change it later in settings.
            </Trans>
          </Text>

          <Form onSubmit={select}>
            <Fields fields={["username"]} />
            <Row align justify>
              <Button
                variant="text"
                onPress={() =>
                  lifecycle.transition({
                    type: TransitionType.Cancel,
                  })
                }
              >
                <MdArrowBack {...iconSize("1.2em")} /> <Trans>Cancel</Trans>
              </Button>
              <Button type="submit">
                <Trans>Confirm</Trans>
              </Button>
            </Row>
          </Form>
        </Match>
        <Match when={isLoggedIn()}>
          {/*
            STELLIS: post-login (or post-onboarding) hard reload to /app
            instead of SPA <Navigate>. Stoat's SPA transition leaves Layout's
            children un-hydrated until manual reload (the "только контур"
            blank card bug). Forcing a real navigation re-bootstraps with the
            cached session and paints the app properly.
          */}
          {(() => {
            const next = state.layout.popNextPath() ?? "/app";
            queueMicrotask(() => window.location.replace(next));
            return <CircularProgress />;
          })()}
        </Match>
      </Switch>
    </>
  );
}
