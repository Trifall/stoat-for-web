// TOP OF FILE - BEFORE ANY IMPORTS
console.log("RTC STATE MODULE LOADING NOW");
alert("RTC STATE MODULE LOADING");

import {
  Accessor,
  JSX,
  Setter,
  batch,
  createContext,
  createSignal,
  useContext,
  onMount,
  onCleanup,
} from "solid-js";
import { RoomContext } from "solid-livekit-components";

// Type declarations for Stoat Desktop push-to-talk API
declare global {
  interface Window {
    pushToTalk?: {
      onStateChange: (callback: (state: { active: boolean }) => void) => void;
      offStateChange: (callback: (state: { active: boolean }) => void) => void;
      onLocalKeybind: (callback: (data: { accelerator: string }) => void) => void;
      offLocalKeybind: (callback: (data: { accelerator: string }) => void) => void;
      setManualState: (active: boolean) => void;
      getCurrentState: () => { active: boolean };
    };
  }
}

import { Room } from "livekit-client";
import { Channel } from "stoat.js";

// DEBUG: Verify this file is being loaded
console.log("[PTT-WEB] state.tsx module loaded!"); alert("[PTT-WEB] VOICE MODULE LOADED - CHECK CONSOLE");

import { useState } from "@revolt/state";
import { Voice as VoiceSettings } from "@revolt/state/stores/Voice";
import { VoiceCallCardContext } from "@revolt/ui/components/features/voice/callCard/VoiceCallCard";

import { InRoom } from "./components/InRoom";
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
    console.log("[PTT-WEB] Voice.connect() called for channel:", channel.id);
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

      // Start with mic OFF (muted) for PTT mode
      console.log("[PTT-WEB] Setting initial mic state to OFF (muted)");
      this.#setMicrophone(false);
      this.#setDeafen(false);
      this.#setVideo(false);
      this.#setScreenshare(false);

      // Only enable mic if user has speaking permission AND PTT is not active
      // Note: PTT starts with mic OFF, user must press key to speak
      if (this.speakingPermission) {
        console.log("[PTT-WEB] User has speaking permission, but keeping mic OFF initially (PTT mode)");
        // Don't enable mic automatically - wait for PTT key
        // room.localParticipant.setMicrophoneEnabled(true)...
      }
    });

    room.addListener("connected", () => {
      console.log("[PTT-WEB] Room connected");
      this.#setState("CONNECTED");
    });

    room.addListener("disconnected", () => {
      console.log("[PTT-WEB] Room disconnected");
      this.#setState("DISCONNECTED");
    });

    if (!auth) {
      auth = await channel.joinCall("worldwide");
    }

    console.log("[PTT-WEB] Connecting to room...");
    await room.connect(auth.url, auth.token, {
      autoSubscribe: false,
    });
    console.log("[PTT-WEB] Room connected successfully, mic state:", room.localParticipant.isMicrophoneEnabled);
    
    // Explicitly mute the microphone in LiveKit after connecting
    // PTT mode requires mic to start muted
    if (room.localParticipant.isMicrophoneEnabled) {
      console.log("[PTT-WEB] Mic was auto-enabled by LiveKit, explicitly muting...");
      await room.localParticipant.setMicrophoneEnabled(false);
      console.log("[PTT-WEB] Mic explicitly muted, state:", room.localParticipant.isMicrophoneEnabled);
    } else {
      console.log("[PTT-WEB] Mic already muted as expected");
    }
  }

  disconnect() {
    const room = this.room();
    if (!room) return;

    room.removeAllListeners();
    room.disconnect();

    batch(() => {
      this.#setState("READY");
      this.#setRoom(undefined);
      this.#setChannel(undefined);
    });
  }

  async toggleDeafen() {
    this.#setDeafen((s) => !s);
  }

  async toggleMute() {
    const room = this.room();
    if (!room) throw "invalid state";
    await room.localParticipant.setMicrophoneEnabled(
      !room.localParticipant.isMicrophoneEnabled,
    );

    this.#setMicrophone(room.localParticipant.isMicrophoneEnabled);
  }

  /**
   * Set microphone mute state directly (for push-to-talk)
   * @param enabled true to unmute, false to mute
   */
  async setMute(enabled: boolean) {
    console.log("[PTT-WEB] setMute() called:", enabled);
    const room = this.room();
    if (!room) {
      console.log("[PTT-WEB] setMute() - no room, returning");
      return;
    }
    
    const currentState = room.localParticipant.isMicrophoneEnabled;
    console.log("[PTT-WEB] setMute() - current mic state:", currentState, "target:", enabled);
    
    // Only change if different from current state
    if (currentState !== enabled) {
      console.log("[PTT-WEB] setMute() - calling setMicrophoneEnabled(", enabled, ")");
      await room.localParticipant.setMicrophoneEnabled(enabled);
      this.#setMicrophone(enabled);
      console.log("[PTT-WEB] setMute() - mic state updated to:", enabled);
    } else {
      console.log("[PTT-WEB] setMute() - no change needed, already:", enabled);
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
export function VoiceContext(props: { children: JSX.Element }) {
  const state = useState();
  const voice = new Voice(state.voice);

  // Initialize push-to-talk integration with desktop app
  onMount(() => {
    console.log("[PTT-WEB] VoiceContext mounted, checking for desktop PTT API...");
    console.log("[PTT-WEB] window.pushToTalk exists:", typeof window !== "undefined" && !!window.pushToTalk);
    
    if (typeof window !== "undefined" && window.pushToTalk) {
      console.log("[PTT-WEB] ✓ Desktop PTT API found, initializing integration");

      // Check current state immediately (in case we missed the initial signal)
      const currentState = window.pushToTalk.getCurrentState();
      console.log("[PTT-WEB] Current PTT state from desktop:", currentState.active ? "ON" : "OFF");

      const handleStateChange = (e: { active: boolean }) => {
        console.log("[PTT-WEB] Received state change from desktop:", e.active ? "ON" : "OFF");
        console.log("[PTT-WEB] Current room:", voice.room() ? "connected" : "not connected");
        
        // e.active = true means PTT key is pressed (mic should be ON/unmuted)
        // e.active = false means PTT key is released (mic should be OFF/muted)
        if (voice.room()) {
          // setMute(true) = enable mic (unmute), setMute(false) = disable mic (mute)
          const shouldEnableMic = e.active;
          console.log("[PTT-WEB] PTT active:", e.active, "-> Mic enabled:", shouldEnableMic);
          voice.setMute(shouldEnableMic);
        } else {
          console.log("[PTT-WEB] ⚠ No active room, cannot mute/unmute");
        }
      };
      
      // Also apply current state immediately when joining a call
      // This ensures PTT OFF is applied when first connecting
      const applyCurrentPttState = () => {
        const room = voice.room();
        if (room) {
          const currentState = window.pushToTalk?.getCurrentState();
          if (currentState) {
            console.log("[PTT-WEB] Applying current PTT state on room connection:", currentState.active ? "ON" : "OFF");
            voice.setMute(currentState.active);
          }
        }
      };
      
      // Apply state now and also listen for room connection
      applyCurrentPttState();

      // Apply current state immediately
      handleStateChange(currentState);

      console.log("[PTT-WEB] Registering onStateChange listener...");
      window.pushToTalk.onStateChange(handleStateChange);
      console.log("[PTT-WEB] ✓ Listener registered");

      onCleanup(() => {
        console.log("[PTT-WEB] Cleaning up PTT listener");
        window.pushToTalk?.offStateChange(handleStateChange);
      });
    } else {
      console.log("[PTT-WEB] ✗ Desktop PTT API not available (running in browser?)");
    }
  });

  return (
    <voiceContext.Provider value={voice}>
      <RoomContext.Provider value={voice.room}>
        <VoiceCallCardContext>{props.children}</VoiceCallCardContext>
        <InRoom>
          <RoomAudioManager />
        </InRoom>
      </RoomContext.Provider>
    </voiceContext.Provider>
  );
}

export const useVoice = () => useContext(voiceContext);
