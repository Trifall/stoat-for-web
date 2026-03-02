import { styled } from "styled-system/jsx";

export const ProfileCard = styled("div", {
  base: {
    // for <Ripple />:
    position: "relative",

    minWidth: 0,
    height: "fit-content",
    width: "100%",
    userSelect: "none",

    color: "var(--md-sys-color-on-surface)",
    background: "var(--md-sys-color-surface-container-low)",

    padding: "var(--gap-lg)",
    borderRadius: "var(--borderRadius-lg)",

    display: "flex",
    gap: "var(--gap-sm)",
    flexDirection: "column",
  },
  variants: {
    isLink: {
      true: {
        cursor: "pointer",
      },
    },
  },
});
