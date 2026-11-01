/**
 * Lightweight widget metadata (no rendering code), safe to import from the
 * Electron main process for menus. Keep in sync with WIDGETS in ./index.ts —
 * a unit test checks this.
 */
export const WIDGETS: { name: string; title: string; kind: 'inline' | 'block' }[] = [
  { name: 'note', title: 'Note', kind: 'inline' },
  { name: 'notes', title: 'Notes', kind: 'inline' },
  { name: 'chord', title: 'Chord symbol', kind: 'inline' },
  { name: 'interval', title: 'Interval', kind: 'inline' },
  { name: 'scale', title: 'Scale or mode', kind: 'block' },
  { name: 'progression', title: 'Chord progression', kind: 'block' },
  { name: 'guitar', title: 'Guitar chord', kind: 'block' },
  { name: 'piano', title: 'Piano chord', kind: 'block' },
  { name: 'pianoroll', title: 'Piano roll', kind: 'block' },
  { name: 'circle', title: 'Circle of fifths', kind: 'block' },
];
