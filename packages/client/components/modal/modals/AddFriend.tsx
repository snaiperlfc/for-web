import { createFormControl, createFormGroup } from "solid-forms";
import { createSignal } from "solid-js";

import { Trans, useLingui } from "@lingui-solid/solid/macro";

import { Dialog, DialogProps, Form2 } from "@revolt/ui";

import { useModals } from "..";
import { Modals } from "../types";

/**
 * STELLIS: grandma-friendly Add Friend modal.
 *
 * Stoat's original UI asked for "username#1234" — older relatives don't know
 * what that format is and have nowhere to learn it. We invert the flow:
 *
 * 1. BIG section at the top: "Ваш ID. Покажите его другу, и он пришлёт
 *    заявку". With Copy + native Web Share buttons (so they can ping into
 *    WhatsApp/Telegram in two taps).
 *
 * 2. Smaller section below: "Знаете ID друга? Введите его сюда." Same
 *    submit as before — power users can still send a direct request.
 *
 * Either side works. Most family-flow add-friends happen via the share-my-ID
 * path because it's one mental step (copy/share) instead of two (memorize +
 * type someone else's identifier).
 */
export function AddFriendModal(
  props: DialogProps & Modals & { type: "add_friend" },
) {
  const { t } = useLingui();
  const { showError } = useModals();

  const me = props.client.user;
  const myId =
    me && me.username
      ? me.discriminator
        ? `${me.username}#${me.discriminator}`
        : me.username
      : "";

  const [copied, setCopied] = createSignal(false);

  async function copyId() {
    if (!myId) return;
    try {
      await navigator.clipboard.writeText(myId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      showError(err);
    }
  }

  async function shareId() {
    if (!myId) return;
    const text = `Найди меня в Stellis: ${myId}`;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if ((navigator as any).share) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (navigator as any).share({
          title: "Stellis",
          text,
        });
      } else {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch {
      /* user cancelled share — silent */
    }
  }

  const group = createFormGroup({
    username: createFormControl("", { required: true }),
  });

  async function onSubmit() {
    try {
      await props.client.api.post(`/users/friend`, {
        username: group.controls.username.value,
      });

      props.onClose();
    } catch (error) {
      showError(error);
    }
  }

  const submit = Form2.useSubmitHandler(group, onSubmit);

  return (
    <Dialog
      show={props.show}
      onClose={props.onClose}
      title={<Trans>Добавить друга</Trans>}
      actions={[
        { text: <Trans>Закрыть</Trans> },
        {
          text: <Trans>Отправить заявку</Trans>,
          onClick: () => {
            onSubmit();
            return false;
          },
          isDisabled: !Form2.canSubmit(group),
        },
      ]}
      isDisabled={group.isPending}
    >
      {/* Share-my-ID block — primary path. */}
      <div
        style={{
          padding: "16px",
          background: "var(--md-sys-color-surface-container-high)",
          "border-radius": "16px",
          "margin-bottom": "20px",
        }}
      >
        <div
          style={{
            "font-size": "0.85em",
            color: "var(--md-sys-color-on-surface-variant)",
            "margin-bottom": "8px",
          }}
        >
          Ваш ID — покажите его другу, он добавит вас
        </div>
        <div
          style={{
            "font-family": "monospace",
            "font-size": "1.2em",
            "font-weight": 600,
            "user-select": "all",
            "margin-bottom": "12px",
            color: "var(--md-sys-color-primary)",
            "letter-spacing": "0.5px",
          }}
        >
          {myId || "—"}
        </div>
        <div style={{ display: "flex", gap: "8px", "flex-wrap": "wrap" }}>
          <button
            type="button"
            onClick={copyId}
            style={{
              padding: "10px 16px",
              "border-radius": "12px",
              background: "var(--md-sys-color-primary)",
              color: "var(--md-sys-color-on-primary)",
              border: "none",
              "font-size": "14px",
              "font-weight": 600,
              cursor: "pointer",
              "min-height": "44px",
              "min-width": "44px",
            }}
          >
            {copied() ? "✓ Скопировано" : "📋 Скопировать ID"}
          </button>
          <button
            type="button"
            onClick={shareId}
            style={{
              padding: "10px 16px",
              "border-radius": "12px",
              background: "var(--md-sys-color-secondary-container)",
              color: "var(--md-sys-color-on-secondary-container)",
              border: "none",
              "font-size": "14px",
              "font-weight": 600,
              cursor: "pointer",
              "min-height": "44px",
              "min-width": "44px",
            }}
          >
            ↗ Поделиться
          </button>
        </div>
      </div>

      {/* Reverse path — explicit add by entering someone's ID. */}
      <div
        style={{
          padding: "16px",
          "border-radius": "16px",
          border: "1px solid var(--md-sys-color-outline-variant)",
        }}
      >
        <div
          style={{
            "font-size": "0.85em",
            color: "var(--md-sys-color-on-surface-variant)",
            "margin-bottom": "8px",
          }}
        >
          Знаете ID друга? Введите его сюда
        </div>
        <form onSubmit={submit}>
          <Form2.TextField
            name="username"
            control={group.controls.username}
            label={t`Имя друга`}
            placeholder={`например, ${myId || "имя#1234"}`}
          />
        </form>
      </div>
    </Dialog>
  );
}
