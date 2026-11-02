import { Chord, Interval, Note } from '@tonaljs/tonal';
import { ascendingOctaves, normalizeNoteName, parseNote } from './pitch';

export interface ParsedChord {
  /** The symbol as written (normalized), e.g. "Cmaj7/E" */
  symbol: string;
  /** Root pitch class, e.g. "C" */
  root: string;
  /** The chord quality suffix as written, e.g. "maj7" */
  suffix: string;
  /** Slash bass pitch class, if any */
  bass?: string;
  /** Pitch classes, root first (bass not included unless part of chord) */
  notes: string[];
  /** Intervals from the root */
  intervals: string[];
  /** Human readable name, e.g. "C major seventh" */
  name: string;
  quality: string;
  /**
   * For chords written as notes ("Fm(add9)[F3 Ab3 G3]"): the notes exactly as
   * written. These are what sound; the label is only what's shown.
   */
  explicit?: string[];
  /** The display label of a chord written as notes ("" when unnamed) */
  label?: string;
}

/**
 * A chord can be written as the exact notes that sound, with an optional
 * label in front: "Fm(add9)[F3 Ab3 G3]" or just "[F Ab G]". This lets any set
 * of notes be used as a chord, whether or not it has a standard name.
 */
const EXPLICIT_RE = /^([^\s[\]]*)\[([^\]]*)\]$/;

export interface ExplicitChord {
  label: string;
  /** Notes as written, e.g. ["F3", "Ab3", "G3"] */
  notes: string[];
}

export function parseExplicitChord(input: string): ExplicitChord | null {
  const m = EXPLICIT_RE.exec(input.trim());
  if (!m) return null;
  const parsed = m[2].split(/[\s,]+/).filter(Boolean).map(parseNote);
  if (!parsed.length || parsed.some((n) => !n)) return null;
  return { label: m[1], notes: parsed.map((n) => n!.name) };
}

/** Write notes (and an optional label) as a chord: "Fmadd9[F3 Ab3 G3]". */
export function formatExplicitChord(label: string, notes: string[]): string {
  return `${cleanChordLabel(label)}[${notes.join(' ')}]`;
}

/** Labels can't hold spaces or brackets, since they live inside chord lists. */
export function cleanChordLabel(label: string): string {
  return label.replace(/[\s[\]]+/g, '');
}

/** What to show for a chord: its label, or for unnamed notes the notes themselves. */
export function chordLabel(input: string): string {
  const e = parseExplicitChord(input);
  if (!e) return input;
  return e.label || e.notes.map((n) => Note.pitchClass(n)).join(' ');
}

function parseExplicit(e: ExplicitChord): ParsedChord {
  const voiced = ascendingOctaves(e.notes, 3).sort((a, b) => Note.midi(a)! - Note.midi(b)!);
  const pcs: string[] = [];
  for (const n of voiced) {
    const pc = Note.pitchClass(n);
    if (!pcs.some((p) => Note.chroma(p) === Note.chroma(pc))) pcs.push(pc);
  }
  const named = e.label ? parseChord(e.label) : null;
  const root = named && pcs.some((p) => Note.chroma(p) === Note.chroma(named.root)) ? named.root : pcs[0];
  const bass = Note.chroma(pcs[0]) !== Note.chroma(root) ? pcs[0] : undefined;
  // Root first, then the rest in pitch order
  const notes = [root, ...pcs.filter((p) => Note.chroma(p) !== Note.chroma(root))].map((p) =>
    pcs.find((x) => Note.chroma(x) === Note.chroma(p))!,
  );
  return {
    symbol: formatExplicitChord(e.label, e.notes),
    root,
    suffix: named && named.root === root ? named.suffix : '',
    bass,
    notes,
    intervals: notes.map((n) => Interval.simplify(Interval.distance(root, n)) || '1P'),
    name: e.label || notes.join(' '),
    quality: named?.quality ?? '',
    explicit: e.notes,
    label: e.label,
  };
}

/** Normalize common chord-symbol spellings tonal doesn't know. */
function normalizeSymbol(input: string): string {
  let s = input.trim().replace(/♯/g, '#').replace(/♭/g, 'b');
  s = s.replace(/ø7?/g, 'm7b5').replace(/°7/g, 'dim7').replace(/°/g, 'dim').replace(/Δ7?/g, 'maj7');
  if (s.length) s = s[0].toUpperCase() + s.slice(1);
  return s;
}

const ROOT_RE = /^([A-G](?:##|bb|#|b)?)(.*)$/;

export function parseChord(input: string): ParsedChord | null {
  const explicit = parseExplicitChord(input);
  if (explicit) return parseExplicit(explicit);
  if (/[[\]]/.test(input)) return null;
  const symbol = normalizeSymbol(input);
  if (!symbol) return null;

  let main = symbol;
  let bass: string | undefined;
  let chord = Chord.get(main);
  if (chord.empty && symbol.includes('/')) {
    const idx = symbol.lastIndexOf('/');
    const bassPart = parseNote(symbol.slice(idx + 1));
    if (bassPart && bassPart.oct === undefined) {
      main = symbol.slice(0, idx);
      bass = bassPart.pc;
      chord = Chord.get(main);
    }
  }
  if (chord.empty || !chord.tonic) return null;
  const m = ROOT_RE.exec(main);
  return {
    symbol,
    root: chord.tonic,
    suffix: m ? m[2] : '',
    bass,
    notes: chord.notes,
    intervals: chord.intervals,
    name: chord.name || chord.symbol,
    quality: chord.quality,
  };
}

export function isChord(input: string): boolean {
  return parseChord(input) !== null;
}

/**
 * Voice a chord for playback / display with octaves. The root sits at the given
 * octave and the remaining tones stack above it; a slash bass goes an octave below.
 */
export function voiceChord(input: string, octave = 3): string[] {
  const c = parseChord(input);
  if (!c) return [];
  if (c.explicit) return ascendingOctaves(c.explicit, octave).sort((a, b) => Note.midi(a)! - Note.midi(b)!);
  const root = `${c.root}${octave}`;
  const notes = c.intervals.map((ivl) => Note.transpose(root, ivl));
  if (c.bass) {
    const bassNote = `${c.bass}${octave - 1}`;
    // Avoid a doubled bass far below if it's already the root
    return [bassNote, ...notes];
  }
  return notes;
}

/** All notes in the chord, bass first (pitch classes). */
export function chordPitchClasses(c: ParsedChord): string[] {
  const set = [...c.notes];
  if (c.bass && !set.some((n) => Note.chroma(n) === Note.chroma(c.bass!))) set.unshift(c.bass);
  else if (c.bass) {
    const i = set.findIndex((n) => Note.chroma(n) === Note.chroma(c.bass!));
    set.unshift(...set.splice(i, 1));
  }
  return set;
}

/** Split a chord symbol into root and suffix for typographic display. */
export function splitChordSymbol(input: string): { root: string; suffix: string; bass?: string } {
  const s = normalizeNoteName(input);
  const slash = s.lastIndexOf('/');
  let main = s;
  let bass: string | undefined;
  if (slash > 0 && /^[A-G](#|b)?$/.test(s.slice(slash + 1))) {
    main = s.slice(0, slash);
    bass = s.slice(slash + 1);
  }
  const m = ROOT_RE.exec(main);
  if (!m) return { root: s, suffix: '' };
  return { root: m[1], suffix: m[2], bass };
}

/** Common chord suffixes, for pickers. */
export const CHORD_SUFFIXES = [
  '',
  'm',
  '7',
  'maj7',
  'm7',
  'm7b5',
  'dim',
  'dim7',
  'aug',
  'sus2',
  'sus4',
  '7sus4',
  '6',
  'm6',
  'add9',
  '9',
  'maj9',
  'm9',
  '11',
  '13',
  '7b9',
  '7#9',
];
