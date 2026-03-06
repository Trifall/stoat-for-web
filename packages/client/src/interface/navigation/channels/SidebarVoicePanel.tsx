import { Show } from "solid-js";

import { styled } from "styled-system/jsx";

import { CONFIGURATION } from "@revolt/common";
import { useClient } from "@revolt/client";
import { InRoom, useVoice } from "@revolt/rtc";
import { Button, IconButton } from "@revolt/ui/components/design";
import { Symbol } from "@revolt/ui/components/utils/Symbol";

import { VoiceCallCardStatus } from "@revolt/ui/components/features/voice/callCard/VoiceCallCardStatus";

export function SidebarVoicePanel() {
  const voice = useVoice();
  const client = useClient();

  const channelLabel = () => {
    const ch = voice.channel();
    if (!ch) return "";
    if (ch.serverId) {
      const server = client().servers.get(ch.serverId);
      return server ? `${server.name} - ${ch.name}` : ch.name;
    }
    return ch.name ?? "";
  };

  return (
    <InRoom>
      <Panel>
        <VoiceCallCardStatus />
        <ChannelLabel>{channelLabel()}</ChannelLabel>
        <Controls />
      </Panel>
    </InRoom>
  );
}

function Controls() {
  const voice = useVoice();

  function isVideoEnabled() {
    return CONFIGURATION.ENABLE_VIDEO;
  }

  return (
    <Actions>
      <IconButton
        size="xs"
        variant={voice.microphone() ? "filled" : "tonal"}
        onPress={() => voice.toggleMute()}
        isDisabled={!voice.speakingPermission}
      >
        <Show when={voice.microphone()} fallback={<Symbol>mic_off</Symbol>}>
          <Symbol>mic</Symbol>
        </Show>
      </IconButton>
      <IconButton
        size="xs"
        variant={voice.deafen() || !voice.listenPermission ? "tonal" : "filled"}
        onPress={() => voice.toggleDeafen()}
        isDisabled={!voice.listenPermission}
      >
        <Show
          when={voice.deafen() || !voice.listenPermission}
          fallback={<Symbol>headset</Symbol>}
        >
          <Symbol>headset_off</Symbol>
        </Show>
      </IconButton>
      <IconButton
        size="xs"
        variant={isVideoEnabled() && voice.video() ? "filled" : "tonal"}
        onPress={() => {
          if (isVideoEnabled()) voice.toggleCamera();
        }}
        isDisabled={!isVideoEnabled()}
      >
        <Symbol>camera_video</Symbol>
      </IconButton>
      <IconButton
        size="xs"
        variant={isVideoEnabled() && voice.screenshare() ? "filled" : "tonal"}
        onPress={() => {
          if (isVideoEnabled()) voice.toggleScreenshare();
        }}
        isDisabled={!isVideoEnabled()}
      >
        <Show
          when={!isVideoEnabled() || voice.screenshare()}
          fallback={<Symbol>stop_screen_share</Symbol>}
        >
          <Symbol>screen_share</Symbol>
        </Show>
      </IconButton>
      <Button
        size="xs"
        variant="_error"
        onPress={() => voice.disconnect()}
      >
        <Symbol>call_end</Symbol>
      </Button>
    </Actions>
  );
}

const Panel = styled("div", {
  base: {
    flexShrink: 0,
    userSelect: "none",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "var(--gap-md)",
    padding: "var(--gap-lg)",
    marginTop: "auto",
    marginBottom: "var(--gap-sm)",
    marginLeft: "var(--gap-sm)",
    marginRight: "var(--gap-sm)",
    borderRadius: "var(--borderRadius-lg)",
    background: "var(--md-sys-color-secondary-container)",
  },
});

const ChannelLabel = styled("span", {
  base: {
    fontSize: "12px",
    color: "var(--md-sys-color-on-surface-variant)",
    textAlign: "center",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    width: "100%",
  },
});

const Actions = styled("div", {
  base: {
    display: "flex",
    justifyContent: "center",
    gap: "var(--gap-xs)",
    alignItems: "center",
    padding: "var(--gap-xs) var(--gap-sm)",
    borderRadius: "var(--borderRadius-full)",
    background: "var(--md-sys-color-surface-container)",
  },
});
