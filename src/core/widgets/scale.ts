import { displayNote, getScale, prettyAccidentals, SCALES, type ScaleInfo } from '../theory';
import { h, soundFor } from './dom';
import { OCTAVE_OPTIONS, ROOT_OPTIONS, SOUND_FIELD, WIDGET_ICONS } from './common';
import { pill } from './inline';
import type { WidgetDefinition, WidgetValues } from './types';

/** One label per scale tone (no repeated octave): intervals ("1 2 ♭3") or note names ("D E F"). */
function toneLabels(info: ScaleInfo, values: WidgetValues): string[] {
  return values.labels === 'notes'
    ? info.pcs.map((n) => displayNote(n, { octave: false }))
    : info.degrees.slice(0, info.pcs.length);
}

function scaleInfo(values: WidgetValues): ScaleInfo | null {
  return getScale(values.root || 'C', values.mode || 'major', parseInt(values.octave || '4', 10));
}

export const scaleWidget: WidgetDefinition = {
  name: 'scale',
  title: 'Scale or mode',
  description: 'A scale or mode, spelled out as intervals or note names, that plays when clicked',
  kind: 'inline',
  icon: WIDGET_ICONS.scale,
  fields: [
    { key: 'root', label: 'Root', type: 'select', options: ROOT_OPTIONS, required: true },
    {
      key: 'mode',
      label: 'Scale',
      type: 'select',
      required: true,
      options: SCALES.map((s) => ({ value: s.id, label: s.label, group: s.group })),
    },
    {
      key: 'labels',
      label: 'Show',
      type: 'select',
      options: [
        { value: 'degrees', label: 'Intervals (1 2 ♭3 …)' },
        { value: 'notes', label: 'Note names (D E F …)' },
      ],
    },
    {
      key: 'direction',
      label: 'Playback',
      type: 'select',
      options: [
        { value: 'up', label: 'Ascending' },
        { value: 'updown', label: 'Up and back down' },
        { value: 'down', label: 'Descending' },
      ],
      advanced: true,
    },
    { key: 'octave', label: 'Octave', type: 'select', options: OCTAVE_OPTIONS, advanced: true },
    SOUND_FIELD,
  ],
  defaults: { root: 'C', mode: 'major', octave: '4', labels: 'degrees', direction: 'up' },
  summary: (v) => {
    const info = scaleInfo(v);
    if (!info) return `${v.root} ${v.mode} scale`;
    return `${prettyAccidentals(info.shortName)} → ${toneLabels(info, v).join(' ')}`;
  },
  render(el, values, ctx) {
    const info = scaleInfo(values);
    if (!info) {
      el.append(pill('scale', [`${values.root || '?'} ${values.mode || '?'}`], 'Unknown scale', () => {}, true));
      return;
    }

    const labels = toneLabels(info, values);
    const items = labels.map((l) => h('span', { class: 'mn-scale-item' }, l));
    const list = h('span', { class: 'mn-scale-tones' });
    items.forEach((it, i) => list.append(...(i ? [' ', it] : [it])));

    // Playback runs through the octave tonic, which lights up the "1" again
    const dir = values.direction || 'up';
    const order = info.notes.map((_, i) => i);
    const seq = dir === 'down' ? [...order].reverse() : dir === 'updown' ? [...order, ...order.slice(0, -1).reverse()] : order;
    const highlight = (idx: number | null) =>
      items.forEach((it, j) => it.classList.toggle('is-current', idx !== null && idx % items.length === j));

    let handle: { stop(): void } | null = null;
    const play = () => {
      handle?.stop();
      const step = Math.min(0.5, ctx.audio.beat / 2);
      handle = ctx.audio.sequence(
        seq.map((idx, i) => ({ time: i * step, notes: [info.notes[idx]], duration: step * 1.5 })),
        {
          instrument: soundFor(values, ctx),
          onEvent: (i) => highlight(seq[i]),
          onEnd: () => highlight(null),
        },
      );
    };

    el.append(
      pill(
        'scale',
        [
          h('span', { class: 'mn-scale-name' }, prettyAccidentals(info.shortName)),
          h('span', { class: 'mn-scale-arrow' }, '→'),
          list,
        ],
        `Play ${prettyAccidentals(info.name)}`,
        play,
      ),
    );
    return {
      destroy: () => {
        handle?.stop();
        highlight(null);
      },
    };
  },
};
