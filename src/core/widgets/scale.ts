import { Note } from '@tonaljs/tonal';
import { diatonicChords, displayNote, getScale, prettyAccidentals, SCALES } from '../theory';
import { card, clickable, errorBox, flash, h, playButton, soundFor } from './dom';
import { CAPTION_FIELD, OCTAVE_OPTIONS, ROOT_OPTIONS, SOUND_FIELD, WIDGET_ICONS } from './common';
import { keyboard, keyboardRange, type KeyMark } from './keyboard';
import type { WidgetDefinition } from './types';

export const scaleWidget: WidgetDefinition = {
  name: 'scale',
  title: 'Scale or mode',
  description: 'A scale on a keyboard, optionally with its diatonic chords',
  kind: 'block',
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
    { key: 'octave', label: 'Octave', type: 'select', options: OCTAVE_OPTIONS, required: true },
    {
      key: 'labels',
      label: 'Key labels',
      type: 'select',
      options: [
        { value: 'degrees', label: 'Scale degrees' },
        { value: 'notes', label: 'Note names' },
        { value: 'none', label: 'None' },
      ],
    },
    {
      key: 'chords',
      label: 'Diatonic chords',
      type: 'select',
      options: [
        { value: 'none', label: 'Hide' },
        { value: 'triads', label: 'Triads' },
        { value: 'sevenths', label: 'Seventh chords' },
      ],
      help: 'Available for seven-note scales.',
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
    CAPTION_FIELD,
    SOUND_FIELD,
  ],
  defaults: { root: 'C', mode: 'major', octave: '4', labels: 'degrees', chords: 'none', direction: 'up' },
  summary: (v) => `${v.root} ${v.mode} scale`,
  render(el, values, ctx) {
    const octave = parseInt(values.octave || '4', 10);
    const info = getScale(values.root || 'C', values.mode || 'major', octave);
    if (!info) {
      el.append(errorBox(`Unknown scale: ${values.root} ${values.mode}`));
      return;
    }
    const midis = info.notes.map((n) => Note.midi(n)!);
    const labels = values.labels || 'degrees';
    const marks = new Map<number, KeyMark>();
    info.notes.forEach((n, i) => {
      const m = midis[i];
      const label =
        labels === 'degrees' ? info.degrees[i].replace('8', '1') : labels === 'notes' ? displayNote(n, { octave: false }) : undefined;
      marks.set(m, { label, tone: i === 0 || i === info.notes.length - 1 ? 'root' : 'tone' });
    });

    const { el: frame, body, actions } = card({
      kind: 'scale',
      title: prettyAccidentals(info.name),
      caption: values.caption,
    });

    const instrument = () => soundFor(values, ctx);
    const kb = keyboard({
      ...keyboardRange(midis),
      marks,
      onKey: (m) => ctx.audio.play([Note.fromMidi(m)], { instrument: instrument(), duration: 0.9 }),
    });
    body.append(h('div', { class: 'mn-keyboard-wrap' }, kb.el));

    // Diatonic chords
    const chordsMode = values.chords || 'none';
    if (chordsMode !== 'none') {
      const chords = diatonicChords(values.root || 'C', values.mode || 'major', chordsMode === 'sevenths', octave);
      if (chords.length) {
        const row = h('div', { class: 'mn-chips mn-chips-chords' });
        for (const c of chords) {
          const chip = h(
            'span',
            { class: 'mn-chip mn-chip-chord' },
            h('span', { class: 'mn-chip-sub' }, prettyAccidentals(c.degree)),
            h('span', { class: 'mn-chip-main' }, prettyAccidentals(c.symbol)),
          );
          clickable(chip, () => {
            ctx.audio.play(c.notes, { instrument: instrument(), duration: 1.4, strum: 0.02 });
            kb.setActive(c.notes.map((n) => Note.midi(n)!));
            flash(chip, 700);
            setTimeout(() => kb.setActive([]), 700);
          });
          row.append(chip);
        }
        body.append(row);
      }
    }

    // Playback
    const dir = values.direction || 'up';
    const order = info.notes.map((_, i) => i);
    const seq = dir === 'down' ? [...order].reverse() : dir === 'updown' ? [...order, ...order.slice(0, -1).reverse()] : order;
    let handle: { stop(): void } | null = null;
    const btn = playButton(
      () => {
        const step = ctx.audio.beat / 2;
        handle = ctx.audio.sequence(
          seq.map((idx, i) => ({ time: i * step, notes: [info.notes[idx]], duration: step * 1.5 })),
          {
            instrument: instrument(),
            onEvent: (i) => kb.setActive([midis[seq[i]]]),
            onEnd: () => {
              kb.setActive([]);
              btn.set(false);
            },
          },
        );
      },
      () => handle?.stop(),
      'Play scale',
    );
    actions.append(btn.el);
    el.append(frame);
    return { destroy: () => handle?.stop() };
  },
};
