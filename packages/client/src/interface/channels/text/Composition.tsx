import {
  For,
  Match,
  Show,
  Switch,
  createEffect,
  createMemo,
  createSignal,
  on,
  onCleanup,
} from "solid-js";

import { useLingui } from "@lingui-solid/solid/macro";
import { Channel } from "stoat.js";

import { useClient } from "@revolt/client";
import { CONFIGURATION, debounce } from "@revolt/common";
import { Keybind, KeybindAction, createKeybind } from "@revolt/keybinds";
import { useModals } from "@revolt/modal";
import { useState } from "@revolt/state";
import {
  CompositionMediaPicker,
  FileCarousel,
  FileDropAnywhereCollector,
  FilePasteCollector,
  IconButton,
  MessageBox,
  MessageReplyPreview,
  humanFileSize,
} from "@revolt/ui";
import { Symbol } from "@revolt/ui/components/utils/Symbol";
import { useSearchSpace } from "@revolt/ui/components/utils/autoComplete";

interface Props {
  /**
   * Channel to compose for
   */
  channel: Channel;

  /**
   * Notify parent component when a message is sent
   */
  onMessageSend?: () => void;
}

/**
 * Message composition engine
 */
export function MessageComposition(props: Props) {
  const state = useState();
  const { t } = useLingui();
  const client = useClient();
  const { openModal } = useModals();

  createKeybind(KeybindAction.CHAT_JUMP_END, () =>
    setNodeReplacement(["_focus"]),
  );

  createKeybind(KeybindAction.CHAT_FOCUS_COMPOSITION, () =>
    setNodeReplacement(["_focus"]),
  );

  /**
   * Get the draft for the current channel
   * @returns Draft
   */
  function draft() {
    return state.draft.getDraft(props.channel.id);
  }

  const messageLength = () => draft().content?.length ?? 0;

  const maxMessageLength = () => {
    const cl = client();
    return cl.configured()
      ? (cl.configuration?.features.limits.default.message_length ?? 2000)
      : 2000;
  };

  // STELLIS: surface the counter much earlier so people see the limit coming
  // (was 200 — too late; users would only notice when already a paragraph
  // over). Also dropped the bizarre "wayTooLong = +9999" upstream threshold —
  // any overflow shows "Too long" immediately.
  const isAlmostTooLong = () => messageLength() > maxMessageLength() - 500;

  const isTooLong = () => messageLength() > maxMessageLength();

  // Whether the send button should be active/clickable
  const canSend = createMemo(() => {
    const draftContent = draft()?.content ?? "";
    const draftFiles = draft()?.files ?? [];

    const tooLong = messageLength() > maxMessageLength();

    return (
      !tooLong && (draftContent.trim().length > 0 || draftFiles.length > 0)
    );
  });

  // TEMP
  function currentValue() {
    return draft()?.content ?? "";
  }

  const [initialValue, setInitialValue] = createSignal([
    currentValue(),
  ] as const);

  const [nodeReplacement, setNodeReplacement] =
    createSignal<readonly [string | "_focus"]>();

  // bind this composition instance to the global node replacement signal
  state.draft._setNodeReplacement = setNodeReplacement;
  onCleanup(() => (state.draft._setNodeReplacement = undefined));

  createEffect(
    on(
      () => props.channel,
      () => setInitialValue([currentValue()]),
      { defer: true },
    ),
  );

  createEffect(
    on(
      () => currentValue(),
      (value) => {
        if (value === "") {
          setInitialValue([""]);
        }
      },
      { defer: true },
    ),
  );
  // END TEMP

  /**
   * Keep track of last time we sent a typing packet
   */
  let isTyping: number | undefined = undefined;

  /**
   * Send typing packet
   */
  function startTyping() {
    if (typeof isTyping === "number" && +new Date() < isTyping) return;

    const ws = client()!.events;
    if (ws.state() === 2) {
      isTyping = +new Date() + 2500;
      ws.send({
        type: "BeginTyping",
        channel: props.channel.id,
      });
    }
  }

  /**
   * Send stop typing packet
   */
  function stopTyping() {
    if (isTyping) {
      const ws = client()!.events;
      if (ws.state() === 2) {
        isTyping = undefined;
        ws.send({
          type: "EndTyping",
          channel: props.channel.id,
        });
      }
    }
  }

  /**
   * Stop typing after some time
   */
  const delayedStopTyping = debounce(stopTyping, 1000); // eslint-disable-line solid/reactivity

  /**
   * Send a message using the current draft
   * @param useContent Content to send
   */
  async function sendMessage(useContent?: unknown) {
    if (!canSend() && typeof useContent !== "string") {
      return;
    }
    stopTyping();
    props.onMessageSend?.();

    /*
     * STELLIS: tiny haptic on send — confirms the tap registered without
     * blocking visuals. 8ms is barely perceptible but lands as a "click."
     * Optional chaining guards desktops/iOS Safari (Apple disables the API
     * silently — no error). Wrapped in try because some Android builds
     * throw if the user has reduced-motion or vibration disabled.
     */
    try {
      navigator.vibrate?.(8);
    } catch {
      /* noop */
    }

    if (typeof useContent === "string") {
      const currentDraft = draft();
      if (
        currentDraft?.replies?.length &&
        !currentDraft.content &&
        !currentDraft.files?.length
      ) {
        state.draft.setDraft(props.channel.id, {
          ...currentDraft,
          content: useContent,
        });
        return state.draft.sendDraft(client(), props.channel);
      }
      return props.channel.sendMessage(useContent);
    }

    state.draft.sendDraft(client(), props.channel);
  }

  /**
   * Shorthand for updating the draft
   */
  function setContent(content: string) {
    state.draft.setDraft(props.channel.id, { content });
    startTyping();
  }

  /**
   * Handle files being added to the draft.
   * @param files List of files
   */
  function onFiles(files: File[]) {
    const rejectedFiles: File[] = [];
    const validFiles: File[] = [];

    const maxSize = client().configured()
      ? (client().configuration?.features.limits.default.file_upload_size_limits
          .attachments ?? CONFIGURATION.MAX_FILE_SIZE)
      : CONFIGURATION.MAX_FILE_SIZE;

    for (const file of files) {
      if (file.size > maxSize) {
        console.log("File too large:", file);
        rejectedFiles.push(file);
      } else {
        validFiles.push(file);
      }
    }

    if (rejectedFiles.length > 0) {
      const maxSizeFormatted = humanFileSize(maxSize);

      if (rejectedFiles.length === 1) {
        const file = rejectedFiles[0];
        const fileSize = humanFileSize(file.size);
        const error = new Error(
          t`The file "${file.name}" (${fileSize}) exceeds the maximum size limit of ${maxSizeFormatted}.`,
        );
        error.name = "File too large";
        openModal({
          type: "error2",
          error,
        });
      } else {
        const error = new Error(
          t`${rejectedFiles.length} files exceed the maximum size limit of ${maxSizeFormatted} and were not uploaded.`,
        );
        error.name = "Files too large";
        openModal({
          type: "error2",
          error,
        });
      }
    }

    for (const file of validFiles) {
      state.draft.addFile(props.channel.id, file);
    }
  }

  /**
   * Add a file to the message
   */
  function addFile() {
    const input = document.createElement("input");
    input.accept = "*";
    input.type = "file";
    input.multiple = true;
    input.style.display = "none";

    input.addEventListener("change", async (e) => {
      // Get all attached files
      const files = (e.currentTarget as HTMLInputElement)?.files;

      // Remove element from DOM
      input.remove();

      // Skip execution if no files specified
      if (!files) return;
      onFiles([...files]);
    });

    // iOS requires us to append the file input
    // to DOM to allow us to add any images
    document.body.appendChild(input);
    input.click();
  }

  /**
   * Remove a file by its ID
   * @param fileId File ID
   */
  function removeFile(fileId: string) {
    state.draft.removeFile(props.channel.id, fileId);
  }

  const searchSpace = useSearchSpace(() => props.channel, client);

  /*
   * STELLIS: force the inline Send button on touch devices regardless of the
   * appearance:show_send_button setting. On phones the on-screen keyboard's
   * "send/return" key is ambiguous — newer iOS shows a "return" arrow that
   * inserts a newline; users (especially elderly) end up with a multi-line
   * empty draft and no apparent way to send. A visible filled button removes
   * the ambiguity. Desktop respects the user setting as before.
   * matchMedia is safe at module/setup time — Solid signals not required;
   * the orientation doesn't flip pointer:coarse so we can read once.
   */
  const isTouchDevice = (() => {
    if (typeof window === "undefined") return false;
    try {
      return window.matchMedia("(pointer: coarse)").matches;
    } catch {
      return false;
    }
  })();
  const showSendButton = () =>
    isTouchDevice ||
    state.settings.getValue("appearance:show_send_button") ||
    false;

  return (
    <>
      {/*
        STELLIS: explicit inline error when the draft is over the server's
        message_length limit. Upstream only changes the floating counter to
        "Too Long" and silently disables Send — users hit Enter, nothing
        happens, no explanation. This banner sits right above the input so
        it's impossible to miss and tells them exactly what to do.
      */}
      <Show when={isTooLong()}>
        <div
          role="alert"
          style={{
            margin: "0 8px 6px",
            padding: "8px 12px",
            "border-radius": "8px",
            "font-size": "0.85em",
            "line-height": "1.4",
            background: "color-mix(in oklab, var(--md-sys-color-error) 12%, transparent)",
            color: "var(--md-sys-color-error)",
            border: "1px solid color-mix(in oklab, var(--md-sys-color-error) 35%, transparent)",
          }}
        >
          {/* Russian-only on purpose — Stellis is closed RU instance. */}
          Сообщение слишком длинное:{" "}
          <strong>
            {messageLength()} / {maxMessageLength()}
          </strong>{" "}
          символов. Разбей на несколько сообщений или сократи на{" "}
          <strong>{messageLength() - maxMessageLength()}</strong>{" "}
          символов.
        </div>
      </Show>
      <Show when={state.draft.hasAdditionalElements(props.channel.id)}>
        <Keybind
          keybind={KeybindAction.CHAT_REMOVE_COMPOSITION_ELEMENT}
          onPressed={() => state.draft.popFromDraft(props.channel.id)}
        />
      </Show>
      <FileCarousel
        files={draft().files ?? []}
        getFile={state.draft.getFile}
        addFile={addFile}
        removeFile={removeFile}
      />
      <For each={draft().replies ?? []}>
        {(reply) => {
          const message = client()!.messages.get(reply.id);

          /**
           * Toggle mention on reply
           */
          function toggle() {
            state.draft.toggleReplyMention(props.channel.id, reply.id);
          }

          /**
           * Dismiss a reply
           */
          function dismiss() {
            state.draft.removeReply(props.channel.id, reply.id);
          }

          return (
            <MessageReplyPreview
              message={message}
              mention={reply.mention}
              toggle={toggle}
              dismiss={dismiss}
              self={message?.authorId === client()!.user!.id}
            />
          );
        }}
      </For>
      <MessageBox
        initialValue={initialValue()}
        nodeReplacement={nodeReplacement()}
        onSendMessage={() => sendMessage()}
        onTyping={delayedStopTyping}
        onEditLastMessage={() => state.draft.setEditingMessage(true)}
        content={draft()?.content ?? ""}
        setContent={setContent}
        actionsStart={
          <Switch fallback={<MessageBox.InlineIcon size="short" />}>
            <Match when={props.channel.havePermission("UploadFiles")}>
              <MessageBox.InlineIcon size="wide">
                <IconButton onPress={addFile}>
                  <Symbol>add</Symbol>
                </IconButton>
              </MessageBox.InlineIcon>
            </Match>
          </Switch>
        }
        actionsEnd={
          <MessageBox.ActionContainer column>
            <Show when={isAlmostTooLong()}>
              <MessageBox.FloatingAction
                size="normal"
                error={isTooLong()}
              >
                {isTooLong()
                  ? `−${messageLength() - maxMessageLength()}`
                  : maxMessageLength() - messageLength()}
              </MessageBox.FloatingAction>
            </Show>
            <MessageBox.ActionContainer>
              <CompositionMediaPicker
                onMessage={sendMessage}
                onTextReplacement={(text) => setNodeReplacement([text])}
              >
                {(triggerProps) => (
                  <>
                    <MessageBox.InlineIcon size="normal" data-stellis-compose-action="gif">
                      <IconButton onPress={triggerProps.onClickGif}>
                        <Symbol>gif</Symbol>
                      </IconButton>
                    </MessageBox.InlineIcon>
                    <MessageBox.InlineIcon size="normal" data-stellis-compose-action="emoji">
                      <IconButton onPress={triggerProps.onClickEmoji}>
                        {/* STELLIS: `emoticon` is not a valid Material Symbol —
                            it rendered as a broken ":-)" glyph. `mood` is the
                            real smiley face icon (Telegram-style). */}
                        <Symbol>mood</Symbol>
                      </IconButton>
                    </MessageBox.InlineIcon>

                    <div ref={triggerProps.ref} />
                  </>
                )}
              </CompositionMediaPicker>
            </MessageBox.ActionContainer>
          </MessageBox.ActionContainer>
        }
        placeholder={
          props.channel.type === "SavedMessages"
            ? t`Save to your notes`
            : // STELLIS: on phones use a short "Сообщение" placeholder — the
              // full "Сообщение <channel>" wraps to two lines in the pill.
              isTouchDevice
              ? t`Message`
              : props.channel.type === "DirectMessage"
                ? t`Message ${props.channel.recipient?.username}`
                : t`Message ${props.channel.name}`
        }
        sendingAllowed={props.channel.havePermission("SendMessage")}
        autoCompleteSearchSpace={searchSpace}
        updateDraftSelection={(start, end) =>
          state.draft.setSelection(props.channel.id, start, end)
        }
        hasActionsAppend={showSendButton()}
        actionsAppend={
          <Show when={showSendButton()}>
            <IconButton
              _compositionSendMessage
              size="sm"
              variant={canSend() ? "filled" : "tonal"}
              shape="square"
              isDisabled={!canSend()}
              onPress={sendMessage}
              data-stellis-send-button
            >
              <Symbol fill={true}>send</Symbol>
            </IconButton>
          </Show>
        }
      />
      <FilePasteCollector onFiles={onFiles} />
      <FileDropAnywhereCollector onFiles={onFiles} />
    </>
  );
}
