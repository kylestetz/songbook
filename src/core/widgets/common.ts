import { INSTRUMENTS } from '../audio/instruments';
import type { FieldSpec } from './types';

export const SOUND_FIELD: FieldSpec = {
  key: 'sound',
  label: 'Sound',
  type: 'select',
  advanced: true,
  options: [{ value: '', label: 'Document default' }, ...INSTRUMENTS.map((i) => ({ value: i.id, label: i.label }))],
};

export const CAPTION_FIELD: FieldSpec = {
  key: 'caption',
  label: 'Caption',
  type: 'text',
  placeholder: 'Optional caption',
};

export const OCTAVE_OPTIONS = [1, 2, 3, 4, 5, 6, 7].map((o) => ({ value: String(o), label: String(o) }));

export const ROOT_OPTIONS = ['C', 'C#', 'Db', 'D', 'D#', 'Eb', 'E', 'F', 'F#', 'Gb', 'G', 'G#', 'Ab', 'A', 'A#', 'Bb', 'B'].map((n) => ({
  value: n,
  label: n.replace('#', '♯').replace('b', '♭'),
}));

/** Small inline glyphs used in menus. */
export const WIDGET_ICONS = {
  note: '<svg viewBox="0 0 20 20"><path d="M12.5 3v9.3a2.7 2.7 0 1 1-1.5-2.4V5.2l-4 1.2" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M12.5 3l3 1.2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
  notes: '<svg viewBox="0 0 20 20"><circle cx="5" cy="14" r="2.2" fill="currentColor"/><circle cx="10" cy="10" r="2.2" fill="currentColor"/><circle cx="15" cy="6" r="2.2" fill="currentColor"/></svg>',
  chord: '<svg viewBox="0 0 20 20"><circle cx="10" cy="5" r="2.2" fill="currentColor"/><circle cx="10" cy="10" r="2.2" fill="currentColor"/><circle cx="10" cy="15" r="2.2" fill="currentColor"/></svg>',
  interval: '<svg viewBox="0 0 20 20"><circle cx="5" cy="14" r="2.2" fill="currentColor"/><circle cx="15" cy="6" r="2.2" fill="currentColor"/><path d="M7 12.5l6-5" stroke="currentColor" stroke-width="1.3" stroke-dasharray="1.6 1.6"/></svg>',
  scale: '<svg viewBox="0 0 20 20"><path d="M3 16h2.5v-2.5H8V11h2.5V8.5H13V6h2.5V3.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>',
  steps: '<svg viewBox="0 0 20 20"><path d="M2.5 15.5h4v-4h4v-4h2v-2h5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/></svg>',
  progression: '<svg viewBox="0 0 20 20"><rect x="2" y="5" width="4.5" height="10" rx="1.2" fill="none" stroke="currentColor" stroke-width="1.4"/><rect x="7.75" y="5" width="4.5" height="10" rx="1.2" fill="none" stroke="currentColor" stroke-width="1.4"/><rect x="13.5" y="5" width="4.5" height="10" rx="1.2" fill="currentColor"/></svg>',
  guitar: '<svg viewBox="0 0 20 20"><path d="M4 3h12M4 3v14M8 3v14M12 3v14M16 3v14M4 7.5h12M4 12h12" fill="none" stroke="currentColor" stroke-width="1.2"/><circle cx="8" cy="9.75" r="1.7" fill="currentColor"/><circle cx="12" cy="14.25" r="1.7" fill="currentColor"/></svg>',
  piano: '<svg viewBox="0 0 20 20"><rect x="2" y="4" width="16" height="12" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M6 4v12M10 4v12M14 4v12" stroke="currentColor" stroke-width="1.2"/><rect x="4.6" y="4" width="2.8" height="7" fill="currentColor"/><rect x="12.6" y="4" width="2.8" height="7" fill="currentColor"/></svg>',
  pianoroll: '<svg viewBox="0 0 20 20"><rect x="2" y="3" width="16" height="14" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.4"/><rect x="4" y="12" width="5" height="2.2" rx="1" fill="currentColor"/><rect x="9" y="8.5" width="3" height="2.2" rx="1" fill="currentColor"/><rect x="12.5" y="5.5" width="4" height="2.2" rx="1" fill="currentColor"/></svg>',
  circle: '<svg viewBox="0 0 20 20"><circle cx="10" cy="10" r="7.5" fill="none" stroke="currentColor" stroke-width="1.4"/><circle cx="10" cy="10" r="3.5" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M10 2.5v4M10 2.5a7.5 7.5 0 0 1 6.5 3.75L13 8.2" fill="currentColor" fill-opacity=".35" stroke="currentColor" stroke-width="1.2"/></svg>',
};
