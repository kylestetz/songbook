/**
 * Helpers for "play it to write it" input: naming chords from notes picked on
 * an instrument, and placing notes on guitar strings.
 */
import { Chord, ChordType, Note } from '@tonaljs/tonal';
import { CHORD_SUFFIXES, chordPitchClasses, parseChord } from './chord';
import type { Frets, Tuning } from './guitar';

/** Spellings that read naturally on chord charts: C♯, E♭, F♯, A♭, B♭. */
const FRIENDLY = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];

/** Name a midi note with chart-friendly spelling, e.g. 63 -> "Eb4". */
export function friendlyNote(midi: number): string {
  return `${FRIENDLY[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`;
}

/** Pitch-class name for a midi note, e.g. 63 -> "Eb". */
export function friendlyPitchClass(midi: number): string {
  return FRIENDLY[((midi % 12) + 12) % 12];
}

const COMMON = new Set([...CHORD_SUFFIXES, '5', 'madd9', 'mmaj7', '6/9', 'maj7#11', 'm11']);

/** Tonal writes major triads as "CM"; chord charts write "C". */
function normalizeDetected(symbol: string): string {
  return symbol.replace(/^([A-G](?:#|b)?)M(?=\/|$)/, '$1');
}

/**
 * Name the chord formed by some notes. The lowest note is treated as the bass.
 * Returns candidate symbols, most natural first (e.g. C E G -> ["C"],
 * E G C -> ["C/E", ...], A C E G -> ["Am7", "C6/A"]). Empty when the notes
 * don't form a chord tonal knows.
 */
export function detectChords(midis: number[]): string[] {
  const sorted = [...new Set(midis)].sort((a, b) => a - b);
  const pcs: string[] = [];
  for (const m of sorted) {
    const pc = friendlyPitchClass(m);
    if (!pcs.includes(pc)) pcs.push(pc);
  }
  if (pcs.length < 2) return [];
  const raw = Chord.detect(pcs).map(normalizeDetected);
  // Two distinct notes a fifth apart: a power chord
  if (pcs.length === 2 && !raw.length) {
    const ivl = ((Note.chroma(pcs[1])! - Note.chroma(pcs[0])!) + 12) % 12;
    if (ivl === 7) raw.push(`${pcs[0]}5`);
  }
  const scored = raw
    .filter((s) => parseChord(s))
    .map((s, i) => {
      const c = parseChord(s)!;
      let score = -i * 0.5;
      if (COMMON.has(c.suffix)) score += 10;
      if (c.bass) score -= 3;
      return { s, score };
    });
  scored.sort((a, b) => b.score - a.score);
  // Hide exotic readings (like "G#m#5/E" for an E chord) when a familiar name fits.
  const familiar = scored.filter((x) => x.score > 0);
  return (familiar.length ? familiar : scored).map((x) => x.s);
}

/**
 * Suggest names for notes that don't spell out a whole chord, using music
 * theory to fill the gap: a chord with its fifth left out is still that chord
 * (F A♭ G is Fm(add9) without the C). Most likely first; the bass is preferred
 * as the root, and other roots are written as slash chords. These are labels
 * only: the notes themselves are what should sound.
 */
export function guessChordNames(midis: number[]): string[] {
  const sorted = [...new Set(midis)].sort((a, b) => a - b);
  const pcs: string[] = [];
  for (const m of sorted) {
    const pc = friendlyPitchClass(m);
    if (!pcs.includes(pc)) pcs.push(pc);
  }
  if (pcs.length < 3) return [];
  const exact = new Set(detectChords(midis));
  const out: { s: string; score: number }[] = [];
  pcs.forEach((root, ri) => {
    const rc = Note.chroma(root)!;
    const played = new Set(pcs.map((p) => (Note.chroma(p)! - rc + 12) % 12));
    for (const t of ChordType.all()) {
      const tones = [...t.chroma].map((c, i) => (c === '1' ? i : -1)).filter((i) => i >= 0);
      if (![...played].every((i) => tones.includes(i))) continue;
      const missing = tones.filter((i) => !played.has(i));
      // Only the perfect fifth can go unplayed and still leave the chord clear.
      if (missing.length !== 1 || missing[0] !== 7) continue;
      const alias = t.aliases.find((a) => COMMON.has(a)) ?? (t.aliases.includes('M') ? '' : t.aliases[0]);
      if (alias === undefined) continue;
      const s = `${root}${alias}${ri ? `/${pcs[0]}` : ''}`;
      if (exact.has(s) || !parseChord(s) || out.some((x) => x.s === s)) continue;
      let score = -tones.length;
      if (COMMON.has(alias)) score += 10;
      if (ri) score -= 3;
      out.push({ s, score });
    }
  });
  out.sort((a, b) => b.score - a.score);
  return out.map((x) => x.s);
}

/** The most likely name for some notes, or "" when nothing fits. */
export function bestChordName(midis: number[]): string {
  return detectChords(midis)[0] ?? guessChordNames(midis)[0] ?? '';
}

/**
 * Name notes the way they'd be written for a chord: the G♯ in E major, the
 * A♭ in F minor. Falls back to chart-friendly spellings.
 */
export function spellNotes(midis: number[], chordSymbol?: string): string[] {
  const c = parseChord(chordSymbol ?? detectChords(midis)[0] ?? '');
  const pcs = c ? chordPitchClasses(c) : [];
  return midis.map((m) => {
    const pc = pcs.find((p) => Note.chroma(p) === ((m % 12) + 12) % 12);
    if (!pc) return friendlyNote(m);
    const oct = Math.floor(m / 12) - 1;
    for (const o of [oct, oct + 1, oct - 1]) if (Note.midi(`${pc}${o}`) === m) return `${pc}${o}`;
    return friendlyNote(m);
  });
}

/** Highest fret offered by the fretboard input. */
export const MAX_FRET = 15;

/**
 * Place notes on guitar strings, one note per string, keeping the hand as
 * compact as possible. Returns frets (low string first) or null if the notes
 * can't all be played at once.
 */
export function fitToStrings(midis: number[], tuning: Tuning, maxFret = MAX_FRET): Frets | null {
  const notes = [...new Set(midis)].sort((a, b) => a - b);
  const open = tuning.notes.map((n) => Note.midi(n)!);
  if (!notes.length) return open.map(() => null);
  if (notes.length > open.length) return null;
  let best: { frets: Frets; score: number } | null = null;
  const current: Frets = open.map(() => null);
  // Assign notes in ascending order to strings in ascending order.
  const walk = (ni: number, fromString: number) => {
    if (ni === notes.length) {
      const fretted = current.filter((f): f is number => f !== null && f > 0);
      const span = fretted.length ? Math.max(...fretted) - Math.min(...fretted) : 0;
      if (span > 4) return;
      const sum = current.reduce<number>((a, f) => a + (f ?? 0), 0);
      const score = span * 3 + sum * 0.2 + (fretted.length ? Math.min(...fretted) : 0) * 0.5;
      if (!best || score < best.score) best = { frets: [...current], score };
      return;
    }
    for (let s = fromString; s <= open.length - (notes.length - ni); s++) {
      const f = notes[ni] - open[s];
      if (f < 0 || f > maxFret) continue;
      current[s] = f;
      walk(ni + 1, s + 1);
      current[s] = null;
    }
  };
  walk(0, 0);
  return best ? (best as { frets: Frets }).frets : null;
}
