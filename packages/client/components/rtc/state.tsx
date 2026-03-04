import {
  Accessor,
  JSX,
  Show,
  Setter,
  batch,
  createContext,
  createEffect,
  createSignal,
  onCleanup,
  onMount,
  useContext,
} from "solid-js";
import { RoomContext } from "solid-livekit-components";

import { voiceNotifications } from "./VoiceNotifications";

const debugLog = (prefix: string, ...args: unknown[]) => {
  if (import.meta.env.DEV) {
    console.log(`[${prefix}]`, ...args);
  }
};

// Type declarations for Stoat Desktop push-to-talk API
declare global {
  interface Window {
    pushToTalk?: {
      onStateChange: (callback: (state: { active: boolean }) => void) => void;
      offStateChange: (callback: (state: { active: boolean }) => void) => void;
      setManualState: (active: boolean) => void;
      getCurrentState: () => { active: boolean };
      getConfig: () => {
        enabled: boolean;
        keybind: string;
        mode: "hold" | "toggle";
        releaseDelay: number;
      };
      onConfigChange: (
        callback: (config: {
          enabled: boolean;
          keybind: string;
          mode: "hold" | "toggle";
          releaseDelay: number;
        }) => void,
      ) => void;
      offConfigChange: (
        callback: (config: {
          enabled: boolean;
          keybind: string;
          mode: "hold" | "toggle";
          releaseDelay: number;
        }) => void,
      ) => void;
      updateSettings: (settings: {
        enabled?: boolean;
        keybind?: string;
        mode?: "hold" | "toggle";
        releaseDelay?: number;
        notificationSounds?: boolean;
      }) => void;
    };
  }
}

import { Room } from "livekit-client";
import { Channel } from "stoat.js";

import { useClient } from "@revolt/client";
import { useNavigate } from "@revolt/routing";
import { useState } from "@revolt/state";
import { Voice as VoiceSettings } from "@revolt/state/stores/Voice";
import { VoiceCallCardContext } from "@revolt/ui/components/features/voice/callCard/VoiceCallCard";

import { InRoom } from "./components/InRoom";
import { IncomingCallPopup } from "./components/IncomingCallPopup";
import { RoomAudioManager } from "./components/RoomAudioManager";

type State =
  | "READY"
  | "DISCONNECTED"
  | "CONNECTING"
  | "CONNECTED"
  | "RECONNECTING";

class Voice {
  #settings: VoiceSettings;

  channel: Accessor<Channel | undefined>;
  #setChannel: Setter<Channel | undefined>;

  room: Accessor<Room | undefined>;
  #setRoom: Setter<Room | undefined>;

  state: Accessor<State>;
  #setState: Setter<State>;

  deafen: Accessor<boolean>;
  #setDeafen: Setter<boolean>;

  microphone: Accessor<boolean>;
  #setMicrophone: Setter<boolean>;

  video: Accessor<boolean>;
  #setVideo: Setter<boolean>;

  screenshare: Accessor<boolean>;
  #setScreenshare: Setter<boolean>;

  #isManualDisconnect = false;
  #reconnectAttempts = 0;
  #maxReconnectAttempts = 5;
  #micWasOnBeforeDeafen = false;
  #lastCallMessageSent = new Map<string, number>();

  constructor(voiceSettings: VoiceSettings) {
    this.#settings = voiceSettings;

    const [channel, setChannel] = createSignal<Channel>();
    this.channel = channel;
    this.#setChannel = setChannel;

    const [room, setRoom] = createSignal<Room>();
    this.room = room;
    this.#setRoom = setRoom;

    const [state, setState] = createSignal<State>("READY");
    this.state = state;
    this.#setState = setState;

    const [deafen, setDeafen] = createSignal<boolean>(false);
    this.deafen = deafen;
    this.#setDeafen = setDeafen;

    const [microphone, setMicrophone] = createSignal(false);
    this.microphone = microphone;
    this.#setMicrophone = setMicrophone;

    const [video, setVideo] = createSignal(false);
    this.video = video;
    this.#setVideo = setVideo;

    const [screenshare, setScreenshare] = createSignal(false);
    this.screenshare = screenshare;
    this.#setScreenshare = setScreenshare;
  }

  async connect(channel: Channel, auth?: { url: string; token: string }) {
    debugLog("PTT-WEB", "Voice.connect() called for channel:", channel.id);

    // Reset reconnect state on new connection attempt
    this.#isManualDisconnect = false;
    this.#reconnectAttempts = 0;

    this.disconnect();

    const room = new Room({
      audioCaptureDefaults: {
        deviceId: this.#settings.preferredAudioInputDevice,
        echoCancellation: this.#settings.echoCancellation,
        noiseSuppression: this.#settings.noiseSupression,
      },
      audioOutput: {
        deviceId: this.#settings.preferredAudioOutputDevice,
      },
    });

    batch(() => {
      this.#setRoom(room);
      this.#setChannel(channel);
      this.#setState("CONNECTING");

      // only auto-mute when PTT is enabled
      const pttEnabled = this.#settings.pushToTalkEnabled;
      if (pttEnabled) {
        debugLog(
          "PTT-WEB",
          "PTT enabled - Setting initial mic state to OFF (muted)",
        );
        this.#setMicrophone(false);
      } else {
        debugLog("PTT-WEB", "PTT disabled - Keeping mic state as-is");
        this.#setMicrophone(true);
      }
      this.#setDeafen(false);
      this.#setVideo(false);
      this.#setScreenshare(false);
    });

    room.addListener("connected", () => {
      debugLog("PTT-WEB", "Room connected");
      this.#setState("CONNECTED");
      this.#reconnectAttempts = 0; // Reset on successful connection
      console.log("[VoiceNotifications] Playing self join sound");
      voiceNotifications.playSelfJoin();

      // Send "started a call" message only when starting a new call (no existing participants)
      if (
        (channel.type === "DirectMessage" || channel.type === "Group") &&
        channel.voiceParticipants.size <= 1
      ) {
        const lastSent = this.#lastCallMessageSent.get(channel.id);
        if (!lastSent || Date.now() - lastSent >= 60_000) {
          this.#lastCallMessageSent.set(channel.id, Date.now());
          channel.sendMessage("> *Started a call*").catch(() => {});
        }
      }
    });

    room.addListener("disconnected", (reason?) => {
      debugLog(
        "PTT-WEB",
        "Room disconnected, reason:",
        reason,
        "isManual:",
        this.#isManualDisconnect,
      );

      // If this was a manual disconnect (user clicked leave), don't try to reconnect
      if (this.#isManualDisconnect) {
        debugLog("PTT-WEB", "Manual disconnect - resetting state");
        voiceNotifications.playSelfLeave();
        this.#setState("READY");
        this.#setRoom(undefined);
        this.#setChannel(undefined);
        return;
      }

      // Check if auto-reconnect is enabled
      if (!this.#settings.autoReconnect) {
        debugLog(
          "PTT-WEB",
          "Auto-reconnect disabled - setting to DISCONNECTED",
        );
        this.#setState("DISCONNECTED");
        if (this.#settings.soundDisconnect) {
          voiceNotifications.playDisconnect();
        }
        return;
      }

      // Try to reconnect
      this.#handleReconnect();
    });

    if (!auth) {
      auth = await channel.joinCall("worldwide");
    }

    debugLog("PTT-WEB", "Connecting to room...");
    await room.connect(auth.url, auth.token, {
      autoSubscribe: false,
    });
    debugLog(
      "PTT-WEB",
      "Room connected successfully, mic state:",
      room.localParticipant.isMicrophoneEnabled,
    );

    // Handle mic state based on PTT setting
    if (this.#settings.pushToTalkEnabled) {
      // PTT enabled - mute mic so user must press key to speak
      if (room.localParticipant.isMicrophoneEnabled) {
        debugLog(
          "PTT-WEB",
          "PTT enabled and mic was auto-enabled by LiveKit, explicitly muting...",
        );
        await room.localParticipant.setMicrophoneEnabled(false);
        debugLog(
          "PTT-WEB",
          "Mic explicitly muted, state:",
          room.localParticipant.isMicrophoneEnabled,
        );
      }
    } else {
      // PTT disabled - unmute mic so user can speak immediately
      if (!room.localParticipant.isMicrophoneEnabled) {
        debugLog(
          "PTT-WEB",
          "PTT disabled and mic is muted, explicitly unmuting...",
        );
        await room.localParticipant.setMicrophoneEnabled(true);
        debugLog(
          "PTT-WEB",
          "Mic explicitly unmuted, state:",
          room.localParticipant.isMicrophoneEnabled,
        );
      }
    }
  }

  async #handleReconnect() {
    const channel = this.channel();
    if (!channel) {
      debugLog("PTT-WEB", "No channel to reconnect to");
      this.#setState("DISCONNECTED");
      if (this.#settings.soundDisconnect) {
        voiceNotifications.playDisconnect();
      }
      return;
    }

    this.#reconnectAttempts++;
    debugLog(
      "PTT-WEB",
      `Reconnect attempt ${this.#reconnectAttempts}/${this.#maxReconnectAttempts}`,
    );

    this.#setState("RECONNECTING");

    try {
      // Fetch a fresh token for reconnection
      const auth = await channel.joinCall("worldwide");
      const room = this.room();

      if (!room) {
        throw new Error("Room no longer exists");
      }

      debugLog("PTT-WEB", "Attempting to reconnect with new token...");
      await room.connect(auth.url, auth.token, {
        autoSubscribe: false,
      });

      debugLog("PTT-WEB", "Reconnection successful!");
      this.#reconnectAttempts = 0;
      this.#setState("CONNECTED");
    } catch (error) {
      debugLog("PTT-WEB", "Reconnection failed:", error);

      if (this.#reconnectAttempts < this.#maxReconnectAttempts) {
        // Try again with exponential backoff
        const delay = Math.min(
          1000 * Math.pow(2, this.#reconnectAttempts),
          10000,
        );
        debugLog("PTT-WEB", `Retrying in ${delay}ms...`);

        setTimeout(() => {
          this.#handleReconnect();
        }, delay);
      } else {
        // Max attempts reached, give up
        debugLog("PTT-WEB", "Max reconnection attempts reached");
        this.#setState("DISCONNECTED");
        if (this.#settings.soundDisconnect) {
          voiceNotifications.playDisconnect();
        }
      }
    }
  }

  disconnect() {
    const room = this.room();
    if (!room) return;

    // Mark as manual disconnect to prevent auto-reconnect
    this.#isManualDisconnect = true;
    this.#reconnectAttempts = 0;

    voiceNotifications.playSelfLeave();

    room.removeAllListeners();
    room.disconnect();

    batch(() => {
      this.#setState("READY");
      this.#setRoom(undefined);
      this.#setChannel(undefined);
    });
  }

  async toggleDeafen() {
    const willDeafen = !this.deafen();

    if (willDeafen) {
      // Save current mic state so we can restore it on undeafen
      this.#micWasOnBeforeDeafen = this.microphone();

      // Mute the mic when deafening
      const room = this.room();
      if (room && room.localParticipant.isMicrophoneEnabled) {
        await room.localParticipant.setMicrophoneEnabled(false);
        this.#setMicrophone(false);
      }
    } else {
      // Restore mic to its previous state when undeafening
      if (this.#micWasOnBeforeDeafen) {
        const room = this.room();
        if (room) {
          await room.localParticipant.setMicrophoneEnabled(true);
          this.#setMicrophone(true);
        }
      }
    }

    this.#setDeafen(willDeafen);
  }

  async toggleMute() {
    const room = this.room();
    if (!room) throw "invalid state";

    // if user is deafened, don't allow them to unmute
    if (this.deafen()) {
      debugLog("PTT-WEB", "Cannot unmute while deafened");
      return;
    }

    await room.localParticipant.setMicrophoneEnabled(
      !room.localParticipant.isMicrophoneEnabled,
    );

    this.#setMicrophone(room.localParticipant.isMicrophoneEnabled);

    // only play sounds if PTT is disabled, or if PTT is enabled with notification sounds on
    const shouldPlaySound =
      !this.#settings.pushToTalkEnabled ||
      this.#settings.pushToTalkNotificationSounds;

    if (shouldPlaySound) {
      if (room.localParticipant.isMicrophoneEnabled) {
        voiceNotifications.playUnmute();
      } else {
        voiceNotifications.playMute();
      }
    }
  }

  /**
   * Set microphone mute state directly (for push-to-talk)
   * @param enabled true to unmute, false to mute
   */
  async setMute(enabled: boolean) {
    debugLog("PTT-WEB", "setMute() called:", enabled);
    const room = this.room();
    if (!room) {
      debugLog("PTT-WEB", "setMute() - no room, returning");
      return;
    }

    // if user is deafened, don't allow them to unmute
    if (this.deafen()) {
      debugLog("PTT-WEB", "Cannot unmute while deafened");
      return;
    }

    const currentState = room.localParticipant.isMicrophoneEnabled;
    debugLog(
      "PTT-WEB",
      "setMute() - current mic state:",
      currentState,
      "target:",
      enabled,
    );

    if (currentState !== enabled) {
      debugLog(
        "PTT-WEB",
        "setMute() - calling setMicrophoneEnabled(",
        enabled,
        ")",
      );
      await room.localParticipant.setMicrophoneEnabled(enabled);
      this.#setMicrophone(enabled);
      debugLog("PTT-WEB", "setMute() - mic state updated to:", enabled);

      // only play sounds if PTT is disabled, or if PTT is enabled with notification sounds on
      const shouldPlaySound =
        !this.#settings.pushToTalkEnabled ||
        this.#settings.pushToTalkNotificationSounds;

      if (shouldPlaySound) {
        if (enabled) {
          voiceNotifications.playUnmute();
        } else {
          voiceNotifications.playMute();
        }
      }
    } else {
      debugLog("PTT-WEB", "setMute() - no change needed, already:", enabled);
    }
  }

  async toggleCamera() {
    const room = this.room();
    if (!room) throw "invalid state";
    await room.localParticipant.setCameraEnabled(
      !room.localParticipant.isCameraEnabled,
    );

    this.#setVideo(room.localParticipant.isCameraEnabled);
  }

  async toggleScreenshare() {
    const room = this.room();
    if (!room) throw "invalid state";
    await room.localParticipant.setScreenShareEnabled(
      !room.localParticipant.isScreenShareEnabled,
    );

    this.#setScreenshare(room.localParticipant.isScreenShareEnabled);
  }

  getConnectedUser(userId: string) {
    return this.room()?.getParticipantByIdentity(userId);
  }

  get listenPermission() {
    return !!this.channel()?.havePermission("Listen");
  }

  get speakingPermission() {
    return !!this.channel()?.havePermission("Speak");
  }
}

const voiceContext = createContext<Voice>(null as unknown as Voice);

/**
 * Mount global voice context and room audio manager
 */
type IncomingCall = {
  channel: Channel;
  callerName: string;
  callerAvatar?: string;
};

export function VoiceContext(props: { children: JSX.Element }) {
  const state = useState();
  const voice = new Voice(state.voice);
  const client = useClient();
  const navigate = useNavigate();

  const [incomingCall, setIncomingCall] = createSignal<IncomingCall>();
  let incomingCallTimeout: ReturnType<typeof setTimeout> | undefined;
  let incomingCallSoundTimeout: ReturnType<typeof setTimeout> | undefined;
  // Track recently dismissed channels to prevent re-trigger spam
  const recentlyDismissed = new Map<string, number>();
  const DISMISS_COOLDOWN = 15_000; // 15 second cooldown per channel

  function dismissIncomingCall() {
    const call = incomingCall();
    if (call) {
      recentlyDismissed.set(call.channel.id, Date.now());
    }
    voiceNotifications.stopIncomingCall();
    setIncomingCall(undefined);
    if (incomingCallTimeout) {
      clearTimeout(incomingCallTimeout);
      incomingCallTimeout = undefined;
    }
    if (incomingCallSoundTimeout) {
      clearTimeout(incomingCallSoundTimeout);
      incomingCallSoundTimeout = undefined;
    }
  }

  function answerCall() {
    const call = incomingCall();
    if (!call) return;
    dismissIncomingCall();
    voice.connect(call.channel);
    navigate(call.channel.path);
  }

  function rejectCall() {
    dismissIncomingCall();
  }

  onMount(() => {
    debugLog(
      "PTT-WEB",
      "VoiceContext mounted, checking for desktop PTT API...",
    );
    debugLog(
      "PTT-WEB",
      "window.pushToTalk exists:",
      typeof window !== "undefined" && !!window.pushToTalk,
    );

    if (typeof window !== "undefined" && window.pushToTalk) {
      debugLog("PTT-WEB", "✓ Desktop PTT API found, initializing integration");

      // Check current state immediately (in case we missed the initial signal)
      const currentState = window.pushToTalk.getCurrentState();
      debugLog(
        "PTT-WEB",
        "Current PTT state from desktop:",
        currentState.active ? "ON" : "OFF",
      );

      const handleStateChange = (e: { active: boolean }) => {
        debugLog(
          "PTT-WEB",
          "Received state change from desktop:",
          e.active ? "ON" : "OFF",
        );
        debugLog(
          "PTT-WEB",
          "Current room:",
          voice.room() ? "connected" : "not connected",
        );

        // e.active = true means PTT key is pressed (mic should be ON/unmuted)
        // e.active = false means PTT key is released (mic should be OFF/muted)
        if (voice.room()) {
          const shouldEnableMic = e.active;
          debugLog(
            "PTT-WEB",
            "PTT active:",
            e.active,
            "-> Mic enabled:",
            shouldEnableMic,
          );
          voice.setMute(shouldEnableMic);
        } else {
          debugLog("PTT-WEB", "⚠ No active room, cannot mute/unmute");
        }
      };

      handleStateChange(currentState);

      debugLog("PTT-WEB", "Registering onStateChange listener...");
      window.pushToTalk.onStateChange(handleStateChange);
      debugLog("PTT-WEB", "✓ Listener registered");

      // Sync initial config from desktop to web client (config file is source of truth)
      debugLog("PTT-WEB", "Syncing PTT config from desktop...");
      const handleConfigChange = (config: {
        enabled: boolean;
        keybind: string;
        mode: "hold" | "toggle";
        releaseDelay: number;
      }) => {
        debugLog("PTT-WEB", "Received config from desktop:", config);
        state.voice.setPushToTalkConfig(config);
      };

      // get initial config
      const initialConfig = window.pushToTalk.getConfig();
      debugLog("PTT-WEB", "Initial config from desktop:", initialConfig);
      state.voice.setPushToTalkConfig(initialConfig);

      // listen for future config changes
      window.pushToTalk.onConfigChange(handleConfigChange);
      debugLog("PTT-WEB", "✓ Config sync initialized");

      onCleanup(() => {
        debugLog("PTT-WEB", "Cleaning up PTT listener");
        window.pushToTalk?.offStateChange(handleStateChange);
        window.pushToTalk?.offConfigChange(handleConfigChange);
      });
    } else {
      debugLog(
        "PTT-WEB",
        "✗ Desktop PTT API not available (running in browser?)",
      );
    }

    // setup voice notification sounds
    const currentClient = client();
    console.log(
      "[VoiceNotifications] Setting up notifications, client available:",
      !!currentClient,
    );

    if (!currentClient) {
      console.log(
        "[VoiceNotifications] Client not available yet, skipping setup",
      );
    } else {
      // console.log("[VoiceNotifications] Registering event listeners");

      const onJoin = (channel: Channel, participant: { userId: string }) => {
        // console.log("[VoiceNotifications] VoiceChannelJoin event received:", {
        //   channelId: channel.id,
        //   participantId: participant.userId,
        //   currentChannelId: voice.channel()?.id,
        //   currentUserId: currentClient.user?.id,
        //   shouldPlay: voice.channel()?.id === channel.id && participant.userId !== currentClient.user?.id
        // });
        if (participant.userId === currentClient.user?.id) return;

        if (voice.channel()?.id === channel.id) {
          console.log("[VoiceNotifications] Playing join sound");
          voiceNotifications.playJoin();
          return;
        }

        // Incoming call: someone joined a DM/Group voice channel we're not in
        if (
          (channel.type === "DirectMessage" || channel.type === "Group") &&
          !voice.channel()
        ) {
          // Already showing an incoming call popup — don't stack another
          if (incomingCall()) return;

          // Cooldown: don't re-trigger for a channel we just dismissed
          const lastDismissed = recentlyDismissed.get(channel.id);
          if (lastDismissed && Date.now() - lastDismissed < DISMISS_COOLDOWN) return;

          // Don't ring if user is on DND (Busy) or Focus
          const userStatus = currentClient.user?.status?.presence;
          if (userStatus === "Busy" || userStatus === "Focus") return;

          let callerName: string;
          let callerAvatar: string | undefined;

          if (channel.type === "Group") {
            callerName = channel.name ?? "Group Call";
            callerAvatar = channel.iconURL;
          } else {
            const caller = currentClient.users.get(participant.userId);
            callerName = caller?.displayName ?? caller?.username ?? "Unknown";
            callerAvatar = caller?.avatarURL;
          }

          debugLog("IncomingCall", "Ringing from", callerName);
          setIncomingCall({ channel, callerName, callerAvatar });
          voiceNotifications.playIncomingCall();

          // Stop ringing after 15 seconds
          if (incomingCallSoundTimeout) clearTimeout(incomingCallSoundTimeout);
          incomingCallSoundTimeout = setTimeout(() => {
            voiceNotifications.stopIncomingCall();
            incomingCallSoundTimeout = undefined;
          }, 15_000);

          // Auto-dismiss popup after 60 seconds
          if (incomingCallTimeout) clearTimeout(incomingCallTimeout);
          incomingCallTimeout = setTimeout(() => {
            dismissIncomingCall();
          }, 60_000);
        }
      };

      const onLeave = (channel: Channel, userId: string) => {
        // console.log("[VoiceNotifications] VoiceChannelLeave event received:", {
        //   channelId: channel.id,
        //   userId: userId,
        //   currentChannelId: voice.channel()?.id,
        //   currentUserId: currentClient.user?.id,
        //   shouldPlay: voice.channel()?.id === channel.id && userId !== currentClient.user?.id
        // });
        if (userId === currentClient.user?.id) return;

        if (voice.channel()?.id === channel.id) {
          console.log("[VoiceNotifications] Playing leave sound");
          voiceNotifications.playLeave();
        }

        // Dismiss incoming call if the caller left
        const call = incomingCall();
        if (call && call.channel.id === channel.id) {
          // Check if anyone is still in the call
          const remaining = channel.voiceParticipants;
          const othersInCall = [...remaining.keys()].filter(
            (id) => id !== currentClient.user?.id,
          );
          if (othersInCall.length === 0) {
            debugLog("IncomingCall", "Caller left, dismissing");
            dismissIncomingCall();
          }
        }
      };

      currentClient.on("voiceChannelJoin", onJoin);
      currentClient.on("voiceChannelLeave", onLeave);
      console.log("[VoiceNotifications] Event listeners registered");

      onCleanup(() => {
        console.log("[VoiceNotifications] Cleaning up event listeners");
        currentClient.off("voiceChannelJoin", onJoin);
        currentClient.off("voiceChannelLeave", onLeave);
      });
    }
  });

  // sync notification settings reactively
  createEffect(() => {
    // track master settings
    const enabled = state.voice.notificationSoundsEnabled;
    const volume = state.voice.notificationVolume;

    // track individual sound toggles (force reactivity)
    const soundJoinCall = state.voice.soundJoinCall;
    const soundLeaveCall = state.voice.soundLeaveCall;
    const soundSomeoneJoined = state.voice.soundSomeoneJoined;
    const soundSomeoneLeft = state.voice.soundSomeoneLeft;
    const soundMute = state.voice.soundMute;
    const soundUnmute = state.voice.soundUnmute;
    const soundReceiveMessage = state.voice.soundReceiveMessage;
    const soundDisconnect = state.voice.soundDisconnect;
    const soundIncomingCall = state.voice.soundIncomingCall;

    console.log(
      "[VoiceNotifications] Settings updated - enabled:",
      enabled,
      "volume:",
      volume,
    );

    // apply settings to notification manager
    voiceNotifications.setEnabled(enabled);
    voiceNotifications.setVolume(volume);

    // sync individual sound toggles
    voiceNotifications.setSoundEnabled("join_call", soundJoinCall);
    voiceNotifications.setSoundEnabled("leave_call", soundLeaveCall);
    voiceNotifications.setSoundEnabled("someone_joined", soundSomeoneJoined);
    voiceNotifications.setSoundEnabled("someone_left", soundSomeoneLeft);
    voiceNotifications.setSoundEnabled("mute", soundMute);
    voiceNotifications.setSoundEnabled("unmute", soundUnmute);
    voiceNotifications.setSoundEnabled("receive_message", soundReceiveMessage);
    voiceNotifications.setSoundEnabled("disconnect", soundDisconnect);
    voiceNotifications.setSoundEnabled("incoming_call", soundIncomingCall);
  });

  return (
    <voiceContext.Provider value={voice}>
      <RoomContext.Provider value={voice.room}>
        <VoiceCallCardContext>{props.children}</VoiceCallCardContext>
        <InRoom>
          <RoomAudioManager />
        </InRoom>
        <Show when={incomingCall()}>
          {(call) => (
            <IncomingCallPopup
              callerName={call().callerName}
              callerAvatar={call().callerAvatar}
              onAnswer={answerCall}
              onReject={rejectCall}
            />
          )}
        </Show>
      </RoomContext.Provider>
    </voiceContext.Provider>
  );
}

export const useVoice = () => useContext(voiceContext);
