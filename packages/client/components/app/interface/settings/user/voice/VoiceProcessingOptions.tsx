import { Show, createEffect, createSignal, on, onCleanup } from "solid-js";

import { Trans } from "@lingui-solid/solid/macro";

import { useState } from "@revolt/state";
import {
  CategoryButton,
  Checkbox,
  Column,
  Text,
} from "@revolt/ui";
import { CategoryCollapse } from "@revolt/ui/components/design/CategoryButton";
import { useVoice } from "../../../../../rtc/state";

/**
 * Voice processing options
 */
export function VoiceProcessingOptions() {
  const state = useState();

  return (
    <Column>
      <Text class="title">
        <Trans>Voice Processing</Trans>
      </Text>
      <CategoryButton.Group>
        <NoiseSuppression />
        <CategoryButton
          icon="blank"
          action={<Checkbox checked={state.voice.echoCancellation} />}
          onClick={() =>
            (state.voice.echoCancellation = !state.voice.echoCancellation)
          }
        >
          <Trans>Browser Echo Cancellation</Trans>
        </CategoryButton>
        <CategoryButton
          icon="blank"
          action={<Checkbox checked={state.voice.autoGainControl} />}
          onClick={() =>
            (state.voice.autoGainControl = !state.voice.autoGainControl)
          }
        >
          <Trans>Automatic Gain Control</Trans>
        </CategoryButton>
        <CategoryButton
          icon="blank"
          action={<Checkbox checked={state.voice.noiseGateEnabled} />}
          onClick={() =>
            (state.voice.noiseGateEnabled = !state.voice.noiseGateEnabled)
          }
          description={<Trans>Silence your mic when you're not speaking</Trans>}
        >
          <Trans>Noise Gate</Trans>
        </CategoryButton>
      </CategoryButton.Group>
      <Show when={state.voice.noiseGateEnabled}>
        <NoiseGateSettings />
      </Show>
    </Column>
  );
}

/**
 * Noise gate threshold slider with live mic level meter.
 *
 * When in a call with noise gate active, uses the processor's onLevel callback
 * (post-RNNoise). Otherwise falls back to a preview stream with matching
 * browser constraints.
 */
function NoiseGateSettings() {
  const state = useState();
  const voice = useVoice();
  const [micLevel, setMicLevel] = createSignal(-100);

  // --- Fallback preview monitoring (when not in a call) ---
  let audioCtx: AudioContext | undefined;
  let analyser: AnalyserNode | undefined;
  let source: MediaStreamAudioSourceNode | undefined;
  let stream: MediaStream | undefined;
  let rafId: number | undefined;

  async function startPreviewMonitoring() {
    try {
      const deviceId = state.voice.preferredAudioInputDevice;
      const audioConstraints: MediaTrackConstraints = {
        ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
        noiseSuppression: state.voice.noiseSupression === "browser",
        echoCancellation: state.voice.echoCancellation,
      };
      stream = await navigator.mediaDevices.getUserMedia({
        audio: audioConstraints,
      });

      audioCtx = new AudioContext();
      source = audioCtx.createMediaStreamSource(stream);
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.3;
      source.connect(analyser);

      const dataArray = new Float32Array(analyser.fftSize);

      const measure = () => {
        if (!analyser) return;
        analyser.getFloatTimeDomainData(dataArray);

        let sumSquares = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sumSquares += dataArray[i] * dataArray[i];
        }
        const rms = Math.sqrt(sumSquares / dataArray.length);
        const db = 20 * Math.log10(Math.max(rms, 1e-10));
        setMicLevel(db);

        rafId = requestAnimationFrame(measure);
      };
      measure();
    } catch (err) {
      console.warn("[NoiseGate] Could not access microphone for level meter:", err);
    }
  }

  function stopPreviewMonitoring() {
    if (rafId) cancelAnimationFrame(rafId);
    source?.disconnect();
    analyser?.disconnect();
    stream?.getTracks().forEach((t) => t.stop());
    audioCtx?.close();
    audioCtx = undefined;
    analyser = undefined;
    source = undefined;
    stream = undefined;
    rafId = undefined;
  }

  // --- Wire up the level source ---
  createEffect(() => {
    const processor = voice.noiseGateProcessor;

    if (processor) {
      // In a call with noise gate active: use processor levels (post-RNNoise)
      stopPreviewMonitoring();
      const handler = (db: number) => setMicLevel(db);
      processor.onLevel = handler;
      onCleanup(() => {
        if (processor.onLevel === handler) {
          processor.onLevel = undefined;
        }
      });
    } else {
      // Not in a call: use preview stream with matching browser constraints
      startPreviewMonitoring();
      onCleanup(stopPreviewMonitoring);
    }
  });

  // Restart preview monitoring if the preferred mic device changes
  createEffect(
    on(
      () => state.voice.preferredAudioInputDevice,
      () => {
        if (!voice.noiseGateProcessor) {
          stopPreviewMonitoring();
          startPreviewMonitoring();
        }
      },
      { defer: true },
    ),
  );

  // Map dB to a 0-100 percentage for the meter bar.
  // Range: -60 dB (silent) to 0 dB (max).
  const levelPercent = () => {
    const db = micLevel();
    const clamped = Math.max(-60, Math.min(0, db));
    return ((clamped + 60) / 60) * 100;
  };

  return (
    <Column>
      <Text class="label">
        <Trans>Noise Gate Threshold</Trans>: {state.voice.noiseGateThreshold} dB
      </Text>

      {/* Custom noise gate control: level meter + draggable threshold */}
      <NoiseGateMeter
        level={levelPercent()}
        threshold={state.voice.noiseGateThreshold}
        onThresholdChange={(v) => (state.voice.noiseGateThreshold = v)}
      />
    </Column>
  );
}

/**
 * Custom noise gate meter: level bar with a draggable threshold handle.
 */
function NoiseGateMeter(props: {
  level: number;
  threshold: number;
  onThresholdChange: (value: number) => void;
}) {
  let trackRef: HTMLDivElement | undefined;
  const [dragging, setDragging] = createSignal(false);

  const thresholdPercent = () => {
    const clamped = Math.max(-60, Math.min(0, props.threshold));
    return ((clamped + 60) / 60) * 100;
  };

  const updateFromPointer = (e: PointerEvent) => {
    if (!trackRef) return;
    const rect = trackRef.getBoundingClientRect();
    const pad = parseFloat(getComputedStyle(trackRef).fontSize) * 0.625;
    const trackLeft = rect.left + pad;
    const trackWidth = rect.width - pad * 2;
    const percent = Math.max(0, Math.min(1, (e.clientX - trackLeft) / trackWidth));
    const db = Math.round(-60 + percent * 60);
    props.onThresholdChange(db);
  };

  const onPointerDown = (e: PointerEvent) => {
    e.preventDefault();
    trackRef!.setPointerCapture(e.pointerId);
    setDragging(true);
    updateFromPointer(e);
  };

  const onPointerMove = (e: PointerEvent) => {
    if (dragging()) updateFromPointer(e);
  };

  const onPointerUp = (e: PointerEvent) => {
    setDragging(false);
    trackRef?.releasePointerCapture(e.pointerId);
  };

  return (
    <div
      ref={trackRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      style={{
        position: "relative",
        height: "2.5rem",
        cursor: "pointer",
        "user-select": "none",
        "touch-action": "none",
      }}
    >
      {/* Track background */}
      <div
        style={{
          position: "absolute",
          top: "50%",
          left: "0.625rem",
          right: "0.625rem",
          height: "0.25rem",
          "margin-top": "-0.125rem",
          "border-radius": "9999px",
          background: "var(--md-sys-color-surface-container-highest)",
          overflow: "hidden",
        }}
      >
        {/* Level fill */}
        <div
          style={{
            width: `${props.level}%`,
            height: "100%",
            background: "var(--md-sys-color-primary)",
            transition: "width 50ms linear",
          }}
        />
      </div>

      {/* Threshold handle */}
      <div
        style={{
          position: "absolute",
          top: "50%",
          left: `calc(0.625rem + (100% - 1.25rem) * ${thresholdPercent() / 100})`,
          transform: "translate(-50%, -50%)",
          width: "1.25rem",
          height: "1.25rem",
          "border-radius": "50%",
          background: "var(--md-sys-color-primary)",
          "box-shadow": "var(--md-sys-color-shadow) 0 1px 3px",
        }}
      />

    </div>
  );
}

function NoiseSuppression() {
  const state = useState();

  const description = () => {
    if (state.voice.noiseSupression === "disabled") {
      return <Trans>Disabled</Trans>;
    }
    if (state.voice.noiseSupression === "browser") {
      return <Trans>Browser</Trans>;
    }
    if (state.voice.noiseSupression === "enhanced") {
      return <Trans>Enhanced (RNNoise)</Trans>;
    }
  };

  return (
    <CategoryCollapse
      icon={"blank"}
      title={<Trans>Select noise suppression</Trans>}
      description={description()}
    >
      <CategoryButton
        icon={"blank"}
        onClick={() => (state.voice.noiseSupression = "disabled")}
        action={
          <Checkbox checked={state.voice.noiseSupression === "disabled"} />
        }
      >
        <Trans>Disabled</Trans>
      </CategoryButton>
      <CategoryButton
        icon={"blank"}
        onClick={() => (state.voice.noiseSupression = "browser")}
        action={
          <Checkbox checked={state.voice.noiseSupression === "browser"} />
        }
      >
        <Trans>Browser</Trans>
      </CategoryButton>
      <CategoryButton
        icon={"blank"}
        onClick={() => (state.voice.noiseSupression = "enhanced")}
        action={
          <Checkbox checked={state.voice.noiseSupression === "enhanced"} />
        }
        description={<Trans>Powered by RNNoise</Trans>}
      >
        <Trans>Enhanced</Trans>
      </CategoryButton>
    </CategoryCollapse>
  );
}
