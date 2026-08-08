# Agent Guidelines for Stoat for Web

This file contains practical rules for agents implementing features or refactoring this repository. Follow the repository's existing architecture and patterns before introducing new abstractions.

This is a behaviorally significant fork of upstream Stoat for Web. Read `fork-changes.md` before changing voice, sound, push-to-talk, settings, responsive layout, desktop integration, or forked submodules. That document is the detailed source of truth; this file is the day-to-day implementation checklist.

## Start With Context

### Do

- Inspect the relevant components, stores, runtime controllers, and package configuration before editing.
- Trace state from its source through every UI consumer instead of inferring behavior from rendered HTML.
- Check `git status --short` before and after work, including submodule state.
- Keep unrelated user changes and dirty submodules untouched.
- Prefer the smallest behaviorally complete change that fits existing patterns.

### Do Not

- Do not use generated DOM structure or CSS classes as application state when typed runtime state is available.
- Do not reset, clean, replace, or update unrelated modified files or submodules.
- Do not introduce a second source of truth for state already owned by a store or runtime controller.
- Do not add compatibility layers unless persisted data, an external API, shipped behavior, or another concrete consumer requires one.

## Fork Ownership and Architecture

### Do

- Preserve documented fork behavior while incorporating compatible upstream improvements.
- Treat `packages/client/components/rtc/state.tsx` as a central integration point for voice, PTT, reconnect, sounds, screen-share events, and noise processing.
- Keep `<SoundContext>` outside `<VoiceContext>` in `packages/client/src/index.tsx`; `VoiceContext` depends on `useSound()`.
- Resolve coordinated refactors as a group when a provider, runtime controller, store, UI component, desktop bridge, or submodule API changes across several files.
- Review `fork-changes.md` for behavioral invariants before simplifying code that appears redundant or legacy.
- Preserve fork behavior even in files that merge cleanly; automatic line merges can still produce inconsistent lifecycle behavior.

### Do Not

- Do not replace fork voice, mute/deafen, sound, reconnect, PTT, or settings behavior wholesale with upstream implementations.
- Do not resurrect removed standalone voice notification code; notifications are integrated through `VoiceContext`, `SoundController`, and state stores.
- Do not reorder runtime providers without tracing every hook dependency.
- Do not assume an upstream implementation is equivalent because its public API or UI looks similar.
- Do not remove known caveats or legacy fields merely because they appear unused without checking persisted data and runtime gates.

## Instance and Runtime Contexts

### Do

- Preserve the effective provider order in `packages/client/src/index.tsx`: `DeviceContext` > `I18nProvider` > `SnackbarProvider` > `Router` > `InstanceContext` > `StateContext` > `KeybindContext` > `ModalContext` > `ClientContext` > `SoundContext` > `VoiceContext` > `QueryClientProvider`.
- Keep `InstanceContext` outside `StateContext`; the draft store captures `useInstance()` during state construction. Keep `SoundContext` outside `VoiceContext` because voice calls `useSound()`.
- Treat `Instance` as the owner of the configured Stoat.js client, API/media/proxy/Gifbox endpoints, backend feature configuration, navigation base, and reactive user limits.
- Obtain the active SDK client through the accessor returned by `useClient()` and call that accessor inside reactive work or at the point of use. Let `ClientController` replace clients through `Instance.newClient()`.
- Read user limits through `instance.limits()` so login-time `ready` updates remain reactive. Use `instance.config`, `instance.apiUrl`, `instance.mediaUrl`, and `instance.proxyUrl` for runtime backend data instead of removed static feature or limit fields on `CONFIGURATION`.
- Use `Instance.href()` for frontend navigation and shared application links, and `Instance.apiUrl` for actual backend API endpoints such as webhook URLs.
- Preserve the current redirect from `/i/:host` to the default instance until persistence and session isolation for multiple instances are deliberately implemented.
- Preserve environment compatibility for both `https://api.stoat.chat` and the legacy `https://stoat.chat/api` default API value, including trailing-slash normalization, without requiring `VITE_HOST`.

### Do Not

- Do not move `StateContext` outside `InstanceContext` or reorder another provider across a context it consumes.
- Do not destructure `client` from `useInstance()` or retain one concrete client for a provider's lifetime; both patterns lose reactivity when login, logout, or lifecycle recovery replaces the client.
- Do not construct replacement SDK clients outside `Instance.newClient()` or bypass the coordinated `ClientContext` and `VoiceContext` cleanup paths.
- Do not describe `/i/:host` as working multi-instance support while all alternate hosts are intentionally redirected.
- Do not compensate in client code for the Stoat.js `new_user_hours` duration multiplier caveat; fix and push the SDK fork before advancing its parent gitlink.

## Persistent State and Desktop Boundaries

### Do

- Use `state.voice` for persistent voice/PTT/processing settings and `state.sounds` for current sound toggles, master enable, and volume.
- Update each store's defaults and `clean(input)` validation when adding or changing persisted fields.
- Account for delayed `localforage` writes; normal settings writes are not guaranteed to flush if the page exits immediately.
- Keep manual microphone preferences distinct from transient PTT-driven state.
- Treat desktop/main as authoritative for PTT `enabled`, `keybind`, `mode`, `releaseDelay`, and resolved active state.
- Keep `pushToTalkNotificationSounds` client-local until the paired desktop repository implements that field end to end.
- Coordinate bridge changes across desktop persistence, IPC, preload APIs, runtime behavior, and `packages/client/types/types.d.ts`.
- Preserve the string storage format of `pushToTalkKeybind`, including JSON-array strings for dual bindings, unless a migration is explicitly designed.

### Do Not

- Do not persist transient PTT mute/unmute events into the user's normal `micOn` preference.
- Do not move PTT timing or resolved active-state logic into the browser client.
- Do not make type-only desktop bridge changes and assume the runtime contract changed.
- Do not change persisted field shapes without a migration and cleanup strategy.
- Do not remove legacy sound fields casually; `state.voice.soundDisconnect` still gates disconnect playback and persisted clients may contain older values.

## Voice Runtime Preservation

### Do

- Preserve push-to-talk-aware `toggleMute()`, `setMute()`, and `toggleDeafen()` semantics.
- Keep all PTT microphone changes serialized through `#mutePromise`, including initial state application from `RoomEvent.Connected`.
- Treat LiveKit publication mute state, raw capture tracks, and processor output `MediaStreamTrack.enabled` flags as separate controls. Keep immediate PTT release muting, then resynchronize the publication-facing track after asynchronous LiveKit activation.
- Establish microphone permission during a trusted user-initiated voice action before relying on desktop IPC or another background event to activate capture. Start the request synchronously but do not await it before connecting, use the configured input with graceful fallback constraints, stop temporary tracks, and make the first LiveKit capture wait for any in-flight preflight so the requests cannot overlap.
- Keep self join/leave sounds separate from remote participant join/leave sounds.
- Play self leave only for real user-initiated `disconnect(true)` calls; channel switches and internal cleanup use `disconnect(false)`.
- Gate initial participant notifications so joining an existing room does not produce join-sound spam.
- Suppress false leave/join sounds caused by reconnect churn.
- Preserve fresh-token auto-reconnect behavior and resilient LiveKit node selection, including timeout and `"worldwide"` fallback.
- Chain enhanced RNNoise before the noise gate when both processors are enabled.
- Preserve remote deafen behavior across `RoomAudioManager` and the forked LiveKit `AudioTrack` publication enable/disable implementation.

### Do Not

- Do not collapse self and remote voice events into a single sound path.
- Do not assume that unmuting a LiveKit publication re-enables a publication-facing or processor output `MediaStreamTrack` that application code disabled directly.
- Do not defer the first microphone permission request exclusively to PTT or desktop IPC events that Chromium may not treat as trusted user gestures.
- Do not block room connection on a permission prompt; `getUserMedia()` is allowed to remain pending indefinitely when the user ignores it.
- Do not initialize the PTT microphone directly from `RoomEvent.Connected`; bypassing `#mutePromise` can lose a toggle transition while the first publication is pending.
- Do not play manual leave sounds for reconnect cleanup or internal channel changes.
- Do not assume LiveKit's built-in reconnect behavior replaces the fork's terminal-disconnect fresh-token reconnect.
- Do not replace resilient node selection with a raw `Promise.race()` that can reject early, hang, or omit fallback behavior.
- Do not flatten the RNNoise/noise-gate chain into mutually exclusive processing.
- Do not infer that local screen-share start/end sound behavior is symmetric without checking the current event paths.

## Sound and Asset Changes

### Do

- Add persistent event toggles in `packages/client/components/state/stores/Sounds.ts` and runtime playback in `packages/client/components/client/Sounds.tsx`.
- Keep runtime controller enable and volume synchronized reactively from `state.sounds`.
- Resolve standard sounds through `packages/client/public/assets/sounds/`, backed by the brand assets submodule.
- Use `packages/client/scripts/assets_fallback/sounds/` only for genuinely fork-only assets.
- Inspect emitted asset sizes and, when audio matters, verify the actual audio level or content.
- Remember that runtime volume changes affect newly created audio nodes, not an already-playing one-shot or ringtone.

### Do Not

- Do not move all sound imports to fallback assets; some fallback files are intentionally silent placeholders.
- Do not treat a successful bundle as proof that an audio asset is audible or correct.

## SolidJS and UI State

### Do

- Keep derived UI state reactive by reading Solid accessors inside derived functions, effects, and JSX.
- If running into problems, look up and research SolidJS documentation to understand the behavior of the constructs you are using.
- Put call-wide state used by multiple components in the existing voice controller rather than duplicating local signals.
- Derive visibility from one shared accessor when a control, layout region, and rendered list must agree.
- Check related modes together, including focused, filtered, maximized, fullscreen, floating, and disconnected states.
- Reset call-scoped UI state when leaving a call unless the feature is intentionally persistent.
- Ensure controls have translated tooltips or other accessible labels.
- Test desktop and narrow/mobile layouts for any size, position, overflow, or responsive change.

### Do Not

- Do not let a control remain visible when its action cannot change visible output.
- Do not reserve empty layout space for a filtered or empty list.
- Do not calculate a button's eligibility from an unfiltered collection while rendering a filtered collection.
- Do not let application fullscreen sizing and in-pane maximize sizing override each other.
- Do not assume a successful type check proves reactive behavior or layout behavior is correct.

## Voice, Camera, and Screen Share UI

Relevant files include:

- `packages/client/components/rtc/state.tsx`
- `packages/client/components/ui/components/features/voice/callCard/VoiceCallCard.tsx`
- `packages/client/components/ui/components/features/voice/callCard/VoiceCallCardActiveRoom.tsx`
- `packages/client/components/ui/components/features/voice/callCard/VoiceCallCardActions.tsx`
- `packages/client/components/ui/components/features/voice/callCard/ParticipantTile.tsx`

### Do

- Use LiveKit track references and publication state to identify active camera and screen-share video.
- Remember that camera entries may have placeholders while screen shares are separate track references.
- Treat camera and screen-share publications as video when implementing video-only views.
- Keep focused-track lookup consistent with the currently visible track set.
- Clear or replace focus when filtering makes the focused track unavailable.
- Fall back to showing participants when a video-only filter would otherwise produce an empty call pane.
- Disable or clear video-only filtering when the final active video publication disappears.
- Keep `screenShareBitrateKbps` persisted and validated in kilobits per second, then convert it to bits per second only at the LiveKit publish boundary. Preserve the 250-8000 kbps bounds and 250 kbps increments unless intentionally redesigning the setting.
- Keep `screenShareFrameRate` persisted and validated between 5 and 30 FPS in 5 FPS increments. Apply it to both capture constraints and LiveKit's publish encoding, while allowing quality presets such as text mode to impose a lower frame rate.
- Treat screen-share bitrate changes as applying to newly published shares; changing the persisted value does not reconfigure an active `RTCRtpSender`.
- Compute secondary focused-view tracks once and use that result for the show/hide control, strip sizing, and `TrackLoop`.
- Keep in-pane maximize constrained to the channel content width so it does not cover the left navigation or become browser/application fullscreen.

### Do Not

- Do not query for `<video>` elements or depend on `lk-participant-media-video` attributes to decide which participants have video.
- Do not equate every camera placeholder with active video.
- Do not pass the persisted kbps value directly to LiveKit's `maxBitrate`, which expects bits per second.
- Do not claim the backend exposes a frame-rate entitlement; the current 30 FPS cap follows the highest client quality preset because only `video_resolution` is provided.
- Do not leave `Hide Others` or `Show Others` visible when filtering leaves no non-focused tracks to show.
- Do not hide every participant when no camera or screen-share publication is active.
- Do not make a focused, filtered, or maximized view break the existing true-fullscreen flow.

## Lingui and User-Visible Text

This repository uses Lingui macros and generated catalogs. Adding a translated string in source without updating and compiling catalogs can produce runtime warnings such as `Uncompiled message detected!`.

### Do

- Wrap every new user-visible label, tooltip, menu item, status, and error in the existing Lingui macro pattern.
- Keep the settings version display sourced from build-time `VITE_RELEASE_TAG` when provided, with the root package version as the development and standalone-web fallback.
- Run the repository workflow after adding or changing messages:

  ```sh
  mise lingui
  ```

- Expect `mise lingui` to extract messages into all configured `.po` catalogs and compile runtime TypeScript catalogs.
- Confirm the English source catalog contains every new message with a source fallback.
- Inspect generated catalog changes and keep only changes produced by the intended source edits.
- Rebuild after compilation to ensure no uncompiled-message warning remains.
- Resolve catalog merge conflicts in source first, then regenerate catalogs instead of manually merging repeated `.po` conflicts.
- Use extraction/compilation plus `git diff --check` while catalogs are intentionally modified; `mise lingui:check` expects a clean catalog worktree and will fail when generated catalog changes are present.

### Do Not

- Do not assume using `t\`...\`` in a component is enough by itself.
- Do not add raw English UI text when the surrounding component uses Lingui.
- Do not hand-edit compiled `messages.ts` output.
- Do not hand-copy message IDs or hashes into catalogs.
- Do not omit catalog extraction because the UI appears to fall back to English during development.
- Do not manually resolve generated catalog content when it can be deterministically regenerated from source.

## Responsive Shell, Settings, and Ongoing Calls

### Do

- Preserve the coordinated responsive shell behavior across `src/Interface.tsx`, `src/interface/Sidebar.tsx`, and `components/ui/styles.css`.
- Keep the primary sidebar closed by default on phones and preserve its `data-open`-driven overlay behavior.
- Preserve settings overlay z-index and pointer-event behavior in `components/modal/modals/Settings.tsx`.
- Check ongoing-call behavior across text-channel banners, home/sidebar indicators, call-card previews, channel headers, and the active-call sidebar panel.
- Treat the internal settings IDs `voice`, `push_to_talk`, and `voice_advanced` as settings-page identifiers, not standalone URL routes.
- Test UI changes with the member sidebar, left navigation, floating call card, phone drawer, modals, and browser fullscreen where relevant.

### Do Not

- Do not repair only one file in a coordinated responsive layout change.
- Do not let an overlay become visually correct but non-interactive because of pointer-event or stacking-context regressions.
- Do not assume call visibility is controlled by only the main call card.

## Forked Submodules and Dependencies

Behaviorally significant submodules include `packages/stoat.js`, `packages/solid-livekit-components`, and the brand assets submodule.

### Do

- Inspect `.gitmodules`, gitlink pointers, and submodule worktree state before dependency or LiveKit work.
- Treat lowercase `m` in parent `git status` as local submodule content that must remain untouched unless explicitly requested.
- Preserve fork remotes and verify that any intended new gitlink contains both fork behavior and current upstream history.
- Recheck the parent `pnpm-lock.yaml` after a submodule `package.json` changes.
- Rebuild changed submodules and type-check the parent against their generated declarations.
- Ensure a parent gitlink never points to an unpushed submodule commit.

### Do Not

- Do not run broad `git submodule update --remote`, reset, clean, or checkout commands over the workspace.
- Do not replace `packages/solid-livekit-components` with upstream based only on apparent API compatibility; its gain, output-device, and deafen behavior is required.
- Do not blindly accept upstream `.gitmodules` or gitlink updates.
- Do not disable pnpm release-age policy to force a dependency update without owner approval.

## Upstream Changes and Material Conflicts

### Do

- Use a real upstream merge commit when synchronizing the fork; preserve upstream ancestry.
- Classify conflicts as routine or material before resolving them.
- Stop and ask when a decision changes architecture, persistence, ownership, IPC, accessibility, responsive behavior, packaging, security, performance, or documented fork behavior.
- Investigate both implementations before asking: identify exact files, fork behavior, upstream behavior, compatibility risks, a recommendation, alternatives, and a validation plan.
- Ask for separate decisions for materially different subsystems.
- Prefer integrating fork behavior into a sound new upstream architecture when both can coexist.
- Keep the merge and worktree intact while awaiting a material decision.

### Do Not

- Do not sync upstream by cherry-picking, squashing, rebasing, or recreating upstream commits.
- Do not resolve material conflicts by blindly choosing `ours`, choosing `theirs`, or mechanically combining lines.
- Do not interpret general permission to merge upstream as permission to redesign or remove documented fork features.
- Do not bundle unrelated product decisions into one approval question.
- Do not abort, reset, clean, update submodules, commit, or push while a material decision is pending unless explicitly requested.

## Verification

### Do

- Format changed source files with Prettier.
- Run the repository type-check task:

  ```sh
  mise build:check
  ```

- Run targeted ESLint checks for changed source files.
- For a clean full verification path, install and build workspace dependencies before the project build:

  ```sh
  mise install:frozen
  mise build:deps
  mise build:check
  mise build
  ```

- Run the production build for changes involving runtime catalogs, assets, CSS generation, or bundling:

  ```sh
  mise build
  ```

- Run `git diff --check` and inspect the complete final diff.
- Check for unresolved conflicts with `git diff --name-only --diff-filter=U`.
- Inspect the worktree after mise tasks because catalog generation, Panda output, assets, and symlinks may change.
- Perform manual multi-user call testing for voice UI behavior that cannot be established by static checks.

### Do Not

- Do not report a check as passing if it failed because of a pre-existing issue; state the exact limitation.
- Do not treat a successful production build as proof that every interactive edge case works.
- Do not commit generated `dist` output unless repository policy explicitly changes to track it.
- Do not stage unrelated generated catalog, asset, symlink, Panda, lockfile, or submodule changes.

### Manual Voice Checks

When touching voice, sound, PTT, processing, or call UI, test the relevant paths with real participants where possible:

- Join and manually leave a voice channel; verify self sounds and cleanup.
- Switch channels; verify internal disconnect does not act like a manual leave.
- Have another participant join and leave after connection; verify remote events do not fire for the initial participant list.
- Trigger a reconnect or temporary network failure; verify retry behavior and no false join/leave sound spam.
- Exercise camera, screen share, focus, video-only filtering, secondary-strip show/hide, maximize, and true fullscreen in combination.
- Test one video stream plus hidden non-video users and multiple simultaneous video streams.
- Enable PTT; verify desktop active state controls the mic without overwriting the saved manual mic preference.
- Deafen and undeafen with the mic on; verify remote publication behavior and PTT-aware mic restoration.
- Enable noise gate and enhanced suppression together; verify metering and the chained in-call processor path.

## Feature Completion

### Do

- Record meaningful edge cases, architectural ownership, persistence behavior, and cross-package dependencies discovered during implementation.
- Explain any manual checks that remain necessary after automated verification.
- Review whether the feature adds fork-specific behavior that an upstream merge could accidentally remove.
- After finishing a feature or system redesign, consider adding its important behavior, ownership, edge cases, and conflict risks to `fork-changes.md` so future upstream merges preserve it.

### Do Not

- Do not leave important maintenance constraints only in chat history or a pull request description.
- Do not describe temporary implementation details as stable architecture without verifying their callers and lifecycle.
