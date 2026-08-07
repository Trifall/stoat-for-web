import {
  Accessor,
  JSX,
  Setter,
  Show,
  batch,
  createContext,
  createEffect,
  createRoot,
  createSignal,
  onCleanup,
  onMount,
  useContext,
} from "solid-js";
import {
  RoomContext,
  TrackReferenceOrPlaceholder,
  isTrackReference,
  useTracks,
} from "solid-livekit-components";

import {
  ConnectionState,
  LocalTrackPublication,
  MediaDeviceFailure,
  Room,
  RoomEvent,
  Track,
  TrackInvalidError,
} from "livekit-client";
import { Channel } from "stoat.js";

import { NoiseGateProcessor } from "./NoiseGateProcessor";
import { VoiceProcessor } from "./VoiceProcessor";

import { type SoundController, useClient, useSound } from "@revolt/client";
import { CONFIGURATION } from "@revolt/common";
import { useInstance } from "@revolt/instance";
import { ModalController, useModals } from "@revolt/modal";
import { useNavigate } from "@revolt/routing";
import { useState } from "@revolt/state";
import {
  NoiseSuppresionState,
  ScreenShareQualityName,
  Voice as VoiceSettings,
} from "@revolt/state/stores/Voice";
import { VoiceCallCardContext } from "@revolt/ui/components/features/voice/callCard/VoiceCallCard";
import { ScreenSharePresets, VideoResolution } from "livekit-client";

import { InRoom } from "./components/InRoom";
import { RoomAudioManager } from "./components/RoomAudioManager";

const debugLog = (prefix: string, ...args: unknown[]) => {
  if (import.meta.env.DEV) {
    console.log(`[${prefix}]`, ...args);
  }
};

declare global {
  interface Window {
    stoatRefreshVoice?: () => void;
  }
}

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

  #reconnectAttempts = 0;
  #maxReconnectAttempts = 5;
  #micWasOnBeforeDeafen = false;
  #noiseGateProcessor?: NoiseGateProcessor;
  #pushToTalkActive = false;
  #mutePromise: Promise<void> = Promise.resolve();
  #microphonePermissionPromise?: Promise<void>;
  #voiceProcessingPromise: Promise<void> = Promise.resolve();
  #mediaDevicesChangeHandler?: () => void;
  #pendingLeaveNotifications = new Map<string, ReturnType<typeof setTimeout>>();
  #suppressedReconnectJoins = new Set<string>();
  #suppressedReconnectJoinsClearTimeout?: ReturnType<typeof setTimeout>;
  #reconnectTimeout?: ReturnType<typeof setTimeout>;
  #connectionGeneration = 0;
  #disposeTracks?: () => void;
  #disposed = false;

  fullscreen: Accessor<boolean>;
  #setFullscreen: Setter<boolean>;

  maximized: Accessor<boolean>;
  #setMaximized: Setter<boolean>;

  hideNonVideoParticipants: Accessor<boolean>;
  #setHideNonVideoParticipants: Setter<boolean>;

  focusId: Accessor<string | undefined>;
  #setFocus: Setter<string | undefined>;

  showBar: Accessor<boolean>;
  #setShowBar: Setter<boolean>;

  private openModal;
  private getClient;
  private config;
  private limits;
  private screenShareTracks: Set<string>;
  private voiceProcessor?: VoiceProcessor;

  private sound: SoundController;

  constructor(
    voiceSettings: VoiceSettings,
    modals: ModalController,
    sound: SoundController,
  ) {
    this.#settings = voiceSettings;
    this.sound = sound;

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

    const [microphone, setMicrophone] = createSignal(
      voiceSettings.micOn && !voiceSettings.deafen,
    );
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

    const [maximized, setMaximized] = createSignal(false);
    this.maximized = maximized;
    this.#setMaximized = setMaximized;

    const [hideNonVideoParticipants, setHideNonVideoParticipants] =
      createSignal(false);
    this.hideNonVideoParticipants = hideNonVideoParticipants;
    this.#setHideNonVideoParticipants = setHideNonVideoParticipants;

    const [focus, setFocus] = createSignal<string>();
    this.focusId = focus;
    this.#setFocus = setFocus;

    const [showBar, setShowBar] = createSignal(true);
    this.showBar = showBar;
    this.#setShowBar = setShowBar;

    const inst = useInstance();
    this.config = inst.config;
    this.limits = inst.limits;
    this.openModal = modals.openModal;
    this.getClient = useClient();

    this.screenShareTracks = new Set();

    // Setup settings listeners
    this.settingsListeners();
  }

  // Dynamically set echo cancellation and gain control when the settings are changed
  // These functions are needed to maintain reactivity. Don't ask me why but if you make them not functions it breaks.
  private settingsListeners() {
    const getSettings = () => this.#settings;

    const setEchoCancellation = (echoCancellation: boolean) => {
      const track = this.getMicrophoneTrack()?.audioTrack;
      if (track) {
        track.constraints.echoCancellation = echoCancellation;
      }
    };

    const setAutoGainControl = (autoGainControl: boolean) => {
      const track = this.getMicrophoneTrack()?.audioTrack;
      if (track) {
        track.constraints.autoGainControl = autoGainControl;
      }
    };

    const setNoiseSuppression = (noiseSuppression: NoiseSuppresionState) => {
      const track = this.getMicrophoneTrack()?.audioTrack;
      if (track) {
        if (noiseSuppression === "browser") {
          track.constraints.noiseSuppression = true;
          //@ts-expect-error voiceIsolation is not yet standard, but it supported by livekit and most chromium based browsers, including electron.
          track.constraints.voiceIsolation = true;
        } else {
          track.constraints.noiseSuppression = false;
          //@ts-expect-error voiceIsolation is not yet standard, but it supported by livekit and most chromium based browsers, including electron.
          track.constraints.voiceIsolation = false;
        }
      }
    };

    const restartTrack = () => {
      const track = this.getMicrophoneTrack()?.audioTrack;
      if (track) {
        track.restartTrack();
      }
    };

    createEffect(() => {
      setEchoCancellation(getSettings().echoCancellation ?? true);
      setAutoGainControl(getSettings().autoGainControl ?? true);
      setNoiseSuppression(getSettings().noiseSupression ?? "browser");
      restartTrack();
    });
  }

  #resetVoiceProcessors() {
    this.#noiseGateProcessor?.destroy();
    this.#noiseGateProcessor = undefined;
  }

  #microphoneCaptureOptions() {
    return {
      deviceId: this.#settings.preferredAudioInputDevice,
      echoCancellation: this.#settings.echoCancellation,
      noiseSuppression: this.#settings.noiseSupression === "browser",
      autoGainControl: this.#settings.autoGainControl,
      voiceIsolation: this.#settings.noiseSupression === "browser",
      channelCount: { ideal: 1 },
    };
  }

  #primeMicrophonePermission() {
    const mediaDevices = navigator.mediaDevices;
    if (!mediaDevices || this.#microphonePermissionPromise) return;

    const preferredDevice = this.#settings.preferredAudioInputDevice;
    this.#microphonePermissionPromise = mediaDevices
      .getUserMedia({
        audio: {
          ...this.#microphoneCaptureOptions(),
          deviceId: preferredDevice ? { ideal: preferredDevice } : undefined,
        },
      })
      .then((stream) => {
        stream.getTracks().forEach((track) => track.stop());
      })
      .catch((error) => {
        debugLog(
          "PTT-WEB",
          "Failed to eagerly request mic permissions:",
          error,
        );
      })
      .finally(() => {
        this.#microphonePermissionPromise = undefined;
      });
  }

  #createMicrophoneProcessor() {
    if (this.#settings.noiseGateEnabled) {
      const upstream = new VoiceProcessor(this.#settings);

      this.#noiseGateProcessor = new NoiseGateProcessor({
        threshold: this.#settings.noiseGateThreshold,
        upstream,
      });
      return this.#noiseGateProcessor;
    }

    return (this.voiceProcessor = new VoiceProcessor(this.#settings));
  }

  #isUnavailableMicrophoneError(error: unknown) {
    if (!error || typeof error !== "object") return false;

    return (
      MediaDeviceFailure.getFailure(error) === MediaDeviceFailure.NotFound ||
      (error instanceof DOMException &&
        error.name === "OverconstrainedError") ||
      error instanceof TrackInvalidError
    );
  }

  async #switchToDefaultMicrophone(room: Room) {
    this.#settings.preferredAudioInputDevice = undefined;
    await room.switchActiveDevice("audioinput", "default", false);
  }

  #handleMicrophoneError(error: unknown) {
    const room = this.room();
    const audioTrack = room?.localParticipant.getTrackPublication(
      Track.Source.Microphone,
    )?.audioTrack;
    this.#setMicrophone(
      !!audioTrack &&
        audioTrack.mediaStreamTrack.readyState === "live" &&
        room.localParticipant.isMicrophoneEnabled,
    );

    if (this.#isUnavailableMicrophoneError(error)) {
      console.warn("[Voice] Microphone is currently unavailable:", error);
    } else {
      this.onErr(error);
    }
  }

  async #setLiveKitMicrophoneEnabled(room: Room, enabled: boolean) {
    if (enabled && this.#microphonePermissionPromise) {
      await this.#microphonePermissionPromise;
    }

    const audioTrack = room.localParticipant.getTrackPublication(
      Track.Source.Microphone,
    )?.audioTrack;
    if (enabled && audioTrack?.mediaStreamTrack.readyState === "ended") {
      await audioTrack.restartTrack(this.#microphoneCaptureOptions());
    }

    return room.localParticipant.setMicrophoneEnabled(
      enabled,
      enabled ? this.#microphoneCaptureOptions() : undefined,
    );
  }

  async #handleMediaDevicesChanged(room: Room) {
    try {
      const devices = await Room.getLocalDevices("audioinput", false);
      const preferredDevice = this.#settings.preferredAudioInputDevice;
      const activeDevice = room.getActiveDevice("audioinput");
      const selectedDevice = preferredDevice ?? activeDevice;

      const selectedDeviceUnavailable =
        selectedDevice !== undefined &&
        selectedDevice !== "default" &&
        !devices.some((device) => device.deviceId === selectedDevice);

      if (selectedDeviceUnavailable) {
        console.warn(
          "[Voice] Selected microphone disconnected; falling back to the default input.",
        );
        await this.#switchToDefaultMicrophone(room);
      }

      const shouldEnableMicrophone =
        !this.#settings.deafen &&
        (this.#settings.pushToTalkEnabled
          ? this.#pushToTalkActive
          : this.#settings.micOn);
      const audioTrack = room.localParticipant.getTrackPublication(
        Track.Source.Microphone,
      )?.audioTrack;
      const microphoneTrackEnded =
        audioTrack?.mediaStreamTrack.readyState === "ended";
      if (
        devices.length > 0 &&
        shouldEnableMicrophone &&
        (microphoneTrackEnded || !room.localParticipant.isMicrophoneEnabled)
      ) {
        await this.setMute(true);
      }
    } catch (error) {
      this.#handleMicrophoneError(error);
    }
  }

  async #configureMicrophoneTrack(track?: MicrophonePublication) {
    const audioTrack = track?.audioTrack;
    if (!audioTrack) return;
    if (audioTrack.getProcessor()) return;

    this.#resetVoiceProcessors();

    const settings = audioTrack.mediaStreamTrack.getSettings();
    if (settings.channelCount && settings.channelCount > 1) {
      console.warn(
        "[Voice] Mic track is stereo (channelCount:",
        settings.channelCount,
        ") - remote participants may hear audio in one ear only.",
      );
    }

    const processor = this.#createMicrophoneProcessor();
    if (processor) {
      console.info(
        "[Voice] Applying processor to audio track:",
        audioTrack.sid,
      );
      await audioTrack.setProcessor(processor as never);
    }
  }

  async #setMicrophoneEnabled(
    enabled: boolean,
    options: { persistPreference?: boolean } = {},
  ) {
    const room = this.room();
    if (!room) throw "invalid state";

    let track: Awaited<
      ReturnType<Room["localParticipant"]["setMicrophoneEnabled"]>
    >;
    try {
      track = await this.#setLiveKitMicrophoneEnabled(room, enabled);
    } catch (error) {
      const preferredDevice = this.#settings.preferredAudioInputDevice;
      const shouldRetryWithDefault =
        enabled &&
        preferredDevice !== undefined &&
        this.#isUnavailableMicrophoneError(error);

      if (!shouldRetryWithDefault) throw error;

      console.warn(
        "[Voice] Could not use the selected microphone; retrying with the default input.",
      );
      await this.#switchToDefaultMicrophone(room);
      track = await this.#setLiveKitMicrophoneEnabled(room, true);
    }

    if (
      enabled &&
      (this.deafen() ||
        (this.#settings.pushToTalkEnabled && !this.#pushToTalkActive))
    ) {
      enabled = false;
      if (track?.audioTrack) {
        track.audioTrack.mediaStreamTrack.enabled = false;
      }
      await this.#setLiveKitMicrophoneEnabled(room, false);
    }

    const isEnabled = enabled && typeof track !== "undefined";

    this.#setMicrophone(isEnabled);

    if (options.persistPreference ?? true) {
      this.#settings.micOn = isEnabled;
    }

    if (isEnabled) {
      await this.#configureMicrophoneTrack(
        track as MicrophonePublication | undefined,
      );

      const audioTrack = track?.audioTrack;
      if (audioTrack) {
        audioTrack.mediaStreamTrack.enabled =
          !this.deafen() &&
          (!this.#settings.pushToTalkEnabled || this.#pushToTalkActive);
      }
    }

    return track;
  }

  async #selectLiveKitNode(): Promise<string> {
    const nodes = this.config.features.livekit.nodes;
    if (!nodes.length) return "worldwide";

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);

    try {
      return await Promise.any(
        nodes.map(async (node) => {
          const url = new URL(node.public_url);
          if (url.protocol === "wss:") url.protocol = "https:";
          if (url.protocol === "ws:") url.protocol = "http:";

          const response = await fetch(url, { signal: controller.signal });
          if (!response.ok) {
            throw new Error(`${node.name} returned HTTP ${response.status}`);
          }

          return node.name;
        }),
      );
    } catch (error) {
      debugLog(
        "PTT-WEB",
        "LiveKit node selection failed, using worldwide:",
        error,
      );
      return "worldwide";
    } finally {
      clearTimeout(timeout);
      controller.abort();
    }
  }

  async connect(channel: Channel, auth?: { url: string; token: string }) {
    debugLog("PTT-WEB", "Voice.connect() called for channel:", channel.id);

    // Start capture during this trusted UI gesture without making connection
    // progress depend on the user answering the permission prompt.
    if (
      window.pushToTalk &&
      this.#settings.pushToTalkEnabled &&
      channel.havePermission("Speak")
    ) {
      this.#primeMicrophonePermission();
    }

    // Reset reconnect state on new connection attempt
    this.#reconnectAttempts = 0;

    this.disconnect(false);
    const connectionGeneration = this.#connectionGeneration;

    const room = new Room({
      audioCaptureDefaults: {
        ...this.#microphoneCaptureOptions(),
      },
      audioOutput: {
        deviceId: this.#settings.preferredAudioOutputDevice,
      },
      videoCaptureDefaults: {
        deviceId: this.#settings.preferredVideoDevice,
      },
    });
    this.#mediaDevicesChangeHandler = () => {
      void this.#handleMediaDevicesChanged(room);
    };
    navigator.mediaDevices?.addEventListener(
      "devicechange",
      this.#mediaDevicesChangeHandler,
    );
    let participantNotificationsReady = false;

    this.vidTracks = createRoot((dispose) => {
      this.#disposeTracks = dispose;
      return useTracks(
        [
          { source: Track.Source.Camera, withPlaceholder: true },
          { source: Track.Source.ScreenShare, withPlaceholder: false },
        ],
        { room, onlySubscribed: false },
      );
    });

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
      this.#reconnectAttempts = 0;
      console.log("[VoiceNotifications] Playing self join sound");
      this.sound.playSound("selfJoinVoice");
      for (const p of room.remoteParticipants.values()) {
        const screenShareTrack = p.getTrackPublication(
          Track.Source.ScreenShare,
        );
        if (screenShareTrack) {
          this.screenShareTracks.add(screenShareTrack.trackSid);
        }
      }
      if (this.speakingPermission) {
        if (this.#settings.pushToTalkEnabled) {
          this.setPushToTalkActive(
            !!window.pushToTalk?.getCurrentState().active,
          );
        } else {
          const targetMicEnabled =
            !this.#settings.deafen && this.#settings.micOn;
          this.#setMicrophoneEnabled(targetMicEnabled, {
            persistPreference: !this.#settings.deafen,
          })
            .then((track) => {
              if (targetMicEnabled && !track?.audioTrack) {
                console.warn(
                  "[Voice] Microphone enabled but no audio track was returned.",
                );
              }
            })
            .catch((error) => this.#handleMicrophoneError(error));
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
      this.sound.playSound("userJoinVoice");
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
        this.sound.playSound("userLeaveVoice");
      }, 0);

      this.#pendingLeaveNotifications.set(participant.identity, timeout);
    });

    room.addListener("localTrackPublished", (pub) => {
      if (pub.audioTrack && pub.audioTrack.source === Track.Source.Microphone) {
        if (!pub.audioTrack.getProcessor()) {
          pub.audioTrack?.setProcessor(
            (this.voiceProcessor = new VoiceProcessor(this.#settings)),
          );
        }
      }
    });

    room.addListener(RoomEvent.Disconnected, (reason?) => {
      debugLog("PTT-WEB", "Room disconnected, reason:", reason);

      if (!this.#settings.autoReconnect) {
        debugLog("PTT-WEB", "Auto-reconnect disabled");
        this.#setState("DISCONNECTED");
        if (this.#settings.soundDisconnect) {
          this.sound.playSound("disconnect");
        }
        return;
      }

      void this.#handleReconnect(connectionGeneration);
    });

    room.addListener("trackPublished", (pub) => {
      if (pub.source === Track.Source.ScreenShare) {
        pub.once("subscribed", (track) => {
          track.once("videoPlaybackStarted", () => {
            this.sound.playSound("streamStart");
            if (track.sid) {
              this.screenShareTracks.add(track.sid);
            }
          });
        });
      }
    });

    room.addListener("trackUnpublished", (unpub) => {
      if (this.screenShareTracks.has(unpub.trackSid)) {
        this.sound.playSound("streamEnd");
        this.screenShareTracks.delete(unpub.trackSid);
      }
    });

    try {
      if (!auth) {
        auth = await channel.joinCall(await this.#selectLiveKitNode());
      }

      if (connectionGeneration !== this.#connectionGeneration) {
        room.removeAllListeners();
        void room.disconnect();
        return;
      }

      debugLog("PTT-WEB", "Connecting to room...");
      await room.connect(auth.url, auth.token, {
        autoSubscribe: false,
      });

      if (connectionGeneration !== this.#connectionGeneration) {
        room.removeAllListeners();
        void room.disconnect();
        return;
      }

      participantNotificationsReady = true;
      debugLog(
        "PTT-WEB",
        "Room connected successfully, mic state:",
        room.localParticipant.isMicrophoneEnabled,
      );
    } catch (error) {
      room.removeAllListeners();
      void room.disconnect();

      if (
        connectionGeneration === this.#connectionGeneration &&
        this.room() === room
      ) {
        this.disconnect(false);
        this.onErr(error);
      }
    }
  }

  async #handleReconnect(connectionGeneration = this.#connectionGeneration) {
    if (this.#disposed || connectionGeneration !== this.#connectionGeneration)
      return;

    const channel = this.channel();
    const room = this.room();
    if (!channel) {
      debugLog("PTT-WEB", "No channel to reconnect to");
      this.#setState("DISCONNECTED");
      if (this.#settings.soundDisconnect) {
        this.sound.playSound("disconnect");
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
      const auth = await channel.joinCall(await this.#selectLiveKitNode());

      if (!room) {
        throw new Error("Room no longer exists");
      }
      if (
        connectionGeneration !== this.#connectionGeneration ||
        room !== this.room()
      )
        return;

      debugLog("PTT-WEB", "Attempting to reconnect with new token...");
      await room.connect(auth.url, auth.token, {
        autoSubscribe: false,
      });

      if (
        connectionGeneration !== this.#connectionGeneration ||
        room !== this.room()
      )
        return;

      debugLog("PTT-WEB", "Reconnection successful!");
      this.#reconnectAttempts = 0;
      this.#setState("CONNECTED");
    } catch (error) {
      if (
        connectionGeneration !== this.#connectionGeneration ||
        room !== this.room()
      )
        return;

      debugLog("PTT-WEB", "Reconnection failed:", error);

      if (this.#reconnectAttempts < this.#maxReconnectAttempts) {
        // Try again with exponential backoff
        const delay = Math.min(
          1000 * Math.pow(2, this.#reconnectAttempts),
          10000,
        );
        debugLog("PTT-WEB", `Retrying in ${delay}ms...`);

        this.#reconnectTimeout = setTimeout(() => {
          this.#reconnectTimeout = undefined;
          void this.#handleReconnect(connectionGeneration);
        }, delay);
      } else {
        // Max attempts reached, give up
        debugLog("PTT-WEB", "Max reconnection attempts reached");
        this.#setState("DISCONNECTED");
        if (this.#settings.soundDisconnect) {
          this.sound.playSound("disconnect");
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

  updateVoiceProcessing() {
    const applySettings = async () => {
      const room = this.room();
      const publication = room?.localParticipant.getTrackPublication(
        Track.Source.Microphone,
      );
      const audioTrack = publication?.audioTrack;
      if (!audioTrack || !room?.localParticipant.isMicrophoneEnabled) return;

      if (audioTrack.getProcessor()) {
        await audioTrack.stopProcessor();
      }
      this.#noiseGateProcessor = undefined;

      await audioTrack.restartTrack(this.#microphoneCaptureOptions());
      await this.#configureMicrophoneTrack(
        publication as MicrophonePublication,
      );
    };

    this.#voiceProcessingPromise = this.#voiceProcessingPromise
      .then(applySettings, applySettings)
      .catch((error) => this.#handleMicrophoneError(error));
    return this.#voiceProcessingPromise;
  }

  setPushToTalkActive(active: boolean) {
    this.#pushToTalkActive = active;

    if (this.#settings.pushToTalkEnabled) {
      if (!active) {
        const audioTrack = this.room()?.localParticipant.getTrackPublication(
          Track.Source.Microphone,
        )?.audioTrack;
        if (audioTrack) {
          audioTrack.mediaStreamTrack.enabled = false;
        }
      }
      void this.setMute(active);
    }
  }

  reconcilePushToTalk(enabled: boolean) {
    const microphoneEnabled = enabled
      ? this.#pushToTalkActive
      : !this.#settings.deafen && this.#settings.micOn;
    void this.setMute(microphoneEnabled);
  }

  disconnect(manual: boolean = true) {
    try {
      this.#connectionGeneration++;

      if (this.#reconnectTimeout) {
        clearTimeout(this.#reconnectTimeout);
        this.#reconnectTimeout = undefined;
      }

      if (this.#mediaDevicesChangeHandler) {
        navigator.mediaDevices?.removeEventListener(
          "devicechange",
          this.#mediaDevicesChangeHandler,
        );
        this.#mediaDevicesChangeHandler = undefined;
      }

      this.#reconnectAttempts = 0;
      this.#disposeTracks?.();
      this.#disposeTracks = undefined;
      this.vidTracks = () => [];

      const room = this.room();
      if (!room) return;

      // Clean up noise gate processor
      this.#noiseGateProcessor?.destroy();
      this.#noiseGateProcessor = undefined;

      if (manual) {
        this.sound.playSound("selfLeaveVoice");
      }

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
        this.#setVideo(false);
        this.#setScreenshare(false);
        this.#setFullscreen(false);
        this.#setMaximized(false);
        this.#setHideNonVideoParticipants(false);
        this.#setFocus();
        this.#setShowBar(true);
      });
      this.screenShareTracks = new Set();
    } catch (e) {
      this.onErr(e);
    }
  }

  dispose() {
    this.#disposed = true;
    this.disconnect(false);
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
      const shouldRestoreMic = this.#settings.pushToTalkEnabled
        ? this.#pushToTalkActive
        : this.#micWasOnBeforeDeafen;

      if (shouldRestoreMic) {
        const room = this.room();
        if (room) {
          await this.#setMicrophoneEnabled(true, {
            persistPreference: false,
          });
        }
      }
    }

    this.sound.playSound(willDeafen ? "deafen" : "undeafen");
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

      if (this.#settings.pushToTalkEnabled && window.pushToTalk) {
        window.pushToTalk.setManualState(!this.#pushToTalkActive);
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
          this.sound.playSound("unmute");
        } else {
          this.sound.playSound("mute");
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

      if (
        enabled &&
        this.#settings.pushToTalkEnabled &&
        !this.#pushToTalkActive
      ) {
        enabled = false;
      }

      const audioTrack = room.localParticipant.getTrackPublication(
        Track.Source.Microphone,
      )?.audioTrack;

      // if user is deafened, don't allow them to unmute
      if (this.deafen()) {
        if (audioTrack) {
          audioTrack.mediaStreamTrack.enabled = false;
        }
        debugLog("PTT-WEB", "Cannot unmute while deafened");
        return;
      }

      // Re-read state inside the mutex - it may have changed while we waited.
      const currentState = room.localParticipant.isMicrophoneEnabled;
      const microphoneTrackEnded =
        audioTrack?.mediaStreamTrack.readyState === "ended";

      if (audioTrack && currentState === enabled) {
        audioTrack.mediaStreamTrack.enabled = enabled;
      }
      debugLog(
        "PTT-WEB",
        "setMute() - current mic state:",
        currentState,
        "target:",
        enabled,
      );

      if (currentState !== enabled || (enabled && microphoneTrackEnded)) {
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
            this.sound.playSound("unmute");
          } else {
            this.sound.playSound("mute");
          }
        }
      } else {
        debugLog("PTT-WEB", "setMute() - no change needed, already:", enabled);
      }
    } catch (error) {
      this.#handleMicrophoneError(error);
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
        fullName: `720p ${Math.min(30, this.#settings.screenShareFrameRate)}FPS`,
        contentHint: "motion",
      },
    };

    const limit = this.limits().video_resolution;

    // TODO: Add more resolutions to stream from if they're enabled. May tie into premium users in the future?
    if (
      (limit[0] === 0 || limit[0] >= 1920) &&
      (limit[1] === 0 || limit[1] >= 1080)
    ) {
      qualities.high = {
        name: "high",
        resolution: ScreenSharePresets.h1080fps30.resolution,
        fullName: `1080p ${Math.min(30, this.#settings.screenShareFrameRate)}FPS`,
        contentHint: "motion",
      };
      const originalResolution = ScreenSharePresets.original.resolution;
      originalResolution.frameRate = 5;
      originalResolution.aspectRatio = 0;

      originalResolution.width = limit[0];
      originalResolution.height = limit[1];
      // If both resolutions are limited, set aspect ratio
      if (originalResolution.height !== 0 && originalResolution.width !== 0) {
        originalResolution.aspectRatio =
          originalResolution.width / originalResolution.height;
      }

      qualities.text = {
        name: "text",
        resolution: originalResolution,
        fullName: `Source ${Math.min(5, this.#settings.screenShareFrameRate)}FPS`,
        contentHint: "text",
      };
    }

    return qualities;
  }

  #screenShareResolution(quality: ScreenShareQuality): VideoResolution {
    return {
      ...quality.resolution,
      frameRate: Math.min(
        quality.resolution.frameRate ?? this.#settings.screenShareFrameRate,
        this.#settings.screenShareFrameRate,
      ),
    };
  }

  async toggleScreenshare() {
    const room = this.room();
    if (!room) throw "invalid state";

    if (this.screenshare()) {
      await room.localParticipant.setScreenShareEnabled(false);

      this.#setScreenshare(room.localParticipant.isScreenShareEnabled);

      this.sound.playSound("streamEnd");
    } else {
      const qualities = this.getEnabledScreenShareQualities();
      const initialQuality =
        qualities[this.#settings.screenShareQuality || "low"] || qualities.low!;
      const initialResolution = this.#screenShareResolution(initialQuality);
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
            resolution: initialResolution,
            audio: {
              autoGainControl: false,
              echoCancellation: false,
              noiseSuppression: false,
              voiceIsolation: false,
              restrictOwnAudio: true,
            },
          },
          {
            screenShareEncoding: {
              ...ScreenSharePresets.h1080fps15.encoding,
              maxBitrate: this.#settings.screenShareBitrateKbps * 1000,
              maxFramerate: this.#settings.screenShareFrameRate,
            },
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
            const resolution = this.#screenShareResolution(quality);

            if (localTrack.videoTrack) {
              await localTrack.videoTrack.mediaStreamTrack.applyConstraints({
                frameRate: { max: resolution.frameRate },
                width:
                  resolution.width === 0
                    ? undefined
                    : { max: resolution.width },
                height:
                  resolution.height === 0
                    ? undefined
                    : { max: resolution.height },
              });
              localTrack.videoTrack.mediaStreamTrack.contentHint =
                quality.contentHint;
              if (!audio && screenAudioTrack?.track) {
                room.localParticipant.unpublishTrack(screenAudioTrack.track);
              }
            }
          };

          if (screenPickerQualityName) {
            await callback(
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
                  try {
                    await callback(qualityName, audio);
                  } catch (error) {
                    this.onErr(error);
                  } finally {
                    try {
                      await Promise.all([
                        localTrack.resumeUpstream(),
                        audio
                          ? screenAudioTrack?.resumeUpstream()
                          : Promise.resolve(),
                      ]);
                    } catch (error) {
                      this.onErr(error);
                    }
                  }
                },
              });
            } else {
              await callback(
                this.#settings.screenShareQuality || "low",
                this.#settings.screenShareAudio,
              );
            }
          } else {
            await callback(
              this.#settings.screenShareQuality || "low",
              this.#settings.screenShareAudio,
            );
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

  toggleMaximized(maximized: boolean = !this.maximized()) {
    this.#setMaximized(maximized);
  }

  toggleHideNonVideoParticipants(
    hide: boolean = !this.hideNonVideoParticipants(),
  ) {
    this.#setHideNonVideoParticipants(hide);
  }

  isActiveVideoTrack(t: TrackReferenceOrPlaceholder) {
    return isTrackReference(t) && !t.publication.isMuted;
  }

  hasActiveVideoTracks() {
    return this.vidTracks().some((t) => this.isActiveVideoTrack(t));
  }

  visibleTracks() {
    const tracks = this.vidTracks();
    if (!this.hideNonVideoParticipants()) return tracks;

    const videoTracks = tracks.filter((t) => this.isActiveVideoTrack(t));
    return videoTracks.length ? videoTracks : tracks;
  }

  trackId(t: TrackReferenceOrPlaceholder) {
    return `${t.source}_${t.participant.sid}`;
  }

  toggleFocus(t?: TrackReferenceOrPlaceholder) {
    const id = t ? this.trackId(t) : undefined;
    this.#setFocus(
      this.focusId() === id || this.visibleTracks().length < 2 ? undefined : id,
    );
  }

  isFocus(t: TrackReferenceOrPlaceholder) {
    return this.trackId(t) === this.focusId();
  }

  focusTrack() {
    const id = this.focusId();
    return id
      ? this.visibleTracks().find((t) => this.trackId(t) === id)
      : undefined;
  }

  toggleShowBar() {
    this.#setShowBar((s) => !s);
  }

  getConnectedUser(userId: string) {
    return this.room()?.getParticipantByIdentity(userId);
  }

  showCard(channel: Channel) {
    return (
      channel.isVoice &&
      (this.channel()?.id === channel.id ||
        channel.type === "TextChannel" ||
        !!channel.voiceParticipants.size)
    );
  }

  getMicrophoneTrack(): LocalTrackPublication | undefined {
    const track = this.room()?.localParticipant.getTrackPublication(
      Track.Source.Microphone,
    );
    return track;
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
export function VoiceContext(props: { children: JSX.Element }) {
  const state = useState();
  const modals = useModals();
  const sound = useSound();
  const voice = new Voice(state.voice, modals, sound);
  const client = useClient();


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
        if (voice.room() && state.voice.pushToTalkEnabled) {
          const shouldEnableMic = e.active;
          debugLog(
            "PTT-WEB",
            "PTT active:",
            e.active,
            "-> Mic enabled:",
            shouldEnableMic,
          );
          voice.setPushToTalkActive(shouldEnableMic);
        } else {
          debugLog("PTT-WEB", "⚠ No active room, cannot mute/unmute");
          voice.setPushToTalkActive(e.active);
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
        voice.reconcilePushToTalk(config.enabled);
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
  });

  onCleanup(() => {
    voice.dispose();
  });

  // sync sound settings reactively from Sounds store
  createEffect(() => {
    const enabled = state.sounds.getEnabled();
    const volume = state.sounds.getVolume();

    sound.setEnabled(enabled);
    sound.setVolume(volume);
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
      </RoomContext.Provider>
    </voiceContext.Provider>
  );
}

export const useVoice = () => useContext(voiceContext);
