import { parseNote } from './pitch';

/** A note in a piano roll: pitch, start step, length in steps. */
export interface RollNote {
  pitch: string;
  start: number;
  length: number;
}

/**
 * Compact text form: "C4@0+2 E4@4 G4@8+4"
 * pitch@start(+length) — length defaults to 1 step.
 */
export function parseRoll(input: string): RollNote[] {
  const out: RollNote[] = [];
  for (const tok of input.split(/[\s,]+/).filter(Boolean)) {
    const m = /^([^@]+)@(\d+)(?:\+(\d+))?$/.exec(tok);
    if (!m) continue;
    const n = parseNote(m[1]);
    if (!n || n.oct === undefined) continue;
    out.push({ pitch: n.name, start: parseInt(m[2], 10), length: m[3] ? Math.max(1, parseInt(m[3], 10)) : 1 });
  }
  return out.sort((a, b) => a.start - b.start || (parseNote(a.pitch)!.midi! - parseNote(b.pitch)!.midi!));
}

export function formatRoll(notes: RollNote[]): string {
  return [...notes]
    .sort((a, b) => a.start - b.start || (parseNote(a.pitch)!.midi! - parseNote(b.pitch)!.midi!))
    .map((n) => `${n.pitch}@${n.start}${n.length > 1 ? `+${n.length}` : ''}`)
    .join(' ');
}
