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

import { Note } from '@tonaljs/tonal';
import { detectChords, fitToStrings, friendlyNote, getTuning as tuningFor, spellNotes } from '../src/core/theory';

describe('playing notes to name chords', () => {
  const m = (...names: string[]) => names.map((n) => Note.midi(n)!);
  it('names root-position and inverted chords naturally', () => {
    expect(detectChords(m('C4', 'E4', 'G4'))[0]).toBe('C');
    expect(detectChords(m('E3', 'G3', 'C4'))[0]).toBe('C/E');
    expect(detectChords(m('A2', 'C3', 'E3', 'G3'))[0]).toBe('Am7');
    expect(detectChords(m('C3', 'D3', 'G3'))[0]).toBe('Csus2');
    expect(detectChords(m('E2', 'B2', 'E3', 'G#3', 'B3', 'E4'))[0]).toBe('E');
    expect(detectChords(m('E2', 'B2'))).toEqual(['E5']);
    expect(detectChords(m('C4'))).toEqual([]);
  });
  it('spells notes the way chord charts do', () => {
    expect(friendlyNote(63)).toBe('Eb4');
    expect(friendlyNote(66)).toBe('F#4');
    expect(spellNotes(m('E3', 'G#3', 'B3'))).toEqual(['E3', 'G#3', 'B3']);
    expect(spellNotes(m('F3', 'G#3', 'C4'))).toEqual(['F3', 'Ab3', 'C4']);
    expect(detectChords(m('E2', 'B2', 'E3', 'G#3', 'B3', 'E4'))).toEqual(['E']);
  });
  it('fits notes onto guitar strings', () => {
    const std = tuningFor('standard');
    expect(fitToStrings(m('E4'), std)).toEqual([null, null, null, null, null, 0]);
    expect(fitToStrings(m('A2', 'E3', 'A3', 'C4', 'E4'), std)).toEqual([null, 0, 2, 2, 1, 0]);
    expect(fitToStrings(m('C1'), std)).toBeNull();
  });
});

import { chordLabel, formatExplicitChord, guessChordNames, guitarVoicing as voicingFor, tokenize, voiceLead } from '../src/core/theory';

describe('chords written as notes', () => {
  const m = (...names: string[]) => names.map((n) => Note.midi(n)!);
  it('keeps any notes as a chord, with an optional label', () => {
    const c = parseChord('Fmadd9[F3 Ab3 G3]')!;
    expect(c.explicit).toEqual(['F3', 'Ab3', 'G3']);
    expect(c.root).toBe('F');
    expect(voiceChord('Fmadd9[F3 Ab3 G3]', 5)).toEqual(['F3', 'G3', 'Ab3']);
    expect(voiceChord('[F Ab G]', 3)).toEqual(['F3', 'Ab3', 'G4']);
    expect(parseChord('Fm(add9)[F3 Ab3 G3]')?.root).toBe('F');
    expect(parseChord('[X3 Y]')).toBeNull();
    expect(chordLabel('Fm(add9)[F3 Ab3 G3]')).toBe('Fm(add9)');
    expect(chordLabel('[F3 Ab3 G3]')).toBe('F Ab G');
    expect(formatExplicitChord('Fm add9', ['F3', 'Ab3'])).toBe('Fmadd9[F3 Ab3]');
  });
  it('keeps bracketed notes together in chord lists', () => {
    expect(tokenize('Dm7 Fmadd9[F3 Ab3 G3] | G7, [C E]')).toEqual(['Dm7', 'Fmadd9[F3 Ab3 G3]', 'G7', '[C E]']);
    const steps = parseProgression('Dm7 Fmadd9[F3 Ab3 G3]', 'Fm');
    expect(steps[1].symbol).toBe('Fmadd9[F3 Ab3 G3]');
    expect(steps[1].notes).toEqual(['F3', 'G3', 'Ab3']);
    expect(steps[1].roman).toBe('iadd9');
  });
  it('finds a guitar shape with exactly those notes', () => {
    const v = voicingFor('[F3 Ab3 G3]')!;
    const std = tuningFor('standard');
    const sounding = v.frets.map((f, i) => (f === null ? null : (Note.midi(std.notes[i])! + f) % 12)).filter((x) => x !== null);
    expect(new Set(sounding)).toEqual(new Set([5, 8, 7]));
  });
  it('guesses names for chords with the fifth left out', () => {
    expect(guessChordNames(m('F3', 'Ab3', 'G3'))[0]).toBe('Fmadd9');
    expect(guessChordNames(m('C3', 'E3', 'B3'))[0]).toBe('Cmaj7');
    expect(guessChordNames(m('C4', 'E4', 'G4'))).toEqual([]);
  });
});

describe('exact voicings', () => {
  const am7 = 'Am7[A2 E3 G3 C4 E4 @x02010]';
  it('keeps a fingering alongside the notes', () => {
    const c = parseChord(am7)!;
    expect(c.frets).toBe('x02010');
    expect(c.symbol).toBe(am7);
    expect(formatExplicitChord('Am7', ['A2', 'E3', 'G3', 'C4', 'E4'], 'x02010')).toBe(am7);
    expect(tokenize(`Dm7 | ${am7} G7`)).toEqual(['Dm7', am7, 'G7']);
    expect(voicingFor(am7)!.frets).toEqual([null, 0, 2, 0, 1, 0]);
  });
  it('tells apart the same notes on different strings', () => {
    // E4 on the open high string, or at the 5th fret of the B string
    expect(voicingFor('[A2 E4 @x0xxx0]')!.frets).toEqual([null, 0, null, null, null, 0]);
    expect(voicingFor('[A2 E4 @x0xx5x]')!.frets).toEqual([null, 0, null, null, 5, null]);
  });
  it('keeps doubled notes and string order', () => {
    // A voicing whose strings don't ascend in pitch: B string 9 (G#4) above open E4
    expect(voiceChord('E[E2 G#4 E4 @0xxx90]')).toEqual(['E2', 'G#4', 'E4']);
    // The same E4 on two strings
    expect(voiceChord('[E4 E4 @xxxx50]')).toEqual(['E4', 'E4']);
  });
  it('ignores a fingering that does not play the notes', () => {
    expect(voicingFor('[A2 E3 @x03xxx]')!.frets).toEqual([null, 0, 2, null, null, null]);
  });
  it('places notes without a fingering at their written octave', () => {
    const frets = voicingFor('[E4 G4 C5]')!.frets;
    const std = tuningFor('standard');
    const played = frets.flatMap((f, i) => (f === null ? [] : [Note.midi(std.notes[i])! + f]));
    expect(played).toEqual([Note.midi('E4'), Note.midi('G4'), Note.midi('C5')]);
  });
  it('is not revoiced for playback', () => {
    const steps = parseProgression(`Dm7 ${am7} [C5 E5 G5] G7`);
    expect(steps.map((s) => s.exact)).toEqual([false, true, true, false]);
    const voiced = voiceLead(steps.map((s) => s.notes), steps.map((s) => s.exact));
    expect(voiced[1]).toEqual(['A2', 'E3', 'G3', 'C4', 'E4']);
    expect(voiced[2]).toEqual(['C5', 'E5', 'G5']);
  });
  it('does not change the name with the notes', () => {
    expect(parseProgression('Whatever[A2 E3 G3 C4 E4 @x02010]')[0].notes).toEqual(['A2', 'E3', 'G3', 'C4', 'E4']);
    expect(chordLabel('Whatever[A2 E3 @x02xxx]')).toBe('Whatever');
  });
});
