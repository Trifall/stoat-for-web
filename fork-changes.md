# Fork Changes — Stoat for Web

This document records fork-specific behavior in `Trifall/stoat-for-web` that must be preserved during upstream merges and future PRs. Treat it as required merge context for humans and agents working on this web-client fork.

The fork adds substantial voice, sound, push-to-talk, and settings behavior on top of upstream Stoat for Web. Many of these changes intentionally differ from upstream behavior. Do not remove or simplify them unless the fork owner explicitly asks for that.

- **Fork repository:** https://github.com/Trifall/stoat-for-web
- **Upstream repository:** https://github.com/stoatchat/for-web (remote name `upstream`)
- **Paired desktop fork:** https://github.com/Trifall/stoat-for-desktop

> **If you are an agent performing an upstream merge:** preserve the behavior documented here, create a real merge commit rather than cherry-picking or squashing upstream, and follow the material-conflict approval process below. General permission to "merge upstream" is not permission to remove or redesign a documented fork feature.

## High-Priority Preservation Rules

- Do not cherry-pick upstream commits to sync the fork. Merge upstream into the fork so GitHub recognizes the fork as not behind upstream.
- Do not resurrect the old standalone voice notification implementation. Current notification behavior is integrated through `SoundController`, the `Sounds` store, and `VoiceContext`.
- Do not replace fork mute/deafen behavior with upstream wholesale. The fork intentionally has push-to-talk-aware mute/deafen logic.
- Do not move push-to-talk source of truth fully into the web client. Desktop/main process config and active state are authoritative.
- More precisely, desktop is currently authoritative for PTT `enabled`, `keybind`, `mode`, `releaseDelay`, and resolved active state. `pushToTalkNotificationSounds` remains client-local because the current desktop bridge ignores `notificationSounds`.
- Do not collapse self voice sounds into other-user voice sounds. Self join/leave and remote participant join/leave must remain separate.
- Manual leave sound must only play on real user-initiated disconnects, not channel switches, reconnect cleanup, or internal disconnects.
- `state.sounds` is the current primary sound source of truth, but `state.voice.soundDisconnect` still gates disconnect sound calls.
- `<InstanceContext>` must wrap `<StateContext>` because application state construction consumes the active Instance.
- `<SoundContext>` must wrap `<VoiceContext>` because `VoiceContext` calls `useSound()`.
- Noise gate processing must stay compatible with enhanced RNNoise processing by chaining processors when both are enabled.
- Do not replace the forked `packages/solid-livekit-components` submodule with upstream solely because the APIs appear compatible. Its audio track behavior is part of deafen, gain, and output-device handling.

## Main Fork Feature Areas

- Voice sounds and notification behavior.
- Push-to-talk desktop integration.
- Push-to-talk-aware mute/deafen behavior.
- Voice configuration persistence.
- Noise gate and voice processing.
- Auto-reconnect for voice calls.
- Voice/settings UI routes.
- Sound settings integration.
- Fork submodule preservation.

## Important Files

- `packages/client/components/rtc/state.tsx`: central runtime integration for voice, PTT, auto-reconnect, voice sounds, screenshare sounds, and noise gate wiring.
- `packages/client/components/client/Sounds.tsx`: runtime sound controller and `SoundContext`.
- `packages/client/components/state/stores/Sounds.ts`: persistent sound toggles, master sound enable, and master volume.
- `packages/client/components/state/stores/Voice.ts`: persistent voice, PTT, noise gate, auto-reconnect, and legacy sound flags.
- `packages/client/components/rtc/NoiseGateProcessor.ts`: LiveKit audio track processor implementing the fork noise gate.
- `packages/client/components/app/interface/settings/user/voice/PushToTalkSettings.tsx`: PTT settings UI and desktop sync writes.
- `packages/client/components/app/interface/settings/user/voice/AdvancedSettings.tsx`: auto-reconnect settings UI.
- `packages/client/components/app/interface/settings/user/voice/VoiceProcessingOptions.tsx`: noise suppression/noise gate UI and live meter.
- `packages/client/components/app/interface/settings/user/notifications/Sounds.tsx`: sound settings UI, including fork sound toggles.
- `packages/client/types/types.d.ts`: desktop bridge typing for `window.pushToTalk`.
- `packages/client/src/index.tsx`: complete provider hierarchy and route-level Instance mounting.
- `packages/client/components/instance/index.tsx`: Instance configuration loading, default-instance redirects, and context setup.
- `packages/client/components/instance/Instance.ts`: configured client, endpoint, navigation, replacement-client, and reactive-limit ownership.
- `packages/client/components/client/index.tsx`: `ClientContext`, reactive `useClient()`, and controller ownership.
- `packages/client/components/client/Controller.ts`: login lifecycle and replacement-client coordination through `Instance.newClient()`.

## Release Build Identity

Desktop release builds provide `VITE_RELEASE_TAG`, which replaces the upstream root package version in the settings sidebar for that build. Standalone and development builds fall back to the root `package.json` version when the variable is absent.

## Lingui 6 Integration

The client uses the official Lingui 6 Solid integration through `@lingui/solid`, `@lingui/solid/macro`, and `@lingui/vite-plugin`. The former `packages/js-lingui-solid` submodule and its custom build tasks were removed. Fork-only source such as PTT, advanced voice settings, and Try PWA must use the official macro imports so a clean checkout does not depend on the retired workspace packages.

Translation catalogs remain generated files. Resolve source first, run extraction across all catalogs, and compile with Lingui 6 rather than restoring the old submodule or hand-merging catalog conflicts.

## Runtime Context Integration

The app currently mounts its effective provider hierarchy in this order in `packages/client/src/index.tsx`:

```tsx
<DeviceContext>
  <I18nProvider>
    <SnackbarProvider>
      <Router>
        <Route component={InstanceContext}>
          <Route component={MountContext}>
            <StateContext>
              <KeybindContext>
                <ModalContext>
                  <ClientContext>
                    <SoundContext>
                      <VoiceContext>
                        <QueryClientProvider>...</QueryClientProvider>
                      </VoiceContext>
                    </SoundContext>
                    <SyncWorker />
                  </ClientContext>
                </ModalContext>
              </KeybindContext>
              <LoadTheme />
            </StateContext>
          </Route>
        </Route>
      </Router>
    </SnackbarProvider>
  </I18nProvider>
</DeviceContext>
```

The two most important ordering constraints are:

- `InstanceContext` must wrap `StateContext`. `StateContext` constructs the application stores, and `Draft` captures `useInstance()` in its constructor for endpoint and attachment-limit behavior.
- `SoundContext` must wrap `VoiceContext`. `VoiceContext` calls `useSound()` and passes the `SoundController` into the fork `Voice` runtime class.

`InstanceContext` loads the selected app configuration, creates and configures the initial Stoat.js `Client`, and only then renders the state and runtime contexts. `Instance` owns that configured client, the API/media/proxy/Gifbox endpoints, backend feature configuration, route base, and reactive user limits. Runtime consumers should use those `Instance` fields rather than removed static feature and limit fields on `CONFIGURATION`; build-time environment values remain bootstrap or development overrides.

`ClientContext` obtains both `State` and `Instance` through their hooks and passes them to `ClientController`. The controller's lifecycle obtains every replacement SDK client through `Instance.newClient()`. `useClient()` deliberately returns `() => instance.client`; consumers must retain and invoke that accessor instead of destructuring `client` from `useInstance()` or capturing one concrete client indefinitely.

`Instance.newClient()` reuses the configured initial client for the first lifecycle initialization. Later replacements remove listeners, disconnect the old event WebSocket, create a newly configured client for the same API endpoint, and update the Instance client signal. Keep that lifecycle coordinated with `ClientContext` and `VoiceContext`; otherwise login, logout, or recovery can leave voice behavior attached to a disposed client.

`instance.limits()` is the reactive source for enforced user limits. It starts with the backend's new-user limits and updates from `client.limits` on the active client's `ready` event. Prefer it to `globalLimits`, `baseLimits`, or a one-time read from a concrete client. The Stoat.js fork calculates `new_user_hours` with `3_600_000` milliseconds per hour; keep that calculation in the SDK rather than adding a separate client-side workaround.

Alternate `/i/:host` routes currently redirect to the default instance before loading an alternate configuration. This is intentional until instance-specific persistence and session isolation are designed, so the route structure must not be described as completed multi-instance support. `Instance.href()` uses the current frontend `location.origin` and adds the instance route base for application links; backend links such as webhook URLs must use `Instance.apiUrl`.

Environment validation treats both the canonical `https://api.stoat.chat` endpoint and the legacy `https://stoat.chat/api` endpoint as default Stoat APIs after removing trailing slashes. Preserve this compatibility: either endpoint can be supplied through `VITE_API_URL` without also requiring `VITE_HOST`; genuinely custom API endpoints still require an explicit host.

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
- `disconnect`
- `enabled`
- `volume`

The store default keeps these enabled by default, with volume defaulting to `0.3`.

The sound controls remain available even when browser desktop notifications are unsupported. Audio playback is independent of the Notification API and must not be hidden by `desktopNotificationsState`.

### Sound Assets

Standard sound assets come from the brand assets submodule through:

- `packages/client/assets/sounds/`
- `packages/client/public/assets` (created as a symlink by `scripts/copyAssets.mjs`)

`SoundController` imports standard sounds through `packages/client/public/assets/sounds/` so Vite bundles the configured brand assets. Fork-only sounds that do not exist in the brand repository may be imported from:

- `packages/client/scripts/assets_fallback/sounds/`

Do not move all sound imports to `assets_fallback`. Some fallback audio files are silent placeholders, so a build can succeed while producing no audible sound. When changing asset paths, inspect the emitted files under `packages/client/dist/assets/` and verify that their sizes or audio levels match the intended source files.

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
- Remote stream-start playback is tied to screenshare publication/subscription and actual video playback; remote stream-end is tied to the tracked publication ending.
- Local screenshare end explicitly plays `streamEnd`. There is currently no equivalent explicit local `streamStart` call, so do not claim both directions are symmetric without verifying the current runtime.

### Current Sound UI Caveat

The store and controller support a master sound enable flag (`state.sounds.enabled`), and `VoiceContext` syncs it into `SoundController`, but the current settings UI exposes only event-specific toggles and master volume. It does **not** expose a master enable toggle.

Additional controller details that matter during refactors:

- One-shot sounds can overlap; `SoundController` does not globally stop the previous one-shot.
- Runtime `setVolume()` affects newly created audio nodes; it does not retroactively adjust an already-playing one-shot.
- A successful build only proves an audio file was bundled. Several fallback assets are silent placeholders, so verify the emitted audio itself.

## Push-to-Talk Desktop Integration

### Source of Truth

Push-to-talk timing and resolved active state are desktop-authoritative. The desktop main process owns global key capture, hold/toggle behavior, release delay, and the final active/inactive state sent to web.

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

The web type declarations and settings UI also include `notificationSounds`, but the paired desktop implementation currently does **not** persist, return, or apply that field. The desktop silently ignores it. `pushToTalkNotificationSounds` still works because the web settings page writes it to `state.voice` locally and the RTC runtime reads that local field.

Persistent store names in `state.voice`:

- `pushToTalkEnabled`
- `pushToTalkKeybind`
- `pushToTalkMode`
- `pushToTalkReleaseDelay`
- `pushToTalkNotificationSounds`

`Voice.setPushToTalkConfig(...)` maps bridge config into these persistent store fields. Do not describe all five as desktop-authoritative until the paired desktop repository adds `notificationSounds` to its schema, native IPC payload, preload config shape, and type declarations.

### Multi-Keybind Encoding

`pushToTalkKeybind` is intentionally still a string for compatibility.

- Legacy/single-key configs store a plain accelerator string, such as `V`.
- Dual-key configs store a JSON array string, such as `["V","Mouse4"]`.

`PushToTalkSettings.tsx` parses either format. It serializes back to JSON only when a secondary keybind exists. Duplicate primary/secondary keybinds are ignored.

Do not change this field into an array without a migration plan, because persisted data and desktop config expect a string.

The client duplicate check is case-insensitive but compares full accelerator strings, so `V` and `Shift+V` are allowed together. Test same-base-key combinations in both desktop input paths: native main-process handling and preload DOM interception do not currently select matching bindings in exactly the same way.

### Runtime Behavior

PTT state changes are handled in `VoiceContext`:

- Desktop active state `true` means mic should be enabled/unmuted.
- Desktop active state `false` means mic should be disabled/muted.
- The client routes events through `voice.setPushToTalkActive(active)`, which caches the latest desktop state even when no room exists or PTT is disabled.
- If PTT is enabled, `setPushToTalkActive()` applies the cached state through `voice.setMute(active)`.
- Desktop config changes call `voice.reconcilePushToTalk(enabled)`: enabling applies the cached PTT state; disabling restores the normal preference with `!deafen && micOn`.

On voice connect, if PTT is enabled, initial mic state is derived from `window.pushToTalk.getCurrentState().active` and applied through the same serialized `setMute()` path as later desktop events.

Desktop PTT connections start a non-blocking microphone permission request during the trusted join action. The request prefers the configured input with browser fallback semantics and stops its temporary track when permission resolves; room connection does not wait for the permission prompt, but the first LiveKit microphone capture waits for an in-flight preflight to prevent overlapping device requests.

When PTT changes mic state, `state.voice.micOn` is not persisted. This is intentional. PTT should not overwrite the user's normal mic preference.

`setMute()` is serialized through `#mutePromise` to avoid races from rapid PTT events.

`setMute()` currently refuses **all** microphone changes while deafened, not only attempts to unmute.

Mute/unmute sounds are suppressed while PTT is enabled unless `pushToTalkNotificationSounds` is true.

`getCurrentState()`/`getConfig()` are read before listener registration, while the desktop bridge's `onStateChange()` and `onConfigChange()` immediately invoke new listeners. Initial state and config are therefore processed twice. Preserve correctness if this is deduplicated; do not remove the immediate bridge callbacks without coordinating the desktop preload.

The PTT settings page is visible in a normal browser even when `window.pushToTalk` is unavailable. There is no complete browser-side PTT key engine. Enabling PTT without the desktop bridge can make calls start muted with no desktop event capable of unmuting them.

## Mute and Deafen Behavior

The fork intentionally differs from upstream here. Preserve this logic.

### Initial State

Initial microphone signal is:

```ts
voiceSettings.micOn && !voiceSettings.deafen;
```

This keeps upstream's important microphone/deafen initialization fix while preserving fork PTT behavior.

### `toggleMute()`

Manual mute behavior:

- Requires an active room.
- Does nothing while deafened.
- When desktop PTT is enabled, sends the inverse cached active state through `window.pushToTalk.setManualState(...)` so on-screen controls update the authoritative desktop latch.
- Desktop PTT manual changes flow back through `setPushToTalkActive()` and `setMute()` and do not persist `state.voice.micOn`.
- Without desktop PTT, toggles LiveKit microphone state and persists `state.voice.micOn` because this is a user/manual preference.
- Plays mute/unmute sounds only when PTT is disabled or PTT notification sounds are enabled.

### `setMute(enabled)`

Direct mute behavior for PTT:

- Serializes concurrent calls through `#mutePromise`.
- Requires an active room.
- Refuses activation while deafened and keeps the underlying track disabled.
- Disables the publication-facing track immediately on PTT release before serialized LiveKit cleanup completes.
- Re-reads current mic state inside the mutex.
- Calls `#setMicrophoneEnabled(enabled, { persistPreference: false })`.
- Rechecks deafen after asynchronous device acquisition and mutes a newly created track if deafen won the race.
- Rechecks retained PTT state after asynchronous device acquisition and mutes a newly created publication if a release won the race.
- Resynchronizes raw or processor-output track state after processor setup so the next PTT press transmits normally.
- Does not persist `micOn`.
- Plays sounds only if PTT is disabled or PTT notification sounds are enabled.

### `toggleDeafen()`

Deafen behavior:

- Persists `state.voice.deafen`.
- When deafening, stores whether the mic was on in `#micWasOnBeforeDeafen`.
- When deafening, mutes the mic without persisting `micOn`.
- When undeafening, restores the mic only if it was previously on.
- If PTT is enabled, undeafen restores according to cached `#pushToTalkActive` rather than the normal `#micWasOnBeforeDeafen` preference.
- Plays `deafen` or `undeafen` after applying the state change. The undeafen sound still plays when PTT is inactive and microphone restoration is skipped.

Actual remote-audio deafen behavior is also implemented outside `toggleDeafen()`:

- `packages/client/components/rtc/components/RoomAudioManager.tsx` passes `muted={userMute || voice.deafen()}` to remote audio tracks.
- The forked `packages/solid-livekit-components/src/components/participant/AudioTrack.tsx` converts that state into `RemoteTrackPublication.setEnabled(!muted)`.

This intentionally stops/enables the remote LiveKit publication rather than merely muting a local HTML audio element. Preserve both sides together during upstream LiveKit component refactors.

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

LiveKit's built-in reconnect events still run regardless of this setting. `autoReconnect` controls the fork's additional **fresh-token reconnect after terminal `RoomEvent.Disconnected`**, not LiveKit's normal signal reconnect policy.

If disabled:

- Set voice state to `DISCONNECTED`.
- If `state.voice.soundDisconnect` is true, play `disconnect` sound.

If enabled:

- Call `#handleReconnect()`.
- Select a LiveKit node with `#selectLiveKitNode()` and fetch a fresh token with `channel.joinCall(selectedNode)`.
- Attempt `room.connect(auth.url, auth.token, { autoSubscribe: false })` on the same room.
- Use exponential backoff capped at 10 seconds.
- Max attempts: 5.
- Retry delays after attempts 1–4 are 2, 4, 8, and 10 seconds; the first attempt is immediate.
- On success, reset attempt counter and set state to `CONNECTED`.
- On final failure, set `DISCONNECTED` and play disconnect sound if `soundDisconnect` allows it.

### LiveKit Node Selection

Upstream added latency-based LiveKit node selection for initial connections. The fork integrates that behavior with its additional fresh-token reconnect lifecycle:

- `#selectLiveKitNode()` probes every configured `features.livekit.nodes` entry concurrently and returns the first successful node.
- `wss:` probe URLs are converted to `https:` and `ws:` URLs to `http:` with `URL`, not string replacement.
- Only successful HTTP responses select a node.
- Probes share a 3-second abort timeout. An empty node list, timeout, malformed URL, rejected request, or all failed responses falls back to `"worldwide"`.
- Initial `connect(channel, auth)` only probes when it must request auth. Supplied auth bypasses selection.
- Every fork fresh-token reconnect re-probes so a terminal disconnect can fail over to a different healthy node.

Do not restore upstream's raw `Promise.race(...)` implementation without preserving these safeguards. It can hang on an empty list, reject on the first failed request, lacks a timeout/fallback, and does not cover the fork reconnect path.

Manual disconnect path:

- `disconnect(manual = true)` removes listeners before `room.disconnect()`.
- Manual disconnect plays `selfLeaveVoice`.
- Internal channel-switch disconnects call `disconnect(false)` and must not play self leave.

Current reconnect caveats:

- Terminal failure/disabled reconnect sets runtime state to `DISCONNECTED` but does not fully clear room/channel state.

Initial joins and fresh-token reconnects use a connection generation tied to the concrete room. Disconnects, channel switches, and provider cleanup invalidate that generation, cancel retained retry timers, and prevent stale token or `room.connect()` completions from affecting a newer call. Failed initial joins clean up their room, device listener, track subscription root, and call ownership.

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
channelCount: {
  ideal: 1;
}
```

The code also warns if the browser reports a stereo mic track.

### UI and Live Meter

UI file:

- `packages/client/components/app/interface/settings/user/voice/VoiceProcessingOptions.tsx`

The UI:

- Adds a `Noise Gate` toggle under voice processing.
- Shows a draggable threshold meter when enabled.
- Uses the active processor's `onLevel` callback when that processor already exists and the UI successfully attaches to it.
- Starts a preview mic stream for metering when not in a call.
- Restarts preview monitoring when the preferred input device changes.
- Updates the active processor live through a `VoiceContext` effect that calls `voice.updateNoiseGateThreshold(...)`.

The active `#noiseGateProcessor` is a plain class field rather than a Solid signal. The UI is not guaranteed to react when a processor is created, replaced, or destroyed after the settings component mounts. Preview metering also does not exactly reproduce the call pipeline: it omits enhanced RNNoise and some active-capture constraints. Do not assume the preview meter proves the complete in-call processor chain is active.

`#microphoneCaptureOptions()` and serialized `updateVoiceProcessing()` behavior allow suppression, echo cancellation, automatic gain control, and gate-enable changes to restart and reconfigure an active microphone track.

## Wayland Screen Audio Scaffolding

Upstream 0.15.0 adds `packages/client/components/rtc/virtualMic.ts`, which conditionally replaces display-capture audio with the reserved `stoat-virtual-source` device when the desktop bridge synchronously reports Wayland. The web client installs this behavior only when `window.native.isWayland()` returns the Boolean `true`; a Promise or missing bridge leaves normal capture untouched. Replaced display-audio tracks are stopped, and the reserved source is hidden from the normal microphone selector.

This web-side integration is dormant unless the paired desktop app exposes the bridge and creates the PipeWire source. Native activation, packaging, and the privacy semantics of which system audio is routed remain desktop responsibilities. Do not make the web check treat an asynchronous Promise as a truthy platform result, and do not route the virtual source through the fork's ordinary PTT/noise-gate microphone pipeline.

When `screenShareQualityAsk` is enabled, keep the screen-share settings prompt available if either multiple qualities or a screen-audio publication is available. Accounts limited to the single low-quality preset still need the prompt to enable or disable Wayland screen audio when the native system picker bypasses the custom desktop picker.

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
- `voice` and `sounds` are local-only stores. They are not part of server settings synchronization; currently only `ordering`, `notifications`, and `release-notes` are synchronized.
- Normal store writes are delayed by `DISK_WRITE_WAIT_MS = 1200`; auth bypasses the delay. There is no explicit unload flush, so do not assume the last in-memory change was persisted if the page exits immediately.

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

These are internal settings page IDs, not standalone URL routes:

- `voice` → regular voice settings
- `push_to_talk` → fork PTT settings
- `voice_advanced` → fork advanced voice settings

Regular `VoiceSettings.tsx` contains input options, processing options, and screenshare options when video is enabled. PTT and auto-reconnect remain separate entries under the hardcoded "Stoat Plus Settings" category.

The Stoat Plus advanced voice page exposes `screenShareBitrateKbps` and `screenShareFrameRate`. Bitrate defaults to `2500`, is clamped to `250-8000` in 250 kbps increments during hydration and writes, and is converted to bits per second when a new screen-share track is published. Frame rate defaults to `15` and is clamped to `5-30` in 5 FPS increments; it caps both capture and publish encoding while allowing a quality preset such as source/text mode to use a lower value. These settings intentionally affect newly started shares rather than reconfiguring an active sender. The backend currently exposes only `video_resolution`, so the 30 FPS ceiling follows the highest client screen-share preset rather than a separate server entitlement.

Upstream 0.15.0's role-management redesign is intentionally adopted as a coordinated unit: role ordering, role colour editing, permission overrides, floating create actions, and the shared save/reset surface belong to the new settings architecture. Preserve fork responsive settings hooks and overlay behavior around it, but do not restore the old role editor piecemeal.

### Layout and Modal Integration

Preserve these merge-repair changes around the settings and responsive shell:

- `packages/client/src/Interface.tsx`: `AppRoot` is a full-height flex column, the main layout is positioned relative, and the primary sidebar defaults closed on phones.
- `packages/client/src/interface/Sidebar.tsx`: `SidebarBase` remains `display: flex` and emits `data-open`.
- `packages/client/components/ui/styles.css`: the phone `.main_bar` is an absolute full-screen overlay and is hidden unless `data-open="true"`.
- `packages/client/components/modal/modals/Settings.tsx`: the settings overlay uses the high z-index and pointer-event behavior needed to remain interactive above the app shell.

These can look like ordinary upstream layout changes, but past merges broke settings interaction and mobile/sidebar presentation when only one side of the coordinated layout was retained.

### Ongoing Call UI

Fork call visibility is also integrated through:

- `packages/client/src/interface/channels/text/TextChannel.tsx`: ongoing DM/group call banner.
- `packages/client/src/interface/navigation/channels/HomeSidebar.tsx`: call indicator for active voice participants.
- `packages/client/src/interface/navigation/channels/SidebarVoicePanel.tsx`: fork active-call sidebar panel.
- `packages/client/components/ui/components/features/voice/callCard/VoiceCallCardPreview.tsx`: clickable join/switch preview.
- `packages/client/src/interface/channels/ChannelHeader.tsx`: join button behavior coordinated with `voice.showCard(channel)`.

The floating/PiP call card must be gated on `voice.room()`, keyed by the concrete `Room` instance, and pass that room to `useTracks()`. During disconnect, room and channel state are cleared together, while floating mode is reset by a later reactive effect; relying only on room context in that interval causes `useTracks()` to throw and turns an otherwise successful manual leave into an error modal. Keying the branch also remounts PiP with the correct room when switching calls.

## Desktop Bridge Typing

`packages/client/types/types.d.ts` declares `window.pushToTalk`. Keep these typings aligned with the runtime bridge in the paired desktop repository.

The client currently types and sends `notificationSounds`, but desktop does not implement that field. There are two valid future directions, and choosing between them requires coordination with the owner:

1. Keep notification-sound preference client-local and stop claiming the desktop returns it.
2. Make it desktop-authoritative by updating desktop persistence, native IPC, preload config, desktop typings, client typings, and both config-mapping paths together.

Do not "fix" only `types.d.ts`; a type-only change cannot alter the actual Electron bridge contract.

## Fork Submodules

The fork uses forked submodule URLs for at least:

- `packages/stoat.js`
- `packages/solid-livekit-components`

`packages/client/assets` points to the internal brand assets repository and has `update = none`.

During upstream merges, ensure fork-specific submodule URLs in `.gitmodules` are preserved where intended. Do not blindly take upstream `.gitmodules` if it reverts fork SDK/livekit submodules back to upstream remotes.

The forked submodules are behaviorally significant:

- `packages/stoat.js` preserves fork voice-status behavior while also merging upstream SDK changes such as user limits.
- `packages/solid-livekit-components` provides gain, output-device, and `RemoteTrackPublication.setEnabled()` behavior used by mute/deafen integration.
- `packages/client/assets` provides branded sounds and may be intentionally unavailable to Renovate/public automation.

The Stoat.js fork at `4394bc9e` merges upstream SDK `ee0a9803` while preserving fork voice join/leave/move events, global stale voice-participant clearing on `Ready`, and the optional large-server member hydration cap. It also fixes the `new_user_hours` conversion to use `3_600_000` milliseconds per hour. The web client keeps a 200-member cap for the listed large servers while using upstream's pre-hydration architecture.

Review both `.gitmodules` URLs and gitlink commit pointers. A clean parent-repository merge can still silently regress behavior by advancing a submodule to an incompatible upstream commit.

### Updating a Forked Submodule Safely

When the owner says a forked submodule has already merged its upstream, update the parent gitlink deliberately rather than running `git submodule update --remote` across the workspace:

1. Record parent and submodule status first. A lowercase `m` is local submodule content and must remain untouched unless explicitly included in the task.
2. Inside the requested submodule, fetch both remotes and verify the fork remote is current:

   ```sh
   git fetch --all --prune
   git rev-list --left-right --count origin/main...upstream/main
   git merge-base --is-ancestor upstream/main origin/main
   git merge-base --is-ancestor HEAD origin/main
   ```

   The second `rev-list` number must be `0`. The ancestry checks prove the new fork tip contains both current upstream and the previously recorded fork behavior.

3. Fast-forward the submodule working tree with `git merge --ff-only origin/main`. Do not create a new submodule merge in the parent task when the owner already pushed that merge to the submodule fork.
4. In the parent, review `git diff --submodule=log`, confirm `.gitmodules` still points at the fork, and stage only the requested gitlink.
5. A submodule `package.json` change can make the **parent workspace** `pnpm-lock.yaml` stale. Run `mise install:frozen`; if it reports an outdated lockfile, regenerate the parent lock with `pnpm install --no-frozen-lockfile`, inspect the lock diff, then rerun the frozen install.
6. If pnpm's `minimumReleaseAge` blocks an explicitly approved new Stoat package, do not silently disable the policy or edit global config. Ask the owner whether to add the package name to `minimumReleaseAgeExclude`, then verify again with an ordinary frozen install.
7. Rebuild the submodule and type-check the parent. Generated API packages may remove or consolidate exported types even when the submodule itself builds. Adapt obsolete parent type references only after confirming the replacement in the installed declarations.
8. Commit the parent gitlink, lockfile, and any required compatibility edits together. Push the submodule fork first if it was changed locally; a parent gitlink must never reference an unpushed commit.

## Material Conflict Escalation and User Approval

When upstream and the fork both make important changes to the same subsystem, do not resolve the conflict solely by selecting `ours`, selecting `theirs`, or mechanically combining lines. A syntactically valid result can still remove fork behavior, reject an important upstream improvement, or create an integration whose product behavior was never approved.

### When to stop and ask

Pause before editing a conflict area when the decision could materially change functionality, architecture, persistence, UI behavior, accessibility, security, performance, packaging, compatibility, or maintenance strategy. This includes:

- Upstream replaces or substantially redesigns voice state, LiveKit integration, sound playback, settings stores, providers, preload/desktop bridge APIs, device handling, responsive layout, or a forked submodule API.
- Preserving the fork would discard an important upstream feature, bug fix, security fix, migration, or architectural change.
- Adopting upstream would remove, weaken, or substantially rewrite PTT, mute/deafen semantics, reconnect, noise gate, sound behavior, call UI, persistence, or responsive/settings repairs documented here.
- Both implementations are valid but require a product choice, such as which process owns a setting, when sounds play, whether a reconnect counts as a new call, or how deafen affects remote publications.
- Integration requires a data migration, new dependency, compatibility layer, major refactor, submodule replacement, or coordinated change in `Trifall/stoat-for-desktop`.
- Existing tests and documentation do not establish the intended behavior well enough to choose safely.

Routine, behavior-preserving conflicts may be resolved without interruption when the outcome is unambiguous, such as combining non-overlapping imports, regenerating catalogs/lockfiles after an approved dependency merge, preserving documented fork submodule URLs, or accepting upstream tooling versions while retaining fork tasks.

### Required analysis for each decision area

Investigate both sides before asking. For every material subsystem, present:

1. **Conflict area:** exact files, components, stores, methods, and submodules involved.
2. **Fork behavior:** what currently happens, why it exists, and which web/desktop code depends on it.
3. **Upstream behavior:** what changed upstream, the problem it solves, and whether it replaces or overlaps the fork.
4. **Compatibility and risk:** what can coexist, what cannot, and implications for runtime state, persisted data, IPC, UI, accessibility, platforms, and submodules.
5. **Recommended integration:** the preferred approach and why it best preserves the fork while incorporating upstream improvements.
6. **Alternatives:** concise viable choices and the behavior/risk of each.
7. **Validation plan:** type checks, builds, focused manual checks, and any paired-desktop verification required.

The default recommendation should usually be to **integrate both behaviors by adapting the fork to the new upstream architecture**, not to reject upstream or freeze the old implementation. Recommend removing fork behavior only when it is obsolete, duplicated by upstream, unsafe, or explicitly no longer desired.

### Ask separately and wait for the answer

Ask for a separate decision for each materially different area. Do not bundle PTT, reconnect, sounds, noise processing, settings layout, and submodule changes into one generic approval request merely because they occur in the same merge.

Use this format:

```text
Conflict area: PTT-aware mute/deafen handling in rtc/state.tsx

Fork behavior: ...
Upstream change: ...
Compatibility/risk: ...

Recommended: Integrate upstream's microphone fix into the fork's PTT-aware
state machine because ...

Options:
1. Integrate both (Recommended): ...
2. Prefer upstream: ...
3. Preserve the current fork behavior: ...

Which approach should I apply for this area?
```

Put the recommended option first, label it clearly, and allow a custom answer. General permission to perform the merge does not authorize removal of documented fork behavior.

### Repository state while waiting

- Keep the current merge and worktree state intact. Do not abort, reset, clean, update submodules, commit, or push while a material decision is pending unless the owner explicitly asks.
- Independent routine conflicts may be resolved while waiting, but do not edit the disputed area in a way that prejudges the decision.
- Record and apply each answer only to its corresponding area.
- If implementation reveals a materially different tradeoff from what was presented, stop and ask again.
- Before committing, summarize every material area, the owner's decision, and how the resulting code implements it.

## Reusable Upstream Merge Process

### Before Merging

1. Fetch both remotes and inspect the exact divergence:

   ```sh
   git fetch --all --prune
   git rev-list --left-right --count main...upstream/main
   git log --oneline main..upstream/main
   ```

2. Inspect `git status --short --branch` and `git submodule status` before changing anything. A lowercase `m` in status means a submodule working tree is locally modified. Do not stage, reset, update, or clean that submodule unless the owner explicitly asks.
3. Confirm the pull request head is the same upstream history being merged. The PR is useful for reviewing the missing commits, but resolve the merge locally when GitHub reports conflicts.
4. Review incoming commits against every feature area in this document. Identify likely material conflicts before starting and ask early when the upstream design clearly requires a product decision.
5. Merge the upstream branch directly without committing immediately:

   ```sh
   git merge --no-ff --no-commit upstream/main
   ```

   Do not cherry-pick, squash, rebase, or recreate upstream commits. The upstream tip must remain an ancestor of fork `main`.

### Resolving Conflicts

- Classify every conflict as routine or material. Follow the approval process above for each material area before editing it.
- Audit files in material subsystems even when Git reports a clean automatic merge. A line-level merge can be syntactically valid while applying upstream behavior only to the initial path and leaving a fork lifecycle path inconsistent. Compare the pre-merge fork file, upstream file, and merged result for voice, PTT, reconnect, sounds, processing, settings, responsive layout, and submodule pointers.
- Resolve coordinated refactors as a group. If upstream changes a provider, context, or component API across several files, mixing old and new versions file-by-file can compile incorrectly or leave inconsistent runtime behavior.
- Use `fork-changes.md` to identify fork-owned behavior, then compare all three conflict stages when intent is unclear:

  ```sh
  git show :1:path/to/file  # merge base
  git show :2:path/to/file  # fork side
  git show :3:path/to/file  # upstream side
  ```

- Preserve fork behavior without rejecting unrelated upstream improvements. For example, keep fork voice controls while incorporating upstream layout, mobile, accessibility, or navigation changes around them.
- Search the whole tree for conflict markers before staging:

  ```sh
  rg '^(<<<<<<<|=======|>>>>>>>)'
  ```

- Translation catalogs are generated files. Resolve source conflicts first, choose a clean catalog side only to remove conflict markers, then regenerate all catalogs rather than hand-merging repeated `.po` conflicts:

  ```sh
  pnpm --filter client exec lingui extract
  ```

  Stage the regenerated catalogs before checking for unmerged paths. `mise lingui:check` is designed for a clean worktree and intentionally fails while catalog changes are staged, so extraction/compilation plus `git diff --check` are the useful merge-time validations.

- Run the formatter on manually combined source files. Formatting also catches malformed JSX and import ordering that can be hard to see in a large conflict resolution.

### Verification Before Pushing

1. Run the type check and the real project build path:

   ```sh
   mise install:frozen
   mise build:deps
   mise build:check
   mise build
   ```

   `mise build` configures assets and compiles Lingui, but it assumes workspace dependencies are already installed and built. `mise install:frozen` and `mise build:deps` are therefore part of a clean verification path. These tasks may update generated catalogs, Panda output, and the `public/assets` symlink; inspect the worktree afterward and do not stage unrelated generated changes.

2. Run `git diff --check` and confirm `git diff --name-only --diff-filter=U` is empty.
3. Re-run the preservation checklist below and inspect `.gitmodules` explicitly.
4. Verify the merge commit has both expected parents and upstream is an ancestor:

   ```sh
   git show --no-patch --format='%H%n%P%n%s' HEAD
   git merge-base --is-ancestor upstream/main main
   git rev-list --left-right --count main...upstream/main
   ```

   The second number from `rev-list` must be `0` before pushing.

5. Fetch `origin` immediately before pushing and ensure it is still an ancestor of local `main`. This avoids overwriting concurrent fork work:

   ```sh
   git fetch origin --prune
   git merge-base --is-ancestor origin/main main
   git push origin main
   ```

6. Confirm GitHub recognizes the fork as not behind. A direct API comparison is more reliable than only checking the local refs:

   ```sh
   gh api repos/stoatchat/for-web/compare/main...Trifall:main \
     --jq '{status: .status, ahead_by: .ahead_by, behind_by: .behind_by}'
   ```

   `behind_by` must be `0`. A PR whose head was upstream may automatically become merged once fork `main` contains that upstream tip.

### Build Artifact Checks

- The desktop build copies `packages/client/dist` into its bundled `web-dist`, so verify the web artifacts before packaging desktop.
- `mise build` runs `install:assets`, which executes `packages/client/scripts/copyAssets.mjs` and configures `packages/client/public/assets` from the brand asset submodule when it is populated.
- A successful build only proves that an audio file was bundled, not that it is audible. For sound regressions, locate the hashed output in `packages/client/dist/assets/`, compare its size to the intended source, and use `ffprobe`/`ffmpeg` volume detection when necessary.
- Keep build output and generated `dist` directories out of commits unless the repository explicitly starts tracking them.

## Merge Checklist for Future Agents

When merging upstream, verify these before finalizing:

- `SoundContext` still wraps `VoiceContext`.
- `state.sounds` still contains fork toggles and master volume/enabled fields.
- `VoiceContext` still syncs `state.sounds.enabled` and `state.sounds.volume` into `SoundController`.
- Self join plays on `RoomEvent.Connected`.
- Self leave only plays for manual `disconnect(true)`.
- Remote join/leave sounds are not fired for initial room participant list.
- Reconnect churn does not trigger false join/leave sounds.
- Desktop remains authoritative for PTT enabled/keybind/mode/release delay and resolved active state; notification-sound preference remains explicitly client-local unless both repositories are migrated together.
- PTT active/inactive events still cache state through `setPushToTalkActive()` and apply enabled PTT through serialized `voice.setMute(active)`.
- Enabling/disabling PTT still calls `reconcilePushToTalk()` so cached PTT state or normal `micOn` preference is restored correctly.
- PTT mute changes do not persist `state.voice.micOn`.
- `setMute()` remains serialized through `#mutePromise`.
- `toggleMute()` and `toggleDeafen()` remain PTT-aware.
- Remote deafen still flows through `RoomAudioManager` and the forked LiveKit `AudioTrack` publication enable/disable behavior.
- Deafen and undeafen state changes still call their corresponding `SoundController` sounds, including undeafen while PTT prevents microphone restoration.
- Auto-reconnect remains enabled by default and fetches fresh voice tokens.
- Initial joins and every fresh-token reconnect use resilient `#selectLiveKitNode()` probing with a 3-second timeout and `"worldwide"` fallback; supplied auth bypasses probing.
- Disconnect sound remains gated by `state.voice.soundDisconnect`.
- Noise gate still chains after RNNoise when both are enabled.
- Noise gate processors are retained across mute/PTT cycles and destroyed when voice disconnects or processing is reconfigured.
- Client bridge typings match the paired desktop runtime; any `notificationSounds` authority change is coordinated across both repositories rather than being type-only.
- `.gitmodules` keeps fork remotes for forked submodules.
- Gitlink pointers for `stoat.js` and `solid-livekit-components` preserve the fork behavior described above.
- Responsive `Interface.tsx`/`Sidebar.tsx`/`styles.css` behavior and settings overlay pointer/z-index fixes remain coordinated.
- Standard sounds resolve through `public/assets/sounds`; only genuinely fork-only sounds use `scripts/assets_fallback/sounds`.
- Built sound artifacts are not silent placeholders.

## Recommended Verification After Voice/Sound Merges

Run at least:

```sh
mise install:frozen
mise build:deps
mise build:check
mise build
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

---

_Last updated: after integrating upstream 0.15.0, Lingui 6, the role-management redesign, guarded Wayland screen-audio scaffolding, and the merged Stoat.js fork while preserving fork voice, PTT, sound, fullscreen, and responsive behavior._
