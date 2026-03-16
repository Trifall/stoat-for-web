/**
 * Noise gate track processor for LiveKit.
 *
 * Implements the TrackProcessor interface (structurally typed) so it can be
 * passed to `LocalAudioTrack.setProcessor()`.
 *
 * Audio below the threshold (in dB) is silenced via a GainNode.
 * The current RMS level (dB) is exposed via an `onLevel` callback so the
 * settings UI can render a live meter.
 *
 * Optionally wraps an upstream TrackProcessor (e.g. DenoiseTrackProcessor)
 * so both can run in a single setProcessor() call:
 *   Source → [Upstream (RNNoise)] → Noise Gate → Output
 */

/** Minimal TrackProcessor shape we need for chaining. */
interface UpstreamProcessor {
  init(opts: { track: any; kind?: any; element?: any }): Promise<void>;
  restart(opts: { track: any; kind?: any; element?: any }): Promise<void>;
  destroy(): Promise<void>;
  processedTrack?: MediaStreamTrack;
}

export class NoiseGateProcessor {
  name = "noise-gate";
  processedTrack?: MediaStreamTrack;

  #ctx?: AudioContext;
  #source?: MediaStreamAudioSourceNode;
  #analyser?: AnalyserNode;
  #gateGain?: GainNode;
  #dest?: MediaStreamAudioDestinationNode;
  #intervalId?: number;
  #threshold: number;
  #upstream?: UpstreamProcessor;

  /** Called every ~20 ms with the current RMS level in dB. */
  onLevel?: (db: number) => void;

  constructor(options: { threshold?: number; upstream?: UpstreamProcessor }) {
    this.#threshold = options.threshold ?? -50;
    this.#upstream = options.upstream;
  }

  /** Update the gate threshold (in dB, e.g. -50). */
  set threshold(value: number) {
    this.#threshold = value;
  }

  get threshold(): number {
    return this.#threshold;
  }

  async init(opts: { track: any; kind?: any; element?: any }) {
    let inputTrack: MediaStreamTrack | undefined;

    if (this.#upstream) {
      // Initialise the upstream processor first (e.g. RNNoise) so it
      // produces a processedTrack we can feed into the noise gate.
      await this.#upstream.init(opts);
      inputTrack = this.#upstream.processedTrack;
    } else {
      // LiveKit passes the raw MediaStreamTrack as opts.track
      inputTrack = opts.track instanceof MediaStreamTrack ? opts.track : opts.track?.mediaStreamTrack;
    }

    if (!inputTrack) {
      console.warn("[NoiseGate] No input track available, processor not initialized. opts.track:", opts.track);
      return;
    }

    this.#ctx = new AudioContext();
    // Ensure AudioContext is running (may start suspended on Windows/Electron)
    if (this.#ctx.state !== "running") {
      await this.#ctx.resume();
    }

    this.#source = this.#ctx.createMediaStreamSource(
      new MediaStream([inputTrack]),
    );

    this.#analyser = this.#ctx.createAnalyser();
    this.#analyser.fftSize = 2048;
    this.#analyser.smoothingTimeConstant = 0.3;

    this.#gateGain = this.#ctx.createGain();
    this.#dest = this.#ctx.createMediaStreamDestination();

    // source → analyser (for level metering, no audio output)
    this.#source.connect(this.#analyser);
    // source → gate gain → destination (actual audio path)
    this.#source.connect(this.#gateGain);
    this.#gateGain.connect(this.#dest);

    this.processedTrack = this.#dest.stream.getAudioTracks()[0];
    // Auto-resume if AudioContext gets suspended mid-session
    this.#ctx.addEventListener("statechange", () => {
      if (this.#ctx?.state === "suspended") {
        console.warn("[NoiseGate] AudioContext suspended, resuming...");
        this.#ctx.resume();
      }
    });

    console.info("[NoiseGate] Processor initialized, AudioContext state:", this.#ctx.state,
      "processedTrack:", this.processedTrack?.id);
    this.#startGating();
  }

  #startGating() {
    const dataArray = new Float32Array(this.#analyser!.fftSize);

    const process = () => {
      if (!this.#analyser || !this.#gateGain || !this.#ctx) return;

      this.#analyser.getFloatTimeDomainData(dataArray);

      let sumSquares = 0;
      for (let i = 0; i < dataArray.length; i++) {
        sumSquares += dataArray[i] * dataArray[i];
      }
      const rms = Math.sqrt(sumSquares / dataArray.length);
      const db = 20 * Math.log10(Math.max(rms, 1e-10));

      // Report level to UI
      this.onLevel?.(db);

      // Gate: open (1) if above threshold, closed (0) if below
      const target = db >= this.#threshold ? 1 : 0;
      this.#gateGain.gain.setTargetAtTime(
        target,
        this.#ctx.currentTime,
        0.015,
      );
    };

    this.#intervalId = window.setInterval(process, 20);
  }

  async restart(opts: { track: any; kind?: any; element?: any }) {
    await this.destroy();
    await this.init(opts);
  }

  async destroy() {
    if (this.#intervalId) {
      clearInterval(this.#intervalId);
      this.#intervalId = undefined;
    }
    this.#source?.disconnect();
    this.#analyser?.disconnect();
    this.#gateGain?.disconnect();
    this.processedTrack?.stop();
    await this.#ctx?.close();
    this.processedTrack = undefined;
    this.#ctx = undefined;
    this.#source = undefined;
    this.#analyser = undefined;
    this.#gateGain = undefined;
    this.#dest = undefined;

    // Tear down the upstream processor too
    await this.#upstream?.destroy();
  }
}
