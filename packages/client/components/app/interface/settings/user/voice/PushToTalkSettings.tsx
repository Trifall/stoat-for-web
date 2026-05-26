import { Show } from "solid-js";

import { Trans } from "@lingui-solid/solid/macro";
import { css } from "styled-system/css";
import { styled } from "styled-system/jsx";

import { useState } from "@revolt/state";
import { Column, KeybindInput, Row, Slider, Text } from "@revolt/ui";

import { CompactNumberInput } from "./CompactNumberInput";
import {
  SettingsToggleButton,
  SettingsToggleGroup,
} from "./SettingsToggleButton";

/**
 * Sync PTT settings to desktop main process
 */
function syncToDesktop(settings: {
  enabled?: boolean;
  keybind?: string;
  mode?: "hold" | "toggle";
  releaseDelay?: number;
  notificationSounds?: boolean;
}) {
  if (typeof window !== "undefined" && window.pushToTalk?.updateSettings) {
    window.pushToTalk.updateSettings(settings);
  }
}

function splitPushToTalkKeybinds(value: string): [string, string] {
  let parsed: unknown = value;

  try {
    parsed = JSON.parse(value);
  } catch {
    // legacy configs stored a single accelerator string.
  }

  const keybinds = Array.isArray(parsed)
    ? parsed.filter((keybind): keybind is string => typeof keybind === "string")
    : [value];
  const [primary = "", secondary = ""] = keybinds;

  return [primary, secondary];
}

function serializePushToTalkKeybinds(keybinds: [string, string]) {
  const [primary, secondary] = keybinds;
  if (secondary) {
    return JSON.stringify(keybinds);
  }

  return primary;
}

function normalizeKeybind(value: string) {
  return value.trim().toLowerCase();
}

/**
 * Push to Talk settings configuration
 */
export function PushToTalkSettings() {
  const state = useState();

  const updateKeybind = (index: 0 | 1, keybind: string) => {
    const keybinds = splitPushToTalkKeybinds(state.voice.pushToTalkKeybind);
    const duplicateIndex = index === 0 ? 1 : 0;

    if (
      keybind &&
      normalizeKeybind(keybind) === normalizeKeybind(keybinds[duplicateIndex])
    ) {
      return;
    }

    keybinds[index] = keybind;
    const nextValue = serializePushToTalkKeybinds(keybinds);
    state.voice.pushToTalkKeybind = nextValue;
    syncToDesktop({ keybind: nextValue });
  };

  return (
    <Column gap="lg">
      <Column>
        <SettingsToggleGroup>
          <SettingsToggleButton
            checked={state.voice.pushToTalkEnabled}
            onClick={() => {
              const newValue = !state.voice.pushToTalkEnabled;
              state.voice.pushToTalkEnabled = newValue;
              syncToDesktop({ enabled: newValue });
            }}
          >
            <Trans id="ptt.settings.enable">Enable Push to Talk</Trans>
          </SettingsToggleButton>
        </SettingsToggleGroup>
      </Column>

      <Show when={state.voice.pushToTalkEnabled}>
        <Column gap="md">
          <Text class="label" rootClass={sectionHeading}>
            <Trans id="ptt.settings.keybind">Push to Talk Keybind</Trans>
          </Text>

          <KeybindInput
            value={splitPushToTalkKeybinds(state.voice.pushToTalkKeybind)[0]}
            onChange={(value) => updateKeybind(0, value)}
            placeholder="Click to set primary keybind"
          />

          <KeybindInput
            value={splitPushToTalkKeybinds(state.voice.pushToTalkKeybind)[1]}
            onChange={(value) => updateKeybind(1, value)}
            placeholder="Click to set secondary keybind"
          />
        </Column>

        <Column>
          <Text class="label" rootClass={sectionHeading}>
            <Trans id="ptt.settings.notifications">Notification Sounds</Trans>
          </Text>
          <SettingsToggleGroup>
            <SettingsToggleButton
              checked={state.voice.pushToTalkNotificationSounds}
              description={
                <Trans id="ptt.settings.muteSoundsDescription">
                  Play sounds when muting/unmuting with Push to Talk
                </Trans>
              }
              onClick={() => {
                const newValue = !state.voice.pushToTalkNotificationSounds;
                state.voice.pushToTalkNotificationSounds = newValue;
                syncToDesktop({ notificationSounds: newValue });
              }}
            >
              <Trans id="ptt.settings.playMuteSounds">
                Play Mute/Unmute Sounds
              </Trans>
            </SettingsToggleButton>
          </SettingsToggleGroup>
        </Column>

        <Column>
          <Text class="label" rootClass={sectionHeading}>
            <Trans id="ptt.settings.mode">Mode</Trans>
          </Text>
          <SettingsToggleGroup>
            <SettingsToggleButton
              checked={state.voice.pushToTalkMode === "toggle"}
              description={
                <Trans id="ptt.settings.defaultHold">
                  Default is Hold mode
                </Trans>
              }
              onClick={() => {
                const newMode =
                  state.voice.pushToTalkMode === "hold" ? "toggle" : "hold";
                state.voice.pushToTalkMode = newMode;
                syncToDesktop({ mode: newMode });
              }}
            >
              <Trans id="ptt.settings.toggleMode">Enable Toggle Mode</Trans>
            </SettingsToggleButton>
          </SettingsToggleGroup>
        </Column>

        <Column gap="md">
          <Text class="label" rootClass={sectionHeading}>
            <Trans id="ptt.settings.releaseDelay">Release Delay</Trans>
          </Text>
          <Row gap="md" align={true}>
            <SliderContainer>
              <Slider
                min={0}
                max={5000}
                step={50}
                value={state.voice.pushToTalkReleaseDelay}
                onInput={(event) => {
                  const value = event.currentTarget.value;
                  state.voice.pushToTalkReleaseDelay = value;
                  syncToDesktop({ releaseDelay: value });
                }}
                labelFormatter={(value) => `${value}ms`}
              />
            </SliderContainer>
            <TextFieldContainer>
              <CompactNumberInput
                type="text"
                width="64px"
                value={state.voice.pushToTalkReleaseDelay.toString()}
                inputMode="numeric"
                onChange={(event) => {
                  const value = parseInt(event.currentTarget.value, 10);
                  if (!isNaN(value) && value >= 0 && value <= 5000) {
                    state.voice.pushToTalkReleaseDelay = value;
                    syncToDesktop({ releaseDelay: value });
                  }
                }}
              />
              <Text size="small" class="label">
                ms
              </Text>
            </TextFieldContainer>
          </Row>
        </Column>
      </Show>
    </Column>
  );
}

const pageHeading = css({
  fontSize: "16px",
  fontWeight: "700",
  lineHeight: "1.3",
  color: "var(--md-sys-color-on-surface)",
  letterSpacing: "0.01em",
});

const sectionHeading = css({
  fontSize: "15px",
  fontWeight: "600",
  lineHeight: "1.35",
  color: "var(--md-sys-color-on-surface)",
  marginBottom: "2px",
});

const SliderContainer = styled("div", {
  base: {
    flex: 1,
    minWidth: 0,
    display: "flex",
    alignItems: "center",
  },
});

const TextFieldContainer = styled("div", {
  base: {
    display: "flex",
    alignItems: "center",
    gap: "var(--gap-xs)",
    minHeight: "32px",
  },
});
