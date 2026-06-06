import { Show, createSignal, onMount } from "solid-js";

import { Trans } from "@lingui-solid/solid/macro";

import { useApi, useClient, useClientLifecycle } from "@revolt/client";
import { State, TransitionType } from "@revolt/client/Controller";
import { useModals } from "@revolt/modal";
import { useParams } from "@revolt/routing";
import {
  Button,
  CircularProgress,
  Column,
  Row,
  Text,
  TextField,
} from "@revolt/ui";

import { FlowTitle } from "./Flow";

/**
 * STELLIS: simplified invite-redeem flow for non-tech-savvy users
 * (older family members). Single screen with two fields — name and password —
 * end-to-end takes the click of an invite link straight into the chat:
 *
 *   /invite/CODE  →  Interface bounces to /login/join/CODE  →  this screen
 *
 * Submit chain:
 *   1. POST /auth/account/create  {email, password, invite}
 *      (email is auto-generated `<slug(name)>-<rand>@invite.stellis.local` —
 *       we have no SMTP and features.email is false, so the address is just
 *       an internal identifier the user never has to remember.)
 *   2. login(...) — transitions LoggingIn → Onboarding (no username yet)
 *   3. selectUsername(...) — /onboard/complete, transitions to Ready
 *   4. POST /invites/:code — accept, auto-joins server
 *   5. hard-reload /server/:server/channel/:channel (or /server/:server)
 *
 * If anything between steps 3-4 fails, we still hard-reload to /invite/CODE
 * so the standard "Join" modal renders — the worst-case fallback is one
 * extra click, never a dead end.
 */
export default function FlowJoinInvite() {
  const api = useApi();
  const params = useParams();
  const getClient = useClient();
  const { lifecycle, isLoggedIn, login, selectUsername } = useClientLifecycle();
  const modals = useModals();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [invite, setInvite] = createSignal<any>(null);
  const [inviteError, setInviteError] = createSignal<string | null>(null);
  const [error, setError] = createSignal<string | null>(null);
  const [busy, setBusy] = createSignal(false);

  onMount(() => {
    const code = params.code;
    if (!code) {
      setInviteError("Invite code is missing.");
      return;
    }
    api
      .get(`/invites/${code as ""}`)
      .then((data) => setInvite(data))
      .catch((err) => {
        console.error("invite preview failed", err);
        setInviteError(
          "Приглашение недействительно или уже использовано.",
        );
      });
  });

  /** Generate a username-safe slug for the auto-email. */
  function slug(name: string) {
    // Apply the same Cyrillic→Latin translit so "Бабушка Аня" → "babushka-anya"
    // rather than a meaningless "guest-..." that grandma can't even relate to
    // her account. Hyphen-separated to keep email tokens readable in admin panel.
    const s = translit(name)
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    return s.length > 0 ? s : "guest";
  }

  /*
   * STELLIS: Cyrillic transliteration table. Stoat usernames must match
   * [A-Za-z0-9_]{2,32}; the display name (set separately below) carries
   * the original Cyrillic. Без транслитерации "Бабушка Аня" → user_xxxx,
   * имя в чате превращалось в мусор.
   */
  const CYRILLIC_TO_LATIN: Record<string, string> = {
    а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "yo", ж: "zh",
    з: "z", и: "i", й: "i", к: "k", л: "l", м: "m", н: "n", о: "o",
    п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "ts",
    ч: "ch", ш: "sh", щ: "sch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu",
    я: "ya",
  };

  function translit(input: string): string {
    return Array.from(input.toLowerCase())
      .map((ch) => CYRILLIC_TO_LATIN[ch] ?? ch)
      .join("");
  }

  /** Convert a display name to a Stoat-compatible username (>=2, [A-Za-z0-9_]). */
  function toUsername(name: string) {
    const trimmed = name.trim();
    let u = translit(trimmed)
      .replace(/[^A-Za-z0-9_]/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_+|_+$/g, "");
    if (u.length < 2) u = `user_${Math.random().toString(36).slice(2, 6)}`;
    if (u.length > 32) u = u.slice(0, 32);
    return u;
  }

  function waitForState(predicate: () => boolean, timeoutMs = 10_000) {
    return new Promise<void>((resolve, reject) => {
      const start = Date.now();
      const tick = () => {
        if (predicate()) return resolve();
        if (Date.now() - start > timeoutMs) {
          return reject(new Error("Timed out waiting for client state"));
        }
        setTimeout(tick, 100);
      };
      tick();
    });
  }

  function destinationFromInvite(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    payload: any,
  ): { server: string; channel: string } {
    const server =
      payload?.server_id ??
      payload?.server?._id ??
      payload?.server?.id ??
      "";
    const channel =
      payload?.channel_id ??
      payload?.channel?._id ??
      payload?.channel?.id ??
      "";
    return { server, channel };
  }

  /** Already logged in? One-click accept. */
  async function acceptOnly() {
    if (busy()) return;
    setBusy(true);
    setError(null);
    try {
      const r = await getClient().api.post(`/invites/${params.code as ""}`);
      const dest = destinationFromInvite(r);
      if (dest.server && dest.channel) {
        window.location.replace(`/server/${dest.server}/channel/${dest.channel}`);
      } else if (dest.server) {
        window.location.replace(`/server/${dest.server}`);
      } else {
        window.location.replace("/app");
      }
    } catch (err) {
      console.error("accept invite failed", err);
      setError("Не удалось присоединиться. Попробуйте ещё раз.");
      setBusy(false);
    }
  }

  async function handleSubmit(event: Event) {
    event.preventDefault();
    if (busy()) return;

    const form = event.currentTarget as HTMLFormElement;
    const data = new FormData(form);
    const name = ((data.get("name") as string) ?? "").trim();
    const password = (data.get("password") as string) ?? "";

    if (name.length < 2) {
      setError("Введите имя — минимум 2 символа.");
      return;
    }
    if (password.length < 8) {
      setError("Пароль должен быть минимум 8 символов.");
      return;
    }

    setBusy(true);
    setError(null);

    const username = toUsername(name);
    const email = `${slug(name)}-${Date.now().toString(36)}-${Math.random()
      .toString(36)
      .slice(2, 6)}@invite.stellis.local`;
    const code = params.code as string;

    try {
      // 1) Create account
      await api.post("/auth/account/create", {
        email,
        password,
        invite: code,
      });

      // 2) Login — sets session, fires LoggingIn → Onboarding
      await login({ email, password }, modals);

      // 3) Wait for Onboarding state, then complete with the chosen username
      try {
        await waitForState(() => lifecycle.state() === State.Onboarding, 8_000);
        try {
          await selectUsername(username);
        } catch {
          // Username collision — append a short suffix and retry once
          await selectUsername(
            `${username.slice(0, 28)}_${Math.random().toString(36).slice(2, 5)}`,
          );
        }
      } catch (err) {
        // Not in Onboarding (e.g. already had a username somehow) — proceed
        console.warn("skipping username step", err);
      }

      // 4) Wait for Ready, then accept the invite as the authed client
      try {
        await waitForState(
          () => isLoggedIn() && lifecycle.state() === State.Ready,
          8_000,
        );
      } catch {
        // ignore — try accept anyway, hard reload covers any drift
      }

      /*
       * STELLIS: set display_name to the original (Cyrillic-allowed) input.
       * username is the login id and must be ASCII; display_name is free-form
       * Unicode and is what other members see. Без этого бабушка появлялась
       * в чате как "user_kpk0" вместо "Бабушка Аня".
       */
      try {
        const me = getClient().user;
        if (me) {
          await me.edit({ display_name: name });
        }
      } catch (err) {
        console.warn("display_name set failed", err);
      }

      /*
       * STELLIS: cache the auto-generated email so a return-visit can log
       * in without grandma having to remember it. FlowLogin reads
       * "stellis-cached-email" on mount and pre-fills the field. Cleared
       * automatically on Logout (Controller).
       */
      try {
        localStorage.setItem("stellis-cached-email", email);
        localStorage.setItem("stellis-cached-name", name);
      } catch {
        /* localStorage may be blocked in private mode */
      }

      let dest = { server: "", channel: "" };
      try {
        const r = await getClient().api.post(`/invites/${code as ""}`);
        dest = destinationFromInvite(r);
      } catch (err) {
        console.warn("auto-accept failed, falling back to invite modal", err);
      }

      if (!dest.server && invite()) {
        dest = destinationFromInvite(invite());
      }

      // 5) Hard reload — clean SPA bootstrap with the cached session
      if (dest.server && dest.channel) {
        window.location.replace(`/server/${dest.server}/channel/${dest.channel}`);
      } else if (dest.server) {
        window.location.replace(`/server/${dest.server}`);
      } else {
        // Worst case: land on /invite/CODE so the user sees the Join modal
        window.location.replace(`/invite/${code}`);
      }
    } catch (err) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const e = err as any;
      console.error("FlowJoinInvite submit failed", e);
      const stoatType = e?.response?.data?.type ?? e?.type;
      let msg: string;
      if (stoatType === "OperationFailed") {
        msg = "Имя или пароль уже заняты. Попробуйте другое имя.";
      } else if (stoatType === "InvalidInvite") {
        msg = "Приглашение недействительно или уже использовано.";
      } else if (stoatType === "FailedValidation") {
        msg = "Пароль слишком простой или имя содержит запрещённые символы.";
      } else {
        msg = "Что-то пошло не так. Попробуйте ещё раз.";
      }
      setError(msg);
      // Lifecycle may be mid-transition — fully reset before letting the user retry
      try {
        lifecycle.transition({ type: TransitionType.Cancel });
      } catch {
        /* noop */
      }
      setBusy(false);
    }
  }

  return (
    <>
      <Show when={inviteError()}>
        <FlowTitle subtitle={inviteError()!} emoji="wave">
          <Trans>Stellis</Trans>
        </FlowTitle>
        <Row justify>
          <a href="/login">
            <Button variant="text">
              <Trans>Back to sign in</Trans>
            </Button>
          </a>
        </Row>
      </Show>

      <Show when={!inviteError() && !invite()}>
        <CircularProgress />
      </Show>

      <Show when={!inviteError() && invite() && !isLoggedIn()}>
        <FlowTitle
          subtitle={(() => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const inv = invite() as any;
            const serverName =
              inv?.server_name ?? inv?.server?.name ?? "Stellis";
            return (
              <>
                Вас пригласили в <b>{serverName}</b>
              </>
            );
          })()}
          emoji="wave"
        >
          Добро пожаловать!
        </FlowTitle>

        <Text>
          Заполните два поля — и вы в чате. Это всё, что нужно.
        </Text>

        {(() => {
          let formRef: HTMLFormElement | undefined;
          return (
            <form
              ref={formRef}
              onSubmit={handleSubmit}
              id="stellis-join-invite-form"
            >
              <Column gap="lg">
                <label>
                  <TextField
                    required
                    autoFocus
                    name="name"
                    label="Как вас зовут"
                    placeholder="Например, Бабушка Аня"
                    minlength={2}
                    maxlength={32}
                    autocomplete="nickname"
                  />
                </label>
                <label>
                  <TextField
                    required
                    name="password"
                    type="password"
                    label="Придумайте пароль"
                    placeholder="Минимум 8 символов"
                    minlength={8}
                    autocomplete="new-password"
                  />
                </label>

                <Show when={error()}>
                  <Text
                    style={{
                      color: "var(--md-sys-color-error)",
                      "font-size": "0.9em",
                    }}
                  >
                    {error()}
                  </Text>
                </Show>

                <Row justify>
                  {/* STELLIS: Stoat's <Button> doesn't whitelist type="submit"
                      in its props, so we trigger the form submit manually via
                      onPress + requestSubmit(). This survives whatever
                      @solid-aria/button does with the native click handler. */}
                  <Button
                    disabled={busy()}
                    onPress={() => {
                      if (busy()) return;
                      if (formRef?.checkValidity()) {
                        formRef.requestSubmit();
                      } else {
                        formRef?.reportValidity();
                      }
                    }}
                  >
                    {busy() ? "Создаём аккаунт…" : "Войти в чат"}
                  </Button>
                </Row>

                <Text
                  style={{
                    color: "var(--md-sys-color-on-surface-variant)",
                    "font-size": "0.85em",
                    "text-align": "center",
                  }}
                >
                  Запомните пароль — он понадобится при следующем входе. Имя
                  можно изменить позже в настройках.
                </Text>
              </Column>
            </form>
          );
        })()}
      </Show>

      <Show when={!inviteError() && invite() && isLoggedIn()}>
        <FlowTitle
          subtitle={(() => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const inv = invite() as any;
            const serverName =
              inv?.server_name ?? inv?.server?.name ?? "Stellis";
            return (
              <>
                Принять приглашение в <b>{serverName}</b>?
              </>
            );
          })()}
          emoji="wave"
        >
          Stellis
        </FlowTitle>

        <Row justify>
          <Button onPress={acceptOnly} disabled={busy()}>
            {busy() ? "Подключаем…" : "Присоединиться"}
          </Button>
        </Row>

        <Show when={error()}>
          <Text style={{ color: "var(--md-sys-color-error)" }}>{error()}</Text>
        </Show>
      </Show>
    </>
  );
}
