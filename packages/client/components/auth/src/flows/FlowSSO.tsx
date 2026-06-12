import { Show, createSignal, onMount } from "solid-js";

import { useState } from "@revolt/state";
import { Button, CircularProgress, Column } from "@revolt/ui";

/**
 * STELLIS: Yandex SSO landing.
 *
 * The backend bridge (/auth/yandex/callback) finishes the OAuth dance and
 * redirects here with the minted Stoat session in the URL FRAGMENT:
 *   /login/sso#token=<t>&id=<sessionId>&user=<userId>
 * (fragment, not query — keeps the token out of server logs / Referer).
 *
 * On success we persist the session exactly like a normal login and hard-
 * navigate into the app. On error we show a friendly RU message.
 */
const ERRORS: Record<string, string> = {
  invite_required:
    "Чтобы зайти впервые, нужна ссылка-приглашение. Попроси её у того, кто тебя зовёт, и открой Stellis по ней — дальше вход через Яндекс будет в одно касание.",
  email_taken:
    "На эту почту уже есть аккаунт Stellis. Войди по паролю — или попроси сбросить пароль у администратора.",
  yandex_denied: "Доступ к Яндексу не выдан. Попробуй ещё раз.",
  yandex_disabled: "Вход через Яндекс сейчас отключён.",
  no_email:
    "Яндекс не отдал адрес почты. Разреши доступ к почте при входе или используй обычную регистрацию.",
  bad_state: "Ссылка устарела. Начни вход заново.",
  login_failed: "Не удалось войти. Попробуй ещё раз.",
  login_after_create: "Аккаунт создан, но войти не вышло. Попробуй ещё раз.",
  create_failed: "Не удалось создать аккаунт. Проверь приглашение и попробуй снова.",
  default: "Что-то пошло не так со входом через Яндекс. Попробуй ещё раз.",
};

export default function FlowSSO() {
  const state = useState();
  const [error, setError] = createSignal<string | null>(null);

  onMount(() => {
    const hash = window.location.hash.startsWith("#")
      ? window.location.hash.slice(1)
      : window.location.hash;
    const params = new URLSearchParams(hash);

    const err = params.get("error");
    if (err) {
      setError(ERRORS[err] ?? ERRORS.default);
      return;
    }

    const token = params.get("token");
    const id = params.get("id");
    const userId = params.get("user");

    if (token && id && userId) {
      state.auth.setSession({ _id: id, token, userId, valid: true });
      // Clear the token from the URL before bootstrapping the app.
      window.location.replace("/app");
      return;
    }

    setError(ERRORS.default);
  });

  return (
    <Show when={error()} fallback={<CircularProgress />}>
      <Column gap="lg">
        <b style={{ "font-size": "1.2em", "text-align": "center" }}>
          Вход через Яндекс
        </b>
        <span style={{ "text-align": "center", opacity: 0.8, "line-height": 1.5 }}>
          {error()}
        </span>
        <a href="/login" style={{ "text-decoration": "none" }}>
          <Button>Назад ко входу</Button>
        </a>
      </Column>
    </Show>
  );
}
