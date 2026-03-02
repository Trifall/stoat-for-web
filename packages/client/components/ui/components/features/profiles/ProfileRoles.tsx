import { For, Show } from "solid-js";

import { ServerMember } from "stoat.js";
import { styled } from "styled-system/jsx";

import { useModals } from "@revolt/modal";

import { Trans, useLingui } from "@lingui-solid/solid/macro";
import { useState } from "@revolt/state";
import { BiSolidPlusCircle } from "solid-icons/bi";
import { typography } from "../../design";
import { dismissFloatingElements } from "../../floating";
import { Row } from "../../layout";
import { ColouredText } from "../../utils";

export function ProfileRoles(props: { member?: ServerMember }) {
  const { openModal } = useModals();
  const { t } = useLingui();
  const state = useState();

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
        <Show when={props.member?.server!.havePermission("AssignRoles")}>
          <Row align>
            <Role onClick={openRoles} cursor="pointer">
              <BiSolidPlusCircle />
              <Trans> Add Role </Trans>
            </Role>
          </Row>
        </Show>
        <For each={props.member!.orderedRoles.toReversed()}>
          {(role) => (
            <Row align>
              {/* There is probably a better to do this if ... else ... */}
              <Show when={state.settings.getValue("advanced:copy_id")}>
                <Role
                  onClick={() => navigator.clipboard.writeText(role.id)}
                  cursor="pointer"
                >
                  <span
                    use:floating={{
                      tooltip: {
                        placement: "top",
                        content: t`Copy Role ID`,
                      },
                    }}
                  >
                    <ColouredText
                      colour={
                        role.colour ?? "var(--md-sys-color-outline-variant)"
                      }
                    >
                      {role.name}
                    </ColouredText>
                  </span>
                </Role>
              </Show>

              <Show when={!state.settings.getValue("advanced:copy_id")}>
                <Role>
                  <ColouredText
                    colour={
                      role.colour ?? "var(--md-sys-color-outline-variant)"
                    }
                  >
                    {role.name}
                  </ColouredText>
                </Role>
              </Show>
            </Row>
          )}
        </For>
      </RoleList>
    </Show>
  );
}

const Role = styled("span", {
  base: {
    display: "flex",
    background: "var(--md-sys-color-surface-container-low)",
    gap: "var(--gap-sm)",
    alignItems: "center",
    overflow: "hidden",
    whiteSpace: "nowrap",
    textOverflow: "ellipsis",
    userSelect: "none",
    padding: "var(--gap-sm) var(--gap-md)",
    borderRadius: "full",
    height: "full",
    ...typography.raw({ class: "label" }),
  },
});

const RoleList = styled("div", {
  base: {
    display: "flex",
    alignItems: "stretch",
    gap: "var(--gap-sm)",
    overflowX: "scroll",
    scrollbar: "hidden",
  },
});
