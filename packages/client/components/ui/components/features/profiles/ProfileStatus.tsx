import { Show } from "solid-js";

import { useLingui } from "@lingui-solid/solid/macro";
import { User } from "stoat.js";
import { styled } from "styled-system/jsx";

import { typography } from "../../design";

export function ProfileStatus(props: { user: User }) {
  const { t } = useLingui();

  return (
    <Show when={props.user.status?.text}>
      <Status>
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
    userSelect: "text",
    padding: "0 var(--gap-md)",
  },
});
