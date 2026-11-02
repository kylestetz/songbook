import { Note } from '@tonaljs/tonal';
import { chordPitchClasses, parseChord } from './chord';

/** A fret per string, low string first. null = muted, 0 = open. */
export type Frets = (number | null)[];

export interface Tuning {
  id: string;
  label: string;
  notes: string[];
}

export const TUNINGS: Tuning[] = [
  { id: 'standard', label: 'Standard (EADGBE)', notes: ['E2', 'A2', 'D3', 'G3', 'B3', 'E4'] },
  { id: 'drop-d', label: 'Drop D (DADGBE)', notes: ['D2', 'A2', 'D3', 'G3', 'B3', 'E4'] },
  { id: 'dadgad', label: 'DADGAD', notes: ['D2', 'A2', 'D3', 'G3', 'A3', 'D4'] },
  { id: 'open-g', label: 'Open G (DGDGBD)', notes: ['D2', 'G2', 'D3', 'G3', 'B3', 'D4'] },
  { id: 'open-d', label: 'Open D (DADF♯AD)', notes: ['D2', 'A2', 'D3', 'F#3', 'A3', 'D4'] },
  { id: 'half-step-down', label: 'Half step down', notes: ['Eb2', 'Ab2', 'Db3', 'Gb3', 'Bb3', 'Eb4'] },
];

export function getTuning(id: string | undefined): Tuning {
  return TUNINGS.find((t) => t.id === id) ?? TUNINGS[0];
}

/** Parse "x32010", "x-10-12-12-10-x", "3 2 0 0 0 3" */
export function parseFrets(input: string, strings = 6): Frets | null {
  const s = input.trim().toLowerCase();
  if (!s) return null;
  const parts = /[\s,-]/.test(s) ? s.split(/[\s,-]+/).filter(Boolean) : s.split('');
  if (parts.length !== strings) return null;
  const out: Frets = [];
  for (const p of parts) {
    if (p === 'x' || p === 'm') out.push(null);
    else if (/^\d+$/.test(p)) out.push(parseInt(p, 10));
    else return null;
  }
  return out;
}

export function formatFrets(frets: Frets): string {
  const big = frets.some((f) => f !== null && f > 9);
  const parts = frets.map((f) => (f === null ? 'x' : String(f)));
  return big ? parts.join('-') : parts.join('');
}

export function fretsToNotes(frets: Frets, tuning: Tuning): (string | null)[] {
  return frets.map((f, i) => (f === null ? null : Note.fromMidiSharps(Note.midi(tuning.notes[i])! + f)));
}

/** Hand-checked open-position shapes for standard tuning. */
const OPEN_SHAPES: Record<string, string> = {
  C: 'x32010',
  Cmaj7: 'x32000',
  C7: 'x32310',
  Cadd9: 'x32030',
  Csus2: 'x30033',
  Csus4: 'x33011',
  D: 'xx0232',
  Dm: 'xx0231',
  D7: 'xx0212',
  Dmaj7: 'xx0222',
  Dm7: 'xx0211',
  Dsus2: 'xx0230',
  Dsus4: 'xx0233',
  E: '022100',
  Em: '022000',
  E7: '020100',
  Em7: '022030',
  Emaj7: '021100',
  Esus4: '022200',
  F: '133211',
  Fmaj7: 'xx3210',
  G: '320003',
  G7: '320001',
  Gmaj7: '320002',
  A: 'x02220',
  Am: 'x02210',
  A7: 'x02020',
  Am7: 'x02010',
  Amaj7: 'x02120',
  Asus2: 'x02200',
  Asus4: 'x02230',
  B7: 'x21202',
  Bm: 'x24432',
};

type Shape = (number | null)[];

/** Movable barre shapes, as fret offsets from the root's fret (low string first). */
const E_SHAPES: Record<string, Shape> = {
  '': [0, 2, 2, 1, 0, 0],
  m: [0, 2, 2, 0, 0, 0],
  '7': [0, 2, 0, 1, 0, 0],
  m7: [0, 2, 0, 0, 0, 0],
  maj7: [0, null, 1, 1, 0, null],
  sus4: [0, 2, 2, 2, 0, 0],
  '7sus4': [0, 2, 0, 2, 0, 0],
};
const A_SHAPES: Record<string, Shape> = {
  '': [null, 0, 2, 2, 2, 0],
  m: [null, 0, 2, 2, 1, 0],
  '7': [null, 0, 2, 0, 2, 0],
  m7: [null, 0, 2, 0, 1, 0],
  maj7: [null, 0, 2, 1, 2, 0],
  sus2: [null, 0, 2, 2, 0, 0],
  sus4: [null, 0, 2, 2, 3, 0],
  '7sus4': [null, 0, 2, 0, 3, 0],
  '6': [null, 0, 2, 2, 2, 2],
  m7b5: [null, 0, 1, 0, 1, null],
  '9': [null, 0, -1, 0, 0, 0],
  '7#9': [null, 0, -1, 0, 1, null],
};

function movableShape(rootChroma: number, suffix: string): Frets | null {
  const options: Frets[] = [];
  const place = (shape: Shape | undefined, openChroma: number) => {
    if (!shape) return;
    let fret = (rootChroma - openChroma + 12) % 12;
    if (shape.some((o) => o !== null && fret + o < 0)) fret += 12;
    options.push(shape.map((o) => (o === null ? null : fret + o)));
  };
  place(E_SHAPES[suffix], 4); // low E
  place(A_SHAPES[suffix], 9); // A string
  if (!options.length) return null;
  // Lowest position wins, but avoid the nut for shapes that need a barre (fret 0 = open chord, fine)
  options.sort((a, b) => Math.min(...(a.filter((f) => f !== null) as number[])) - Math.min(...(b.filter((f) => f !== null) as number[])));
  return options[0];
}

export interface Voicing {
  frets: Frets;
  /** Lowest fretted position, for the diagram window */
  baseFret: number;
  /** Optional barre: fret + string span (indexes, low string first) */
  barre?: { fret: number; from: number; to: number };
}

function normalizeKey(symbol: string): string {
  const c = parseChord(symbol);
  if (!c) return symbol;
  const suffix = c.suffix === 'M' ? '' : c.suffix === 'min' ? 'm' : c.suffix;
  return `${c.root}${suffix}${c.bass ? '/' + c.bass : ''}`;
}

/** Find a playable voicing for a chord symbol. */
export function guitarVoicing(symbol: string, tuning: Tuning = TUNINGS[0]): Voicing | null {
  const chordAsNotes = parseChord(symbol);
  if (chordAsNotes?.explicit) {
    // Exactly these notes: the lowest is the bass, and none may be dropped.
    const pcs = chordPitchClasses(chordAsNotes);
    const best = searchVoicing(pcs, pcs[0], tuning, false);
    return best ? describeVoicing(best) : null;
  }
  const key = normalizeKey(symbol);
  if (tuning.id === 'standard' && OPEN_SHAPES[key]) {
    return describeVoicing(parseFrets(OPEN_SHAPES[key])!);
  }
  const chord = parseChord(symbol);
  if (!chord) return null;
  if (tuning.id === 'standard' && !chord.bass) {
    const suffix = key.slice(chord.root.length);
    const shape = movableShape(Note.chroma(chord.root)!, suffix);
    if (shape) return describeVoicing(shape);
  }
  const best = searchVoicing(chordPitchClasses(chord), chord.bass ?? chord.root, tuning);
  return best ? describeVoicing(best) : null;
}

export function describeVoicing(frets: Frets): Voicing {
  const fretted = frets.filter((f): f is number => f !== null && f > 0);
  const min = fretted.length ? Math.min(...fretted) : 1;
  const max = fretted.length ? Math.max(...fretted) : 1;
  const baseFret = max <= 5 ? 1 : min;
  // Detect a barre: lowest fret used on 3+ strings including the highest sounding string
  let barre: Voicing['barre'];
  const atMin = frets.map((f, i) => (f === min ? i : -1)).filter((i) => i >= 0);
  if (fretted.length >= 4 && atMin.length >= 2) {
    const from = atMin[0];
    const to = atMin[atMin.length - 1];
    const between = frets.slice(from, to + 1);
    if (between.every((f) => f !== null && f >= min) && atMin.length >= 2 && to - from >= 2) {
      barre = { fret: min, from, to };
    }
  }
  return { frets, baseFret, barre };
}

/**
 * Brute-force search for a compact voicing: every string is muted or plays a
 * chord tone within a 4-fret window; the lowest sounding note must be the bass;
 * every chord tone (except possibly the 5th) must be present.
 */
function searchVoicing(pcs: string[], bass: string, tuning: Tuning, dropFifth = true): Frets | null {
  const chromas = pcs.map((n) => Note.chroma(n)!);
  const bassChroma = Note.chroma(bass)!;
  const required = new Set(chromas);
  // Allow dropping the 5th on dense chords
  const optional = new Set<number>();
  if (dropFifth && chromas.length >= 4) {
    const root = Note.chroma(pcs[0])!;
    optional.add((root + 7) % 12);
  }
  const open = tuning.notes.map((n) => Note.midi(n)!);
  let best: { frets: Frets; score: number } | null = null;

  for (let base = 0; base <= 10; base++) {
    const options: (number | null)[][] = open.map((o) => {
      const opts: (number | null)[] = [null];
      for (let f = base === 0 ? 0 : base; f <= base + 3; f++) {
        if (chromas.includes((o + f) % 12)) opts.push(f);
      }
      if (base > 0 && chromas.includes(o % 12)) opts.push(0);
      return opts;
    });
    const current: Frets = [];
    const walk = (i: number) => {
      if (i === open.length) {
        const s = scoreVoicing(current, open, bassChroma, required, optional);
        if (s !== null && (!best || s > best.score)) best = { frets: [...current], score: s };
        return;
      }
      for (const opt of options[i]) {
        current.push(opt);
        walk(i + 1);
        current.pop();
      }
    };
    walk(0);
  }
  return best ? (best as { frets: Frets }).frets : null;
}

function scoreVoicing(
  frets: Frets,
  open: number[],
  bassChroma: number,
  required: Set<number>,
  optional: Set<number>,
): number | null {
  const sounding = frets.map((f, i) => (f === null ? null : open[i] + f));
  const firstIdx = sounding.findIndex((m) => m !== null);
  if (firstIdx < 0) return null;
  // no muted strings between sounding strings
  const lastIdx = sounding.length - 1 - [...sounding].reverse().findIndex((m) => m !== null);
  for (let i = firstIdx; i <= lastIdx; i++) if (sounding[i] === null) return null;
  const count = lastIdx - firstIdx + 1;
  if (count < Math.min(4, required.size + 1) && count < 3) return null;
  if (sounding[firstIdx]! % 12 !== bassChroma) return null;
  const present = new Set(sounding.filter((m): m is number => m !== null).map((m) => m % 12));
  for (const c of required) if (!present.has(c) && !optional.has(c)) return null;
  // fingers: fretted notes, with a barre at the lowest fret counted once
  const fretted = frets.filter((f): f is number => f !== null && f > 0);
  const minF = fretted.length ? Math.min(...fretted) : 0;
  const atMin = fretted.filter((f) => f === minF).length;
  const fingers = fretted.length - (atMin > 1 ? atMin - 1 : 0);
  if (fingers > 4) return null;
  const maxF = fretted.length ? Math.max(...fretted) : 0;
  if (maxF - minF > 3) return null;
  let score = 0;
  score += count * 2.5; // fuller chords
  score -= minF * 1.5; // lower positions
  const opens = frets.filter((f) => f === 0).length;
  score += maxF <= 4 ? opens : -4 * opens; // open strings ring in open position, but are awkward up the neck
  score -= fingers * 0.5;
  if (firstIdx > 2) score -= 6; // too thin
  for (const c of required) if (!present.has(c)) score -= 3;
  return score;
}
