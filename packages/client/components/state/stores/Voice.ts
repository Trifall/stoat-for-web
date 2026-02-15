import { State } from "..";

import { AbstractStore } from ".";

export interface TypeVoice {
  preferredAudioInputDevice?: string;
  preferredAudioOutputDevice?: string;

  echoCancellation: boolean;
  noiseSupression: boolean;

  inputVolume: number;
  outputVolume: number;

  userVolumes: Record<string, number>;
  userMutes: Record<string, boolean>;

  pushToTalkEnabled: boolean;
  pushToTalkKeybind: string;
  pushToTalkMode: "hold" | "toggle";
  pushToTalkReleaseDelay: number;

  notificationSoundsEnabled: boolean;
  notificationVolume: number;
}

/**
 * Voice settings store
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
      noiseSupression: true,
      inputVolume: 1.0,
      outputVolume: 1.0,
      userVolumes: {},
      userMutes: {},
      pushToTalkEnabled: false,
      pushToTalkKeybind: "V",
      pushToTalkMode: "hold",
      pushToTalkReleaseDelay: 250,
      notificationSoundsEnabled: true,
      notificationVolume: 0.75,
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

    if (typeof input.echoCancellation === "boolean") {
      data.echoCancellation = input.echoCancellation;
    }

    if (typeof input.noiseSupression === "boolean") {
      data.noiseSupression = input.noiseSupression;
    }

    if (typeof input.inputVolume === "number") {
      data.inputVolume = input.inputVolume;
    }

    if (typeof input.outputVolume === "number") {
      data.outputVolume = input.outputVolume;
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

    if (typeof input.notificationSoundsEnabled === "boolean") {
      data.notificationSoundsEnabled = input.notificationSoundsEnabled;
    }

    if (typeof input.notificationVolume === "number") {
      data.notificationVolume = Math.max(0, Math.min(1, input.notificationVolume));
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
   * Set the preferred audio input device
   */
  set preferredAudioInputDevice(value: string) {
    this.set("preferredAudioInputDevice", value);
  }

  /**
   * Set the preferred audio output device
   */
  set preferredAudioOutputDevice(value: string) {
    this.set("preferredAudioOutputDevice", value);
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
  set noiseSupression(value: boolean) {
    this.set("noiseSupression", value);
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
   * Get the preferred audio input device
   */
  get preferredAudioInputDevice(): string | undefined {
    return this.get().preferredAudioInputDevice;
  }

  /**
   * Get the preferred audio output device
   */
  get preferredAudioOutputDevice(): string | undefined {
    return this.get().preferredAudioInputDevice;
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
  get noiseSupression(): boolean | undefined {
    return this.get().noiseSupression;
  }

  /**
   * Get input volume
   */
  get inputVolume(): number {
    return this.get().inputVolume;
  }

  /**
   * Get noise supression
   */
  get outputVolume(): number {
    return this.get().outputVolume;
  }

  /**
   * Set push to talk enabled
   */
  set pushToTalkEnabled(value: boolean) {
    this.set("pushToTalkEnabled", value);
  }

  /**
   * Get push to talk enabled
   */
  get pushToTalkEnabled(): boolean {
    return this.get().pushToTalkEnabled;
  }

  /**
   * Set push to talk keybind
   */
  set pushToTalkKeybind(value: string) {
    this.set("pushToTalkKeybind", value);
  }

  /**
   * Get push to talk keybind
   */
  get pushToTalkKeybind(): string {
    return this.get().pushToTalkKeybind;
  }

  /**
   * Set push to talk mode
   */
  set pushToTalkMode(value: "hold" | "toggle") {
    this.set("pushToTalkMode", value);
  }

  /**
   * Get push to talk mode
   */
  get pushToTalkMode(): "hold" | "toggle" {
    return this.get().pushToTalkMode;
  }

  /**
   * Set push to talk release delay
   */
  set pushToTalkReleaseDelay(value: number) {
    this.set("pushToTalkReleaseDelay", value);
  }

  /**
   * Get push to talk release delay
   */
  get pushToTalkReleaseDelay(): number {
    return this.get().pushToTalkReleaseDelay;
  }

  /**
   * Set all push to talk config at once (from external source like desktop app)
   */
  setPushToTalkConfig(config: {
    enabled?: boolean;
    keybind?: string;
    mode?: "hold" | "toggle";
    releaseDelay?: number;
  }) {
    console.log("[Voice] Setting PTT config from external source:", config);
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
  }

  /**
   * Get notification sounds enabled
   */
  get notificationSoundsEnabled(): boolean {
    return this.get().notificationSoundsEnabled;
  }

  /**
   * Set notification sounds enabled
   */
  set notificationSoundsEnabled(value: boolean) {
    this.set("notificationSoundsEnabled", value);
  }

  /**
   * Get notification volume
   */
  get notificationVolume(): number {
    return this.get().notificationVolume;
  }

  /**
   * Set notification volume
   */
  set notificationVolume(value: number) {
    this.set("notificationVolume", value);
  }
}
