import { describe, expect, it } from 'vitest';
import {
  chordToRoman,
  diatonicChords,
  displayNote,
  formatFrets,
  getScale,
  guitarVoicing,
  intervalBetween,
  parseChord,
  parseKey,
  parseProgression,
  parseRoll,
  formatRoll,
  prettyAccidentals,
  resolveNotes,
  romanToChord,
  voiceChord,
} from '../src/core/theory';

describe('pitch', () => {
  it('displays accidentals', () => {
    expect(displayNote('C#4')).toBe('C♯4');
    expect(displayNote('bb3')).toBe('B♭3');
    expect(prettyAccidentals('Bb7b9')).toBe('B♭7♭9');
    expect(prettyAccidentals('Ebm7/Db')).toBe('E♭m7/D♭');
    expect(prettyAccidentals('Cadd9')).toBe('Cadd9');
  });
  it('computes intervals', () => {
    expect(intervalBetween('C4', 'G4')?.short).toBe('P5');
    expect(intervalBetween('C', 'Eb')?.long).toBe('Minor third');
    expect(intervalBetween('C4', 'C5')?.long).toBe('Octave');
  });
  it('resolves notes', () => {
    expect(resolveNotes('Cmaj7')).toEqual(['C4', 'E4', 'G4', 'B4']);
    expect(resolveNotes('C E G C')).toEqual(['C4', 'E4', 'G4', 'C5']);
    expect(resolveNotes('G3 B D')).toEqual(['G3', 'B3', 'D4']);
    expect(resolveNotes('F#2')).toEqual(['F#2']);
  });
});

describe('chords', () => {
  it('parses symbols', () => {
    expect(parseChord('Cmaj7')?.notes).toEqual(['C', 'E', 'G', 'B']);
    expect(parseChord('C/E')?.bass).toBe('E');
    expect(parseChord('Bø7')?.notes).toEqual(['B', 'D', 'F', 'A']);
    expect(parseChord('xyz')).toBeNull();
    expect(voiceChord('Am/G', 3)).toEqual(['G2', 'A3', 'C4', 'E4']);
  });
  it('converts roman numerals', () => {
    const C = parseKey('C')!;
    expect(romanToChord('ii7', C)).toBe('Dm7');
    expect(romanToChord('V7', C)).toBe('G7');
    expect(romanToChord('bVII', C)).toBe('Bb');
    expect(romanToChord('vii°', C)).toBe('Bdim');
    expect(romanToChord('III', parseKey('Am')!)).toBe('C');
    expect(chordToRoman('Dm7', C)).toBe('ii7');
    expect(chordToRoman('Bb', C)).toBe('♭VII');
    expect(chordToRoman('Bm7b5', C)).toBe('viiø7');
    expect(chordToRoman('Cmaj7', C)).toBe('Imaj7');
  });
  it('parses progressions', () => {
    const p = parseProgression('ii7 V7 | Imaj7', 'C');
    expect(p.map((s) => s.symbol)).toEqual(['Dm7', 'G7', 'Cmaj7']);
    const q = parseProgression('Am F C G', 'C');
    expect(q.map((s) => s.roman)).toEqual(['vi', 'IV', 'I', 'V']);
  });
});

describe('scales', () => {
  it('builds scales and diatonic chords', () => {
    const s = getScale('D', 'dorian', 4)!;
    expect(s.notes).toEqual(['D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5', 'D5']);
    expect(s.degrees).toEqual(['1', '2', '♭3', '4', '5', '6', '♭7', '8']);
    const chords = diatonicChords('C', 'major');
    expect(chords.map((c) => c.symbol)).toEqual(['C', 'Dm', 'Em', 'F', 'G', 'Am', 'Bdim']);
    expect(chords.map((c) => c.degree)).toEqual(['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°']);
    const sev = diatonicChords('C', 'major', true);
    expect(sev.map((c) => c.degree)).toEqual(['Imaj7', 'ii7', 'iii7', 'IVmaj7', 'V7', 'vi7', 'viiø7']);
  });
});

describe('guitar', () => {
  it('uses open shapes and searches others', () => {
    expect(formatFrets(guitarVoicing('Am')!.frets)).toBe('x02210');
    const bb = guitarVoicing('Bb')!;
    expect(bb.frets.filter((f) => f !== null).length).toBeGreaterThanOrEqual(4);
    const fsharp = guitarVoicing('F#m7')!;
    expect(fsharp).not.toBeNull();
    expect(guitarVoicing('C7#9')).not.toBeNull();
  });
  it('uses conventional barre shapes for common chord types', () => {
    const f = (c: string) => formatFrets(guitarVoicing(c)!.frets);
    expect(f('Bb')).toBe('x13331');
    expect(f('F#m7')).toBe('242222');
    expect(f('C7#9')).toBe('x3234x');
    expect(f('Abm')).toBe('466444');
    expect(f('Bm7b5')).toBe('x2323x');
    expect(guitarVoicing('Bb')!.barre).toEqual({ fret: 1, from: 1, to: 5 });
    // slash chords and unusual qualities fall back to the search
    expect(guitarVoicing('D/F#')!.frets[0]).toBe(2);
  });
});

describe('roll', () => {
  it('round-trips', () => {
    const r = parseRoll('E4@4 C4@0+2 G4@8+4');
    expect(r[0]).toEqual({ pitch: 'C4', start: 0, length: 2 });
    expect(formatRoll(r)).toBe('C4@0+2 E4@4 G4@8+4');
  });
});
