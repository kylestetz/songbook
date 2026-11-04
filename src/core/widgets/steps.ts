import { displayNote, parseStepPattern, stepPatternNotes } from '../theory';
import { h, soundFor } from './dom';
import { SOUND_FIELD, WIDGET_ICONS } from './common';
import { pill } from './inline';
import type { WidgetDefinition } from './types';

const START = 'C4';

export const stepsWidget: WidgetDefinition = {
  name: 'steps',
  title: 'Scale pattern',
  description: 'A pattern of whole (W) and half (H) steps, played as a scale up from C',
  kind: 'inline',
  icon: WIDGET_ICONS.steps,
  labelField: 'pattern',
  fields: [
    {
      key: 'pattern',
      label: 'Steps',
      type: 'text',
      required: true,
      placeholder: 'WWHWWWH',
      help: 'W = whole step, H = half step. Any length; plays up from C.',
    },
    SOUND_FIELD,
  ],
  defaults: { pattern: 'WWHWWWH' },
  summary: (v) => {
    const steps = parseStepPattern(v.pattern ?? '');
    if (!steps) return v.pattern || 'Scale pattern';
    const notes = stepPatternNotes(steps, START).map((n) => displayNote(n, { octave: false }));
    return `${steps.map((s) => (s === 2 ? 'W' : 'H')).join(' ')} → ${notes.join(' ')}`;
  },
  render(el, values, ctx) {
    const steps = parseStepPattern(values.pattern ?? '');
    if (!steps) {
      el.append(pill('steps', [values.pattern || '?'], 'Use only W (whole step) and H (half step)', () => {}, true));
      return;
    }

    const notes = stepPatternNotes(steps, START);
    const items = steps.map((s) => h('span', { class: 'mn-steps-item' }, s === 2 ? 'W' : 'H'));
    const list = h('span', { class: 'mn-steps-list' });
    items.forEach((it, i) => list.append(...(i ? [' ', it] : [it])));

    // Note i is reached by step i - 1; the starting C lights nothing
    const highlight = (noteIdx: number | null) =>
      items.forEach((it, j) => it.classList.toggle('is-current', noteIdx !== null && noteIdx - 1 === j));

    let handle: { stop(): void } | null = null;
    const play = () => {
      handle?.stop();
      const step = Math.min(0.5, ctx.audio.beat / 2);
      handle = ctx.audio.sequence(
        notes.map((n, i) => ({ time: i * step, notes: [n], duration: step * 1.5 })),
        {
          instrument: soundFor(values, ctx),
          onEvent: (i) => highlight(i),
          onEnd: () => highlight(null),
        },
      );
    };

    el.append(
      pill(
        'steps',
        [list],
        `Play ${notes.map((n) => displayNote(n, { octave: false })).join(' ')}`,
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
