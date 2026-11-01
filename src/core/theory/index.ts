export * from './pitch';
export * from './chord';
export * from './scale';
export * from './harmony';
export * from './guitar';
export * from './roll';

import { isChord, voiceChord } from './chord';
import { ascendingOctaves, parseNote, tokenize } from './pitch';

/**
 * Resolve free-form input to concrete notes with octaves.
 * - "Cmaj7" (one token that is a chord symbol) -> voiced chord
 * - "C4" -> ["C4"]
 * - "C E G" / "C4 E4 G4" -> notes, octave-less notes ascending from `octave`
 */
export function resolveNotes(input: string, octave = 4): string[] {
  const tokens = tokenize(input);
  if (tokens.length === 1) {
    const t = tokens[0];
    const n = parseNote(t);
    if (n && n.oct !== undefined) return [n.name];
    if (isChord(t)) return voiceChord(t, octave);
    if (n) return [`${n.pc}${octave}`];
    return [];
  }
  return ascendingOctaves(tokens.filter((t) => parseNote(t)), octave);
}
export * from './detect';
