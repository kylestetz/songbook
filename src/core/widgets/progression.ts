import { displayNote, parseKey, parseProgression, prettyAccidentals, voiceLead } from '../theory';
import { chordSymbolEl } from './symbol';
import { card, clickable, h, ICONS, playButton, soundFor } from './dom';
import { CAPTION_FIELD, OCTAVE_OPTIONS, SOUND_FIELD, WIDGET_ICONS } from './common';
import type { WidgetDefinition } from './types';

export const progressionWidget: WidgetDefinition = {
  name: 'progression',
  title: 'Chord progression',
  description: 'A sequence of chords, as symbols or roman numerals',
  kind: 'block',
  icon: WIDGET_ICONS.progression,
  labelField: 'chords',
  fields: [
    {
      key: 'chords',
      label: 'Chords',
      type: 'text',
      required: true,
      placeholder: 'Dm7 G7 Cmaj7  or  ii7 V7 Imaj7',
      help: 'Chord symbols or roman numerals (with a key), separated by spaces. "|" bar lines are ignored.',
      instrument: { mode: 'chords', octave: 'octave' },
    },
    { key: 'key', label: 'Key', type: 'key', help: 'Shows roman numerals and lets you write numerals like ii7 V7 I.' },
    {
      key: 'beats',
      label: 'Beats per chord',
      type: 'select',
      options: ['1', '2', '3', '4', '6', '8'].map((b) => ({ value: b, label: b })),
    },
    {
      key: 'style',
      label: 'Playback style',
      type: 'select',
      options: [
        { value: 'block', label: 'Block chords' },
        { value: 'strum', label: 'Strummed' },
        { value: 'arpeggio', label: 'Arpeggiated' },
        { value: 'pulse', label: 'Pulse on each beat' },
      ],
    },
    { key: 'loop', label: 'Loop playback', type: 'boolean' },
    { key: 'octave', label: 'Octave', type: 'select', options: OCTAVE_OPTIONS, advanced: true },
    CAPTION_FIELD,
    SOUND_FIELD,
  ],
  defaults: { chords: 'Dm7 G7 Cmaj7', key: '', beats: '4', style: 'block', loop: '', octave: '3' },
  summary: (v) => prettyAccidentals(v.chords ?? ''),
  render(el, values, ctx) {
    const octave = parseInt(values.octave || '3', 10);
    const steps = parseProgression(values.chords ?? '', values.key, octave);
    const key = parseKey(values.key);
    const voiced = voiceLead(steps.map((s) => s.notes));
    const instrument = () => soundFor(values, ctx);
    const style = values.style || 'block';
    let loop = values.loop === 'true';

    const { el: frame, body, actions } = card({
      kind: 'progression',
      title: key ? `In ${prettyAccidentals(key.label)}` : 'Progression',
      caption: values.caption,
    });

    const row = h('div', { class: 'mn-prog' });
    const cells = steps.map((st, i) => {
      const cell = h(
        'div',
        { class: `mn-prog-cell${st.symbol ? '' : ' is-invalid'}` },
        h('div', { class: 'mn-prog-roman' }, st.roman ? prettyAccidentals(st.roman) : key ? '?' : ' '),
        h(
          'div',
          { class: 'mn-prog-symbol' },
          st.symbol ? chordSymbolEl(st.symbol, 'mn-chord-inline') : st.input,
        ),
        h('div', { class: 'mn-prog-notes' }, st.notes.map((n) => displayNote(n, { octave: false })).join(' ')),
      );
      if (st.symbol) {
        clickable(cell, () => {
          ctx.audio.play(voiced[i], { instrument: instrument(), duration: 1.5, strum: style === 'strum' ? 0.03 : 0.008 });
          cell.classList.add('is-current');
          setTimeout(() => cell.classList.remove('is-current'), 500);
        });
      }
      row.append(cell);
      return cell;
    });
    if (!steps.length) row.append(h('div', { class: 'mn-empty' }, 'Add some chords'));
    body.append(row);

    const beat = () => ctx.audio.beat;
    const beats = parseInt(values.beats || '4', 10);
    const buildEvents = () => {
      const events: { time: number; notes: string[]; duration: number; strum?: number; velocity?: number; step: number }[] = [];
      steps.forEach((st, i) => {
        if (!st.symbol) return;
        const t0 = i * beats * beat();
        const len = beats * beat();
        const notes = voiced[i];
        if (style === 'arpeggio') {
          const pattern = [...notes, ...notes.slice(1, -1).reverse()];
          const sub = beat() / 2;
          const count = Math.max(1, Math.round(len / sub));
          for (let k = 0; k < count; k++)
            events.push({ time: t0 + k * sub, notes: [pattern[k % pattern.length]], duration: sub * 1.8, step: i, velocity: k === 0 ? 0.85 : 0.65 });
        } else if (style === 'pulse') {
          for (let k = 0; k < beats; k++)
            events.push({ time: t0 + k * beat(), notes, duration: beat() * 0.8, step: i, velocity: k === 0 ? 0.85 : 0.6, strum: 0.006 });
        } else {
          events.push({ time: t0, notes, duration: len * 0.95, strum: style === 'strum' ? 0.03 : 0.006, step: i });
        }
      });
      return events;
    };

    let handle: { stop(): void } | null = null;
    const highlight = (i: number | null) => cells.forEach((c, j) => c.classList.toggle('is-current', i === j));
    const btn = playButton(
      () => {
        const events = buildEvents();
        handle = ctx.audio.sequence(events, {
          instrument: instrument(),
          loop,
          length: steps.length * beats * beat(),
          onEvent: (i) => highlight(events[i].step),
          onEnd: () => {
            highlight(null);
            btn.set(false);
          },
        });
      },
      () => handle?.stop(),
      'Play progression',
    );
    const loopBtn = h('button', {
      class: `mn-icon-btn${loop ? ' is-on' : ''}`,
      type: 'button',
      title: 'Loop',
      'aria-pressed': String(loop),
      'data-interactive': true,
    });
    loopBtn.innerHTML = ICONS.loop;
    loopBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      loop = !loop;
      loopBtn.classList.toggle('is-on', loop);
      loopBtn.setAttribute('aria-pressed', String(loop));
    });
    actions.append(loopBtn, btn.el);
    el.append(frame);
    return { destroy: () => handle?.stop() };
  },
};
