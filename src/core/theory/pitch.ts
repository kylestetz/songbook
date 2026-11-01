import { Note, Interval } from '@tonaljs/tonal';

/** Normalize user-entered note text: unicode accidentals, case, whitespace. */
export function normalizeNoteName(input: string): string {
  const s = input
    .trim()
    .replace(/♯/g, '#')
    .replace(/♭/g, 'b')
    .replace(/𝄪/g, '##')
    .replace(/𝄫/g, 'bb');
  if (!s) return s;
  return s[0].toUpperCase() + s.slice(1);
}

export interface ParsedNote {
  /** Canonical tonal name, e.g. "C#4" or "Eb" */
  name: string;
  /** Pitch class, e.g. "C#" */
  pc: string;
  /** Octave, if present */
  oct?: number;
  /** Midi number, if octave present */
  midi?: number;
}

export function parseNote(input: string): ParsedNote | null {
  const n = Note.get(normalizeNoteName(input));
  if (n.empty) return null;
  return {
    name: n.name,
    pc: n.pc,
    oct: n.oct,
    midi: n.midi ?? undefined,
  };
}

export function isNote(input: string): boolean {
  return parseNote(input) !== null;
}

export function noteToMidi(name: string): number | null {
  const m = Note.midi(normalizeNoteName(name));
  return m ?? null;
}

export function midiToNote(midi: number, preferFlats = false): string {
  return preferFlats ? Note.fromMidi(midi) : Note.fromMidiSharps(midi);
}

export function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/** Pretty-print a note name with typographic accidentals: "C#4" -> "C♯4" */
export function displayNote(name: string, { octave = true }: { octave?: boolean } = {}): string {
  const n = Note.get(normalizeNoteName(name));
  if (n.empty) return name;
  const acc = n.acc.replace(/##/g, '𝄪').replace(/#/g, '♯').replace(/bb/g, '𝄫').replace(/b/g, '♭');
  return `${n.letter}${acc}${octave && n.oct !== undefined ? n.oct : ''}`;
}

/** Pretty-print accidentals inside any string (chord symbols, degree labels). */
export function prettyAccidentals(s: string): string {
  // "b" is a flat when it directly follows a note letter at the start of a
  // symbol or after a slash ("Bb7", "C/Eb"), or when it precedes a degree
  // number ("b3", "C7b9").
  return s
    .replace(/#/g, '♯')
    .replace(/(^|\/|\s)([A-G])bb/g, '$1$2𝄫')
    .replace(/(^|\/|\s)([A-G])b/g, '$1$2♭')
    .replace(/b(?=\d)/g, '♭');
}

/** Ensure a note has an octave, using the given default. */
export function withOctave(name: string, octave: number): string {
  const n = parseNote(name);
  if (!n) return name;
  return n.oct === undefined ? `${n.pc}${octave}` : n.name;
}

/**
 * Assign octaves to a sequence of notes so that octave-less notes ascend from
 * the previous note. Notes that already carry an octave are kept as-is.
 */
export function ascendingOctaves(names: string[], startOctave = 4): string[] {
  const out: string[] = [];
  let prevMidi: number | null = null;
  for (const raw of names) {
    const n = parseNote(raw);
    if (!n) continue;
    if (n.oct !== undefined) {
      out.push(n.name);
      prevMidi = n.midi ?? prevMidi;
      continue;
    }
    let oct = startOctave;
    let candidate = `${n.pc}${oct}`;
    if (prevMidi !== null) {
      // lowest octave strictly above the previous note
      oct = Math.floor(prevMidi / 12) - 2;
      candidate = `${n.pc}${oct}`;
      while ((Note.midi(candidate) ?? 0) <= prevMidi) {
        oct += 1;
        candidate = `${n.pc}${oct}`;
      }
    }
    out.push(candidate);
    prevMidi = Note.midi(candidate) ?? prevMidi;
  }
  return out;
}

export function transpose(note: string, interval: string): string {
  return Note.transpose(note, interval);
}

const LONG_QUALITY: Record<string, string> = {
  P: 'Perfect',
  M: 'Major',
  m: 'Minor',
  A: 'Augmented',
  d: 'Diminished',
  AA: 'Doubly augmented',
  dd: 'Doubly diminished',
};
const ORDINAL: Record<number, string> = {
  1: 'unison',
  2: 'second',
  3: 'third',
  4: 'fourth',
  5: 'fifth',
  6: 'sixth',
  7: 'seventh',
  8: 'octave',
  9: 'ninth',
  10: 'tenth',
  11: 'eleventh',
  12: 'twelfth',
  13: 'thirteenth',
  14: 'fourteenth',
  15: 'double octave',
};

export interface IntervalInfo {
  /** e.g. "P5" */
  short: string;
  /** e.g. "Perfect fifth" */
  long: string;
  semitones: number;
}

export function intervalBetween(a: string, b: string): IntervalInfo | null {
  const na = parseNote(a);
  const nb = parseNote(b);
  if (!na || !nb) return null;
  const from = withOctave(na.name, 4);
  let to = withOctave(nb.name, 4);
  // If octave-less, place the second note above the first
  if (nb.oct === undefined) to = ascendingOctaves([from, nb.pc])[1];
  const ivl = Interval.get(Interval.distance(from, to));
  if (ivl.empty) return null;
  const num = Math.abs(ivl.num);
  const q = LONG_QUALITY[ivl.q] ?? ivl.q;
  const ord = ORDINAL[num] ?? `${num}th`;
  const long = num === 1 && ivl.q === 'P' ? 'Unison' : num === 8 && ivl.q === 'P' ? 'Octave' : `${q} ${ord}`;
  const short = num === 1 && ivl.q === 'P' ? 'P1' : `${ivl.q}${num}`;
  return { short, long, semitones: Math.abs(ivl.semitones) };
}

/** Degree label for an interval: "3m" -> "♭3", "4A" -> "♯4", "1P" -> "1" */
export function degreeLabel(interval: string): string {
  const ivl = Interval.get(interval);
  if (ivl.empty) return interval;
  const num = ivl.simple === 8 ? 8 : ivl.num;
  const n = ((num - 1) % 7) + 1;
  const perfectable = n === 1 || n === 4 || n === 5;
  let prefix = '';
  if (perfectable) {
    if (ivl.q === 'A') prefix = '♯';
    else if (ivl.q === 'AA') prefix = '𝄪';
    else if (ivl.q === 'd') prefix = '♭';
    else if (ivl.q === 'dd') prefix = '𝄫';
  } else {
    if (ivl.q === 'm') prefix = '♭';
    else if (ivl.q === 'd') prefix = '𝄫';
    else if (ivl.q === 'A') prefix = '♯';
  }
  return `${prefix}${num > 7 ? num : n}`;
}

/** Split a free-form list of notes/chords: "C4 E4, G4 | B4" -> ["C4","E4","G4","B4"] */
export function tokenize(input: string): string[] {
  return input
    .split(/[\s,|]+/)
    .map((t) => t.trim())
    .filter(Boolean);
}
