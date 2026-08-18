import { State } from "..";

import { AbstractStore } from ".";

/**
 * Possible noise suppresion states. Browser is browser noise suppresion and enhanced is machine learning suppression via RNNoise.
 */
export type NoiseSuppresionState = "disabled" | "browser" | "enhanced";

const NoiseSuppresionStates: NoiseSuppresionState[] = [
  "disabled",
  "browser",
  "enhanced",
];

/**
 * Possible screen share qualities. Low is 720p@30fps, high 1080p@30fps and text is source@5fps.
 */
export type ScreenShareQualityName = "low" | "high" | "text";

/**
 * Array of available screen share quality names.
 */
export const ScreenShareQualityNames: ScreenShareQualityName[] = [
  "low",
  "high",
  "text",
];

export const DEFAULT_SCREEN_SHARE_BITRATE_KBPS = 2500;
export const MIN_SCREEN_SHARE_BITRATE_KBPS = 250;
export const MAX_SCREEN_SHARE_BITRATE_KBPS = 8000;
export const SCREEN_SHARE_BITRATE_STEP_KBPS = 250;
export const DEFAULT_SCREEN_SHARE_FRAME_RATE = 15;
export const MIN_SCREEN_SHARE_FRAME_RATE = 5;
export const MAX_SCREEN_SHARE_FRAME_RATE = 30;
export const SCREEN_SHARE_FRAME_RATE_STEP = 5;

export function clampScreenShareBitrateKbps(value: number) {
  if (!Number.isFinite(value)) return DEFAULT_SCREEN_SHARE_BITRATE_KBPS;
  const clamped = Math.min(
    MAX_SCREEN_SHARE_BITRATE_KBPS,
    Math.max(MIN_SCREEN_SHARE_BITRATE_KBPS, value),
  );
  return (
    Math.round(clamped / SCREEN_SHARE_BITRATE_STEP_KBPS) *
    SCREEN_SHARE_BITRATE_STEP_KBPS
  );
}

export function clampScreenShareFrameRate(value: number) {
  if (!Number.isFinite(value)) return DEFAULT_SCREEN_SHARE_FRAME_RATE;
  const clamped = Math.min(
    MAX_SCREEN_SHARE_FRAME_RATE,
    Math.max(MIN_SCREEN_SHARE_FRAME_RATE, value),
  );
  return (
    Math.round(clamped / SCREEN_SHARE_FRAME_RATE_STEP) *
    SCREEN_SHARE_FRAME_RATE_STEP
  );
}

export interface TypeVoice {
  preferredAudioInputDevice?: string;
  preferredAudioOutputDevice?: string;
  preferredVideoDevice?: string;

  echoCancellation: boolean;
  noiseSupression: NoiseSuppresionState;
  autoGainControl: boolean;

  screenShareQuality: ScreenShareQualityName;
  screenShareQualityAsk: boolean;
  screenShareAudio: boolean;
  screenShareBitrateKbps: number;
  screenShareFrameRate: number;

  inputVolume: number;
  outputVolume: number;
  deafen: boolean;
  micOn: boolean;

  userVolumes: Record<string, number>;
  userMutes: Record<string, boolean>;

  screenShareVolumes: Record<string, number>;
  screenShareMutes: Record<string, boolean>;

  noiseGateEnabled: boolean;
  noiseGateThreshold: number;

  pushToTalkEnabled: boolean;
  pushToTalkKeybind: string;
  pushToTalkMode: "hold" | "toggle";
  pushToTalkReleaseDelay: number;
  pushToTalkNotificationSounds: boolean;

  notificationSoundsEnabled: boolean;
  notificationVolume: number;

  soundJoinCall: boolean;
  soundLeaveCall: boolean;
  soundSomeoneJoined: boolean;
  soundSomeoneLeft: boolean;
  soundMute: boolean;
  soundUnmute: boolean;
  soundReceiveMessage: boolean;
  soundDisconnect: boolean;

  autoReconnect: boolean;
}

/**
 * Handles enabling and disabling client experiments.
 */
export class Voice extends AbstractStore<"voice", TypeVoice> {
  /**
   * Construct store
   * @param state State
   */
  constructor(state: State) {
    super(state, "voice");
  }

  /**
   * Hydrate external context
   */
  hydrate(): void {
    /** nothing needs to be done */
  }

  /**
   * Generate default values
   */
  default(): TypeVoice {
    return {
      echoCancellation: true,
      noiseSupression: "enhanced",
      autoGainControl: true,
      screenShareQuality: "low",
      screenShareQualityAsk: true,
      screenShareAudio: false,
      screenShareBitrateKbps: DEFAULT_SCREEN_SHARE_BITRATE_KBPS,
      screenShareFrameRate: DEFAULT_SCREEN_SHARE_FRAME_RATE,
      inputVolume: 1.0,
      outputVolume: 1.0,
      deafen: false,
      micOn: true,
      userVolumes: {},
      userMutes: {},
      screenShareVolumes: {},
      screenShareMutes: {},
      noiseGateEnabled: false,
      noiseGateThreshold: -50,
      pushToTalkEnabled: false,
      pushToTalkKeybind: "V",
      pushToTalkMode: "hold",
      pushToTalkReleaseDelay: 250,
      pushToTalkNotificationSounds: false,
      notificationSoundsEnabled: true,
      notificationVolume: 0.3,
      soundJoinCall: true,
      soundLeaveCall: true,
      soundSomeoneJoined: true,
      soundSomeoneLeft: true,
      soundMute: true,
      soundUnmute: true,
      soundReceiveMessage: true,
      soundDisconnect: true,
      autoReconnect: true,
    };
  }

  /**
   * Validate the given data to see if it is compliant and return a compliant object
   */
  clean(input: Partial<TypeVoice>): TypeVoice {
    const data = this.default();

    if (typeof input.preferredAudioInputDevice === "string") {
      data.preferredAudioInputDevice = input.preferredAudioInputDevice;
    }

    if (typeof input.preferredAudioOutputDevice === "string") {
      data.preferredAudioOutputDevice = input.preferredAudioOutputDevice;
    }

    if (typeof input.preferredVideoDevice === "string") {
      data.preferredVideoDevice = input.preferredVideoDevice;
    }

    if (typeof input.echoCancellation === "boolean") {
      data.echoCancellation = input.echoCancellation;
    }

    // migrate legacy noise suppression to new suppression state
    if ((input.noiseSupression as unknown) === "true") {
      data.noiseSupression = "enhanced";
    } else if ((input.noiseSupression as unknown) === "false") {
      data.noiseSupression = "disabled";
    } else if (
      input.noiseSupression &&
      NoiseSuppresionStates.includes(input.noiseSupression)
    ) {
      data.noiseSupression = input.noiseSupression;
    }

    if (typeof input.autoGainControl === "boolean") {
      data.autoGainControl = input.autoGainControl;
    }

    if (
      input.screenShareQuality &&
      ScreenShareQualityNames.includes(input.screenShareQuality)
    ) {
      data.screenShareQuality = input.screenShareQuality;
    }

    if (typeof input.screenShareQualityAsk === "boolean") {
      data.screenShareQualityAsk = input.screenShareQualityAsk;
    }

    if (typeof input.screenShareAudio === "boolean") {
      data.screenShareAudio = input.screenShareAudio;
    }

    if (typeof input.screenShareBitrateKbps === "number") {
      data.screenShareBitrateKbps = clampScreenShareBitrateKbps(
        input.screenShareBitrateKbps,
      );
    }

    if (typeof input.screenShareFrameRate === "number") {
      data.screenShareFrameRate = clampScreenShareFrameRate(
        input.screenShareFrameRate,
      );
    }

    if (typeof input.inputVolume === "number") {
      data.inputVolume = input.inputVolume;
    }

    if (typeof input.outputVolume === "number") {
      data.outputVolume = input.outputVolume;
    }

    if (typeof input.deafen === "boolean") {
      data.deafen = input.deafen;
    }

    if (typeof input.micOn === "boolean") {
      data.micOn = input.micOn;
    }

    if (typeof input.userVolumes === "object") {
      Object.entries(input.userVolumes)
        .filter(
          ([userId, volume]) =>
            typeof userId === "string" && typeof volume === "number",
        )
        .forEach(([k, v]) => (data.userVolumes[k] = v));
    }

    if (typeof input.userMutes === "object") {
      Object.entries(input.userMutes)
        .filter(
          ([userId, muted]) => typeof userId === "string" && muted === true,
        )
        .forEach(([k, v]) => (data.userMutes[k] = v));
    }

    if (typeof input.screenShareVolumes === "object") {
      Object.entries(input.screenShareVolumes)
        .filter(
          ([userId, volume]) =>
            typeof userId === "string" && typeof volume === "number",
        )
        .forEach(([k, v]) => (data.screenShareVolumes[k] = v));
    }

    if (typeof input.screenShareMutes === "object") {
      Object.entries(input.screenShareMutes)
        .filter(
          ([userId, muted]) => typeof userId === "string" && muted === true,
        )
        .forEach(([k, v]) => (data.screenShareMutes[k] = v));
    }

    if (typeof input.noiseGateEnabled === "boolean") {
      data.noiseGateEnabled = input.noiseGateEnabled;
    }

    if (
      typeof input.noiseGateThreshold === "number" &&
      input.noiseGateThreshold >= -100 &&
      input.noiseGateThreshold <= 0
    ) {
      data.noiseGateThreshold = input.noiseGateThreshold;
    }

    if (typeof input.pushToTalkEnabled === "boolean") {
      data.pushToTalkEnabled = input.pushToTalkEnabled;
    }

    if (typeof input.pushToTalkKeybind === "string") {
      data.pushToTalkKeybind = input.pushToTalkKeybind;
    }

    if (input.pushToTalkMode === "hold" || input.pushToTalkMode === "toggle") {
      data.pushToTalkMode = input.pushToTalkMode;
    }

    if (
      typeof input.pushToTalkReleaseDelay === "number" &&
      input.pushToTalkReleaseDelay >= 0 &&
      input.pushToTalkReleaseDelay <= 5000
    ) {
      data.pushToTalkReleaseDelay = input.pushToTalkReleaseDelay;
    }

    if (typeof input.pushToTalkNotificationSounds === "boolean") {
      data.pushToTalkNotificationSounds = input.pushToTalkNotificationSounds;
    }

    if (typeof input.notificationSoundsEnabled === "boolean") {
      data.notificationSoundsEnabled = input.notificationSoundsEnabled;
    }

    if (typeof input.notificationVolume === "number") {
      data.notificationVolume = Math.max(
        0,
        Math.min(1, input.notificationVolume),
      );
    }

    if (typeof input.soundJoinCall === "boolean") {
      data.soundJoinCall = input.soundJoinCall;
    }
    if (typeof input.soundLeaveCall === "boolean") {
      data.soundLeaveCall = input.soundLeaveCall;
    }
    if (typeof input.soundSomeoneJoined === "boolean") {
      data.soundSomeoneJoined = input.soundSomeoneJoined;
    }
    if (typeof input.soundSomeoneLeft === "boolean") {
      data.soundSomeoneLeft = input.soundSomeoneLeft;
    }
    if (typeof input.soundMute === "boolean") {
      data.soundMute = input.soundMute;
    }
    if (typeof input.soundUnmute === "boolean") {
      data.soundUnmute = input.soundUnmute;
    }
    if (typeof input.soundReceiveMessage === "boolean") {
      data.soundReceiveMessage = input.soundReceiveMessage;
    }
    if (typeof input.soundDisconnect === "boolean") {
      data.soundDisconnect = input.soundDisconnect;
    }
    if (typeof input.autoReconnect === "boolean") {
      data.autoReconnect = input.autoReconnect;
    }

    return data;
  }

  /**
   * Set a user's volume
   * @param userId User ID
   * @param volume Volume
   */
  setUserVolume(userId: string, volume: number) {
    this.set("userVolumes", userId, volume);
  }

  /**
   * Get a user's volume
   * @param userId User ID
   * @returns Volume or default
   */
  getUserVolume(userId: string): number {
    return this.get().userVolumes[userId] || 1.0;
  }

  /**
   * Set whether a user is muted
   * @param userId User ID
   * @param muted Whether they should be muted
   */
  setUserMuted(userId: string, muted: boolean) {
    this.set("userMutes", userId, muted);
  }

  /**
   * Get whether a user is muted
   * @param userId User ID
   * @returns Whether muted
   */
  getUserMuted(userId: string): boolean {
    return this.get().userMutes[userId] || false;
  }

  /**
   * Set a user's screen share volume
   * @param userId User ID
   * @param volume Volume
   */
  setScreenShareVolume(userId: string, volume: number) {
    this.set("screenShareVolumes", userId, volume);
  }

  /**
   * Get a user's screen share volume
   * @param userId User ID
   * @returns Volume or default
   */
  getScreenShareVolume(userId: string): number {
    return this.get().screenShareVolumes[userId] || 1.0;
  }

  /**
   * Set whether a user's screen share is muted
   * @param userId User ID
   * @param muted Whether they should be muted
   */
  setScreenShareMuted(userId: string, muted: boolean) {
    this.set("screenShareMutes", userId, muted);
  }

  /**
   * Get whether a user's screen share is muted
   * @param userId User ID
   * @returns Whether muted
   */
  getScreenShareMuted(userId: string): boolean {
    return this.get().screenShareMutes[userId] ?? true;
  }

  /**
   * Set the preferred audio input device
   */
  set preferredAudioInputDevice(value: string | undefined) {
    this.set("preferredAudioInputDevice", value);
  }

  /**
   * Set the preferred audio output device
   */
  set preferredAudioOutputDevice(value: string | undefined) {
    this.set("preferredAudioOutputDevice", value);
  }

  /**
   * Set the preferred video input device
   */
  set preferredVideoDevice(value: string | undefined) {
    this.set("preferredVideoDevice", value);
  }

  /**
   * Set echo cancellation
   */
  set echoCancellation(value: boolean) {
    this.set("echoCancellation", value);
  }

  /**
   * Set noise cancellation
   */
  set noiseSupression(value: NoiseSuppresionState) {
    this.set("noiseSupression", value);
  }

  /**
   * Set auto gain control
   */
  set autoGainControl(value: boolean) {
    this.set("autoGainControl", value);
  }

  /**
   * Set screen share quality
   */
  set screenShareQuality(value: ScreenShareQualityName) {
    this.set("screenShareQuality", value);
  }

  /**
   * Set screen share quality always ask
   */
  set screenShareQualityAsk(value: boolean) {
    this.set("screenShareQualityAsk", value);
  }

  /**
   * Set screen share audio
   */
  set screenShareAudio(value: boolean) {
    this.set("screenShareAudio", value);
  }

  /**
   * Set screen share bitrate in kilobits per second
   */
  set screenShareBitrateKbps(value: number) {
    this.set("screenShareBitrateKbps", clampScreenShareBitrateKbps(value));
  }

  /**
   * Set screen share frame rate
   */
  set screenShareFrameRate(value: number) {
    this.set("screenShareFrameRate", clampScreenShareFrameRate(value));
  }

  /**
   * Set input volume
   */
  set inputVolume(value: number) {
    this.set("inputVolume", value);
  }

  /**
   * Set output volume
   */
  set outputVolume(value: number) {
    this.set("outputVolume", value);
  }

  /**
   * Set mic status
   */
  set micOn(value: boolean) {
    this.set("micOn", value);
  }

  /**
   * Set deafen status
   */
  set deafen(value: boolean) {
    this.set("deafen", value);
  }

  /**
   * Get the preferred audio input device
   */
  get preferredAudioInputDevice(): string | undefined {
    return this.get().preferredAudioInputDevice;
  }

  /**
   * Get the preferred audio output device
   */
  get preferredAudioOutputDevice(): string | undefined {
    return this.get().preferredAudioOutputDevice;
  }

  /**
   * Get the preferred video input device
   */
  get preferredVideoDevice(): string | undefined {
    return this.get().preferredVideoDevice;
  }

  /**
   * Get echo cancellation
   */
  get echoCancellation(): boolean | undefined {
    return this.get().echoCancellation;
  }

  /**
   * Get noise supression
   */
  get noiseSupression(): NoiseSuppresionState | undefined {
    return this.get().noiseSupression;
  }

  /**
   * Get auto gain control
   */
  get autoGainControl(): boolean | undefined {
    return this.get().autoGainControl;
  }

  /**
   * Get screen share quality
   */
  get screenShareQuality(): ScreenShareQualityName | undefined {
    return this.get().screenShareQuality;
  }

  /**
   * Get screen share quality always ask
   */
  get screenShareQualityAsk(): boolean {
    return this.get().screenShareQualityAsk;
  }

  /**
   * Get screen share audio
   */
  get screenShareAudio(): boolean {
    return this.get().screenShareAudio;
  }

  /**
   * Get screen share bitrate in kilobits per second
   */
  get screenShareBitrateKbps(): number {
    return this.get().screenShareBitrateKbps;
  }

  /**
   * Get screen share frame rate
   */
  get screenShareFrameRate(): number {
    return this.get().screenShareFrameRate;
  }

  /**
   * Get input volume
   */
  get inputVolume(): number {
    return this.get().inputVolume;
  }

  /**
   * Get output volume
   */
  get outputVolume(): number {
    return this.get().outputVolume;
  }

  /**
   * Get deafen status
   */
  get deafen(): boolean {
    return this.get().deafen;
  }

  /**
   * Get mic status
   */
  get micOn(): boolean {
    return this.get().micOn;
  }

  set noiseGateEnabled(value: boolean) {
    this.set("noiseGateEnabled", value);
  }

  get noiseGateEnabled(): boolean {
    return this.get().noiseGateEnabled;
  }

  set noiseGateThreshold(value: number) {
    this.set("noiseGateThreshold", value);
  }

  get noiseGateThreshold(): number {
    return this.get().noiseGateThreshold;
  }

  set pushToTalkEnabled(value: boolean) {
    this.set("pushToTalkEnabled", value);
  }

  get pushToTalkEnabled(): boolean {
    return this.get().pushToTalkEnabled;
  }

  set pushToTalkKeybind(value: string) {
    this.set("pushToTalkKeybind", value);
  }

  get pushToTalkKeybind(): string {
    return this.get().pushToTalkKeybind;
  }

  set pushToTalkMode(value: "hold" | "toggle") {
    this.set("pushToTalkMode", value);
  }

  get pushToTalkMode(): "hold" | "toggle" {
    return this.get().pushToTalkMode;
  }

  set pushToTalkReleaseDelay(value: number) {
    this.set("pushToTalkReleaseDelay", value);
  }

  get pushToTalkReleaseDelay(): number {
    return this.get().pushToTalkReleaseDelay;
  }

  get pushToTalkNotificationSounds(): boolean {
    return this.get().pushToTalkNotificationSounds;
  }

  set pushToTalkNotificationSounds(value: boolean) {
    this.set("pushToTalkNotificationSounds", value);
  }

  setPushToTalkConfig(config: {
    enabled?: boolean;
    keybind?: string;
    mode?: "hold" | "toggle";
    releaseDelay?: number;
    notificationSounds?: boolean;
  }) {
    if (import.meta.env.DEV) {
      console.log("[Voice] Setting PTT config from external source:", config);
    }
    if (typeof config.enabled === "boolean") {
      this.set("pushToTalkEnabled", config.enabled);
    }
    if (typeof config.keybind === "string") {
      this.set("pushToTalkKeybind", config.keybind);
    }
    if (config.mode === "hold" || config.mode === "toggle") {
      this.set("pushToTalkMode", config.mode);
    }
    if (typeof config.releaseDelay === "number") {
      this.set("pushToTalkReleaseDelay", config.releaseDelay);
    }
    if (typeof config.notificationSounds === "boolean") {
      this.set("pushToTalkNotificationSounds", config.notificationSounds);
    }
  }

  get notificationSoundsEnabled(): boolean {
    return this.get().notificationSoundsEnabled;
  }

  set notificationSoundsEnabled(value: boolean) {
    this.set("notificationSoundsEnabled", value);
  }

  get notificationVolume(): number {
    return this.get().notificationVolume;
  }

  set notificationVolume(value: number) {
    this.set("notificationVolume", value);
  }

  get soundJoinCall(): boolean {
    return this.get().soundJoinCall;
  }

  set soundJoinCall(value: boolean) {
    this.set("soundJoinCall", value);
  }

  get soundLeaveCall(): boolean {
    return this.get().soundLeaveCall;
  }

  set soundLeaveCall(value: boolean) {
    this.set("soundLeaveCall", value);
  }

  get soundSomeoneJoined(): boolean {
    return this.get().soundSomeoneJoined;
  }

  set soundSomeoneJoined(value: boolean) {
    this.set("soundSomeoneJoined", value);
  }

  get soundSomeoneLeft(): boolean {
    return this.get().soundSomeoneLeft;
  }

  set soundSomeoneLeft(value: boolean) {
    this.set("soundSomeoneLeft", value);
  }

  get soundMute(): boolean {
    return this.get().soundMute;
  }

  set soundMute(value: boolean) {
    this.set("soundMute", value);
  }

  get soundUnmute(): boolean {
    return this.get().soundUnmute;
  }

  set soundUnmute(value: boolean) {
    this.set("soundUnmute", value);
  }

  get soundReceiveMessage(): boolean {
    return this.get().soundReceiveMessage;
  }

  set soundReceiveMessage(value: boolean) {
    this.set("soundReceiveMessage", value);
  }

  get soundDisconnect(): boolean {
    return this.get().soundDisconnect;
  }

  set soundDisconnect(value: boolean) {
    this.set("soundDisconnect", value);
  }

  get autoReconnect(): boolean {
    return this.get().autoReconnect;
  }

  set autoReconnect(value: boolean) {
    this.set("autoReconnect", value);
  }
}
