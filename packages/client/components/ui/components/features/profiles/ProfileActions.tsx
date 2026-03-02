import { Show } from "solid-js";

import { useNavigate } from "@solidjs/router";
import { ServerMember, User } from "stoat.js";
import { styled } from "styled-system/jsx";

import { UserContextMenu } from "@revolt/app";
import { useModals } from "@revolt/modal";

import MdCancel from "@material-design-icons/svg/filled/cancel.svg?component-solid";
import MdEdit from "@material-design-icons/svg/filled/edit.svg?component-solid";
import MdMoreVert from "@material-design-icons/svg/filled/more_vert.svg?component-solid";

import { Button, IconButton } from "../../design";
import { dismissFloatingElements } from "../../floating";
import { iconSize } from "../../utils";

/**
 * Actions shown on profile cards
 */
export function ProfileActions(props: { user: User; member?: ServerMember }) {
  const navigate = useNavigate();
  const { openModal } = useModals();

  /**
   * Open direct message channel
   */
  function openDm() {
    props.user.openDM().then((channel) => navigate(channel.url));
  }

  /**
   * Open edit menu
   */
  function openEdit() {
    if (props.member) {
      openModal({ type: "server_identity", member: props.member });
    } else {
      openModal({ type: "settings", config: "user" });
    }

    dismissFloatingElements();
  }

  return (
    <Actions>
      <div style={{ "margin-right": "auto" }}>
        {" "}
        <Show when={props.user.relationship === "None" && !props.user.bot}>
          <Button size="sm" onPress={() => props.user.addFriend()}>
            Add Friend
          </Button>
        </Show>
        <Show when={props.user.relationship === "Incoming"}>
          <Button size="sm" onPress={() => props.user.addFriend()}>
            Accept friend request
          </Button>
          <IconButton size="sm" onPress={() => props.user.removeFriend()}>
            <MdCancel />
          </IconButton>
        </Show>
        <Show when={props.user.relationship === "Outgoing"}>
          <Button size="sm" onPress={() => props.user.removeFriend()}>
            Cancel friend request
          </Button>
        </Show>
        <Show when={props.user.relationship === "Friend"}>
          <Button size="sm" onPress={openDm}>
            Message
          </Button>
        </Show>
      </div>
      <Show
        when={
          props.member
            ? props.user.self
              ? props.member.server!.havePermission("ChangeNickname") ||
                props.member.server!.havePermission("ChangeAvatar")
              : (props.member.server!.havePermission("ManageNicknames") ||
                  props.member.server!.havePermission("RemoveAvatars")) &&
                props.member.inferiorTo(props.member!.server!.member!)
            : props.user.self
        }
      >
        <IconButton size="sm" onPress={openEdit}>
          <MdEdit {...iconSize(16)} />
        </IconButton>
      </Show>

      <IconButton
        size="sm"
        use:floating={{
          contextMenu: () => (
            <UserContextMenu user={props.user} member={props.member} />
          ),
          contextMenuHandler: "click",
        }}
      >
        <MdMoreVert />
      </IconButton>
    </Actions>
  );
}

const Actions = styled("div", {
  base: {
    display: "flex",
    minWidth: "fit-content",
    gap: "var(--gap-sm)",
    justifyContent: "flex-end",
    alignItems: "center",
  },
});
