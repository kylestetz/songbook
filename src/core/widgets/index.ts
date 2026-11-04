import type { Directive } from '../markdown/directive';
import { h } from './dom';
import { chordWidget, intervalWidget, notesWidget, noteWidget } from './inline';
import { scaleWidget } from './scale';
import { stepsWidget } from './steps';
import { progressionWidget } from './progression';
import { guitarWidget } from './guitar';
import { pianoWidget } from './piano';
import { pianorollWidget } from './pianoroll';
import { circleWidget } from './circle';
import type { WidgetContext, WidgetDefinition, WidgetInstance, WidgetValues } from './types';

export * from './types';
export { rollGrid, rollKeys, rollLineClass, rollRange, GRID_OPTIONS } from './pianoroll';

/**
 * The widget registry. Adding a widget = writing a WidgetDefinition and
 * listing it here; the editor, insert menu, forms and publisher pick it up.
 */
export const WIDGETS: WidgetDefinition[] = [
  noteWidget,
  notesWidget,
  chordWidget,
  intervalWidget,
  scaleWidget,
  stepsWidget,
  progressionWidget,
  guitarWidget,
  pianoWidget,
  pianorollWidget,
  circleWidget,
];

const byName = new Map(WIDGETS.map((w) => [w.name, w]));

export function getWidget(name: string): WidgetDefinition | undefined {
  return byName.get(name);
}

/** Directive (as parsed from markdown) -> form values, with defaults filled in. */
export function valuesFromDirective(d: Directive): WidgetValues {
  const def = getWidget(d.name);
  const values: WidgetValues = { ...(def?.defaults ?? {}), ...d.attrs };
  if (def?.labelField) values[def.labelField] = d.label ?? values[def.labelField] ?? '';
  else if (d.label) values.label = d.label;
  return values;
}

/** Form values -> directive. Fields equal to their default are omitted unless required. */
export function directiveFromValues(name: string, values: WidgetValues): Directive {
  const def = getWidget(name);
  if (!def) {
    const { label, ...attrs } = values;
    return { name, label, attrs };
  }
  const attrs: Record<string, string> = {};
  const known = new Set(def.fields.map((f) => f.key));
  for (const f of def.fields) {
    if (f.key === def.labelField) continue;
    const v = (values[f.key] ?? '').trim();
    if (!v) continue;
    if (!f.required && v === (def.defaults[f.key] ?? '')) continue;
    if (f.type === 'boolean' && v !== 'true') continue;
    attrs[f.key] = v;
  }
  // Preserve attributes this version doesn't know about
  for (const [k, v] of Object.entries(values)) {
    if (!known.has(k) && k !== 'label' && v) attrs[k] = v;
  }
  return { name, label: def.labelField ? (values[def.labelField] ?? '').trim() : values.label, attrs };
}

export function widgetSummary(name: string, values: WidgetValues): string {
  const def = getWidget(name);
  try {
    return def ? def.summary(values) : `${name}`;
  } catch {
    return name;
  }
}

/** Render any widget (or a placeholder for unknown ones) into `el`. */
export function renderWidget(el: HTMLElement, name: string, values: WidgetValues, ctx: WidgetContext): WidgetInstance | void {
  el.textContent = '';
  const def = getWidget(name);
  if (!def) {
    el.append(h('span', { class: 'mn-error' }, `Unknown widget “${name}”`));
    return;
  }
  try {
    return def.render(el, values, ctx);
  } catch (err) {
    console.error(err);
    el.textContent = '';
    el.append(h('span', { class: 'mn-error' }, `Couldn't render ${def.title.toLowerCase()}`));
  }
}
