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
