import { For, Match, Show, Switch, createMemo } from "solid-js";

import { Trans } from "@lingui-solid/solid/macro";
import { PublicChannelInvite } from "stoat.js";
import { css, cva } from "styled-system/css";
import { styled } from "styled-system/jsx";

import { IS_DEV, useClient } from "@revolt/client";
import { CONFIGURATION } from "@revolt/common";
import { useModals } from "@revolt/modal";
import { useNavigate } from "@revolt/routing";
import { useState } from "@revolt/state";
import {
  Avatar,
  Button,
  CategoryButton,
  Column,
  Header,
  iconSize,
  main,
} from "@revolt/ui";
import { Symbol } from "@revolt/ui/components/utils/Symbol";

import MdAddCircle from "@material-design-icons/svg/filled/add_circle.svg?component-solid";
import MdExplore from "@material-design-icons/svg/filled/explore.svg?component-solid";
import MdGroups3 from "@material-design-icons/svg/filled/groups_3.svg?component-solid";
import MdHome from "@material-design-icons/svg/filled/home.svg?component-solid";
import MdPayments from "@material-design-icons/svg/filled/payments.svg?component-solid";
import MdRateReview from "@material-design-icons/svg/filled/rate_review.svg?component-solid";
import MdSettings from "@material-design-icons/svg/filled/settings.svg?component-solid";

import Wordmark from "../../public/assets/web/wordmark.svg?component-solid";

import { HeaderIcon } from "./common/CommonHeader";

/**
 * Base layout of the home page (i.e. the header/background)
 */
const Base = styled("div", {
  base: {
    width: "100%",
    display: "flex",
    flexDirection: "column",

    color: "var(--md-sys-color-on-surface)",
  },
});

/**
 * Layout of the content as a whole
 */
const content = cva({
  base: {
    ...main.raw(),

    padding: "48px 0",

    gap: "32px",
    alignItems: "center",
    justifyContent: "center",
  },
});

/**
 * Layout of the buttons
 */
const Buttons = styled("div", {
  base: {
    gap: "8px",
    padding: "8px",
    display: "flex",
    borderRadius: "var(--borderRadius-lg)",

    color: "var(--md-sys-color-on-surface-variant)",
    background: "var(--md-sys-color-surface-variant)",
  },
});

/**
 * Make sure the columns are separated
 */
const SeparatedColumn = styled(Column, {
  base: {
    justifyContent: "stretch",
    marginInline: "0.25em",
    width: "260px",
    "& > *": {
      flexGrow: 1,
    },
  },
});

/**
 * Home page
 */
/**
 * STELLIS: are we on a phone-sized / touch screen?
 * matchMedia is read once at setup — orientation doesn't flip the
 * pointer type so a single read is fine.
 */
const isMobileHome = (() => {
  if (typeof window === "undefined") return false;
  try {
    return window.matchMedia(
      "(max-width: 900px), (hover: none) and (pointer: coarse)",
    ).matches;
  } catch {
    return false;
  }
})();

export function HomePage() {
  const { openModal } = useModals();
  const navigate = useNavigate();
  const client = useClient();

  // check if we're stoat.chat; if so, check if the user is in the Lounge
  const showLoungeButton = CONFIGURATION.IS_STOAT;
  const isInLounge =
    client()!.servers.get("01F7ZSBSFHQ8TA81725KQCSDDP") !== undefined;

  return (
    <Base>
      <Header placement="primary">
        <HeaderIcon>
          <MdHome {...iconSize(22)} />
        </HeaderIcon>
        <Trans>Home</Trans>
      </Header>
      {/*
        STELLIS mobile home: a quick-access directory of everything the
        user can jump into (DMs + each server's channels), instead of the
        desktop's "create server / open settings" cards which read as
        admin actions. For a family chat this is the first thing they
        want — tap a channel, you're in.
      */}
      <Show when={isMobileHome} fallback={
      <div use:scrollable={{ class: content() }}>
        <Wordmark
          class={css({
            display: "block",
            width: "320px",
            maxWidth: "70%",
            height: "auto",
            margin: "0 auto",
            color: "var(--md-sys-color-on-surface)",
            fill: "var(--md-sys-color-on-surface)",
          })}
        />
        <Buttons data-stellis-home-buttons>
          <SeparatedColumn>
            <CategoryButton
              onClick={() =>
                openModal({
                  type: "create_group_or_server",
                  client: client()!,
                })
              }
              description={
                <Trans>
                  Invite all of your friends, some cool bots, and throw a big
                  party.
                </Trans>
              }
              icon={<MdAddCircle />}
            >
              <Trans>Create a group or server</Trans>
            </CategoryButton>
            {/* STELLIS: closed instance — Lounge / Donate убраны */}
          </SeparatedColumn>
          <SeparatedColumn>
            {/* STELLIS: Discover Stoat / Give feedback убраны */}
            <CategoryButton
              onClick={() => openModal({ type: "settings", config: "user" })}
              description={
                <Trans>
                  You can also click the gear icon in the bottom left.
                </Trans>
              }
              icon={<MdSettings />}
            >
              <Trans>Open settings</Trans>
            </CategoryButton>
          </SeparatedColumn>
        </Buttons>
        <Show when={IS_DEV}>
          <Button onPress={() => navigate("/dev")}>
            Open Development Page
          </Button>
        </Show>
      </div>
      }>
        <MobileQuickAccess
          openCreate={() =>
            openModal({ type: "create_group_or_server", client: client()! })
          }
          openSettings={() => openModal({ type: "settings", config: "user" })}
        />
      </Show>
    </Base>
  );
}

/**
 * STELLIS: phone home screen — quick-jump directory of conversations
 * and channels. Reuses the same ordering helpers the sidebar uses.
 */
function MobileQuickAccess(props: {
  openCreate: () => void;
  openSettings: () => void;
}) {
  const client = useClient();
  const state = useState();

  const dms = createMemo(() =>
    state.ordering.orderedConversations(client()!),
  );
  const servers = createMemo(() => state.ordering.orderedServers(client()!));

  return (
    <div use:scrollable={{ class: mobileWrap() }}>
      <Show when={dms().length}>
        <SectionTitle>Личные сообщения</SectionTitle>
        <For each={dms()}>
          {(channel) => (
            <a href={channel.path} class={rowLink()}>
              <Avatar
                size={36}
                src={channel.iconURL}
                fallback={channel.displayName ?? channel.name ?? "?"}
              />
              <span class={rowName()}>
                {channel.displayName ?? channel.name ?? "Беседа"}
              </span>
            </a>
          )}
        </For>
      </Show>

      <For each={servers()}>
        {(server) => (
          <>
            <SectionTitle>{server.name}</SectionTitle>
            <For each={server.channels.filter((c) => c.type !== "SavedMessages")}>
              {(channel) => (
                <a href={channel.path} class={rowLink()}>
                  <span class={rowIcon()}>
                    <Symbol size={20}>
                      {channel.isVoice ? "volume_up" : "tag"}
                    </Symbol>
                  </span>
                  <span class={rowName()}>{channel.name}</span>
                </a>
              )}
            </For>
          </>
        )}
      </For>

      <Show when={!dms().length && !servers().length}>
        <div class={emptyHint()}>
          Пока пусто. Создай сервер или попроси приглашение у друга.
        </div>
      </Show>

      <div class={mobileActions()}>
        <Button variant="tonal" onPress={props.openCreate}>
          + Создать сервер
        </Button>
        <Button variant="text" onPress={props.openSettings}>
          Настройки
        </Button>
      </div>
    </div>
  );
}

const mobileWrap = cva({
  base: {
    ...main.raw(),
    display: "flex",
    flexDirection: "column",
    gap: "2px",
    padding: "8px 8px 24px",
    overflowY: "auto",
  },
});

const SectionTitle = styled("div", {
  base: {
    fontSize: "12px",
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: "0.5px",
    color: "var(--md-sys-color-on-surface-variant)",
    padding: "14px 8px 6px",
  },
});

const rowLink = cva({
  base: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    minHeight: "52px",
    padding: "6px 10px",
    borderRadius: "12px",
    textDecoration: "none",
    color: "var(--md-sys-color-on-surface)",
    transition: "background var(--transitions-fast)",
    _active: { background: "var(--md-sys-color-surface-container-high)" },
  },
});

const rowIcon = cva({
  base: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: "36px",
    height: "36px",
    borderRadius: "50%",
    flexShrink: 0,
    background: "var(--md-sys-color-surface-container-high)",
    color: "var(--md-sys-color-on-surface-variant)",
  },
});

const rowName = cva({
  base: {
    fontSize: "16px",
    fontWeight: 500,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
});

const emptyHint = cva({
  base: {
    padding: "32px 16px",
    textAlign: "center",
    color: "var(--md-sys-color-on-surface-variant)",
    fontSize: "14px",
    lineHeight: 1.5,
  },
});

const mobileActions = cva({
  base: {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    padding: "24px 12px 8px",
    marginTop: "auto",
  },
});
