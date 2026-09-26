import { AudioProcessorOptions, Track, TrackProcessor } from "livekit-client";
import { RNNoiseNode } from "livekit-rnnoise-processor";
import { createEffect, createRoot, on } from "solid-js";

import { CONFIGURATION } from "@revolt/common";
import { Voice } from "@revolt/state/stores/Voice";

const rnnoiseModuleLoads = new WeakMap<AudioContext, Promise<void>>();
const rnnoiseModuleContexts = new WeakSet<AudioContext>();
const rnnoiseUnavailableContexts = new WeakSet<AudioContext>();

function forceMono(node: AudioNode) {
  node.channelCount = 1;
  node.channelCountMode = "explicit";
}

async function loadRNNoiseModule(context: AudioContext) {
  if (
    rnnoiseModuleContexts.has(context) ||
    rnnoiseUnavailableContexts.has(context)
  )
    return;

  let load = rnnoiseModuleLoads.get(context);
  if (!load) {
    load = RNNoiseNode.loadModule(
      context,
      CONFIGURATION.RNNOISE_WORKLET_CDN_URL,
    );
    rnnoiseModuleLoads.set(context, load);
  }

  try {
    await load;
    rnnoiseModuleContexts.add(context);
  } catch (error) {
    rnnoiseUnavailableContexts.add(context);
    if (rnnoiseModuleLoads.get(context) === load) {
      rnnoiseModuleLoads.delete(context);
    }
    throw error;
  }
}

export class VoiceProcessor implements TrackProcessor<
  Track.Kind.Audio,
  AudioProcessorOptions
> {
  readonly name = "stoat-voice-processor";
  processedTrack?: MediaStreamTrack;

  private audioContext?: AudioContext;
  private settings: Voice;
  private destroyed = false;

  private noiseSuppressionNode?: RNNoiseNode;
  private sourceNode?: MediaStreamAudioSourceNode;
  private highpassNode?: BiquadFilterNode;
  private compressorNode?: DynamicsCompressorNode;
  private gainNode?: GainNode;
  private destinationNode?: MediaStreamAudioDestinationNode;

  private disposeSolidjsContext: () => void = () => {};

  constructor(voiceSettings: Voice) {
    this.settings = voiceSettings;

    // Create a solid root to track changes to the settings
    createRoot((dispose) => {
      // On input volume setting change, set the gain
      createEffect(() => {
        this.setGain(this.getSettings().inputVolume);
      });

      // On noise suppression setting change, toggle noise suppression
      createEffect(
        on(
          () => this.getSettings().noiseSupression,
          (newNoiseSuppresion, oldNoiseSuppression) => {
            // Only rebuild if noise supression has changed from enhanced to something else or vice versa
            if (
              oldNoiseSuppression &&
              oldNoiseSuppression !== newNoiseSuppresion &&
              (newNoiseSuppresion === "enhanced" ||
                oldNoiseSuppression === "enhanced")
            ) {
              void this.rebuild();
            }
          },
        ),
      );

      // This is needed to destroy the solid context on unload
      this.disposeSolidjsContext = dispose;
    });
  }

  private getSettings(): Voice {
    return this.settings;
  }

  private setGain(newGain: number) {
    if (this.gainNode) {
      this.gainNode.gain.value = newGain;
    }
  }

  private async rebuild() {
    const context = this.audioContext;
    if (!context) return;

    await this.prepareNoiseSuppression(context);
    if (context === this.audioContext) {
      this.updateNoiseSuppression(context);
    }
  }

  private async prepareNoiseSuppression(context: AudioContext) {
    if (this.settings.noiseSupression !== "enhanced") return;

    try {
      await loadRNNoiseModule(context);
    } catch (error) {
      console.warn(
        "[Voice] Enhanced noise suppression is unavailable; continuing without it.",
        error,
      );
    }
  }

  async init(opts: AudioProcessorOptions): Promise<void> {
    this.destroyed = false;
    await this.prepareNoiseSuppression(opts.audioContext);
    if (this.destroyed) return;
    return this.build(opts);
  }

  async restart(opts: AudioProcessorOptions): Promise<void> {
    this.destroyed = false;
    const context = opts.audioContext ?? this.audioContext;
    if (context) {
      await this.prepareNoiseSuppression(context);
    }
    if (this.destroyed) return;
    return this.build(opts);
  }

  async destroy(): Promise<void> {
    this.destroyed = true;
    // Destroy the solid context on processor destruction
    this.disposeSolidjsContext();
    this.audioContext = undefined;
    this.teardown();
  }

  private updateNoiseSuppression(context: AudioContext) {
    this.compressorNode?.disconnect();
    this.destroyNoiseSuppressionNode();
    this.highpassNode?.disconnect();
    this.sourceNode?.disconnect();

    this.compressorNode = undefined;
    this.noiseSuppressionNode = undefined;
    this.highpassNode = undefined;

    if (
      this.settings.noiseSupression === "enhanced" &&
      rnnoiseModuleContexts.has(context)
    ) {
      try {
        // Create a new highpass filter
        this.highpassNode = context.createBiquadFilter();
        this.highpassNode.type = "highpass";
        this.highpassNode.frequency.value = 50;
        this.highpassNode.Q.value = Math.SQRT1_2;
        forceMono(this.highpassNode);

        this.noiseSuppressionNode = new RNNoiseNode(context);
        // Upstream highpass is already mono, so this is belt-and-braces.
        forceMono(this.noiseSuppressionNode);
        this.highpassNode.connect(this.noiseSuppressionNode);

        // Create a new dynamics compressor
        this.compressorNode = context.createDynamicsCompressor();
        this.compressorNode.threshold.value = -3;
        this.compressorNode.knee.value = 0;
        this.compressorNode.ratio.value = 20;
        this.compressorNode.attack.value = 0.003;
        this.compressorNode.release.value = 0.05;
        forceMono(this.compressorNode);
        this.noiseSuppressionNode.connect(this.compressorNode);

        // Connect the compressor to the output gain
        this.compressorNode.connect(this.gainNode!);
        // Lastly, connect the source to the highpass node to complete loop
        this.sourceNode!.connect(this.highpassNode);
        return;
      } catch (error) {
        this.compressorNode?.disconnect();
        this.destroyNoiseSuppressionNode();
        this.highpassNode?.disconnect();
        this.compressorNode = undefined;
        this.noiseSuppressionNode = undefined;
        this.highpassNode = undefined;
        console.warn(
          "[Voice] Enhanced noise suppression could not start; continuing without it.",
          error,
        );
      }
    }

    this.sourceNode!.connect(this.gainNode!);
  }

  private destroyNoiseSuppressionNode() {
    if (!this.noiseSuppressionNode) return;

    this.noiseSuppressionNode.port.postMessage({ message: "DESTROY" });
    this.noiseSuppressionNode.port.close();
    this.noiseSuppressionNode.disconnect();
    this.noiseSuppressionNode = undefined;
  }

  private async build(opts: AudioProcessorOptions): Promise<void> {
    this.teardown();
    // If context was passed, store it for restarts
    // If no context was passed, this was a restart so use the old context
    let context = opts.audioContext;
    if (!context) {
      context = this.audioContext!;
    } else {
      this.audioContext = context;
    }
    if (!context) {
      return;
    }
    this.sourceNode = context.createMediaStreamSource(
      new MediaStream([opts.track]),
    );
    // Downmix stereo mics to mono before RNNoise, which only reads the
    // first channel. Without this a mic carrying voice on the other
    // channel goes quiet for remote participants.
    forceMono(this.sourceNode);

    // Create the target gain node for input volume
    this.gainNode = context.createGain();
    this.gainNode.gain.value = this.settings.inputVolume;
    forceMono(this.gainNode);

    this.updateNoiseSuppression(context);

    // Create the destination node, connect the gain node and send it off to livekit
    this.destinationNode = context.createMediaStreamDestination();
    this.gainNode.connect(this.destinationNode);
    this.processedTrack = this.destinationNode.stream.getAudioTracks()[0];
  }

  private teardown() {
    this.sourceNode?.disconnect();
    this.highpassNode?.disconnect();
    this.destroyNoiseSuppressionNode();
    this.compressorNode?.disconnect();
    this.gainNode?.disconnect();
    this.destinationNode?.disconnect();
    this.processedTrack?.stop();
    this.sourceNode = undefined;
    this.highpassNode = undefined;
    this.noiseSuppressionNode = undefined;
    this.compressorNode = undefined;
    this.gainNode = undefined;
    this.destinationNode = undefined;
    this.processedTrack = undefined;
  }
}
