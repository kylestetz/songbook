import { Chord, Note, Scale } from '@tonaljs/tonal';
import { degreeLabel, parseNote } from './pitch';

export interface ScaleOption {
  id: string;
  label: string;
  group: string;
  /** Shorter name for tight spaces, e.g. inline in a sentence */
  short?: string;
}

/** Curated list of scales/modes presented in pickers. Ids are tonal scale names. */
export const SCALES: ScaleOption[] = [
  { id: 'major', label: 'Major (Ionian)', group: 'Diatonic modes', short: 'Major' },
  { id: 'dorian', label: 'Dorian', group: 'Diatonic modes' },
  { id: 'phrygian', label: 'Phrygian', group: 'Diatonic modes' },
  { id: 'lydian', label: 'Lydian', group: 'Diatonic modes' },
  { id: 'mixolydian', label: 'Mixolydian', group: 'Diatonic modes' },
  { id: 'minor', label: 'Natural minor (Aeolian)', group: 'Diatonic modes', short: 'Minor' },
  { id: 'locrian', label: 'Locrian', group: 'Diatonic modes' },
  { id: 'harmonic minor', label: 'Harmonic minor', group: 'Minor scales' },
  { id: 'melodic minor', label: 'Melodic minor', group: 'Minor scales' },
  { id: 'phrygian dominant', label: 'Phrygian dominant', group: 'Minor scales' },
  { id: 'lydian dominant', label: 'Lydian dominant', group: 'Melodic minor modes' },
  { id: 'altered', label: 'Altered', group: 'Melodic minor modes' },
  { id: 'dorian b2', label: 'Dorian ♭2', group: 'Melodic minor modes' },
  { id: 'major pentatonic', label: 'Major pentatonic', group: 'Pentatonic & blues' },
  { id: 'minor pentatonic', label: 'Minor pentatonic', group: 'Pentatonic & blues' },
  { id: 'blues', label: 'Blues', group: 'Pentatonic & blues' },
  { id: 'major blues', label: 'Major blues', group: 'Pentatonic & blues' },
  { id: 'whole tone', label: 'Whole tone', group: 'Symmetric' },
  { id: 'diminished', label: 'Diminished (whole–half)', group: 'Symmetric' },
  { id: 'half-whole diminished', label: 'Diminished (half–whole)', group: 'Symmetric' },
  { id: 'chromatic', label: 'Chromatic', group: 'Symmetric' },
  { id: 'hirajoshi', label: 'Hirajōshi', group: 'World' },
  { id: 'in-sen', label: 'In-sen', group: 'World' },
  { id: 'double harmonic major', label: 'Double harmonic', group: 'World' },
  { id: 'hungarian minor', label: 'Hungarian minor', group: 'World' },
];

export function scaleLabel(id: string): string {
  return SCALES.find((s) => s.id === id)?.label ?? id.replace(/\b\w/g, (c) => c.toUpperCase());
}

export function scaleShortLabel(id: string): string {
  const s = SCALES.find((o) => o.id === id);
  return s?.short ?? scaleLabel(id);
}

export interface ScaleInfo {
  name: string;
  /** Like `name`, but with the short scale label ("C Major") */
  shortName: string;
  /** Notes with octaves, ascending, including the octave tonic at the end */
  notes: string[];
  /** Degree labels aligned with `notes` */
  degrees: string[];
  intervals: string[];
  /** Pitch classes (no repeated tonic) */
  pcs: string[];
}

export function getScale(root: string, mode: string, octave = 4): ScaleInfo | null {
  const r = parseNote(root);
  if (!r) return null;
  const s = Scale.get(`${r.pc}${octave} ${mode}`);
  if (s.empty || !s.notes.length) return null;
  const top = Note.transpose(s.notes[0], '8P');
  return {
    name: `${r.pc} ${scaleLabel(mode)}`,
    shortName: `${r.pc} ${scaleShortLabel(mode)}`,
    notes: [...s.notes, top],
    degrees: [...s.intervals.map(degreeLabel), '8'],
    intervals: s.intervals,
    pcs: s.notes.map((n) => Note.pitchClass(n)),
  };
}

export interface DiatonicChord {
  degree: string;
  symbol: string;
  notes: string[];
}

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];

/** Chords built by stacking thirds on each degree of a 7-note scale. */
export function diatonicChords(root: string, mode: string, sevenths = false, octave = 3): DiatonicChord[] {
  const info = getScale(root, mode, octave);
  if (!info || info.pcs.length !== 7) return [];
  const notes = info.notes.slice(0, 7);
  const ext = [...notes, ...notes.map((n) => Note.transpose(n, '8P')), ...notes.map((n) => Note.transpose(n, '15P'))];
  return notes.map((_, i) => {
    const tones = [ext[i], ext[i + 2], ext[i + 4]];
    if (sevenths) tones.push(ext[i + 6]);
    const pcs = tones.map((t) => Note.pitchClass(t));
    const detected = Chord.detect(pcs).find((c) => !c.includes('/')) ?? pcs.join('');
    const chord = Chord.get(detected);
    const minorish = chord.quality === 'Minor' || chord.quality === 'Diminished';
    let numeral = ROMAN[i];
    if (minorish) numeral = numeral.toLowerCase();
    const acc = degreeLabel(info.intervals[i]).replace(/\d+/, '');
    let suffix = '';
    if (chord.quality === 'Diminished') suffix = sevenths && chord.type.includes('half') ? 'ø7' : '°' + (sevenths ? '7' : '');
    else if (chord.quality === 'Augmented') suffix = '+';
    else if (sevenths) suffix = chord.type.includes('major seventh') ? 'maj7' : '7';
    if (chord.type === 'half-diminished') suffix = 'ø7';
    return { degree: `${acc}${numeral}${suffix}`, symbol: prettySymbol(detected), notes: tones };
  });
}

function prettySymbol(sym: string): string {
  return sym.replace(/^([A-G][#b]?)M$/, '$1').replace(/^([A-G][#b]?)M7$/, '$1maj7').replace(/^([A-G][#b]?)Maj7$/, '$1maj7');
}

/**
 * Parse a pattern of whole (W) and half (H) steps, e.g. "WWHWWWH", into
 * semitone sizes. Case-insensitive; spaces, commas and dashes are ignored.
 * Returns null for an empty pattern or any other character.
 */
export function parseStepPattern(input: string): number[] | null {
  const letters = input.toUpperCase().replace(/[\s,\-–]+/g, '');
  if (!letters || !/^[WH]+$/.test(letters)) return null;
  return [...letters].map((c) => (c === 'W' ? 2 : 1));
}

/** Notes produced by walking a step pattern up from `start` (start note included). */
export function stepPatternNotes(steps: number[], start = 'C4'): string[] {
  const base = Note.midi(start) ?? 60;
  let midi = base;
  const notes = [Note.fromMidiSharps(midi)];
  for (const s of steps) notes.push(Note.fromMidiSharps((midi += s)));
  return notes;
}
