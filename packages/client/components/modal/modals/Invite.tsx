import { Match, Show, Switch } from "solid-js";

import { Trans } from "@lingui-solid/solid/macro";
import { useMutation } from "@tanstack/solid-query";
import { ServerPublicInvite } from "stoat.js";

import { Avatar, Dialog, DialogProps, Row } from "@revolt/ui";

import { useModals } from "..";
import { Modals } from "../types";

/**
 * Modal to join a server
 */
export function InviteModal(props: DialogProps & Modals & { type: "invite" }) {
  const { showError } = useModals();

  const join = useMutation(() => ({
    mutationFn: () => (props.invite as ServerPublicInvite).join(),
    /*
     * STELLIS: hard navigate instead of SPA navigate. After joining a server
     * via invite, the server is in the client's reactive collection but the
     * primary sidebar wouldn't paint it until the user manually refreshed —
     * same SPA-mount-stale issue we hit on login/logout. window.location
     * .assign restarts the SPA boot path so the joined server appears in
     * the list immediately and the channel view loads cleanly.
     */
    onSuccess(server) {
      window.location.assign(server.path);
    },
    onError: showError,
  }));

  return (
    <Dialog
      show={props.show}
      onClose={props.onClose}
      title={
        <Switch>
          <Match when={props.invite.type === "Server"}>
            <Row>
              <Avatar
                size={32}
                src={
                  (props.invite as ServerPublicInvite).serverIcon?.previewUrl
                }
                fallback={(props.invite as ServerPublicInvite).serverName}
              />
              <span>{(props.invite as ServerPublicInvite).serverName}</span>
            </Row>
          </Match>
        </Switch>
      }
      actions={[
        { text: <Trans>Cancel</Trans> },
        {
          text: (
            <Show
              when={
                props.invite.type === "Server"
                  ? !(props.invite as ServerPublicInvite).server
                  : true
              }
              fallback={<Trans>Open</Trans>}
            >
              <Trans>Join</Trans>
            </Show>
          ),
          onClick: join.mutateAsync,
        },
      ]}
      isDisabled={join.isPending}
      scrimBackground={
        props.invite instanceof ServerPublicInvite
          ? props.invite.serverBanner?.originalUrl
          : undefined
      }
    >
      <Switch>
        <Match when={props.invite.type === "Server"}>
          <Show
            when={!(props.invite as ServerPublicInvite).server}
            fallback={<Trans>You're already part of this server.</Trans>}
          >
            <Trans>
              You've been invited to join this server.
              <br />
              Would you like to join?
            </Trans>
          </Show>
        </Match>
      </Switch>
    </Dialog>
  );
}
