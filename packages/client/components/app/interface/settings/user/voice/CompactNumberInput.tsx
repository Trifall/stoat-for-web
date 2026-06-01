import type { JSX } from "solid-js";

import { styled } from "styled-system/jsx";

type Props = JSX.InputHTMLAttributes<HTMLInputElement> & {
  readonly width?: string;
};

export function CompactNumberInput(props: Props) {
  return (
    <Input
      {...props}
      style={{
        width: props.width,
        ...((props.style as Record<string, unknown>) ?? {}),
      }}
    />
  );
}

const Input = styled("input", {
  base: {
    width: "64px",
    height: "32px",
    padding: "0 8px",

    border: "1px solid var(--md-sys-color-outline-variant)",
    borderRadius: "var(--borderRadius-md)",
    background: "var(--md-sys-color-surface-container-high)",
    color: "var(--md-sys-color-on-surface)",

    fontSize: "12px",
    fontWeight: "600",
    fontVariantNumeric: "tabular-nums",
    textAlign: "center",

    outline: "none",
    transition: "border-color 0.12s ease, background-color 0.12s ease",

    "&:hover:not(:disabled)": {
      background: "var(--md-sys-color-surface-container-highest)",
    },

    "&:focus": {
      borderColor: "var(--md-sys-color-primary)",
      background: "var(--md-sys-color-surface-container-highest)",
    },

    "&:disabled": {
      opacity: "0.56",
      cursor: "not-allowed",
    },
  },
});
