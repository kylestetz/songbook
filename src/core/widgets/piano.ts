import { Interval, Note } from '@tonaljs/tonal';
import { degreeLabel, detectChords, displayNote, isChord, parseChord, prettyAccidentals, resolveNotes, tokenize } from '../theory';
import { chordSymbolEl } from './symbol';
import { card, errorBox, h, playButton, soundFor } from './dom';
import { CAPTION_FIELD, OCTAVE_OPTIONS, SOUND_FIELD, WIDGET_ICONS } from './common';
import { keyboard, keyboardRange, type KeyMark } from './keyboard';
import type { WidgetDefinition } from './types';

export const pianoWidget: WidgetDefinition = {
  name: 'piano',
  title: 'Piano chord',
  description: 'Notes or a chord highlighted on a playable keyboard',
  kind: 'block',
  icon: WIDGET_ICONS.piano,
  labelField: 'notes',
  fields: [
    { key: 'notes', label: 'Chord or notes', type: 'notes', required: true, placeholder: 'Cmaj7  or  C4 E4 G4 B4', help: 'A chord symbol, or notes separated by spaces.', instrument: { mode: 'notes', octave: 'octave' } },
    { key: 'octave', label: 'Octave', type: 'select', options: OCTAVE_OPTIONS },
    {
      key: 'labels',
      label: 'Key labels',
      type: 'select',
      options: [
        { value: 'notes', label: 'Note names' },
        { value: 'intervals', label: 'Chord degrees' },
        { value: 'none', label: 'None' },
      ],
    },
    {
      key: 'style',
      label: 'Playback',
      type: 'select',
      options: [
        { value: 'chord', label: 'Chord' },
        { value: 'arpeggio', label: 'Arpeggio' },
      ],
    },
    CAPTION_FIELD,
    SOUND_FIELD,
  ],
  defaults: { notes: 'Cmaj7', octave: '4', labels: 'notes', style: 'chord' },
  summary: (v) => `${prettyAccidentals(v.notes ?? '')} on piano`,
  render(el, values, ctx) {
    const input = values.notes ?? '';
    const octave = parseInt(values.octave || '4', 10);
    const notes = resolveNotes(input, octave);
    const tokens = tokenize(input);
    const chordSymbol = tokens.length === 1 && isChord(tokens[0]) && !/\d$/.test(tokens[0]) ? tokens[0] : null;
    const chord = chordSymbol ? parseChord(chordSymbol) : null;
    let title: Node | string = notes.map((n) => displayNote(n, { octave: false })).join(' ');
    if (chordSymbol) {
      title = chordSymbolEl(chordSymbol);
    }
    // Notes picked by hand: name the chord they make, if they make one.
    const named = !chord && notes.length > 1 ? parseChord(detectChords(notes.map((n) => Note.midi(n)!))[0] ?? '') : null;
    const { el: frame, body, actions } = card({
      kind: 'piano',
      title,
      subtitle: chord
        ? `${chord.name} · ${notes.map((n) => displayNote(n, { octave: false })).join(' ')}`
        : named
          ? `${prettyAccidentals(named.symbol)} · ${named.name}`
          : undefined,
      caption: values.caption,
    });
    if (!notes.length) {
      body.append(errorBox(`Couldn't read "${input}" as a chord or notes`));
      el.append(frame);
      return;
    }
    const midis = notes.map((n) => Note.midi(n)!);
    const labels = values.labels || 'notes';
    const marks = new Map<number, KeyMark>();
    const rootMidi = chord ? Math.min(...midis.filter((m) => Note.chroma(chord.root) === m % 12)) : midis[0];
    notes.forEach((n, i) => {
      let label: string | undefined;
      if (labels === 'notes') label = displayNote(n, { octave: false });
      else if (labels === 'intervals') {
        const root = chord ? `${chord.root}${Note.octave(notes.find((x) => Note.chroma(x) === Note.chroma(chord.root)) ?? notes[0])}` : notes[0];
        const ivl = Interval.distance(root, n);
        label = degreeLabel(ivl.startsWith('-') ? Interval.invert(ivl.slice(1)) : ivl).replace(/^(\d+)$/, (d) => (d === '8' ? '1' : d));
      }
      marks.set(midis[i], { label, tone: midis[i] === rootMidi ? 'root' : 'tone' });
    });
    const instrument = () => soundFor(values, ctx);
    const kb = keyboard({
      ...keyboardRange(midis),
      marks,
      onKey: (m) => ctx.audio.play([Note.fromMidi(m)], { instrument: instrument(), duration: 1 }),
    });
    body.append(h('div', { class: 'mn-keyboard-wrap' }, kb.el));

    let handle: { stop(): void } | null = null;
    const btn = playButton(
      () => {
        if (values.style === 'arpeggio') {
          const step = ctx.audio.beat / 2;
          handle = ctx.audio.sequence(
            notes.map((n, i) => ({ time: i * step, notes: [n], duration: step * (notes.length - i + 1) })),
            {
              instrument: instrument(),
              onEvent: (i) => kb.setActive(midis.slice(0, i + 1)),
              onEnd: () => {
                kb.setActive([]);
                btn.set(false);
              },
            },
          );
        } else {
          ctx.audio.play(notes, { instrument: instrument(), duration: 1.8, strum: 0.01 });
          kb.setActive(midis);
          setTimeout(() => {
            kb.setActive([]);
            btn.set(false);
          }, 900);
        }
      },
      () => handle?.stop(),
      'Play chord',
    );
    actions.append(btn.el);
    el.append(frame);
    return { destroy: () => handle?.stop() };
  },
};
