import { For, Show } from "solid-js";

import { ServerMember } from "stoat.js";
import { styled } from "styled-system/jsx";

import { useModals } from "@revolt/modal";

import { Trans } from "@lingui-solid/solid/macro";
import { BiSolidPlusCircle } from "solid-icons/bi";
import { typography } from "../../design";
import { dismissFloatingElements } from "../../floating";
import { Row } from "../../layout";

export function ProfileRoles(props: { member?: ServerMember }) {
  const { openModal } = useModals();

  function openRoles() {
    openModal({ type: "user_profile_roles", member: props.member! });
    dismissFloatingElements();
  }

  //TODO: Make this not a button
  return (
    <Show
      when={
        props.member?.roles.length ||
        props.member?.server!.havePermission("AssignRoles")
      }
    >
      <RoleList>
        <For each={props.member!.orderedRoles.toReversed()}>
          {(role) => (
            <Row align>
              <Role
                style={{
                  color: role.colour ?? "var(--md-sys-color-outline-variant)",
                  border:
                    "1px solid " +
                    (role.colour ?? "var(--md-sys-color-outline-variant)"),
                }}
              >
                {role.name}
              </Role>
            </Row>
          )}
        </For>
        <Show when={props.member?.server!.havePermission("AssignRoles")}>
          <Row align>
            <Role onClick={openRoles} cursor="pointer">
              <BiSolidPlusCircle />
              <Trans> Add Role </Trans>
            </Role>
          </Row>
        </Show>
      </RoleList>
    </Show>
  );
}

const Role = styled("span", {
  base: {
    flexGrow: 1,
    display: "flex",
    gap: "var(--gap-sm)",
    alignItems: "center",
    overflow: "hidden",
    whiteSpace: "nowrap",
    textOverflow: "ellipsis",
    padding: "var(--gap-sm) var(--gap-md)",
    border: "1px solid",
    borderRadius: "full",
    height: "full",
    ...typography.raw({ class: "label" }),
  },
});

const RoleList = styled("div", {
  base: {
    display: "flex",
    alignItems: "stretch",
    gap: "var(--gap-md)",
    padding: "var(--gap-sm) var(--gap-md)",
    overflowX: "scroll",
    scrollbar: "hidden",
  },
});
