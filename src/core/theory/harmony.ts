import { Interval, Note, Scale } from '@tonaljs/tonal';
import { parseChord, voiceChord } from './chord';
import { parseNote, tokenize } from './pitch';

export interface KeyInfo {
  tonic: string;
  minor: boolean;
  /** Display label, e.g. "A minor" */
  label: string;
}

/** Parse "C", "Am", "A minor", "F# major", "Ebm" */
export function parseKey(input: string | undefined): KeyInfo | null {
  if (!input) return null;
  const s = input.trim();
  const m = /^([A-Ga-g](?:#|b|♯|♭)?)\s*(m|min|minor|maj|major|M)?$/i.exec(s);
  if (!m) return null;
  const n = parseNote(m[1]);
  if (!n) return null;
  const q = m[2] ?? '';
  const minor = q === 'm' || /^min/i.test(q);
  return { tonic: n.pc, minor, label: `${n.pc} ${minor ? 'minor' : 'major'}` };
}

const ROMAN_RE = /^(bb|b|#|♭|♯)?(VII|VI|V|IV|III|II|I|vii|vi|v|iv|iii|ii|i)(.*)$/;
const ROMAN_DEGREE: Record<string, number> = { I: 0, II: 1, III: 2, IV: 3, V: 4, VI: 5, VII: 6 };

export function isRomanNumeral(token: string): boolean {
  return ROMAN_RE.test(token);
}

/**
 * Convert a roman numeral to a chord symbol in a key.
 * Case determines quality: "ii7" -> Dm7 in C, "V7" -> G7, "bVII" -> Bb, "vii°" -> Bdim.
 * In minor keys, numerals are relative to the natural minor scale ("III" -> C in A minor).
 */
export function romanToChord(token: string, key: KeyInfo): string | null {
  const m = ROMAN_RE.exec(token.trim());
  if (!m) return null;
  const [, accRaw = '', numeral, rawSuffix] = m;
  const acc = accRaw.replace('♭', 'b').replace('♯', '#');
  const deg = ROMAN_DEGREE[numeral.toUpperCase()];
  const scale = Scale.get(`${key.tonic} ${key.minor ? 'minor' : 'major'}`);
  let root = scale.notes[deg];
  if (!root) return null;
  if (acc === 'b') root = Note.transpose(root, '-1A');
  if (acc === 'bb') root = Note.transpose(root, '-2A');
  if (acc === '#') root = Note.transpose(root, '1A');
  root = Note.simplify(root);
  const lower = numeral === numeral.toLowerCase();
  let suffix = rawSuffix
    .replace(/^o7|^°7/, 'dim7')
    .replace(/^o|^°/, 'dim')
    .replace(/^ø7?/, 'm7b5')
    .replace(/^\+/, 'aug');
  if (lower && !/^(dim|m7b5|m|aug)/.test(suffix)) {
    // lowercase numeral = minor quality, unless the suffix says otherwise
    if (/^maj/.test(suffix)) suffix = 'm' + suffix;
    else suffix = 'm' + suffix;
  }
  const symbol = root + suffix;
  return parseChord(symbol) ? symbol : null;
}

const ROMANS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];

/** Describe a chord's function in a key as a roman numeral: Dm7 in C -> "ii7". */
export function chordToRoman(symbol: string, key: KeyInfo): string | null {
  const c = parseChord(symbol);
  if (!c) return null;
  const scale = Scale.get(`${key.tonic} ${key.minor ? 'minor' : 'major'}`).notes;
  const rootChroma = Note.chroma(c.root);
  let degree = scale.findIndex((n) => Note.chroma(n) === rootChroma);
  let acc = '';
  if (degree < 0) {
    // chromatic root: express as flat of the degree above
    const idx = scale.findIndex((n) => (Note.chroma(n)! - 1 + 12) % 12 === rootChroma);
    if (idx >= 0) {
      degree = idx;
      acc = '♭';
    } else {
      const idx2 = scale.findIndex((n) => (Note.chroma(n)! + 1) % 12 === rootChroma);
      if (idx2 < 0) return null;
      degree = idx2;
      acc = '♯';
    }
  }
  const has = (ivl: string) => c.intervals.includes(ivl);
  const minor = has('3m') && !has('5d');
  const dim = has('3m') && has('5d');
  const aug = has('3M') && has('5A');
  let numeral = ROMANS[degree];
  if (minor || dim) numeral = numeral.toLowerCase();
  let suffix = c.suffix;
  // Strip the quality already conveyed by case
  if (minor) suffix = suffix.replace(/^(m(?!aj)|min|-)/, '');
  if (dim) {
    if (has('7m')) suffix = 'ø7';
    else if (has('7d')) suffix = '°7';
    else suffix = '°';
  }
  if (aug) suffix = suffix.replace(/^(aug|\+)/, '') + '+';
  if (suffix === 'M' || suffix === 'maj') suffix = '';
  const bass = c.bass ? `/${c.bass}` : '';
  return `${acc}${numeral}${suffix}${bass}`;
}

export interface ProgressionStep {
  /** Token as written */
  input: string;
  /** Resolved chord symbol, or null if it couldn't be parsed */
  symbol: string | null;
  /** Roman numeral in the key, if a key is given */
  roman: string | null;
  /** Voiced notes for playback */
  notes: string[];
  /** Written as exact notes, so playback must not revoice it */
  exact: boolean;
}

/**
 * Parse a progression written as chord symbols ("Dm7 G7 Cmaj7") or roman
 * numerals ("ii7 V7 Imaj7"), or a mix. Bar lines "|" and commas are ignored.
 */
export function parseProgression(text: string, keyInput?: string, octave = 3): ProgressionStep[] {
  const key = parseKey(keyInput);
  return tokenize(text).map((input) => {
    let symbol: string | null = null;
    // Roman numerals win when a key is set and the token isn't a chord symbol
    // starting with a note letter (e.g. "V7" vs "Bb7").
    if (key && isRomanNumeral(input) && !/^[A-G]/.test(input)) {
      symbol = romanToChord(input, key);
    } else if (parseChord(input)) {
      symbol = parseChord(input)!.symbol;
    } else if (key && isRomanNumeral(input)) {
      symbol = romanToChord(input, key);
    }
    const roman = symbol && key ? chordToRoman(symbol, key) : null;
    return { input, symbol, roman, notes: symbol ? voiceChord(symbol, octave) : [], exact: !!(symbol && parseChord(symbol)?.explicit) };
  });
}

/**
 * Smooth voice-leading: rearrange each chord's notes to stay close to the
 * previous chord. Chords marked `exact` sound as written, and the next chord
 * leads on from them.
 */
export function voiceLead(chords: string[][], exact: boolean[] = []): string[][] {
  const out: string[][] = [];
  let prevCenter: number | null = null;
  for (const [i, notes] of chords.entries()) {
    if (!notes.length) {
      out.push(notes);
      continue;
    }
    const midis = notes.map((n) => Note.midi(n)!).filter((m) => m != null);
    if (prevCenter === null || exact[i]) {
      out.push(notes);
      prevCenter = avg(midis);
      continue;
    }
    // Keep the bass (first note) as-is; shift upper voices by octaves toward the previous center
    const [bass, ...upper] = notes;
    const shifted = upper.map((n) => {
      let m = Note.midi(n)!;
      while (m - prevCenter! > 6) m -= 12;
      while (prevCenter! - m > 6) m += 12;
      const bassMidi = Note.midi(bass)!;
      while (m <= bassMidi) m += 12;
      return Note.fromMidi(m);
    });
    const voiced = [bass, ...shifted.sort((a, b) => Note.midi(a)! - Note.midi(b)!)];
    out.push(voiced);
    prevCenter = avg(shifted.map((n) => Note.midi(n)!));
  }
  return out;
}

function avg(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
}

export function intervalSemitones(a: string, b: string): number | null {
  const i = Interval.distance(a, b);
  const s = Interval.semitones(i);
  return s ?? null;
}

/** Circle of fifths order of major keys, starting at C. */
export const CIRCLE_MAJOR = ['C', 'G', 'D', 'A', 'E', 'B', 'F#', 'Db', 'Ab', 'Eb', 'Bb', 'F'];
export const CIRCLE_MINOR = ['A', 'E', 'B', 'F#', 'C#', 'G#', 'Eb', 'Bb', 'F', 'C', 'G', 'D'];
