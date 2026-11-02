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

/*
 * Clean electric guitar, ported from guitar-explorer. Each note is a
 * Karplus–Strong string rendered offline into an AudioBuffer, heard through a
 * pickup, then run through a shared amp chain: gentle saturation, a
 * speaker-cabinet EQ and a small room.
 */
const GTR_RING = 3; // seconds of audio rendered per note
const GTR_T60_LOW = 4; // seconds for the low E to fall ~60dB; higher notes die sooner
const GTR_TAIL = 0.12; // fade-out at the end of the buffer, avoids a click
const GTR_PLUCK_POS = 0.18; // where the pick hits, as a fraction of the string from the bridge
const GTR_PICKUP_POS = 0.24; // neck-ish pickup: rounder than one right by the bridge
const LOW_E = 82.41;

/** Synthesize one plucked, picked-up string as raw samples. */
function synthString(freq: number, sampleRate: number): Float32Array<ArrayBuffer> {
  const period = sampleRate / freq; // exact (fractional) loop length in samples
  const w0 = (2 * Math.PI * freq) / sampleRate;

  // Loop lowpass (one-pole). Its cutoff tracks pitch so every string sheds its
  // upper harmonics at a similar rate, instead of low strings buzzing on.
  const r = 0.5 * (freq / LOW_E);
  const damp = Math.min(0.95, (-r + Math.sqrt(r * r + 4 * r)) / 2);
  const c = 1 - damp;
  const lpDelay = Math.atan2(c * Math.sin(w0), 1 - c * Math.cos(w0)) / w0;
  const lpGain = damp / Math.hypot(1 - c * Math.cos(w0), c * Math.sin(w0));

  // The rest of the loop is an integer delay line plus a first-order allpass
  // for the fraction, so chords stay in tune.
  const loopDelay = period - lpDelay;
  const lineLength = Math.max(2, Math.floor(loopDelay - 0.1));
  const frac = loopDelay - lineLength;
  const ap = (1 - frac) / (1 + frac);

  const t60 = GTR_T60_LOW * Math.pow(LOW_E / freq, 0.3);
  const loopGain = Math.min(0.99995, Math.pow(10, -3 / (freq * t60)) / lpGain);

  // Excitation: the string's shape as the pick lets go (a triangle peaking at
  // the pluck point), softened, with a pinch of noise for pick scrape.
  const line = new Float32Array(lineLength);
  const peak = Math.min(lineLength - 1, Math.max(1, Math.round(lineLength * GTR_PLUCK_POS)));
  for (let i = 0; i < lineLength; i++) {
    const shape = i < peak ? i / peak : (lineLength - i) / (lineLength - peak);
    line[i] = shape + 0.12 * (Math.random() * 2 - 1);
  }
  let soft = 0;
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < lineLength; i++) {
      soft += 0.5 * (line[i] - soft);
      line[i] = soft;
    }
  }
  const mean = line.reduce((sum, v) => sum + v, 0) / lineLength;
  for (let i = 0; i < lineLength; i++) line[i] -= mean;

  const length = Math.round(sampleRate * (GTR_RING + GTR_TAIL));
  const data = new Float32Array(length);
  let lp = 0;
  let apIn = 0;
  let apOut = 0;
  let idx = 0;
  for (let n = 0; n < length; n++) {
    const x = line[idx];
    data[n] = x;
    lp += damp * (x - lp);
    const y = ap * lp + apIn - ap * apOut;
    apIn = lp;
    apOut = y;
    line[idx] = loopGain * y;
    idx = (idx + 1) % lineLength;
  }

  // Pickup: hearing the string at one point along it notches out the harmonics
  // that have a node there (a feedforward comb). Runs backwards to work in place.
  const tap = Math.max(1, Math.round(period * GTR_PICKUP_POS));
  for (let n = length - 1; n >= tap; n--) data[n] -= data[n - tap];

  let max = 0;
  for (let n = 0; n < length; n++) max = Math.max(max, Math.abs(data[n]));
  const scale = max > 0 ? 0.5 / max : 0;

  // Normalize, shape the attack and fade the tail.
  const attack = Math.round(sampleRate * 0.002);
  const fadeFrom = Math.round(sampleRate * GTR_RING);
  for (let n = 0; n < length; n++) {
    let env = scale;
    if (n < attack) env *= n / attack;
    if (n >= fadeFrom) env *= 1 - (n - fadeFrom) / (length - fadeFrom);
    data[n] *= env;
  }
  return data;
}

const bufferCache = new WeakMap<AudioContext, Map<number, AudioBuffer>>();
function pluckBuffer(ctx: AudioContext, freq: number): AudioBuffer {
  let m = bufferCache.get(ctx);
  if (!m) bufferCache.set(ctx, (m = new Map()));
  const key = Math.round(freq * 10);
  const cached = m.get(key);
  if (cached) return cached;
  const data = synthString(freq, ctx.sampleRate);
  const buf = ctx.createBuffer(1, data.length, ctx.sampleRate);
  buf.copyToChannel(data, 0);
  m.set(key, buf);
  return buf;
}

function biquad(ctx: AudioContext, type: BiquadFilterType, frequency: number, q: number, gain = 0): BiquadFilterNode {
  const node = ctx.createBiquadFilter();
  node.type = type;
  node.frequency.value = frequency;
  node.Q.value = q;
  node.gain.value = gain;
  return node;
}

function saturationCurve(amount: number): Float32Array<ArrayBuffer> {
  const curve = new Float32Array(2048);
  for (let i = 0; i < curve.length; i++) {
    const x = (i / (curve.length - 1)) * 2 - 1;
    curve[i] = Math.tanh(amount * x) / Math.tanh(amount);
  }
  return curve;
}

/** Decaying, darkened stereo noise: a cheap stand-in for a small room. */
function roomImpulse(ctx: AudioContext, seconds: number): AudioBuffer {
  const length = Math.round(ctx.sampleRate * seconds);
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buffer.getChannelData(ch);
    let smooth = 0;
    for (let n = 0; n < length; n++) {
      smooth += 0.3 * (Math.random() * 2 - 1 - smooth);
      data[n] = smooth * Math.exp((-5 * n) / length) * (1 - n / length);
    }
  }
  return buffer;
}

/** One amp (saturation → cabinet → room) per context + output, shared by all guitar voices. */
const ampCache = new WeakMap<AudioContext, WeakMap<AudioNode, GainNode>>();
function guitarAmp(ctx: AudioContext, out: AudioNode): GainNode {
  let m = ampCache.get(ctx);
  if (!m) ampCache.set(ctx, (m = new WeakMap()));
  const existing = m.get(out);
  if (existing) return existing;

  const input = ctx.createGain();
  input.gain.value = 0.35;
  // Amp: a soft tanh curve that only really bites on big chords.
  const drive = ctx.createWaveShaper();
  drive.curve = saturationCurve(1.8);
  drive.oversample = '4x';
  // Cabinet: no sub-lows or fizz, a slight mid scoop and a presence bump.
  const cab = [
    biquad(ctx, 'highpass', 90, 0.7),
    biquad(ctx, 'peaking', 450, 1, -3),
    biquad(ctx, 'peaking', 1800, 0.9, 2.5),
    biquad(ctx, 'lowpass', 4200, 0.8),
    biquad(ctx, 'lowpass', 6500, 0.6),
  ];
  const master = ctx.createGain();
  master.gain.value = 0.55;
  const room = ctx.createConvolver();
  room.buffer = roomImpulse(ctx, 1.5);
  const wet = ctx.createGain();
  wet.gain.value = 0.2;

  const chain: AudioNode[] = [input, drive, ...cab, master];
  for (let i = 1; i < chain.length; i++) chain[i - 1].connect(chain[i]);
  master.connect(out);
  master.connect(room);
  room.connect(wet);
  wet.connect(out);

  m.set(out, input);
  return input;
}

const guitar: Instrument = {
  id: 'guitar',
  label: 'Clean guitar',
  play({ ctx, out, freq, time, duration, velocity }) {
    // Voice gain: the default velocity (0.8) plays at guitar-explorer's level.
    const g = ctx.createGain();
    const level = velocity / 0.8;
    g.gain.setValueAtTime(level, time);
    // Let the string ring for the held duration, then mute it.
    g.gain.setTargetAtTime(0, time + Math.max(duration, 0.3) + 0.4, 0.25);
    g.connect(guitarAmp(ctx, out));
    const src = ctx.createBufferSource();
    src.buffer = pluckBuffer(ctx, freq);
    src.connect(g);
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
