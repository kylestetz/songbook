import type { AudioEngine } from '../audio';

export type WidgetValues = Record<string, string>;

export type FieldType =
  | 'text'
  | 'note'
  | 'chord'
  | 'notes'
  | 'select'
  | 'number'
  | 'boolean'
  | 'key'
  | 'frets'
  | 'roll';

export interface FieldOption {
  value: string;
  label: string;
  group?: string;
}

/**
 * How a field can be filled in by playing an instrument (piano keys or the
 * guitar fretboard) instead of typing note names.
 * - note: one note
 * - notes: a set of notes, written low to high
 * - sequence: notes in the order they were picked
 * - interval: two notes, in the order they were picked
 * - chord: a chord symbol, named from the notes picked
 * - chords: a list of chord symbols, built one chord at a time
 */
export type InstrumentMode = 'note' | 'notes' | 'sequence' | 'interval' | 'chord' | 'chords';

export interface InstrumentBinding {
  mode: InstrumentMode;
  /** Field that stores a guitar fingering, filled when picking on the fretboard */
  frets?: string;
  /** Field holding the octave used to voice chords / octave-less notes */
  octave?: string;
}

export interface FieldSpec {
  key: string;
  label: string;
  type: FieldType;
  options?: FieldOption[];
  placeholder?: string;
  help?: string;
  min?: number;
  max?: number;
  /** Always written to markdown, even when equal to the default */
  required?: boolean;
  /** Shown under "More options" in editors */
  advanced?: boolean;
  /** Field only shown when this returns true */
  visible?: (values: WidgetValues) => boolean;
  /** Field can be entered by playing piano keys or the fretboard */
  instrument?: InstrumentBinding;
}

export interface WidgetContext {
  audio: AudioEngine;
  /** Effective document settings, read at play time */
  settings(): { sound: string; tempo: number };
}

export interface WidgetInstance {
  destroy?(): void;
}

export interface WidgetDefinition {
  /** Directive name, e.g. "scale" -> `::scale{...}` */
  name: string;
  /** Display name, e.g. "Scale" */
  title: string;
  description: string;
  kind: 'inline' | 'block';
  /** SVG markup for menus */
  icon: string;
  /** Field stored as the directive's [label] */
  labelField?: string;
  fields: FieldSpec[];
  defaults: WidgetValues;
  /** Render into `el` (which is emptied first). */
  render(el: HTMLElement, values: WidgetValues, ctx: WidgetContext): WidgetInstance | void;
  /** Plain text summary used for fallbacks, excerpts and accessibility. */
  summary(values: WidgetValues): string;
}
