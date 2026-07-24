import { Trans, useLingui } from "@lingui-solid/solid/macro";
import { css } from "styled-system/css";
import { styled } from "styled-system/jsx";

import { useState } from "@revolt/state";
import {
  MAX_SCREEN_SHARE_BITRATE_KBPS,
  MAX_SCREEN_SHARE_FRAME_RATE,
  MIN_SCREEN_SHARE_BITRATE_KBPS,
  MIN_SCREEN_SHARE_FRAME_RATE,
  SCREEN_SHARE_BITRATE_STEP_KBPS,
  SCREEN_SHARE_FRAME_RATE_STEP,
} from "@revolt/state/stores/Voice";
import { Column, Row, Slider, Text } from "@revolt/ui";

import { CompactNumberInput } from "./CompactNumberInput";
import {
  SettingsToggleButton,
  SettingsToggleGroup,
} from "./SettingsToggleButton";

/**
 * Advanced voice settings
 */
export function VoiceAdvancedSettings() {
  const state = useState();
  const { t } = useLingui();
  const bitrateLabel = () =>
    t({
      id: "plus.advanced.screenShareBitrate",
      message: "Maximum bitrate",
    });
  const frameRateLabel = () =>
    t({
      id: "plus.advanced.screenShareFrameRate",
      message: "Maximum frame rate",
    });

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
            <Trans id="plus.advanced.autoReconnect">Auto-reconnect</Trans>
          </SettingsToggleButton>
        </SettingsToggleGroup>
      </Column>

      <Column gap="md">
        <Text class="label" rootClass={sectionHeading}>
          <Trans id="plus.advanced.screenShare">Screen Share</Trans>
        </Text>

        <BitrateCard>
          <Column gap="xs">
            <Text rootClass={settingTitle}>
              <Trans id="plus.advanced.screenShareBitrate">
                Maximum bitrate
              </Trans>
            </Text>
            <Text size="small" rootClass={settingDescription}>
              <Trans id="plus.advanced.screenShareBitrateDescription">
                Applies to newly started screen shares. Network conditions may
                reduce the actual bitrate.
              </Trans>
            </Text>
          </Column>

          <Row gap="md" align={true}>
            <SliderContainer>
              <Slider
                accessibleLabel={bitrateLabel()}
                min={MIN_SCREEN_SHARE_BITRATE_KBPS}
                max={MAX_SCREEN_SHARE_BITRATE_KBPS}
                step={SCREEN_SHARE_BITRATE_STEP_KBPS}
                value={state.voice.screenShareBitrateKbps}
                onInput={(event) => {
                  state.voice.screenShareBitrateKbps =
                    event.currentTarget.value;
                }}
                labelFormatter={(value) => `${value} kbps`}
              />
            </SliderContainer>

            <BitrateInput>
              <CompactNumberInput
                aria-label={bitrateLabel()}
                type="text"
                width="72px"
                value={state.voice.screenShareBitrateKbps.toString()}
                inputMode="numeric"
                onChange={(event) => {
                  const value = Number.parseInt(event.currentTarget.value, 10);
                  if (Number.isFinite(value)) {
                    state.voice.screenShareBitrateKbps = value;
                  }
                  event.currentTarget.value =
                    state.voice.screenShareBitrateKbps.toString();
                }}
              />
              <Text size="small" class="label">
                <Trans id="plus.advanced.kbps">kbps</Trans>
              </Text>
            </BitrateInput>
          </Row>

          <SettingDivider />

          <Column gap="xs">
            <Text rootClass={settingTitle}>
              <Trans id="plus.advanced.screenShareFrameRate">
                Maximum frame rate
              </Trans>
            </Text>
            <Text size="small" rootClass={settingDescription}>
              <Trans id="plus.advanced.screenShareFrameRateDescription">
                Caps frames per second for newly started screen shares. Quality
                presets may use a lower rate.
              </Trans>
            </Text>
          </Column>

          <Row gap="md" align={true}>
            <SliderContainer>
              <Slider
                accessibleLabel={frameRateLabel()}
                min={MIN_SCREEN_SHARE_FRAME_RATE}
                max={MAX_SCREEN_SHARE_FRAME_RATE}
                step={SCREEN_SHARE_FRAME_RATE_STEP}
                value={state.voice.screenShareFrameRate}
                onInput={(event) => {
                  state.voice.screenShareFrameRate = event.currentTarget.value;
                }}
                labelFormatter={(value) => `${value} FPS`}
              />
            </SliderContainer>

            <BitrateInput>
              <CompactNumberInput
                aria-label={frameRateLabel()}
                type="text"
                width="72px"
                value={state.voice.screenShareFrameRate.toString()}
                inputMode="numeric"
                onChange={(event) => {
                  const value = Number.parseInt(event.currentTarget.value, 10);
                  if (Number.isFinite(value)) {
                    state.voice.screenShareFrameRate = value;
                  }
                  event.currentTarget.value =
                    state.voice.screenShareFrameRate.toString();
                }}
              />
              <Text size="small" class="label">
                <Trans id="plus.advanced.fps">FPS</Trans>
              </Text>
            </BitrateInput>
          </Row>
        </BitrateCard>
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

const BitrateCard = styled("div", {
  base: {
    display: "flex",
    flexDirection: "column",
    gap: "var(--gap-md)",
    padding: "12px",
    border: "1px solid var(--md-sys-color-outline-variant)",
    borderRadius: "var(--borderRadius-lg)",
    background: "var(--md-sys-color-surface-container-high)",
  },
});

const settingTitle = css({
  fontSize: "14px",
  fontWeight: "600",
  lineHeight: "1.3",
  color: "var(--md-sys-color-on-surface)",
});

const settingDescription = css({
  lineHeight: "1.35",
  color: "var(--md-sys-color-on-surface-variant)",
  textWrap: "pretty",
});

const SettingDivider = styled("div", {
  base: {
    height: "1px",
    background: "var(--md-sys-color-outline-variant)",
  },
});

const SliderContainer = styled("div", {
  base: {
    display: "flex",
    flex: 1,
    minWidth: 0,
    alignItems: "center",
  },
});

const BitrateInput = styled("div", {
  base: {
    display: "flex",
    minHeight: "32px",
    alignItems: "center",
    gap: "var(--gap-xs)",
  },
});
