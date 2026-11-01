/**
 * Synthesized instruments. Every instrument is generated in code with the Web
 * Audio API so that published documents stay self-contained (no sample files).
 */

export interface VoiceParams {
  ctx: AudioContext;
  out: AudioNode;
  freq: number;
  time: number;
  /** Seconds the note is held */
  duration: number;
  /** 0..1 */
  velocity: number;
}

export interface Instrument {
  id: string;
  label: string;
  /** Start a voice; returns a function that releases/stops it early. */
  play(p: VoiceParams): () => void;
}

function envGain(ctx: AudioContext, out: AudioNode, time: number): GainNode {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, time);
  g.connect(out);
  return g;
}

function stopper(nodes: (AudioScheduledSourceNode | null)[], gain: GainNode, ctx: AudioContext) {
  return () => {
    const now = ctx.currentTime;
    gain.gain.cancelScheduledValues(now);
    gain.gain.setTargetAtTime(0, now, 0.03);
    for (const n of nodes) {
      try {
        n?.stop(now + 0.2);
      } catch {
        /* already stopped */
      }
    }
  };
}

const waveCache = new WeakMap<AudioContext, Map<string, PeriodicWave>>();
function periodicWave(ctx: AudioContext, id: string, harmonics: number[]): PeriodicWave {
  let m = waveCache.get(ctx);
  if (!m) waveCache.set(ctx, (m = new Map()));
  let w = m.get(id);
  if (!w) {
    const real = new Float32Array(harmonics.length + 1);
    const imag = new Float32Array([0, ...harmonics]);
    w = ctx.createPeriodicWave(real, imag);
    m.set(id, w);
  }
  return w;
}

/** A soft acoustic-ish piano: harmonic stack + filter envelope + long decay. */
const piano: Instrument = {
  id: 'piano',
  label: 'Piano',
  play({ ctx, out, freq, time, duration, velocity }) {
    const g = envGain(ctx, out, time);
    const peak = 0.32 * velocity;
    const decay = Math.max(0.6, 3.2 - Math.log2(freq / 110) * 0.6);
    g.gain.linearRampToValueAtTime(peak, time + 0.005);
    g.gain.setTargetAtTime(peak * 0.35, time + 0.005, 0.25);
    g.gain.setTargetAtTime(0, time + Math.max(duration, 0.1), Math.min(decay, 0.35));
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(Math.min(16000, freq * 12 * (0.6 + velocity)), time);
    filter.frequency.setTargetAtTime(Math.min(8000, freq * 4), time + 0.01, 0.4);
    filter.Q.value = 0.3;
    filter.connect(g);
    const osc = ctx.createOscillator();
    osc.setPeriodicWave(periodicWave(ctx, 'piano', [1, 0.55, 0.3, 0.22, 0.1, 0.08, 0.04, 0.03]));
    osc.frequency.value = freq;
    const osc2 = ctx.createOscillator();
    osc2.setPeriodicWave(periodicWave(ctx, 'piano', [1, 0.55, 0.3, 0.22, 0.1, 0.08, 0.04, 0.03]));
    osc2.frequency.value = freq * 1.0015; // slight detune for string chorus
    const g2 = ctx.createGain();
    g2.gain.value = 0.5;
    osc.connect(filter);
    osc2.connect(g2).connect(filter);
    const end = time + duration + 1.5;
    osc.start(time);
    osc2.start(time);
    osc.stop(end);
    osc2.stop(end);
    return stopper([osc, osc2], g, ctx);
  },
};

/** FM electric piano (Rhodes-like tine). */
const epiano: Instrument = {
  id: 'epiano',
  label: 'Electric piano',
  play({ ctx, out, freq, time, duration, velocity }) {
    const g = envGain(ctx, out, time);
    const peak = 0.3 * velocity;
    g.gain.linearRampToValueAtTime(peak, time + 0.004);
    g.gain.setTargetAtTime(peak * 0.4, time + 0.004, 0.6);
    g.gain.setTargetAtTime(0, time + Math.max(duration, 0.1), 0.25);
    const carrier = ctx.createOscillator();
    carrier.frequency.value = freq;
    const mod = ctx.createOscillator();
    mod.frequency.value = freq; // 1:1 ratio
    const modGain = ctx.createGain();
    modGain.gain.setValueAtTime(freq * 2.2 * velocity, time);
    modGain.gain.setTargetAtTime(freq * 0.25, time, 0.25);
    mod.connect(modGain).connect(carrier.frequency);
    // tine: high ratio, fast decay
    const tine = ctx.createOscillator();
    tine.frequency.value = freq * 14;
    const tineGain = ctx.createGain();
    tineGain.gain.setValueAtTime(freq * 0.9 * velocity, time);
    tineGain.gain.setTargetAtTime(0, time, 0.03);
    tine.connect(tineGain).connect(carrier.frequency);
    carrier.connect(g);
    const end = time + duration + 1.5;
    for (const o of [carrier, mod, tine]) {
      o.start(time);
      o.stop(end);
    }
    return stopper([carrier, mod, tine], g, ctx);
  },
};

/** Karplus–Strong plucked string, rendered to a buffer. */
const bufferCache = new WeakMap<AudioContext, Map<number, AudioBuffer>>();
function pluckBuffer(ctx: AudioContext, freq: number): AudioBuffer {
  let m = bufferCache.get(ctx);
  if (!m) bufferCache.set(ctx, (m = new Map()));
  const key = Math.round(freq * 10);
  const cached = m.get(key);
  if (cached) return cached;
  const sr = ctx.sampleRate;
  const seconds = Math.min(4, Math.max(1.5, 3.5 - Math.log2(freq / 82) * 0.5));
  const len = Math.floor(sr * seconds);
  const buf = ctx.createBuffer(1, len, sr);
  const data = buf.getChannelData(0);
  const period = sr / freq;
  const N = Math.floor(period);
  const frac = period - N;
  const ring = new Float32Array(N + 2);
  // excitation: filtered noise burst (softer pluck)
  let last = 0;
  for (let i = 0; i < ring.length; i++) {
    const r = Math.random() * 2 - 1;
    last = last * 0.5 + r * 0.5;
    ring[i] = last;
  }
  const damping = 0.996 - Math.min(0.006, freq / 200000);
  let idx = 0;
  for (let i = 0; i < len; i++) {
    const a = ring[idx % ring.length];
    const b = ring[(idx + 1) % ring.length];
    const y = a * (1 - frac) + b * frac;
    data[i] = y;
    ring[idx % ring.length] = ((a + b) / 2) * damping;
    idx++;
    if (idx >= N) idx = 0;
  }
  // remove DC and normalize
  let max = 0;
  for (let i = 0; i < len; i++) max = Math.max(max, Math.abs(data[i]));
  if (max > 0) for (let i = 0; i < len; i++) data[i] /= max;
  m.set(key, buf);
  return buf;
}

const guitar: Instrument = {
  id: 'guitar',
  label: 'Nylon guitar',
  play({ ctx, out, freq, time, duration, velocity }) {
    const g = envGain(ctx, out, time);
    const peak = 0.38 * velocity;
    g.gain.linearRampToValueAtTime(peak, time + 0.002);
    g.gain.setTargetAtTime(0, time + Math.max(duration, 0.3) + 0.4, 0.2);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = Math.min(9000, freq * 10);
    filter.connect(g);
    const src = ctx.createBufferSource();
    src.buffer = pluckBuffer(ctx, freq);
    src.connect(filter);
    src.start(time);
    return stopper([src], g, ctx);
  },
};

const organ: Instrument = {
  id: 'organ',
  label: 'Organ',
  play({ ctx, out, freq, time, duration, velocity }) {
    const g = envGain(ctx, out, time);
    const peak = 0.16 * velocity;
    g.gain.linearRampToValueAtTime(peak, time + 0.02);
    g.gain.setValueAtTime(peak, time + duration);
    g.gain.linearRampToValueAtTime(0, time + duration + 0.08);
    const osc = ctx.createOscillator();
    // drawbars 8' 4' 2 2/3' 2'
    osc.setPeriodicWave(periodicWave(ctx, 'organ', [1, 0.8, 0.6, 0.5, 0, 0.3, 0, 0.2]));
    osc.frequency.value = freq;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 5.8;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = freq * 0.003;
    lfo.connect(lfoGain).connect(osc.frequency);
    osc.connect(g);
    const end = time + duration + 0.2;
    osc.start(time);
    lfo.start(time);
    osc.stop(end);
    lfo.stop(end);
    return stopper([osc, lfo], g, ctx);
  },
};

const synth: Instrument = {
  id: 'synth',
  label: 'Warm synth',
  play({ ctx, out, freq, time, duration, velocity }) {
    const g = envGain(ctx, out, time);
    const peak = 0.12 * velocity;
    g.gain.linearRampToValueAtTime(peak, time + 0.04);
    g.gain.setTargetAtTime(peak * 0.7, time + 0.04, 0.3);
    g.gain.setTargetAtTime(0, time + duration, 0.25);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.Q.value = 2;
    filter.frequency.setValueAtTime(freq * 2, time);
    filter.frequency.linearRampToValueAtTime(Math.min(12000, freq * 7), time + 0.12);
    filter.frequency.setTargetAtTime(freq * 3, time + 0.12, 0.6);
    filter.connect(g);
    const oscs = [-7, 0, 7].map((cents) => {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = freq;
      o.detune.value = cents;
      o.connect(filter);
      o.start(time);
      o.stop(time + duration + 1.5);
      return o;
    });
    return stopper(oscs, g, ctx);
  },
};

const marimba: Instrument = {
  id: 'marimba',
  label: 'Marimba',
  play({ ctx, out, freq, time, velocity }) {
    const g = envGain(ctx, out, time);
    const peak = 0.4 * velocity;
    g.gain.linearRampToValueAtTime(peak, time + 0.002);
    g.gain.setTargetAtTime(0, time + 0.002, 0.18 + 40 / freq);
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq;
    const over = ctx.createOscillator();
    over.type = 'sine';
    over.frequency.value = freq * 3.93;
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.35, time);
    og.gain.setTargetAtTime(0, time, 0.03);
    osc.connect(g);
    over.connect(og).connect(g);
    osc.start(time);
    over.start(time);
    osc.stop(time + 2);
    over.stop(time + 2);
    return stopper([osc, over], g, ctx);
  },
};

const sine: Instrument = {
  id: 'sine',
  label: 'Pure tone',
  play({ ctx, out, freq, time, duration, velocity }) {
    const g = envGain(ctx, out, time);
    const peak = 0.25 * velocity;
    g.gain.linearRampToValueAtTime(peak, time + 0.015);
    g.gain.setValueAtTime(peak, time + duration);
    g.gain.linearRampToValueAtTime(0, time + duration + 0.12);
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq;
    osc.connect(g);
    osc.start(time);
    osc.stop(time + duration + 0.2);
    return stopper([osc], g, ctx);
  },
};

export const INSTRUMENTS: Instrument[] = [piano, epiano, guitar, organ, synth, marimba, sine];

export function getInstrument(id: string | undefined): Instrument {
  return INSTRUMENTS.find((i) => i.id === id) ?? piano;
}
