import { BiRegularChevronLeft, BiRegularChevronRight } from "solid-icons/bi";

import { JSX, Match, Switch } from "solid-js";

import { useLingui } from "@lingui-solid/solid/macro";
import { css } from "styled-system/css";

import { useDevice } from "@revolt/common";
import { useState } from "@revolt/state";
import { LAYOUT_SECTIONS } from "@revolt/state/stores/Layout";

/**
 * Wrapper for header icons which adds the chevron on the
 * correct side for toggling sidebar (if on desktop) and
 * the hamburger icon to open sidebar (if on mobile).
 */
export function HeaderIcon(props: { children: JSX.Element }) {
  const state = useState();
  const device = useDevice();
  const { t } = useLingui();
  const primarySidebarDefault = () => device.layout() !== "phone";
  const primarySidebarOpen = () =>
    state.layout.getSectionState(
      LAYOUT_SECTIONS.PRIMARY_SIDEBAR,
      primarySidebarDefault(),
    );

  return (
    <div
      class={container}
      onClick={() => {
        state.layout.toggleSectionState(
          LAYOUT_SECTIONS.PRIMARY_SIDEBAR,
          primarySidebarDefault(),
        );
      }}
      use:floating={{
        tooltip: {
          placement: "bottom",
          content: t`Toggle main sidebar`,
        },
      }}
    >
      <Switch
        fallback={
          <>
            <BiRegularChevronRight size={20} />
            {props.children}
          </>
        }
      >
        <Match when={primarySidebarOpen()}>
          <BiRegularChevronLeft size={20} />
          {props.children}
        </Match>
      </Switch>
    </div>
  );
}

const container = css({
  display: "flex",
  cursor: "pointer",
  alignItems: "center",
});
