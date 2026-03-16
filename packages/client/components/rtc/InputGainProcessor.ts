/**
 * Input gain track processor for LiveKit.
 *
 * Applies a configurable gain to the local audio track before it is
 * published.  Designed to sit as the outermost processor in the chain:
 *   Source -> [RNNoise] -> [Noise Gate] -> Input Gain -> Output
 *
 * The gain value can be updated live via the `gain` setter without
 * tearing down the processor chain.
 */

/** Minimal TrackProcessor shape we need for chaining. */
interface UpstreamProcessor {
  init(opts: { track: any; kind?: any; element?: any }): Promise<void>;
  restart(opts: { track: any; kind?: any; element?: any }): Promise<void>;
  destroy(): Promise<void>;
  processedTrack?: MediaStreamTrack;
}

export class InputGainProcessor {
  name = "input-gain";
  processedTrack?: MediaStreamTrack;

  #ctx?: AudioContext;
  #source?: MediaStreamAudioSourceNode;
  #gainNode?: GainNode;
  #dest?: MediaStreamAudioDestinationNode;
  #gain: number;
  #upstream?: UpstreamProcessor;

  constructor(options: { gain?: number; upstream?: UpstreamProcessor }) {
    this.#gain = options.gain ?? 1.0;
    this.#upstream = options.upstream;
  }

  set gain(value: number) {
    this.#gain = value;
    if (this.#gainNode && this.#ctx) {
      this.#gainNode.gain.setTargetAtTime(value, this.#ctx.currentTime, 0.015);
    }
  }

  get gain(): number {
    return this.#gain;
  }

  async init(opts: { track: any; kind?: any; element?: any }) {
    let inputTrack: MediaStreamTrack | undefined;

    if (this.#upstream) {
      await this.#upstream.init(opts);
      inputTrack = this.#upstream.processedTrack;
    } else {
      inputTrack = opts.track instanceof MediaStreamTrack
        ? opts.track
        : opts.track?.mediaStreamTrack;
    }

    if (!inputTrack) {
      console.warn("[InputGain] No input track available, processor not initialized.");
      return;
    }

    this.#ctx = new AudioContext();
    if (this.#ctx.state !== "running") {
      await this.#ctx.resume();
    }

    this.#source = this.#ctx.createMediaStreamSource(
      new MediaStream([inputTrack]),
    );
    this.#gainNode = this.#ctx.createGain();
    this.#gainNode.gain.value = this.#gain;
    this.#dest = this.#ctx.createMediaStreamDestination();

    this.#source.connect(this.#gainNode);
    this.#gainNode.connect(this.#dest);

    this.processedTrack = this.#dest.stream.getAudioTracks()[0];

    this.#ctx.addEventListener("statechange", () => {
      if (this.#ctx?.state === "suspended") {
        this.#ctx.resume();
      }
    });
  }

  async restart(opts: { track: any; kind?: any; element?: any }) {
    await this.destroy();
    await this.init(opts);
  }

  async destroy() {
    this.#source?.disconnect();
    this.#gainNode?.disconnect();
    this.processedTrack?.stop();
    await this.#ctx?.close();
    this.processedTrack = undefined;
    this.#ctx = undefined;
    this.#source = undefined;
    this.#gainNode = undefined;
    this.#dest = undefined;

    await this.#upstream?.destroy();
  }
}
