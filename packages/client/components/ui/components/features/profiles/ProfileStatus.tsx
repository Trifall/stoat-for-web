import { Show } from "solid-js";

import { useLingui } from "@lingui-solid/solid/macro";
import { User } from "stoat.js";
import { styled } from "styled-system/jsx";

import { typography, UserStatus } from "../../design";

export function ProfileStatus(props: { user: User }) {
  const { t } = useLingui();

  return (
    <Show when={props.user.status?.text}>
      <Status>
        <UserStatus status={props.user.presence} size="16px" />
        {props.user.statusMessage((s) =>
          s === "Online"
            ? t`Online`
            : s === "Busy"
              ? t`Busy`
              : s === "Focus"
                ? t`Focus`
                : s === "Idle"
                  ? t`Idle`
                  : t`Offline`,
        )}
      </Status>
    </Show>
  );
}

const Status = styled("span", {
  base: {
    ...typography.raw(),
    display: "flex",
    alignItems: "center",
    gap: "var(--gap-md)",
    userSelect: "text",
  },
});
