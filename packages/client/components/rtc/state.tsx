import {
  Accessor,
  JSX,
  Setter,
  Show,
  batch,
  createContext,
  createEffect,
  createSignal,
  onCleanup,
  onMount,
  useContext,
} from "solid-js";
import {
  RoomContext,
  TrackReferenceOrPlaceholder,
  useTracks,
} from "solid-livekit-components";

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
    stoatRefreshVoice?: () => void;
  }
}

import { ConnectionState, Room, RoomEvent, Track } from "livekit-client";
import { DenoiseTrackProcessor } from "livekit-rnnoise-processor";
import { Channel } from "stoat.js";

import { NoiseGateProcessor } from "./NoiseGateProcessor";

import { useClient } from "@revolt/client";
import { CONFIGURATION } from "@revolt/common";
import { ModalController, useModals } from "@revolt/modal";
import { useNavigate } from "@revolt/routing";
import { useState } from "@revolt/state";
import {
  ScreenShareQualityName,
  Voice as VoiceSettings,
} from "@revolt/state/stores/Voice";
import { VoiceCallCardContext } from "@revolt/ui/components/features/voice/callCard/VoiceCallCard";
import { ScreenSharePresets, VideoResolution } from "livekit-client";

import { InRoom } from "./components/InRoom";
import { IncomingCallPopup } from "./components/IncomingCallPopup";
import { RoomAudioManager } from "./components/RoomAudioManager";

type State =
  | "READY"
  | "DISCONNECTED"
  | "CONNECTING"
  | "CONNECTED"
  | "RECONNECTING";

type MicrophonePublication = NonNullable<
  Awaited<ReturnType<Room["localParticipant"]["setMicrophoneEnabled"]>>
>;

type ScreenShareQuality = {
  name: ScreenShareQualityName;
  resolution: VideoResolution;
  fullName: string;
  contentHint: string;
};

class Voice {
  #settings: VoiceSettings;

  channel: Accessor<Channel | undefined>;
  #setChannel: Setter<Channel | undefined>;

  room: Accessor<Room | undefined>;
  #setRoom: Setter<Room | undefined>;

  vidTracks: Accessor<TrackReferenceOrPlaceholder[]>;

  state: Accessor<State>;
  #setState: Setter<State>;

  deafen: Accessor<boolean>;
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
  #noiseGateProcessor?: NoiseGateProcessor;
  #mutePromise: Promise<void> = Promise.resolve();
  #pendingLeaveNotifications = new Map<string, ReturnType<typeof setTimeout>>();
  #suppressedReconnectJoins = new Set<string>();
  #suppressedReconnectJoinsClearTimeout?: ReturnType<typeof setTimeout>;

  fullscreen: Accessor<boolean>;
  #setFullscreen: Setter<boolean>;

  focusId: Accessor<string | undefined>;
  #setFocus: Setter<string | undefined>;

  showBar: Accessor<boolean>;
  #setShowBar: Setter<boolean>;

  private openModal;
  private getClient;

  constructor(voiceSettings: VoiceSettings, modals: ModalController) {
    this.#settings = voiceSettings;

    const [channel, setChannel] = createSignal<Channel>();
    this.channel = channel;
    this.#setChannel = setChannel;

    const [room, setRoom] = createSignal<Room>();
    this.room = room;
    this.#setRoom = setRoom;

    this.vidTracks = () => [];

    const [state, setState] = createSignal<State>("READY");
    this.state = state;
    this.#setState = setState;

    this.deafen = () => voiceSettings.deafen;

    const [microphone, setMicrophone] = createSignal(voiceSettings.micOn);
    this.microphone = microphone;
    this.#setMicrophone = setMicrophone;

    const [video, setVideo] = createSignal(false);
    this.video = video;
    this.#setVideo = setVideo;

    const [screenshare, setScreenshare] = createSignal(false);
    this.screenshare = screenshare;
    this.#setScreenshare = setScreenshare;

    const [fullscreen, setFullscreen] = createSignal(false);
    this.fullscreen = fullscreen;
    this.#setFullscreen = setFullscreen;

    const [focus, setFocus] = createSignal<string>();
    this.focusId = focus;
    this.#setFocus = setFocus;

    const [showBar, setShowBar] = createSignal(true);
    this.showBar = showBar;
    this.#setShowBar = setShowBar;

    this.openModal = modals.openModal;

    this.getClient = useClient();
  }

  #resetVoiceProcessors() {
    this.#noiseGateProcessor?.destroy();
    this.#noiseGateProcessor = undefined;
  }

  #configureMicrophoneTrack(track?: MicrophonePublication) {
    this.#resetVoiceProcessors();

    const audioTrack = track?.audioTrack;
    if (!audioTrack) return;

    const settings = audioTrack.mediaStreamTrack.getSettings();
    if (settings.channelCount && settings.channelCount > 1) {
      console.warn(
        "[Voice] Mic track is stereo (channelCount:",
        settings.channelCount,
        ") - remote participants may hear audio in one ear only.",
      );
    }

    if (this.#settings.noiseGateEnabled) {
      const upstream =
        this.#settings.noiseSupression === "enhanced"
          ? new DenoiseTrackProcessor({
              workletCDNURL: CONFIGURATION.RNNOISE_WORKLET_CDN_URL,
            })
          : undefined;

      this.#noiseGateProcessor = new NoiseGateProcessor({
        threshold: this.#settings.noiseGateThreshold,
        upstream,
      });
      console.info(
        "[NoiseGate] Applying processor to audio track:",
        audioTrack.sid,
      );
      audioTrack.setProcessor(this.#noiseGateProcessor as never);
      return;
    }

    if (this.#settings.noiseSupression === "enhanced") {
      audioTrack.setProcessor(
        new DenoiseTrackProcessor({
          workletCDNURL: CONFIGURATION.RNNOISE_WORKLET_CDN_URL,
        }),
      );
    }
  }

  async #setMicrophoneEnabled(
    enabled: boolean,
    options: { persistPreference?: boolean } = {},
  ) {
    const room = this.room();
    if (!room) throw "invalid state";

    const track = await room.localParticipant.setMicrophoneEnabled(enabled);
    const isEnabled = enabled && typeof track !== "undefined";

    this.#setMicrophone(isEnabled);

    if (options.persistPreference ?? true) {
      this.#settings.micOn = isEnabled;
    }

    if (isEnabled) {
      this.#configureMicrophoneTrack(
        track as MicrophonePublication | undefined,
      );
    } else {
      this.#resetVoiceProcessors();
    }

    return track;
  }

  async connect(channel: Channel, auth?: { url: string; token: string }) {
    debugLog("PTT-WEB", "Voice.connect() called for channel:", channel.id);

    // Reset reconnect state on new connection attempt
    this.#isManualDisconnect = false;
    this.#reconnectAttempts = 0;

    this.disconnect(false);

    const room = new Room({
      audioCaptureDefaults: {
        deviceId: this.#settings.preferredAudioInputDevice,
        echoCancellation: this.#settings.echoCancellation,
        noiseSuppression: this.#settings.noiseSupression === "browser",
        autoGainControl: this.#settings.autoGainControl,
        // force mono capture
        channelCount: { ideal: 1 },
      },
      audioOutput: {
        deviceId: this.#settings.preferredAudioOutputDevice,
      },
      videoCaptureDefaults: {
        deviceId: this.#settings.preferredVideoDevice,
      },
    });
    let participantNotificationsReady = false;

    this.vidTracks = useTracks(
      [
        { source: Track.Source.Camera, withPlaceholder: true },
        { source: Track.Source.ScreenShare, withPlaceholder: false },
      ],
      { room, onlySubscribed: false },
    );

    batch(() => {
      this.#setRoom(room);
      this.#setChannel(channel);
      this.#setState("CONNECTING");
      this.#setVideo(false);
      this.#setScreenshare(false);
    });

    room.addListener(RoomEvent.Connected, () => {
      debugLog("PTT-WEB", "Room connected");
      this.#setState("CONNECTED");
      this.#reconnectAttempts = 0; // Reset on successful connection
      console.log("[VoiceNotifications] Playing self join sound");
      voiceNotifications.playSelfJoin();
      if (this.speakingPermission) {
        const pttActive =
          this.#settings.pushToTalkEnabled &&
          !!window.pushToTalk?.getCurrentState().active;
        const targetMicEnabled =
          !this.#settings.deafen &&
          (this.#settings.pushToTalkEnabled ? pttActive : this.#settings.micOn);

        this.#setMicrophoneEnabled(targetMicEnabled, {
          persistPreference:
            !this.#settings.pushToTalkEnabled && !this.#settings.deafen,
        }).then((track) => {
          if (targetMicEnabled && !track?.audioTrack) {
            console.warn(
              "[Voice] Microphone enabled but no audio track was returned.",
            );
          }
        });
      }

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

    room.addListener(RoomEvent.SignalReconnecting, () => {
      debugLog("PTT-WEB", "Room signal reconnecting");
      this.#setState("RECONNECTING");
    });

    room.addListener(RoomEvent.Reconnecting, () => {
      debugLog("PTT-WEB", "Room reconnecting");
      this.#setState("RECONNECTING");
    });

    room.addListener(RoomEvent.Reconnected, () => {
      debugLog("PTT-WEB", "Room reconnected");
      this.#setState("CONNECTED");
      this.#reconnectAttempts = 0;

      if (this.#suppressedReconnectJoinsClearTimeout) {
        clearTimeout(this.#suppressedReconnectJoinsClearTimeout);
      }

      this.#suppressedReconnectJoinsClearTimeout = setTimeout(() => {
        this.#suppressedReconnectJoins.clear();
        this.#suppressedReconnectJoinsClearTimeout = undefined;
      }, 0);
    });

    room.addListener(RoomEvent.ParticipantConnected, (participant) => {
      const pendingLeaveNotification = this.#pendingLeaveNotifications.get(
        participant.identity,
      );
      if (pendingLeaveNotification) {
        clearTimeout(pendingLeaveNotification);
        this.#pendingLeaveNotifications.delete(participant.identity);
      }

      if (this.#suppressedReconnectJoins.delete(participant.identity)) return;

      if (!participantNotificationsReady) return;
      if (participant.identity === this.getClient().user?.id) return;

      console.log("[VoiceNotifications] Playing join sound");
      voiceNotifications.playJoin();
    });

    room.addListener(RoomEvent.ParticipantDisconnected, (participant) => {
      if (!participantNotificationsReady) return;
      if (participant.identity === this.getClient().user?.id) return;

      const timeout = setTimeout(() => {
        this.#pendingLeaveNotifications.delete(participant.identity);
        if (room.state !== ConnectionState.Connected) {
          this.#suppressedReconnectJoins.add(participant.identity);
          return;
        }

        console.log("[VoiceNotifications] Playing leave sound");
        voiceNotifications.playLeave();
      }, 0);

      this.#pendingLeaveNotifications.set(participant.identity, timeout);
    });

    room.addListener(RoomEvent.Disconnected, (reason?) => {
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
    participantNotificationsReady = true;
    debugLog(
      "PTT-WEB",
      "Room connected successfully, mic state:",
      room.localParticipant.isMicrophoneEnabled,
    );
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

  /** Update the noise gate threshold live (called from settings UI). */
  updateNoiseGateThreshold(threshold: number) {
    if (this.#noiseGateProcessor) {
      this.#noiseGateProcessor.threshold = threshold;
    }
  }

  /** Get the active noise gate processor (for the live level meter). */
  get noiseGateProcessor(): NoiseGateProcessor | undefined {
    return this.#noiseGateProcessor;
  }

  disconnect(manual: boolean = true) {
    try {
      const room = this.room();
      if (!room) return;

      // Internal disconnects during channel switches should not disable reconnects.
      this.#isManualDisconnect = manual;
      this.#reconnectAttempts = 0;

      // Clean up noise gate processor
      this.#noiseGateProcessor?.destroy();
      this.#noiseGateProcessor = undefined;

      voiceNotifications.playSelfLeave();

      room.removeAllListeners();
      this.#pendingLeaveNotifications.forEach((timeout) =>
        clearTimeout(timeout),
      );
      this.#pendingLeaveNotifications.clear();
      this.#suppressedReconnectJoins.clear();
      if (this.#suppressedReconnectJoinsClearTimeout) {
        clearTimeout(this.#suppressedReconnectJoinsClearTimeout);
        this.#suppressedReconnectJoinsClearTimeout = undefined;
      }
      room.disconnect();

      batch(() => {
        this.#setState("READY");
        this.#setRoom();
        this.#setChannel();
        this.#setMicrophone(this.#settings.micOn);
        this.#setFullscreen(false);
        this.vidTracks = () => [];
      });
    } catch (e) {
      this.onErr(e);
    }
  }

  async toggleDeafen() {
    const willDeafen = !this.#settings.deafen;
    this.#settings.deafen = willDeafen;

    if (willDeafen) {
      // Save current mic state so we can restore it on undeafen
      this.#micWasOnBeforeDeafen = this.microphone();

      // Mute the mic when deafening
      const room = this.room();
      if (room && room.localParticipant.isMicrophoneEnabled) {
        await this.#setMicrophoneEnabled(false, { persistPreference: false });
      }
    } else {
      // Restore mic to its previous state when undeafening
      if (this.#micWasOnBeforeDeafen) {
        const shouldRestoreMic =
          !this.#settings.pushToTalkEnabled ||
          !!window.pushToTalk?.getCurrentState().active;

        if (!shouldRestoreMic) {
          return;
        }

        const room = this.room();
        if (room) {
          await this.#setMicrophoneEnabled(true, { persistPreference: false });
        }
      }
    }
  }

  async toggleMute() {
    try {
      const room = this.room();
      if (!room) throw "invalid state";

      // if user is deafened, don't allow them to unmute
      if (this.deafen()) {
        debugLog("PTT-WEB", "Cannot unmute while deafened");
        return;
      }

      await this.#setMicrophoneEnabled(
        !room.localParticipant.isMicrophoneEnabled,
        { persistPreference: true },
      );

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
    } catch (e) {
      this.onErr(e);
    }
  }

  /**
   * Set microphone mute state directly (for push-to-talk)
   * @param enabled true to unmute, false to mute
   */
  async setMute(enabled: boolean) {
    // serialize concurrent setMute calls to prevent race conditions
    let resolve!: () => void;
    const prev = this.#mutePromise;
    this.#mutePromise = new Promise<void>((r) => {
      resolve = r;
    });
    await prev;
    try {
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

      // Re-read state inside the mutex - it may have changed while we waited.
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
        await this.#setMicrophoneEnabled(enabled, { persistPreference: false });
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
    } finally {
      resolve();
    }
  }

  async toggleCamera() {
    try {
      const room = this.room();
      if (!room) throw "invalid state";
      await room.localParticipant.setCameraEnabled(
        !room.localParticipant.isCameraEnabled,
      );

      this.#setVideo(room.localParticipant.isCameraEnabled);
    } catch (e) {
      this.onErr(e);
    }
  }

  /**
   * Get the enabled screen share qualities. "low" will always be enabled.
   * Each screen share quality is checked against the limit if the limit is available on the client.
   *
   * TODO: Translate the fullNames here, I can't figure out how to do it.
   *
   * @param name The name of the screen share quality to get
   * @returns A partial record of ScreenShareQualityName to ScreenShareQuality. Will always contain "low" quality.
   */
  getEnabledScreenShareQualities(): Partial<
    Record<ScreenShareQualityName, ScreenShareQuality>
  > {
    // Always enable low
    const qualities: Partial<
      Record<ScreenShareQualityName, ScreenShareQuality>
    > = {
      low: {
        name: "low",
        resolution: ScreenSharePresets.h720fps30.resolution,
        fullName: `720p 30FPS`,
        contentHint: "motion",
      },
    };

    if (this.getClient().configured()) {
      // TODO: Use new user limits if the user is new - I don't think there's a way to do that now?
      const limit =
        this.getClient().configuration?.features.limits.default
          .video_resolution;

      // TODO: Add more resolutions to stream from if they're enabled. May tie into premium users in the future?
      if (limit) {
        if (
          (limit[0] === 0 || limit[0] >= 1920) &&
          (limit[1] === 0 || limit[1] >= 1080)
        ) {
          qualities.high = {
            name: "high",
            resolution: ScreenSharePresets.h1080fps30.resolution,
            fullName: `1080p 30FPS`,
            contentHint: "motion",
          };
          const originalResolution = ScreenSharePresets.original.resolution;
          originalResolution.frameRate = 5;
          originalResolution.aspectRatio = 0;
          if (this.getClient().configured()) {
            // TODO: Use new user limits if the user is new - I don't think there's a way to do that now?
            const limit =
              this.getClient().configuration?.features.limits.default
                .video_resolution;
            if (limit) {
              originalResolution.width = limit[0];
              originalResolution.height = limit[1];
              // If both resolutions are limited, set aspect ratio
              if (
                originalResolution.height !== 0 &&
                originalResolution.width !== 0
              ) {
                originalResolution.aspectRatio =
                  originalResolution.width / originalResolution.height;
              }
            }
          }
          qualities.text = {
            name: "text",
            resolution: originalResolution,
            fullName: `Source 5FPS`,
            contentHint: "text",
          };
        }
      }
    }
    return qualities;
  }

  async toggleScreenshare() {
    const room = this.room();
    if (!room) throw "invalid state";

    if (this.screenshare()) {
      await room.localParticipant.setScreenShareEnabled(false);

      this.#setScreenshare(room.localParticipant.isScreenShareEnabled);
    } else {
      const qualities = this.getEnabledScreenShareQualities();
      let screenPickerQualityName: ScreenShareQualityName | undefined;
      let screenPickerAudio: boolean | undefined;

      // Register the modal on screen picker handler if it exists
      if (window.native && window.native.onceScreenPicker) {
        window.native.onceScreenPicker((sources) => {
          this.openModal({
            type: "screen_share_picker",
            onCancel: () => {
              window.native.screenPickerCallback(-1, false);
            },
            callback: (
              idx: number,
              qualityName: ScreenShareQualityName,
              audio: boolean,
            ) => {
              window.native.screenPickerCallback(idx, audio);
              screenPickerQualityName = qualityName;
              screenPickerAudio = audio;
            },
            sources: sources,
            qualities: Object.keys(qualities).map((k) => {
              const v = qualities[k as ScreenShareQualityName]!;
              return { name: k, fullName: v.fullName };
            }),
          });
        });
      }

      try {
        const localTrack = await room.localParticipant.setScreenShareEnabled(
          true,
          {
            resolution:
              this.getEnabledScreenShareQualities()[
                this.#settings.screenShareQuality || "low"
              ]?.resolution,
            audio: true,
          },
        );

        const screenAudioTrack = room.localParticipant.getTrackPublication(
          Track.Source.ScreenShareAudio,
        );

        this.#setScreenshare(room.localParticipant.isScreenShareEnabled);

        if (localTrack) {
          // This event is only fired if the screen share is ended by closing the window being streamed.
          // This catches the ending and disables screen sharing on our side. If this weren't here,
          // livekit would still share stream audio after closing the window being streamed.
          localTrack.on("ended", () => {
            this.toggleScreenshare();
            const oldAudioTrack = room.localParticipant.getTrackPublication(
              Track.Source.ScreenShareAudio,
            );
            if (oldAudioTrack && oldAudioTrack.track) {
              room.localParticipant.unpublishTrack(oldAudioTrack.track);
            }
          });

          const callback = async (
            qualityName: ScreenShareQualityName,
            audio: boolean,
          ) => {
            const quality = qualities[qualityName] || qualities.low!;

            if (localTrack.videoTrack) {
              await localTrack.videoTrack.mediaStreamTrack.applyConstraints({
                frameRate: { max: quality.resolution.frameRate },
                width:
                  quality.resolution.width === 0
                    ? undefined
                    : { max: quality.resolution.width },
                height:
                  quality.resolution.height === 0
                    ? undefined
                    : { max: quality.resolution.height },
              });
              localTrack.videoTrack.mediaStreamTrack.contentHint =
                quality.contentHint;
              if (!audio && screenAudioTrack?.track) {
                room.localParticipant.unpublishTrack(screenAudioTrack.track);
              }
            }
          };

          if (screenPickerQualityName) {
            callback(
              screenPickerQualityName || "low",
              screenPickerAudio || false,
            );
          } else if (this.#settings.screenShareQualityAsk) {
            if (Object.keys(qualities).length > 1) {
              localTrack.pauseUpstream();
              screenAudioTrack?.pauseUpstream();
              this.openModal({
                onCancel: async () => {
                  await room.localParticipant.setScreenShareEnabled(false);
                  this.#setScreenshare(
                    room.localParticipant.isScreenShareEnabled,
                  );
                },
                type: "screen_share_settings",
                trackReference: {
                  participant: room.localParticipant,
                  publication: localTrack,
                  source: Track.Source.ScreenShare,
                },
                qualities: Object.keys(qualities).map((k) => {
                  const v = qualities[k as ScreenShareQualityName]!;
                  return { name: k, fullName: v.fullName };
                }),
                audio: !!screenAudioTrack,
                callback: async (qualityName, audio) => {
                  callback(qualityName, audio);
                  localTrack.resumeUpstream();
                  if (audio) {
                    screenAudioTrack?.resumeUpstream();
                  }
                },
              });
            } else {
              callback(
                this.#settings.screenShareQuality || "low",
                this.#settings.screenShareAudio,
              );
            }
          }
        }
      } catch (e) {
        this.onErr(e);
      }
    }
  }

  toggleFullscreen(fullscreen: boolean = !this.fullscreen()) {
    this.#setFullscreen(fullscreen);
  }

  trackId(t: TrackReferenceOrPlaceholder) {
    return `${t.source}_${t.participant.sid}`;
  }

  toggleFocus(t?: TrackReferenceOrPlaceholder) {
    const id = t ? this.trackId(t) : undefined;
    this.#setFocus(
      this.focusId() === id || this.vidTracks().length < 2 ? undefined : id,
    );
  }

  isFocus(t: TrackReferenceOrPlaceholder) {
    return this.trackId(t) === this.focusId();
  }

  focusTrack() {
    const id = this.focusId();
    return id
      ? this.vidTracks().find((t) => this.trackId(t) === id)
      : undefined;
  }

  toggleShowBar() {
    this.#setShowBar((s) => !s);
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

  private onErr(e: unknown) {
    if ((e as Error).name !== "NotAllowedError")
      this.openModal({ type: "error2", error: e });
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
  const modals = useModals();
  const voice = new Voice(state.voice, modals);
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

        // Incoming call: someone joined a DM/Group voice channel we're not in
        if (
          (channel.type === "DirectMessage" || channel.type === "Group") &&
          !voice.channel()
        ) {
          // Already showing an incoming call popup — don't stack another
          if (incomingCall()) return;

          // Cooldown: don't re-trigger for a channel we just dismissed
          const lastDismissed = recentlyDismissed.get(channel.id);
          if (lastDismissed && Date.now() - lastDismissed < DISMISS_COOLDOWN)
            return;

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

  // Periodically reconnect the WebSocket so the Ready event clears any ghost
  // voice participants. Skip during active calls to avoid disrupting real-time
  // events (messages, typing, presence).
  const voiceRefreshInterval = setInterval(
    () => {
      if (voice.channel()) return;
      client()?.events.disconnect();
    },
    10 * 60 * 1000,
  );
  onCleanup(() => clearInterval(voiceRefreshInterval));

  // Manual reconnect for debugging ghost cleanup from DevTools:
  //   stoatRefreshVoice()
  window.stoatRefreshVoice = () => {
    console.log("[VoiceState] Manual reconnect triggered");
    client()?.events.disconnect();
  };

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

  // sync noise gate threshold live
  createEffect(() => {
    const threshold = state.voice.noiseGateThreshold;
    voice.updateNoiseGateThreshold(threshold);
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
