import { Note } from '@tonaljs/tonal';
import {
  describeVoicing,
  displayNote,
  fretsToNotes,
  getTuning,
  guitarVoicing,
  parseFrets,
  prettyAccidentals,
  TUNINGS,
  type Voicing,
} from '../theory';
import { card, errorBox, h, playButton, s, soundFor } from './dom';
import { chordSymbolEl } from './symbol';
import { CAPTION_FIELD, SOUND_FIELD, WIDGET_ICONS } from './common';

const GUITAR_SOUND_FIELD = {
  ...SOUND_FIELD,
  options: [
    { value: '', label: 'Nylon guitar' },
    ...SOUND_FIELD.options!.filter((o) => o.value && o.value !== 'guitar'),
    { value: 'document', label: 'Document default' },
  ],
};
import type { WidgetDefinition } from './types';

export const guitarWidget: WidgetDefinition = {
  name: 'guitar',
  title: 'Guitar chord',
  description: 'A chord diagram on the fretboard that strums when clicked',
  kind: 'block',
  icon: WIDGET_ICONS.guitar,
  labelField: 'chord',
  fields: [
    { key: 'chord', label: 'Chord', type: 'chord', required: true, placeholder: 'Am7', instrument: { mode: 'chord', frets: 'frets' } },
    {
      key: 'frets',
      label: 'Fingering',
      type: 'frets',
      placeholder: 'Automatic',
      help: 'Frets from low to high string, e.g. x02210. Use dashes above fret 9: x-10-12-12-10-x.',
    },
    { key: 'tuning', label: 'Tuning', type: 'select', options: TUNINGS.map((t) => ({ value: t.id, label: t.label })) },
    {
      key: 'labels',
      label: 'String labels',
      type: 'select',
      options: [
        { value: 'notes', label: 'Note names' },
        { value: 'none', label: 'None' },
      ],
    },
    CAPTION_FIELD,
    GUITAR_SOUND_FIELD,
  ],
  defaults: { chord: 'Am', frets: '', tuning: 'standard', labels: 'notes', sound: '' },
  summary: (v) => `${prettyAccidentals(v.chord ?? '')} guitar chord${v.frets ? ` (${v.frets})` : ''}`,
  render(el, values, ctx) {
    const tuning = getTuning(values.tuning);
    let voicing: Voicing | null = null;
    if (values.frets) {
      const f = parseFrets(values.frets, tuning.notes.length);
      if (f) voicing = describeVoicing(f);
    }
    if (!voicing && values.chord) voicing = guitarVoicing(values.chord, tuning);
    const title = chordSymbolEl(values.chord || '');
    const { el: frame, body, actions } = card({
      kind: 'guitar',
      title,
      subtitle: tuning.id !== 'standard' ? tuning.label : undefined,
      caption: values.caption,
    });
    if (!voicing) {
      body.append(errorBox(values.frets ? `Can't read fingering "${values.frets}"` : `Couldn't find a voicing for "${values.chord}"`));
      el.append(frame);
      return;
    }
    const notes = fretsToNotes(voicing.frets, tuning);
    const sounding = notes.filter((n): n is string => !!n);
    const instrument = () => (values.sound === 'document' ? soundFor({}, ctx) : values.sound || 'guitar');

    const strum = () => ctx.audio.play(sounding, { instrument: instrument(), duration: 2.2, strum: 0.035 });
    const diagram = fretboard(voicing, notes, values.labels !== 'none', (i) => {
      const n = notes[i];
      if (n) ctx.audio.play([n], { instrument: instrument(), duration: 1.5 });
    });
    diagram.addEventListener('click', (e) => {
      if ((e.target as Element).closest('[data-string]')) return;
      strum();
    });
    body.append(h('div', { class: 'mn-guitar-wrap' }, diagram));

    const btn = playButton(
      () => {
        strum();
        setTimeout(() => btn.set(false), 600);
      },
      () => ctx.audio.stopAll(),
      'Strum',
    );
    actions.append(btn.el);
    el.append(frame);
  },
};

function fretboard(v: Voicing, notes: (string | null)[], showLabels: boolean, onString: (i: number) => void): SVGSVGElement {
  const strings = v.frets.length;
  const fretted = v.frets.filter((f): f is number => f !== null && f > 0);
  const maxF = fretted.length ? Math.max(...fretted) : 0;
  const rows = Math.max(4, maxF - v.baseFret + 1);
  const SX = 22;
  const FY = 28;
  const left = 30;
  const top = 26;
  const width = left + SX * (strings - 1) + 30;
  const gridH = FY * rows;
  const height = top + gridH + (showLabels ? 26 : 10);
  const svg = s('svg', { class: 'mn-fretboard', viewBox: `0 0 ${width} ${height}`, width, role: 'img', 'aria-label': 'Guitar chord diagram' });

  // frets
  for (let r = 0; r <= rows; r++) {
    const y = top + r * FY;
    svg.append(s('line', { class: r === 0 && v.baseFret === 1 ? 'mn-nut' : 'mn-fret', x1: left, x2: left + SX * (strings - 1), y1: y, y2: y }));
  }
  if (v.baseFret > 1) {
    svg.append(s('text', { class: 'mn-fret-pos', x: left - 10, y: top + FY / 2, 'text-anchor': 'end', 'dominant-baseline': 'central' }, `${v.baseFret}fr`));
  }
  // strings
  for (let i = 0; i < strings; i++) {
    const x = left + i * SX;
    svg.append(s('line', { class: 'mn-string', x1: x, x2: x, y1: top, y2: top + gridH, 'stroke-width': 1.6 - i * 0.18 }));
  }
  // barre
  if (v.barre) {
    const y = top + (v.barre.fret - v.baseFret + 0.5) * FY;
    svg.append(
      s('rect', {
        class: 'mn-barre',
        x: left + v.barre.from * SX - 8,
        y: y - 8,
        width: (v.barre.to - v.barre.from) * SX + 16,
        height: 16,
        rx: 8,
      }),
    );
  }
  // markers + dots
  v.frets.forEach((f, i) => {
    const x = left + i * SX;
    const g = s('g', { class: 'mn-string-hit', 'data-string': i, 'data-interactive': '' });
    g.append(s('rect', { x: x - SX / 2, y: 0, width: SX, height, fill: 'transparent' }));
    if (f === null) {
      g.append(s('text', { class: 'mn-mute', x, y: top - 11, 'text-anchor': 'middle', 'dominant-baseline': 'central' }, '×'));
    } else if (f === 0) {
      g.append(s('circle', { class: 'mn-open', cx: x, cy: top - 11, r: 5 }));
    } else {
      const y = top + (f - v.baseFret + 0.5) * FY;
      const inBarre = v.barre && f === v.barre.fret && i >= v.barre.from && i <= v.barre.to;
      if (!inBarre || i === v.barre!.from || i === v.barre!.to) g.append(s('circle', { class: 'mn-dot', cx: x, cy: y, r: 8 }));
    }
    if (showLabels && notes[i]) {
      g.append(
        s('text', { class: 'mn-string-label', x, y: top + gridH + 15, 'text-anchor': 'middle' }, displayNote(Note.pitchClass(notes[i]!), { octave: false })),
      );
    }
    g.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      onString(i);
      g.classList.add('is-active');
      setTimeout(() => g.classList.remove('is-active'), 300);
    });
    svg.append(g);
  });
  return svg;
}
