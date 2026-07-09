# Fork Changes

This document records fork-specific behavior that must be preserved during upstream merges and future PRs. Treat it as merge context for agents working on this fork.

The fork adds substantial voice, sound, push-to-talk, and settings behavior on top of upstream Stoat for Web. Many of these changes intentionally differ from upstream behavior. Do not remove or simplify them unless the fork owner explicitly asks for that.

## High-Priority Preservation Rules

- Do not cherry-pick upstream commits to sync the fork. Merge upstream into the fork so GitHub recognizes the fork as not behind upstream.
- Do not resurrect the old standalone voice notification implementation. Current notification behavior is integrated through `SoundController`, the `Sounds` store, and `VoiceContext`.
- Do not replace fork mute/deafen behavior with upstream wholesale. The fork intentionally has push-to-talk-aware mute/deafen logic.
- Do not move push-to-talk source of truth fully into the web client. Desktop/main process config and active state are authoritative.
- Do not collapse self voice sounds into other-user voice sounds. Self join/leave and remote participant join/leave must remain separate.
- Manual leave sound must only play on real user-initiated disconnects, not channel switches, reconnect cleanup, or internal disconnects.
- Incoming call ringtone is a separate looping audio node and must be stopped explicitly.
- `state.sounds` is the current primary sound source of truth, but `state.voice.soundDisconnect` still gates disconnect sound calls.
- `<SoundContext>` must wrap `<VoiceContext>` because `VoiceContext` calls `useSound()`.
- Noise gate processing must stay compatible with enhanced RNNoise processing by chaining processors when both are enabled.

## Main Fork Feature Areas

- Voice sounds and notification behavior.
- Incoming DM/group call popup and ringtone behavior.
- Push-to-talk desktop integration.
- Push-to-talk-aware mute/deafen behavior.
- Voice configuration persistence.
- Noise gate and voice processing.
- Auto-reconnect for voice calls.
- Voice/settings UI routes.
- Sound settings integration.
- Ghost voice participant cleanup.
- Fork submodule preservation.

## Important Files

- `packages/client/components/rtc/state.tsx`: central runtime integration for voice, PTT, incoming calls, auto-reconnect, voice sounds, screenshare sounds, noise gate wiring, and ghost participant cleanup.
- `packages/client/components/client/Sounds.tsx`: runtime sound controller and `SoundContext`.
- `packages/client/components/state/stores/Sounds.ts`: persistent sound toggles, master sound enable, and master volume.
- `packages/client/components/state/stores/Voice.ts`: persistent voice, PTT, noise gate, auto-reconnect, and legacy sound flags.
- `packages/client/components/rtc/NoiseGateProcessor.ts`: LiveKit audio track processor implementing the fork noise gate.
- `packages/client/components/app/interface/settings/user/voice/PushToTalkSettings.tsx`: PTT settings UI and desktop sync writes.
- `packages/client/components/app/interface/settings/user/voice/AdvancedSettings.tsx`: auto-reconnect settings UI.
- `packages/client/components/app/interface/settings/user/voice/VoiceProcessingOptions.tsx`: noise suppression/noise gate UI and live meter.
- `packages/client/components/app/interface/settings/user/notifications/Sounds.tsx`: sound settings UI, including fork sound toggles.
- `packages/client/components/rtc/components/IncomingCallPopup.tsx`: incoming call popup UI.
- `packages/client/types/types.d.ts`: desktop bridge typing for `window.pushToTalk`.
- `packages/client/src/index.tsx`: context wrapping order; `SoundContext` wraps `VoiceContext`.

## Runtime Context Integration

The app currently mounts contexts in this relevant order in `packages/client/src/index.tsx`:

```tsx
<SoundContext>
  <VoiceContext>
    ...
  </VoiceContext>
</SoundContext>
```

This order is required because `VoiceContext` calls `useSound()` and passes the `SoundController` into the fork `Voice` runtime class.

`DeviceContext` wraps the app outside `StateContext`, preserving upstream device behavior while allowing fork voice UI to use device/layout information.

## Sound System

### Architecture

The fork uses upstream's `Sounds` store and `SoundController` architecture, with fork-specific sounds added into that system.

Persistent toggles live in:

- `packages/client/components/state/stores/Sounds.ts`

Runtime playback lives in:

- `packages/client/components/client/Sounds.tsx`

Voice runtime sound calls live mostly in:

- `packages/client/components/rtc/state.tsx`

The `VoiceContext` has a reactive effect that syncs persistent sound settings into the runtime controller:

```ts
const enabled = state.sounds.getEnabled();
const volume = state.sounds.getVolume();
sound.setEnabled(enabled);
sound.setVolume(volume);
```

`SoundController._enabled` and `SoundController._volume` are runtime-only fields. They must be kept in sync from `state.sounds`.

### Fork Sound Toggles

Fork additions to `TypeSounds` include:

- `selfJoinVoice`
- `selfLeaveVoice`
- `incomingCall`
- `disconnect`
- `enabled`
- `volume`

The store default keeps these enabled by default, with volume defaulting to `0.3`.

### Sound Assets

Sound assets are stored under:

- `packages/client/scripts/assets_fallback/sounds/`

Important fork voice assets include:

- `self_join_voice.ogg`
- `self_leave_voice.ogg`
- `ringtone_incoming.ogg`
- `stream_start.ogg`
- `stream_end.ogg`
- `stream_viewer_join.ogg`
- `stream_viewer_leave.ogg`
- `user_join_voice.ogg`
- `user_leave_voice.ogg`

### Playback Rules

- Self join sound plays from `RoomEvent.Connected` using `sound.playSound("selfJoinVoice")`.
- Self leave sound plays only from `disconnect(manual = true)`.
- Internal disconnects call `disconnect(false)` and must not play self leave.
- Remote participant join/leave sounds are driven by LiveKit participant events after initial room setup is ready.
- Initial participant lists must not produce join spam. `participantNotificationsReady` gates that behavior.
- Reconnect churn must not produce false leave/join sounds. `#pendingLeaveNotifications` and `#suppressedReconnectJoins` handle this.
- Disconnect sound plays on failed/no-reconnect paths and is still gated by `state.voice.soundDisconnect` before calling `sound.playSound("disconnect")`.
- Incoming call ringtone uses `SoundController.playIncomingCall()` and `SoundController.stopIncomingCall()` so the looping ringtone can be stopped independently of one-shot sounds.

### Current Sound UI Caveat

The store and controller support a master sound enable flag (`state.sounds.enabled`), and `VoiceContext` syncs it into `SoundController`. Verify the current sound settings UI before assuming there is an obvious master enable toggle exposed to users.

## Incoming Call System

Incoming call behavior lives in `VoiceContext` in `packages/client/components/rtc/state.tsx`.

The old standalone voice notification files should remain removed/unused. Functionality belongs in the integrated sound/store/RTC path.

### Events

The client listens to:

- `voiceChannelJoin`
- `voiceChannelLeave`

### Ring Conditions

The fork rings only when all conditions are met:

- Channel type is `DirectMessage` or `Group`.
- Another user joins the voice channel.
- The current user is not already in a voice channel.
- There is not already an incoming call popup visible.
- The channel was not dismissed within the last 15 seconds.
- Current user status is not `Busy` or `Focus`.

### Ringtone and Popup Timing

- Ringtone starts with `sound.playIncomingCall()`.
- Ringtone stops after 15 seconds.
- Popup auto-dismisses after 60 seconds.
- Dismiss/reject records a 15 second channel cooldown and stops the ringtone.
- If the caller leaves and no other remote participants remain, the popup dismisses.

### Answer and Reject

- Answering calls `voice.connect(call.channel)` and navigates to `call.channel.path`.
- Rejecting only dismisses and records cooldown.

### Call Message

For DM/group calls, `Voice.connect()` sends:

```md
> *Started a call*
```

This only happens when starting a new call and is throttled per channel for 60 seconds using `#lastCallMessageSent`.

## Push-to-Talk Desktop Integration

### Source of Truth

Push-to-talk is desktop-authoritative.

The web client reads and reacts to the desktop bridge:

- `window.pushToTalk.getConfig()`
- `window.pushToTalk.getCurrentState()`
- `window.pushToTalk.onStateChange(...)`
- `window.pushToTalk.onConfigChange(...)`

The web settings UI writes changes back through:

- `window.pushToTalk.updateSettings(...)`

Do not reimplement hold/toggle/release-delay timing in the web client. The desktop/main process resolves active PTT state and sends active/inactive state changes to web.

### Desktop Bridge Fields

The current bridge is typed in `packages/client/types/types.d.ts`.

Config fields:

- `enabled`
- `keybind`
- `mode`: `"hold" | "toggle"`
- `releaseDelay`
- `notificationSounds`

Persistent store names in `state.voice`:

- `pushToTalkEnabled`
- `pushToTalkKeybind`
- `pushToTalkMode`
- `pushToTalkReleaseDelay`
- `pushToTalkNotificationSounds`

`Voice.setPushToTalkConfig(...)` maps desktop config into these persistent store fields.

### Multi-Keybind Encoding

`pushToTalkKeybind` is intentionally still a string for compatibility.

- Legacy/single-key configs store a plain accelerator string, such as `V`.
- Dual-key configs store a JSON array string, such as `["V","Mouse4"]`.

`PushToTalkSettings.tsx` parses either format. It serializes back to JSON only when a secondary keybind exists. Duplicate primary/secondary keybinds are ignored.

Do not change this field into an array without a migration plan, because persisted data and desktop config expect a string.

### Runtime Behavior

PTT state changes are handled in `VoiceContext`:

- Desktop active state `true` means mic should be enabled/unmuted.
- Desktop active state `false` means mic should be disabled/muted.
- If a voice room exists, `voice.setMute(active)` is called.
- If no room exists, the event is ignored after logging.

On voice connect, if PTT is enabled, initial mic state is derived from `window.pushToTalk.getCurrentState().active`.

When PTT changes mic state, `state.voice.micOn` is not persisted. This is intentional. PTT should not overwrite the user's normal mic preference.

`setMute()` is serialized through `#mutePromise` to avoid races from rapid PTT events.

`setMute()` refuses to unmute while deafened.

Mute/unmute sounds are suppressed while PTT is enabled unless `pushToTalkNotificationSounds` is true.

## Mute and Deafen Behavior

The fork intentionally differs from upstream here. Preserve this logic.

### Initial State

Initial microphone signal is:

```ts
voiceSettings.micOn && !voiceSettings.deafen
```

This keeps upstream's important microphone/deafen initialization fix while preserving fork PTT behavior.

### `toggleMute()`

Manual mute behavior:

- Requires an active room.
- Does nothing while deafened.
- Toggles LiveKit microphone state.
- Persists `state.voice.micOn` because this is a user/manual preference.
- Plays mute/unmute sounds only when PTT is disabled or PTT notification sounds are enabled.

### `setMute(enabled)`

Direct mute behavior for PTT:

- Serializes concurrent calls through `#mutePromise`.
- Requires an active room.
- Does nothing while deafened.
- Re-reads current mic state inside the mutex.
- Calls `#setMicrophoneEnabled(enabled, { persistPreference: false })`.
- Does not persist `micOn`.
- Plays sounds only if PTT is disabled or PTT notification sounds are enabled.

### `toggleDeafen()`

Deafen behavior:

- Persists `state.voice.deafen`.
- When deafening, stores whether the mic was on in `#micWasOnBeforeDeafen`.
- When deafening, mutes the mic without persisting `micOn`.
- When undeafening, restores the mic only if it was previously on.
- If PTT is enabled, undeafen restore only happens when desktop PTT state is currently active.

## Auto-Reconnect

Persistent setting:

- `state.voice.autoReconnect`
- Default: `true`

UI:

- `packages/client/components/app/interface/settings/user/voice/AdvancedSettings.tsx`
- Label: `Auto-reconnect`

Runtime:

- `packages/client/components/rtc/state.tsx`
- `RoomEvent.Disconnected` checks `state.voice.autoReconnect`.

If disabled:

- Set voice state to `DISCONNECTED`.
- If `state.voice.soundDisconnect` is true, play `disconnect` sound.

If enabled:

- Call `#handleReconnect()`.
- Fetch a fresh token with `channel.joinCall("worldwide")`.
- Attempt `room.connect(auth.url, auth.token, { autoSubscribe: false })` on the same room.
- Use exponential backoff capped at 10 seconds.
- Max attempts: 5.
- On success, reset attempt counter and set state to `CONNECTED`.
- On final failure, set `DISCONNECTED` and play disconnect sound if `soundDisconnect` allows it.

Manual disconnect path:

- `disconnect(manual = true)` removes listeners before `room.disconnect()`.
- Manual disconnect plays `selfLeaveVoice`.
- Internal channel-switch disconnects call `disconnect(false)` and must not play self leave.

## Noise Gate

### Persistent Settings

Noise gate settings live in `state.voice`:

- `noiseGateEnabled`
- `noiseGateThreshold`

Defaults:

- `noiseGateEnabled: false`
- `noiseGateThreshold: -50`

Valid threshold range is `-100` to `0` in store cleaning. The UI meter displays/clamps over `-60` to `0` for practical metering.

### Processor

Processor file:

- `packages/client/components/rtc/NoiseGateProcessor.ts`

The processor:

- Implements a LiveKit-compatible track processor shape.
- Uses Web Audio to compute RMS level in dB.
- Gates audio by controlling a `GainNode`.
- Exposes `onLevel?: (db: number) => void` for the settings meter.
- Forces mono-style node settings to avoid one-ear/stereo issues.
- Can wrap an upstream processor such as RNNoise.

If enhanced noise suppression is enabled and noise gate is enabled, `Voice.#configureMicrophoneTrack()` constructs:

```ts
new NoiseGateProcessor({
  threshold: state.voice.noiseGateThreshold,
  upstream: new DenoiseTrackProcessor(...),
})
```

This gives the chain:

```text
Source -> RNNoise -> Noise Gate -> Output
```

If only enhanced noise suppression is enabled, RNNoise is applied directly.

If only noise gate is enabled, the noise gate is applied directly.

### Microphone Constraints

Voice room audio capture requests mono:

```ts
channelCount: { ideal: 1 }
```

The code also warns if the browser reports a stereo mic track.

### UI and Live Meter

UI file:

- `packages/client/components/app/interface/settings/user/voice/VoiceProcessingOptions.tsx`

The UI:

- Adds a `Noise Gate` toggle under voice processing.
- Shows a draggable threshold meter when enabled.
- Uses the active processor's `onLevel` callback while in a call.
- Starts a preview mic stream for metering when not in a call.
- Restarts preview monitoring when the preferred input device changes.
- Updates the active processor live through a `VoiceContext` effect that calls `voice.updateNoiseGateThreshold(...)`.

## Ghost Voice Participant Cleanup

`VoiceContext` periodically reconnects the client event WebSocket to clear ghost voice participants from stale Ready state data.

Behavior:

- Interval: every 10 minutes.
- Skips while in an active voice call to avoid disrupting real-time events.
- Calls `client()?.events.disconnect()` when safe.

Debug helper:

```ts
window.stoatRefreshVoice = () => {
  client()?.events.disconnect();
};
```

This is fork behavior and should not be removed without replacing the ghost cleanup mechanism.

## Voice Configuration Persistence

All persistent stores are handled by `State` in:

- `packages/client/components/state/index.tsx`

Stores use `localforage` and each store provides:

- `default()`
- `clean(input)`

Store writes are delayed by `DISK_WRITE_WAIT_MS`, except auth which bypasses the delay.

Fork-related persistent stores:

- `state.voice`: voice devices, voice processing, PTT, noise gate, auto-reconnect, and legacy sound flags.
- `state.sounds`: current sound toggles, master sound enable, and master volume.

Important persistence behavior:

- Direct setters like `state.voice.autoReconnect = false` persist automatically because store setters call `this.set(...)`.
- `sounds.toggle(...)` and `sounds.setVolume(...)` persist automatically.
- `clean(...)` methods are important for migrating legacy values and validating persisted data.

## Legacy Sound Fields in `state.voice`

`state.voice` still contains older sound fields:

- `notificationSoundsEnabled`
- `notificationVolume`
- `soundJoinCall`
- `soundLeaveCall`
- `soundSomeoneJoined`
- `soundSomeoneLeft`
- `soundMute`
- `soundUnmute`
- `soundReceiveMessage`
- `soundDisconnect`
- `soundIncomingCall`

Most current sound behavior should use `state.sounds`. However, `soundDisconnect` is still actively used as an extra gate before disconnect sounds. Do not remove these fields casually because persisted user data may still contain them and `soundDisconnect` has runtime behavior.

## Settings and UI Routes

Fork voice settings are integrated into user settings.

Important files:

- `packages/client/components/app/interface/settings/UserSettings.tsx`
- `packages/client/components/app/interface/settings/user/voice/PushToTalkSettings.tsx`
- `packages/client/components/app/interface/settings/user/voice/AdvancedSettings.tsx`
- `packages/client/components/app/interface/settings/user/voice/VoiceProcessingOptions.tsx`
- `packages/client/components/app/interface/settings/user/notifications/Sounds.tsx`

Settings include:

- Push to Talk.
- Auto-reconnect.
- Noise gate.
- Voice processing.
- Sound toggles integrated into notification sound settings.

The advanced voice page currently exposes auto-reconnect under a connection section.

## Desktop Bridge Typing

`packages/client/types/types.d.ts` declares `window.pushToTalk`.

Keep these typings aligned with desktop bridge behavior. Runtime code and settings currently use `notificationSounds`, so it must remain part of:

- `updateSettings(...)`
- `getConfig()`
- `onConfigChange(...)`
- `offConfigChange(...)`

## Fork Submodules

The fork uses forked submodule URLs for at least:

- `packages/stoat.js`
- `packages/solid-livekit-components`

`packages/client/assets` points to the internal brand assets repository and has `update = none`.

During upstream merges, ensure fork-specific submodule URLs in `.gitmodules` are preserved where intended. Do not blindly take upstream `.gitmodules` if it reverts fork SDK/livekit submodules back to upstream remotes.

## Merge Checklist for Future Agents

When merging upstream, verify these before finalizing:

- `SoundContext` still wraps `VoiceContext`.
- `state.sounds` still contains fork toggles and master volume/enabled fields.
- `SoundController` still has separate one-shot sounds and looping incoming call node.
- `VoiceContext` still syncs `state.sounds.enabled` and `state.sounds.volume` into `SoundController`.
- Self join plays on `RoomEvent.Connected`.
- Self leave only plays for manual `disconnect(true)`.
- Remote join/leave sounds are not fired for initial room participant list.
- Reconnect churn does not trigger false join/leave sounds.
- Incoming calls still ring only for DM/group calls and respect Busy/Focus status.
- Incoming ringtone stops on dismiss, reject, answer, timeout, and caller leave.
- `window.pushToTalk` config remains desktop-authoritative.
- PTT active/inactive events call `voice.setMute(active)`.
- PTT mute changes do not persist `state.voice.micOn`.
- `setMute()` remains serialized through `#mutePromise`.
- `toggleMute()` and `toggleDeafen()` remain PTT-aware.
- Auto-reconnect remains enabled by default and fetches fresh voice tokens.
- Disconnect sound remains gated by `state.voice.soundDisconnect`.
- Noise gate still chains after RNNoise when both are enabled.
- Noise gate processor is destroyed when mic disables or voice disconnects.
- `types.d.ts` includes `notificationSounds` in the PTT bridge.
- `.gitmodules` keeps fork remotes for forked submodules.

## Recommended Verification After Voice/Sound Merges

Run at least:

```sh
pnpm --filter client exec tsc --noEmit
pnpm --filter client exec vite build
```

Manual smoke checks to consider:

- Join a voice channel and confirm self join sound.
- Leave manually and confirm self leave sound.
- Switch voice channels and confirm self leave does not fire for the internal disconnect.
- Have another user join/leave after you are already connected and confirm remote join/leave sounds.
- Trigger reconnect or temporary network loss and confirm reconnect behavior does not spam join/leave sounds.
- Disable auto-reconnect and confirm unexpected disconnect plays disconnect sound if enabled.
- Enable PTT and confirm desktop active state controls mic without changing saved `micOn`.
- Deafen while mic is on, undeafen, and confirm restore behavior including PTT-active rules.
- Enable noise gate, watch the level meter, and confirm threshold changes apply live.
- Receive a DM/group call while not in voice and confirm popup/ringtone timing and dismissal.
