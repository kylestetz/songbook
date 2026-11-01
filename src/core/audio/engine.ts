import { Note } from '@tonaljs/tonal';
import { getInstrument } from './instruments';

export interface PlayOptions {
  /** Seconds to hold each note */
  duration?: number;
  velocity?: number;
  /** Seconds between successive notes of a chord (guitar strum feel) */
  strum?: number;
  instrument?: string;
}

export interface SequenceEvent {
  /** Seconds from the start of the sequence */
  time: number;
  notes: string[];
  duration: number;
  velocity?: number;
  strum?: number;
}

export interface SequenceOptions {
  instrument?: string;
  /** Called as each event starts sounding */
  onEvent?: (index: number) => void;
  /** Called when the sequence finishes or is stopped */
  onEnd?: () => void;
  /** Loop the sequence; `length` is required for looping */
  loop?: boolean;
  /** Total length in seconds (for looping / end timing) */
  length?: number;
}

export interface PlaybackHandle {
  stop(): void;
  readonly playing: boolean;
}

/**
 * One engine per page. Holds the AudioContext, a master bus with a gentle
 * reverb, the document's default instrument and tempo, and the currently
 * playing sequence (starting a new sequence stops the previous one).
 */
export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private dry: GainNode | null = null;
  private current: { stop: () => void } | null = null;
  private voices = new Set<() => void>();

  instrument = 'piano';
  tempo = 96;
  volume = 0.8;

  private ensure(): { ctx: AudioContext; out: AudioNode } {
    if (!this.ctx) {
      const Ctor: typeof AudioContext =
        window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new Ctor({ latencyHint: 'interactive' });
      const master = ctx.createGain();
      master.gain.value = this.volume;
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.ratio.value = 3;
      master.connect(comp).connect(ctx.destination);
      const dry = ctx.createGain();
      dry.connect(master);
      const reverb = ctx.createConvolver();
      reverb.buffer = impulse(ctx, 1.8, 2.8);
      const wet = ctx.createGain();
      wet.gain.value = 0.18;
      dry.connect(reverb).connect(wet).connect(master);
      this.ctx = ctx;
      this.master = master;
      this.dry = dry;
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return { ctx: this.ctx, out: this.dry! };
  }

  setVolume(v: number) {
    this.volume = v;
    if (this.master) this.master.gain.value = v;
  }

  /** Seconds per beat at the current tempo. */
  get beat(): number {
    return 60 / this.tempo;
  }

  /** Play notes immediately (a chord if several). Does not interrupt sequences. */
  play(notes: string[], opts: PlayOptions = {}, at = 0): void {
    const { ctx, out } = this.ensure();
    const inst = getInstrument(opts.instrument ?? this.instrument);
    const start = ctx.currentTime + 0.02 + at;
    notes.forEach((n, i) => {
      const midi = Note.midi(n);
      if (midi == null) return;
      const freq = 440 * Math.pow(2, (midi - 69) / 12);
      const stop = inst.play({
        ctx,
        out,
        freq,
        time: start + i * (opts.strum ?? 0),
        duration: opts.duration ?? 1,
        velocity: opts.velocity ?? 0.8,
      });
      this.voices.add(stop);
      setTimeout(() => this.voices.delete(stop), ((opts.duration ?? 1) + at + 3) * 1000);
    });
  }

  /** Play a timed sequence of events. Stops any other sequence first. */
  sequence(events: SequenceEvent[], opts: SequenceOptions = {}): PlaybackHandle {
    this.stop();
    const { ctx, out } = this.ensure();
    const inst = getInstrument(opts.instrument ?? this.instrument);
    const length = opts.length ?? Math.max(0, ...events.map((e) => e.time + e.duration));
    const timers: ReturnType<typeof setTimeout>[] = [];
    const stops: (() => void)[] = [];
    let playing = true;
    let ended = false;

    const schedule = (offset: number) => {
      const t0 = ctx.currentTime + 0.05;
      events.forEach((ev, i) => {
        ev.notes.forEach((n, j) => {
          const midi = Note.midi(n);
          if (midi == null) return;
          stops.push(
            inst.play({
              ctx,
              out,
              freq: 440 * Math.pow(2, (midi - 69) / 12),
              time: t0 + ev.time + j * (ev.strum ?? 0),
              duration: ev.duration,
              velocity: ev.velocity ?? 0.8,
            }),
          );
        });
        timers.push(setTimeout(() => playing && opts.onEvent?.(i), (ev.time + 0.05) * 1000));
      });
      timers.push(
        setTimeout(() => {
          if (!playing) return;
          if (opts.loop && length > 0) {
            stops.length = 0;
            schedule(offset + length);
          } else {
            finish();
          }
        }, (length + 0.05) * 1000),
      );
    };

    const finish = () => {
      if (ended) return;
      ended = true;
      playing = false;
      timers.forEach(clearTimeout);
      if (this.current === handleRef) this.current = null;
      opts.onEnd?.();
    };

    const handleRef = {
      stop: () => {
        if (ended) return;
        stops.forEach((s) => s());
        finish();
      },
    };
    this.current = handleRef;
    schedule(0);

    return {
      stop: handleRef.stop,
      get playing() {
        return playing;
      },
    };
  }

  /** Stop the current sequence and any ringing notes. */
  stop(): void {
    this.current?.stop();
    this.current = null;
  }

  stopAll(): void {
    this.stop();
    this.voices.forEach((s) => s());
    this.voices.clear();
  }
}

function impulse(ctx: AudioContext, seconds: number, decay: number): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
  }
  return buf;
}

let shared: AudioEngine | null = null;
export function getAudioEngine(): AudioEngine {
  if (!shared) shared = new AudioEngine();
  return shared;
}
