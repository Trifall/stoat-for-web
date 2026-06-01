import { createContext, JSXElement, useContext } from "solid-js";

import { Sounds, TypeSounds, useState } from "@revolt/state";
import deafenSound from "../../scripts/assets_fallback/sounds/deafen.ogg";
import messageSound from "../../scripts/assets_fallback/sounds/message_sound.ogg";
import muteSound from "../../scripts/assets_fallback/sounds/mute.ogg";
import ringtoneIncomingSound from "../../scripts/assets_fallback/sounds/ringtone_incoming.ogg";
import ringtoneOutgoingSound from "../../scripts/assets_fallback/sounds/ringtone_outgoing.ogg";
import selfJoinVoiceSound from "../../scripts/assets_fallback/sounds/self_join_voice.ogg";
import selfLeaveVoiceSound from "../../scripts/assets_fallback/sounds/self_leave_voice.ogg";
import streamEndSound from "../../scripts/assets_fallback/sounds/stream_end.ogg";
import streamStartSound from "../../scripts/assets_fallback/sounds/stream_start.ogg";
import streamViewerJoinSound from "../../scripts/assets_fallback/sounds/stream_viewer_join.ogg";
import streamViewerLeaveSound from "../../scripts/assets_fallback/sounds/stream_viewer_leave.ogg";
import undeafenSound from "../../scripts/assets_fallback/sounds/undeafen.ogg";
import unmuteSound from "../../scripts/assets_fallback/sounds/unmute.ogg";
import userJoinVoiceSound from "../../scripts/assets_fallback/sounds/user_join_voice.ogg";
import userLeaveVoiceSound from "../../scripts/assets_fallback/sounds/user_leave_voice.ogg";
import userMovedSound from "../../scripts/assets_fallback/sounds/user_moved.ogg";

/**
 * A controller class for making sure sounds are managed in one place and to prevent undesirable sound overlaps
 */
export class SoundController {
  readonly soundState: Sounds;

  node?: HTMLAudioElement;

  lastPlayedSound?: keyof TypeSounds;

  private _enabled = true;
  private _volume = 0.3;
  private _incomingCallNode?: HTMLAudioElement;

  constructor(soundState: Sounds) {
    this.soundState = soundState;

    this.isPlaying = this.isPlaying.bind(this);
    this.canPlay = this.canPlay.bind(this);
    this.playSound = this.playSound.bind(this);
    this.playIncomingCall = this.playIncomingCall.bind(this);
    this.stopIncomingCall = this.stopIncomingCall.bind(this);
    this.setEnabled = this.setEnabled.bind(this);
    this.setVolume = this.setVolume.bind(this);
  }

  /**
   * Get whether a sound is currently being played by the sound controller
   *
   * @returns Whether a sound is currently playing
   */
  isPlaying(): boolean {
    return !!this.node && !this.node.paused;
  }

  /**
   * Get whether a sound can be played right now
   *
   * @param newSound Sound to check for playability
   * @returns Whether the sound passed is playable currently
   */
  canPlay(newSound: keyof TypeSounds): boolean {
    if (!this._enabled) {
      return false;
    }

    if (!this.soundState.enabled(newSound)) {
      return false;
    }

    // Always let the sound play if nothing is currently playing
    if (!this.isPlaying()) {
      return true;
    }

    // If there are any cases where you don't want sound collisions, put them here.
    // None for now.
    return true;
  }

  /**
   * Play a sound, following the rules of sound playability unless force is true
   *
   * @param sound The sound to play
   * @param force Bypass canPlay check
   * @returns Whether the sound played
   */
  playSound(sound: keyof TypeSounds, force?: boolean): boolean {
    if (!force && !this.canPlay(sound)) {
      return false;
    }
    switch (sound) {
      case "deafen": {
        this.node = new Audio(deafenSound);
        break;
      }
      case "message": {
        this.node = new Audio(messageSound);
        break;
      }
      case "mute": {
        this.node = new Audio(muteSound);
        break;
      }
      case "ringtoneIncoming": {
        this.node = new Audio(ringtoneIncomingSound);
        break;
      }
      case "ringtoneOutgoing": {
        this.node = new Audio(ringtoneOutgoingSound);
        break;
      }
      case "streamEnd": {
        this.node = new Audio(streamEndSound);
        break;
      }
      case "streamStart": {
        this.node = new Audio(streamStartSound);
        break;
      }
      case "streamViewerJoin": {
        this.node = new Audio(streamViewerJoinSound);
        break;
      }
      case "streamViewerLeave": {
        this.node = new Audio(streamViewerLeaveSound);
        break;
      }
      case "undeafen": {
        this.node = new Audio(undeafenSound);
        break;
      }
      case "unmute": {
        this.node = new Audio(unmuteSound);
        break;
      }
      case "userJoinVoice": {
        this.node = new Audio(userJoinVoiceSound);
        break;
      }
      case "userLeaveVoice": {
        this.node = new Audio(userLeaveVoiceSound);
        break;
      }
      case "userMoved": {
        this.node = new Audio(userMovedSound);
        break;
      }
      case "selfJoinVoice": {
        this.node = new Audio(selfJoinVoiceSound);
        break;
      }
      case "selfLeaveVoice": {
        this.node = new Audio(selfLeaveVoiceSound);
        break;
      }
      case "incomingCall": {
        this.node = new Audio(ringtoneIncomingSound);
        break;
      }
      case "disconnect": {
        this.node = new Audio(userLeaveVoiceSound);
        break;
      }
    }
    this.lastPlayedSound = sound;
    if (this.node) {
      this.node.volume = this._volume;
      this.node.play();
    }
    return true;
  }

  /**
   * Enable or disable all sounds
   */
  setEnabled(enabled: boolean): void {
    this._enabled = enabled;
  }

  /**
   * Set master volume for sounds
   */
  setVolume(volume: number): void {
    this._volume = Math.max(0, Math.min(1, volume));
  }

  /**
   * Start looping incoming call ringtone
   */
  playIncomingCall(): void {
    if (
      this._incomingCallNode ||
      !this._enabled ||
      !this.soundState.enabled("incomingCall")
    )
      return;
    this._incomingCallNode = new Audio(ringtoneIncomingSound);
    this._incomingCallNode.loop = true;
    this._incomingCallNode.volume = this._volume;
    this._incomingCallNode.play().catch(() => {});
  }

  /**
   * Stop incoming call ringtone
   */
  stopIncomingCall(): void {
    if (this._incomingCallNode) {
      this._incomingCallNode.pause();
      this._incomingCallNode.currentTime = 0;
      this._incomingCallNode = undefined;
    }
  }
}

const soundContext = createContext(null! as SoundController);

export function SoundContext(props: { children: JSXElement }) {
  const { sounds } = useState();

  const controller = new SoundController(sounds);

  return (
    <soundContext.Provider value={controller}>
      {props.children}
    </soundContext.Provider>
  );
}

export function useSound(): SoundController {
  return useContext(soundContext);
}
