import { Trans } from "@lingui-solid/solid/macro";
import { css } from "styled-system/css";

import { useState } from "@revolt/state";
import { Column, Text } from "@revolt/ui";

import {
  SettingsToggleButton,
  SettingsToggleGroup,
} from "./SettingsToggleButton";

/**
 * Advanced voice settings
 */
export function AdvancedSettings() {
  const state = useState();

  return (
    <Column gap="lg">
      <Column>
        <Text class="label" rootClass={sectionHeading}>
          <Trans id="plus.advanced.connection">Connection</Trans>
        </Text>
        <SettingsToggleGroup>
          <SettingsToggleButton
            checked={state.voice.autoReconnect}
            description={
              <Trans id="plus.advanced.autoReconnectDescription">
                Automatically reconnect when disconnected from a voice channel
              </Trans>
            }
            onClick={() => {
              state.voice.autoReconnect = !state.voice.autoReconnect;
            }}
          >
            <Trans id="plus.advanced.autoReconnect">
              Auto-reconnect
            </Trans>
          </SettingsToggleButton>
        </SettingsToggleGroup>
      </Column>
    </Column>
  );
}

const sectionHeading = css({
  fontSize: "15px",
  fontWeight: "600",
  lineHeight: "1.35",
  color: "var(--md-sys-color-on-surface)",
  marginBottom: "2px",
});
