import { useLingui } from "@lingui/solid/macro";

import { For } from "solid-js";

import { Symbol } from "../utils/Symbol";

import { styled } from "styled-system/jsx";

import { Ripple } from "./Ripple";

export const Switch = {
  Override: OverrideSwitch,
};

type State = "allow" | "neutral" | "deny";

interface Props {
  readonly value: State;
  readonly disabled?: boolean;
  readonly onChange: (state: State) => void;
}

/**
 * Override Switch
 */
function OverrideSwitch(props: Props) {
  const { t } = useLingui();

  const options: { state: State; label: string; icon: string }[] = [
    { state: "allow", label: t`Allow`, icon: "check" },
    { state: "neutral", label: t`Inherit`, icon: "remove" },
    { state: "deny", label: t`Deny`, icon: "close" },
  ];

  return (
    <SwitchContainer
      role="radiogroup"
      aria-orientation="horizontal"
      aria-disabled={props.disabled}
    >
      <For each={options}>
        {(option) => (
          <Override
            type={option.state}
            selected={props.value}
            onClick={() => !props.disabled && props.onChange(option.state)}
            role="radio"
            tabIndex={props.value === option.state ? 0 : -1}
            aria-label={option.label}
            aria-checked={props.value === option.state}
            aria-disabled={props.disabled}
            onKeyDown={(event) => {
              if (props.disabled) return;

              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                props.onChange(option.state);
              } else if (
                ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(
                  event.key,
                )
              ) {
                event.preventDefault();
                const index = options.findIndex(
                  ({ state }) => state === option.state,
                );
                const delta =
                  event.key === "ArrowRight" || event.key === "ArrowDown"
                    ? 1
                    : -1;
                const next =
                  options[(index + delta + options.length) % options.length];
                props.onChange(next.state);
                (
                  event.currentTarget.parentElement?.children[
                    (index + delta + options.length) % options.length
                  ] as HTMLElement | undefined
                )?.focus();
              }
            }}
          >
            <Ripple />
            <Symbol size={20}>{option.icon}</Symbol>
          </Override>
        )}
      </For>
    </SwitchContainer>
  );
}

const SwitchContainer = styled("div", {
  base: {
    flexShrink: 0,
    display: "inline-flex",
    margin: "4px 0",
    overflow: "hidden",
    borderRadius: "var(--borderRadius-md)",

    // "&[aria-disabled]": {
    //   pointerEvents: "none",
    //   opacity: 0.6,
    // },

    transition: "var(--transitions-fast) all",
    background: "var(--md-sys-color-primary-container)",
  },
});

const Override = styled("div", {
  base: {
    // for <Ripple />:
    position: "relative",

    width: "36px",
    height: "36px",
    flex: "0 0 36px",
    display: "flex",
    cursor: "pointer",
    alignItems: "center",
    justifyContent: "center",
    transition: "var(--transitions-fast) all",
    background: "var(--md-sys-color-surface-container-high)",

    "&:hover": {
      // filter: "brightness(0.8)",
    },

    "& > span": {
      lineHeight: 1,
    },
  },
  variants: {
    selected: {
      allow: {},
      neutral: {},
      deny: {},
    },
    type: {
      allow: {},
      neutral: {},
      deny: {},
    },
  },
  compoundVariants: [
    {
      type: "allow",
      selected: "allow",
      css: {
        color: "var(--md-sys-color-primary-container)",
        background: "var(--md-sys-color-on-primary-container)",
      },
    },
    {
      type: "neutral",
      selected: "neutral",
      css: {
        fill: "var(--md-sys-color-secondary)",
        background: "var(--md-sys-color-on-secondary)",
      },
    },
    {
      type: "deny",
      selected: "deny",
      css: {
        color: "var(--md-sys-color-error-container)",
        background: "var(--md-sys-color-on-error-container)",
      },
    },
  ],
});
