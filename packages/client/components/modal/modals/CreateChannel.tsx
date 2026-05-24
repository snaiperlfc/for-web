import { createFormControl, createFormGroup } from "solid-forms";

import { Trans, useLingui } from "@lingui-solid/solid/macro";

import { useNavigate } from "@revolt/routing";
import { Column, Dialog, DialogProps, Form2 } from "@revolt/ui";

import MdChatBubble from "@material-design-icons/svg/outlined/chat_bubble.svg?component-solid";
import MdHeadset from "@material-design-icons/svg/outlined/headset_mic.svg?component-solid";

import { useModals } from "..";
import { Modals } from "../types";

/**
 * Modal to create a new server channel
 */
export function CreateChannelModal(
  props: DialogProps & Modals & { type: "create_channel" },
) {
  const { t } = useLingui();
  const navigate = useNavigate();
  const { showError } = useModals();

  const group = createFormGroup({
    name: createFormControl("", { required: true }),
    type: createFormControl("Text"),
  });

  async function onSubmit() {
    try {
      const channel = await props.server.createChannel({
        type: group.controls.type.value as "Text" | "Voice",
        name: group.controls.name.value,
      });

      if (props.cb) {
        props.cb(channel);
      } else {
        navigate(`/server/${props.server.id}/channel/${channel.id}`);
      }

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
      title={<Trans>Create channel</Trans>}
      actions={[
        { text: <Trans>Close</Trans> },
        {
          text: <Trans>Create</Trans>,
          onClick: () => {
            onSubmit();
            return false;
          },
          isDisabled: !Form2.canSubmit(group),
        },
      ]}
      isDisabled={group.isPending}
    >
      <form onSubmit={submit}>
        <Column>
          <Form2.TextField
            minlength={1}
            maxlength={32}
            counter
            name="name"
            control={group.controls.name}
            label={t`Channel Name`}
          />

          {/*
           * STELLIS: replaced Form2.Radio (which wraps mdui-radio-group web
           * component) with Form2.ButtonGroup. The MDUI radio-group's `change`
           * event didn't propagate through Solid's onChange, so the selection
           * never made it back to the form control — every channel was
           * created as "Text" regardless of which radio the user clicked.
           * ButtonGroup uses native onPress + button state, which is reliable.
           */}
          <Form2.ButtonGroup
            control={group.controls.type}
            buttonDefinitions={[
              {
                value: "Text",
                children: (
                  <>
                    <MdChatBubble /> <Trans>Text Channel</Trans>
                  </>
                ),
              },
              {
                value: "Voice",
                children: (
                  <>
                    <MdHeadset /> <Trans>Voice Channel</Trans>
                  </>
                ),
              },
            ]}
          />
        </Column>
      </form>
    </Dialog>
  );
}
