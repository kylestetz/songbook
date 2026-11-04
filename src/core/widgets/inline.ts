/**
 * Inline widgets: small "pills" that sit inside a sentence and play on click.
 */
import {
  chordLabel,
  displayNote,
  intervalBetween,
  parseChord,
  parseNote,
  prettyAccidentals,
  tokenize,
  voiceChord,
  ascendingOctaves,
} from '../theory';
import { clickable, h, soundFor } from './dom';
import { chordSymbolEl } from './symbol';
import { OCTAVE_OPTIONS, SOUND_FIELD, WIDGET_ICONS } from './common';
import type { WidgetContext, WidgetDefinition, WidgetValues } from './types';

export function pill(kind: string, content: (Node | string)[], title: string, onPlay: () => void, invalid = false): HTMLElement {
  const el = h('span', { class: `mn-pill mn-${kind}${invalid ? ' is-invalid' : ''}`, title }, ...content);
  if (!invalid) {
    clickable(el, () => {
      onPlay();
      el.classList.remove('is-active');
      void el.offsetWidth;
      el.classList.add('is-active');
      setTimeout(() => el.classList.remove('is-active'), 500);
    });
  }
  return el;
}

function playNotes(ctx: WidgetContext, values: WidgetValues, notes: string[], opts: { together: boolean; strum?: number }) {
  const instrument = soundFor(values, ctx);
  if (opts.together) {
    ctx.audio.play(notes, { instrument, duration: 1.6, strum: opts.strum ?? 0.012 });
  } else {
    const step = Math.min(0.5, ctx.audio.beat / 2);
    ctx.audio.sequence(
      notes.map((n, i) => ({ time: i * step, notes: [n], duration: step * 1.6 })),
      { instrument },
    );
  }
}

export const noteWidget: WidgetDefinition = {
  name: 'note',
  title: 'Note',
  description: 'A single note you can click to hear',
  kind: 'inline',
  icon: WIDGET_ICONS.note,
  labelField: 'pitch',
  fields: [
    { key: 'pitch', label: 'Note', type: 'note', required: true, placeholder: 'C4', instrument: { mode: 'note' } },
    SOUND_FIELD,
  ],
  defaults: { pitch: 'C4' },
  summary: (v) => displayNote(v.pitch ?? ''),
  render(el, values, ctx) {
    const n = parseNote(values.pitch ?? '');
    const name = n ? (n.oct === undefined ? `${n.pc}4` : n.name) : '';
    el.append(
      pill(
        'note',
        [n ? displayNote(n.name) : values.pitch || '?'],
        n ? `Play ${displayNote(name)}` : 'Not a valid note',
        () => ctx.audio.play([name], { instrument: soundFor(values, ctx), duration: 1.2 }),
        !n,
      ),
    );
  },
};

export const chordWidget: WidgetDefinition = {
  name: 'chord',
  title: 'Chord symbol',
  description: 'An inline chord name, like Cmaj7, that plays when clicked',
  kind: 'inline',
  icon: WIDGET_ICONS.chord,
  labelField: 'symbol',
  fields: [
    { key: 'symbol', label: 'Chord', type: 'chord', required: true, placeholder: 'Cmaj7', instrument: { mode: 'chord', octave: 'octave', voicing: true } },
    { key: 'octave', label: 'Octave', type: 'select', options: OCTAVE_OPTIONS, advanced: true },
    SOUND_FIELD,
  ],
  defaults: { symbol: 'C', octave: '3' },
  summary: (v) => prettyAccidentals(chordLabel(v.symbol ?? '')),
  render(el, values, ctx) {
    const c = parseChord(values.symbol ?? '');
    const octave = parseInt(values.octave || '3', 10);
    const content: (Node | string)[] = [chordSymbolEl(values.symbol ?? '', 'mn-chord-inline')];
    const notes = c ? voiceChord(values.symbol, octave) : [];
    el.append(
      pill(
        'chord',
        content,
        c ? `Play ${prettyAccidentals(chordLabel(values.symbol))}` : 'Unknown chord',
        () => playNotes(ctx, values, notes, { together: true, strum: 0.025 }),
        !c,
      ),
    );
  },
};

export const notesWidget: WidgetDefinition = {
  name: 'notes',
  title: 'Notes',
  description: 'A compact group of notes, played in turn or together as a chord',
  kind: 'inline',
  icon: WIDGET_ICONS.notes,
  labelField: 'notes',
  fields: [
    { key: 'notes', label: 'Notes', type: 'notes', required: true, placeholder: 'C4 E4 G4', help: 'Separate notes with spaces. Octaves are optional.', instrument: { mode: 'sequence', octave: 'octave' } },
    { key: 'chord', label: 'Play together as a chord', type: 'boolean' },
    { key: 'octave', label: 'Starting octave', type: 'select', options: OCTAVE_OPTIONS, advanced: true },
    SOUND_FIELD,
  ],
  defaults: { notes: 'C E G', chord: '', octave: '4' },
  summary: (v) => tokenize(v.notes ?? '').map((n) => displayNote(n)).join(' '),
  render(el, values, ctx) {
    const tokens = tokenize(values.notes ?? '').filter((t) => parseNote(t));
    const octave = parseInt(values.octave || '4', 10);
    const notes = ascendingOctaves(tokens, octave);
    const together = values.chord === 'true';
    const parts: (Node | string)[] = [];
    tokens.forEach((t, i) => {
      if (i) parts.push(h('span', { class: 'mn-notes-sep' }, together ? '·' : ' '));
      parts.push(h('span', { class: 'mn-notes-item', 'data-i': i }, displayNote(t)));
    });
    const p = pill(
      together ? 'notes is-chord' : 'notes',
      parts,
      together ? 'Play as a chord' : 'Play notes',
      () => {
        if (together) playNotes(ctx, values, notes, { together: true });
        else {
          const step = Math.min(0.5, ctx.audio.beat / 2);
          const items = p.querySelectorAll('.mn-notes-item');
          ctx.audio.sequence(
            notes.map((n, i) => ({ time: i * step, notes: [n], duration: step * 1.6 })),
            {
              instrument: soundFor(values, ctx),
              onEvent: (i) => {
                items.forEach((it, j) => it.classList.toggle('is-current', i === j));
              },
              onEnd: () => items.forEach((it) => it.classList.remove('is-current')),
            },
          );
          setTimeout(() => items.forEach((it) => it.classList.remove('is-current')), (notes.length * step + 0.4) * 1000);
        }
      },
      !tokens.length,
    );
    el.append(p);
  },
};

/** Interval names read as part of the sentence: "a perfect fourth", "an octave" */
const intervalName = (long: string) => long.toLowerCase();

export const intervalWidget: WidgetDefinition = {
  name: 'interval',
  title: 'Interval',
  description: 'Two notes and the distance between them',
  kind: 'inline',
  icon: WIDGET_ICONS.interval,
  labelField: 'notes',
  fields: [
    { key: 'notes', label: 'From and to', type: 'notes', required: true, placeholder: 'C4 G4', help: 'Two notes, e.g. "C4 G4" or "E Bb".', instrument: { mode: 'interval' } },
    {
      key: 'show',
      label: 'Show',
      type: 'select',
      options: [
        { value: 'notes', label: 'The two notes (C → G)' },
        { value: 'name', label: 'The interval name (perfect fifth)' },
      ],
    },
    {
      key: 'play',
      label: 'Playback',
      type: 'select',
      options: [
        { value: 'both', label: 'Melodic, then harmonic' },
        { value: 'melodic', label: 'Melodic (one after another)' },
        { value: 'harmonic', label: 'Harmonic (together)' },
      ],
    },
    SOUND_FIELD,
  ],
  defaults: { notes: 'C4 G4', show: 'notes', play: 'both' },
  summary: (v) => {
    const [a, b] = tokenize(v.notes ?? '');
    const info = a && b ? intervalBetween(a, b) : null;
    if (!info) return v.notes ?? '';
    return v.show === 'name' ? intervalName(info.long) : `${displayNote(a)}–${displayNote(b)}`;
  },
  render(el, values, ctx) {
    const [a, b] = tokenize(values.notes ?? '');
    const info = a && b ? intervalBetween(a, b) : null;
    const notes = info ? ascendingOctaves([a, b], 4) : [];
    const mode = values.play || 'both';
    el.append(
      pill(
        'interval',
        !info
          ? [values.notes || '?']
          : values.show === 'name'
            ? [intervalName(info.long)]
            : [h('span', {}, displayNote(a)), h('span', { class: 'mn-interval-arrow' }, '→'), h('span', {}, displayNote(b))],
        info
          ? values.show === 'name'
            ? `${displayNote(a)} → ${displayNote(b)} · ${info.semitones} semitone${info.semitones === 1 ? '' : 's'}`
            : `${info.long} · ${info.semitones} semitone${info.semitones === 1 ? '' : 's'}`
          : 'Enter two notes',
        () => {
          const instrument = soundFor(values, ctx);
          const step = 0.55;
          const events =
            mode === 'harmonic'
              ? [{ time: 0, notes, duration: 0.9 }]
              : mode === 'melodic'
                ? [
                    { time: 0, notes: [notes[0]], duration: 0.6 },
                    { time: step, notes: [notes[1]], duration: 0.7 },
                  ]
                : [
                    { time: 0, notes: [notes[0]], duration: 0.7 },
                    { time: step, notes: [notes[1]], duration: 0.7 },
                    { time: step * 2.4, notes, duration: 0.9 },
                  ];
          ctx.audio.sequence(events, { instrument });
        },
        !info,
      ),
    );
  },
};
