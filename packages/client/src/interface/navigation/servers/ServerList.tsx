import { Accessor, For, JSX, Show, createMemo, createSignal } from "solid-js";

import { Trans } from "@lingui-solid/solid/macro";
import { Channel, Server, User } from "stoat.js";
import { cva } from "styled-system/css";
import { styled } from "styled-system/jsx";

import { useClient, useClientLifecycle } from "@revolt/client";
import { CONFIGURATION } from "@revolt/common";
import { KeybindAction, createKeybind } from "@revolt/keybinds";
import { useModals } from "@revolt/modal";
import { useNavigate } from "@revolt/routing";
import { useState } from "@revolt/state";
import { Avatar, Column, Text, Time, Unreads, UserStatus } from "@revolt/ui";

import MdAdd from "@material-design-icons/svg/filled/add.svg?component-solid";
import MdExplore from "@material-design-icons/svg/filled/explore.svg?component-solid";
import MdHome from "@material-design-icons/svg/filled/home.svg?component-solid";
import MdLogout from "@material-design-icons/svg/filled/logout.svg?component-solid";
import MdSettings from "@material-design-icons/svg/filled/settings.svg?component-solid";

import { Tooltip } from "../../../../components/ui/components/floating";
import { Draggable } from "../../../../components/ui/components/utils/Draggable";

import { UserMenu } from "./UserMenu";

interface Props {
  /**
   * Ordered server list
   */
  orderedServers: Server[];

  /**
   * Set server ordering
   * @param ids List of IDs
   */
  setServerOrder: (ids: string[]) => void;

  /**
   * Unread conversations list
   */
  unreadConversations: Channel[];

  /**
   * Current logged in user
   */
  user: User;

  /**
   * Selected server id
   */
  selectedServer: Accessor<string | undefined>;

  /**
   * Create or join server
   */
  onCreateOrJoinServer(): void;

  /**
   * Menu generator
   */
  menuGenerator: (target: Server | Channel) => JSX.Directives["floating"];
}

/**
 * Server list sidebar component
 */
export const ServerList = (props: Props) => {
  const state = useState();
  const client = useClient();
  const navigate = useNavigate();
  const { openModal } = useModals();
  const { logout } = useClientLifecycle();

  const navigateServer = (byOffset: number) => {
    const serverId = props.selectedServer();
    if (serverId == null && props.orderedServers.length) {
      if (byOffset === 1) {
        navigate(`/server/${props.orderedServers[0].id}`);
      } else {
        navigate(
          `/server/${props.orderedServers[props.orderedServers.length - 1].id}`,
        );
      }
      return;
    }

    const currentServerIndex = props.orderedServers.findIndex(
      (server) => server.id === serverId,
    );

    const nextIndex = currentServerIndex + byOffset;

    if (nextIndex === -1) {
      return navigate("/app");
    }

    // this will wrap the index around
    const nextServer = props.orderedServers.at(
      nextIndex % props.orderedServers.length,
    );

    if (nextServer) {
      navigate(`/server/${nextServer.id}`);
    }
  };

  createKeybind(KeybindAction.NAVIGATION_SERVER_UP, () => navigateServer(-1));
  createKeybind(KeybindAction.NAVIGATION_SERVER_DOWN, () => navigateServer(1));

  const homeNotifications = createMemo(() => {
    return client().users.filter((user) => user.relationship === "Incoming")
      .length;
  });

  // Ref for floating menu
  const [menuButton, setMenuButton] = createSignal<HTMLDivElement>();

  return (
    <ServerListBase>
      <div use:invisibleScrollable={{ direction: "y", class: listBase() }}>
        <a
          class={entryContainer({
            indicator: !props.selectedServer() ? "selected" : undefined,
          })}
          href="/app"
          use:floating={{
            tooltip: {
              content: `You have ${homeNotifications()} pending friend requests.`,
              placement: "right",
            },
          }}
        >
          <Avatar
            size={42}
            fallback={<MdHome />}
            holepunch={homeNotifications() ? "top-right" : undefined}
            overlay={
              <Show when={homeNotifications()}>
                <Unreads.Graphic
                  unread={homeNotifications() !== 0}
                  count={homeNotifications()}
                />
              </Show>
            }
          />
        </a>
        <Tooltip
          placement="right"
          content={() => (
            <Column>
              <span>{props.user.username}</span>
              <Text class="label" size="small">
                {props.user.presence}
              </Text>
            </Column>
          )}
          aria={props.user.username}
        >
          <a ref={setMenuButton} class={entryContainer()}>
            <Avatar
              size={42}
              src={props.user.avatarURL}
              holepunch={"bottom-right"}
              overlay={<UserStatus.Graphic status={props.user.presence} />}
              interactive
            />
          </a>
          <UserMenu anchor={menuButton} />
        </Tooltip>
        <For each={props.unreadConversations.slice(0, 9)}>
          {(conversation) => (
            <Tooltip placement="right" content={conversation.displayName}>
              <a
                class={entryContainer()}
                use:floating={props.menuGenerator(conversation)}
                href={`/channel/${conversation.id}`}
              >
                <Avatar
                  size={42}
                  // TODO: fix this
                  src={conversation.iconURL}
                  holepunch={conversation.unread ? "top-right" : "none"}
                  overlay={
                    <>
                      <Show when={conversation.unread}>
                        <Unreads.Graphic
                          count={conversation.mentions?.size ?? 0}
                          unread
                        />
                      </Show>
                    </>
                  }
                  fallback={
                    conversation.name ?? conversation.recipient?.username
                  }
                  interactive
                />
              </a>
            </Tooltip>
          )}
        </For>
        <Show when={props.unreadConversations.length > 9}>
          <a class={entryContainer()} href={`/`}>
            <Avatar
              size={42}
              fallback={<>+{props.unreadConversations.length - 9}</>}
            />
          </a>
        </Show>
        <LineDivider />
        <Draggable
          type="servers"
          items={props.orderedServers}
          onChange={props.setServerOrder}
        >
          {(entry) => (
            <Tooltip
              placement="right"
              content={() => (
                <Column>
                  <Text class="label" size="large">
                    {entry.item.name}
                  </Text>{" "}
                  <Show when={state.notifications.isMuted(entry.item)}>
                    <Text class="label" size="small">
                      <Show
                        when={
                          state.notifications.getServerMute(entry.item)!.until
                        }
                        fallback={<Trans>Muted</Trans>}
                      >
                        <Trans>
                          Muted until{" "}
                          <Time
                            format="datetime"
                            value={
                              state.notifications.getServerMute(entry.item)!
                                .until
                            }
                          />
                        </Trans>
                      </Show>
                    </Text>
                  </Show>
                </Column>
              )}
              aria={entry.item.name}
            >
              <div
                class={entryContainer({
                  indicator:
                    props.selectedServer() === entry.item.id
                      ? "selected"
                      : entry.item.unread &&
                          !state.notifications.isMuted(entry.item)
                        ? "alert"
                        : undefined,
                })}
                use:floating={props.menuGenerator(entry.item)}
              >
                <a href={state.layout.getLastActiveServerPath(entry.item.id)}>
                  <Avatar
                    size={42}
                    src={entry.item.iconURL}
                    holepunch={
                      entry.item.mentions.length ? "top-right" : "none"
                    }
                    overlay={
                      <>
                        <Show
                          when={
                            entry.item.mentions
                              .length /* as opposed to item.unread */
                          }
                        >
                          <Unreads.Graphic
                            count={entry.item.mentions.length}
                            unread
                          />
                        </Show>
                      </>
                    }
                    fallback={entry.item.name}
                    interactive
                  />
                </a>
              </div>
            </Tooltip>
          )}
        </Draggable>
        <Tooltip placement="right" content={"Create or join a server"}>
          <a
            class={entryContainer()}
            onClick={() => props.onCreateOrJoinServer()}
          >
            <Avatar size={42} fallback={<MdAdd />} />
          </a>
        </Tooltip>
        <Show when={CONFIGURATION.IS_STOAT}>
          <Tooltip placement="right" content={"Find new servers to join"}>
            <a
              href={state.layout.getLastActiveDiscoverPath()}
              class={entryContainer()}
            >
              <Avatar size={42} fallback={<MdExplore />} />
            </a>
          </Tooltip>
        </Show>
      </div>
      <Shadow>
        <div />
      </Shadow>
      <Tooltip placement="right" content="Settings">
        <a
          class={entryContainer()}
          onClick={() => openModal({ type: "settings", config: "user" })}
        >
          <Avatar size={42} fallback={<MdSettings />} interactive />
        </a>
      </Tooltip>
      {/*
        STELLIS: explicit Logout entry next to Settings. Previously the only
        way to log out was Settings → My Account → Log Out (3 taps, buried).
        Mobile users couldn't find it. Visible at all viewports.
      */}
      <Tooltip placement="right" content="Выйти">
        <a
          class={entryContainer()}
          onClick={async () => {
            if (!window.confirm("Выйти из Stellis на этом устройстве?")) return;

            // STELLIS: real cleanup, not just transition.
            //   1. controller.logout() — fires resetNotifications +
            //      killServiceWorkerSubscription + auth.removeSession +
            //      the Logout transition (in that order).
            //   2. Belt-and-braces: nuke IndexedDB + localStorage explicitly
            //      because the security-sensitive failure mode is "click
            //      Logout, reload, end up logged in". If anything in step 1
            //      didn't fully persist before reload, this guarantees it.
            //   3. Hard-reload to /login.
            try {
              logout();
            } catch {
              /* noop — proceed to manual cleanup regardless */
            }
            try {
              localStorage.clear();
              sessionStorage.clear();
            } catch {
              /* noop */
            }
            try {
              const dbs = await indexedDB.databases?.();
              if (dbs) {
                await Promise.all(
                  dbs.map((db) => db.name && indexedDB.deleteDatabase(db.name)),
                );
              } else {
                // Safari < 14 fallback
                indexedDB.deleteDatabase("localforage");
              }
            } catch {
              /* noop */
            }
            window.location.replace("/login");
          }}
        >
          <Avatar size={42} fallback={<MdLogout />} interactive />
        </a>
      </Tooltip>
      {/*
        STELLIS: version stamp. Bake-time injected from vite.config.ts via
        `__STELLIS_SHA__` + `__STELLIS_BUILD__` define-replace. Helps debug
        "ты на старом бандле" (PWA-cache mismatch) at a glance — the user
        can read off the SHA and confirm it matches the latest deploy.
        Tiny + dim so it doesn't compete with anything else in the rail.
      */}
      <Tooltip
        placement="right"
        content={`Билд: ${__STELLIS_BUILD__} UTC`}
      >
        <div
          style={{
            "font-family": "ui-monospace, monospace",
            "font-size": "9px",
            "line-height": "1",
            opacity: "0.4",
            "text-align": "center",
            padding: "8px 0 6px",
            cursor: "default",
            "user-select": "all",
          }}
        >
          {__STELLIS_SHA__}
        </div>
      </Tooltip>
      {/*
        STELLIS DEBUG: temporary diagnostic readout of the iOS PWA
        safe-area-inset values + pointer media-query state. Shows in the
        bottom of the server rail right below the SHA stamp. If it reads
        "T0 B0" on iPhone the PWA was installed before viewport-fit=cover
        landed → user needs to delete + re-add to home screen.
        Remove after iPhone PWA polish is confirmed working.
      */}
      <div
        ref={(el) => {
          if (!el) return;
          // Compute the inset live so we read the actual resolved px, not
          // the variable string. Created via JS env() probe div.
          const probe = document.createElement("div");
          probe.style.cssText =
            "position:fixed;top:env(safe-area-inset-top);left:env(safe-area-inset-left);right:env(safe-area-inset-right);bottom:env(safe-area-inset-bottom);pointer-events:none;visibility:hidden;";
          document.body.appendChild(probe);
          const rect = probe.getBoundingClientRect();
          const top = Math.round(rect.top);
          const bottom = Math.round(window.innerHeight - rect.bottom);
          const left = Math.round(rect.left);
          const right = Math.round(window.innerWidth - rect.right);
          probe.remove();
          const coarse = window.matchMedia("(pointer: coarse)").matches
            ? "Y"
            : "N";
          const standalone =
            window.matchMedia("(display-mode: standalone)").matches ||
            (window.navigator as { standalone?: boolean }).standalone
              ? "Y"
              : "N";
          const w = window.innerWidth;
          const h = window.innerHeight;
          const mobileQ = window.matchMedia(
            "(max-width: 900px), (hover: none) and (pointer: coarse)",
          ).matches
            ? "Y"
            : "N";
          // Find Layout element to see what data-mobile actually resolved to
          // by reading the data-* attribute directly off the DOM.
          const layoutEl = document.querySelector("[data-mobile]");
          const layoutMobile = layoutEl?.getAttribute("data-mobile") ?? "?";
          const layoutSidebar = layoutEl?.getAttribute("data-sidebar") ?? "?";
          el.textContent =
            `T${top} R${right} B${bottom} L${left}\n` +
            `${w}x${h} c${coarse} s${standalone} mq${mobileQ}\n` +
            `dm:${layoutMobile} db:${layoutSidebar}`;
        }}
        style={{
          "font-family": "ui-monospace, monospace",
          "font-size": "7px",
          "line-height": "1.2",
          opacity: "0.35",
          "text-align": "center",
          color: "#E5A857",
          padding: "0 2px 4px",
          "white-space": "pre-line",
        }}
      />
    </ServerListBase>
  );
};

/**
 * Server list container
 */
const ServerListBase = styled("div", {
  base: {
    display: "flex",
    flexDirection: "column",

    // STELLIS: iOS PWA — reclaim notch + home-indicator gutters so the
    // top-most logo and bottom-most SHA stamp aren't clipped. Defaults to
    // 0px on non-notched devices (see index.html :root vars).
    paddingTop: "var(--stellis-safe-top)",
    paddingBottom: "var(--stellis-safe-bottom)",
    paddingLeft: "var(--stellis-safe-left)",

    fill: "var(--md-sys-color-on-surface)",
  },
});

/**
 * Container around list of servers
 */
const listBase = cva({
  base: {
    flexGrow: 1,
  },
});

/**
 * Server entries
 */
const entryContainer = cva({
  base: {
    width: "56px",
    height: "56px",
    position: "relative",
    display: "grid",
    flexShrink: 0,
    placeItems: "center",

    "&:before": {
      content: "' '",
      position: "absolute",
      width: "12px",
      height: "0px",
      transition: "var(--transitions-fast) all",
      left: "-8px",
      borderRadius: "4px",
      background: "var(--md-sys-color-on-surface)",
    },

    "&:hover:before": {
      height: "16px",
    },
  },
  variants: {
    indicator: {
      selected: {
        "&:before": {
          height: "32px !important",
        },
      },
      alert: {
        "&:before": {
          height: "8px",
        },
      },
    },
  },
});

/**
 * Divider line between two lists
 */
const LineDivider = styled("div", {
  base: {
    height: "1px",
    flexShrink: 0,
    margin: "6px auto",
    width: "calc(100% - 24px)",
    background: "var(--md-sys-color-outline-variant)",
  },
});

/**
 * Shadow at the bottom of the list
 */
const Shadow = styled("div", {
  base: {
    height: 0,
    zIndex: 1,
    position: "relative",

    "& div": {
      height: "12px",
      marginTop: "-12px",
      position: "absolute",
      background:
        "linear-gradient(to bottom, transparent, var(--md-sys-color-surface-container-highest))",
    },
  },
});
