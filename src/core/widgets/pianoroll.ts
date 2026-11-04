import { Note } from '@tonaljs/tonal';
import { displayNote, parseRoll, type RollNote } from '../theory';
import { card, h, ICONS, playButton, s, soundFor } from './dom';
import { CAPTION_FIELD, SOUND_FIELD, WIDGET_ICONS } from './common';
import { isBlack } from './keyboard';
import type { WidgetDefinition } from './types';

export const GRID_OPTIONS = [
  { value: '4', label: '16th notes' },
  { value: '2', label: '8th notes' },
  { value: '3', label: '8th-note triplets' },
  { value: '1', label: 'Quarter notes' },
];

export function rollRange(notes: RollNote[]): { lo: number; hi: number } {
  const midis = notes.map((n) => Note.midi(n.pitch)!).filter((m) => m != null);
  if (!midis.length) return { lo: 60, hi: 72 };
  let lo = Math.min(...midis) - 2;
  let hi = Math.max(...midis) + 2;
  while (hi - lo < 12) {
    hi++;
    if (hi - lo < 12) lo--;
  }
  return { lo, hi };
}

export const pianorollWidget: WidgetDefinition = {
  name: 'pianoroll',
  title: 'Piano roll',
  description: 'A short melody or pattern on a grid',
  kind: 'block',
  icon: WIDGET_ICONS.pianoroll,
  fields: [
    { key: 'notes', label: 'Notes', type: 'roll', required: true },
    {
      key: 'steps',
      label: 'Length (steps)',
      type: 'select',
      required: true,
      options: ['8', '12', '16', '24', '32', '48', '64'].map((v) => ({ value: v, label: v })),
    },
    { key: 'grid', label: 'Step size', type: 'select', options: GRID_OPTIONS },
    { key: 'loop', label: 'Loop playback', type: 'boolean' },
    CAPTION_FIELD,
    SOUND_FIELD,
  ],
  defaults: { notes: 'C4@0+2 E4@2+2 G4@4+2 B4@6+2 C5@8+6 B4@14 G4@15', steps: '16', grid: '4', loop: '' },
  summary: (v) => `Piano roll: ${parseRoll(v.notes ?? '').map((n) => displayNote(n.pitch)).join(' ')}`,
  render(el, values, ctx) {
    const notes = parseRoll(values.notes ?? '');
    const steps = Math.max(1, parseInt(values.steps || '16', 10));
    const perBeat = Math.max(1, parseInt(values.grid || '4', 10));
    let loop = values.loop === 'true';
    const { lo, hi } = rollRange(notes);
    const { el: frame, body, actions } = card({ kind: 'pianoroll', label: 'Piano roll', meta: `${steps} steps`, caption: values.caption });

    const grid = rollGrid({ notes, steps, perBeat, lo, hi });
    body.append(h('div', { class: 'mn-roll-wrap' }, grid.el));

    const instrument = () => soundFor(values, ctx);
    let handle: { stop(): void } | null = null;
    const btn = playButton(
      () => {
        const stepDur = ctx.audio.beat / perBeat;
        const events = [
          ...Array.from({ length: steps }, (_, i) => ({ time: i * stepDur, notes: [] as string[], duration: 0, step: i })),
          ...notes.map((n) => ({ time: n.start * stepDur, notes: [n.pitch], duration: n.length * stepDur * 0.95, step: -1 })),
        ];
        handle = ctx.audio.sequence(events, {
          instrument: instrument(),
          loop,
          length: steps * stepDur,
          onEvent: (i) => {
            const step = events[i].step;
            if (step < 0) return;
            grid.setPlayhead(step);
            grid.setActive(notes.filter((n) => step >= n.start && step < n.start + n.length).map((n) => Note.midi(n.pitch)!));
          },
          onEnd: () => {
            grid.setPlayhead(null);
            grid.setActive([]);
            btn.set(false);
          },
        });
      },
      () => handle?.stop(),
      'Play',
    );
    const loopBtn = h('button', { class: `mn-icon-btn${loop ? ' is-on' : ''}`, type: 'button', title: 'Loop', 'data-interactive': true });
    loopBtn.innerHTML = ICONS.loop;
    loopBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      loop = !loop;
      loopBtn.classList.toggle('is-on', loop);
    });
    actions.append(loopBtn, btn.el);
    grid.el.addEventListener('mousedown', (e) => {
      const target = (e.target as Element).closest('[data-pitch]');
      if (target) {
        e.preventDefault();
        e.stopPropagation();
        ctx.audio.play([target.getAttribute('data-pitch')!], { instrument: instrument(), duration: 0.6 });
        target.classList.add('is-pressed');
        setTimeout(() => target.classList.remove('is-pressed'), 180);
      }
    });
    el.append(frame);
    return { destroy: () => handle?.stop() };
  },
};

export interface RollGridOptions {
  notes: RollNote[];
  steps: number;
  perBeat: number;
  lo: number;
  hi: number;
  cell?: number;
  row?: number;
}

export interface RollKey {
  midi: number;
  black: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Key shapes for the keyboard beside a roll, styled like the keyboard widget:
 * white keys share edges and reach behind half of each neighbouring black key
 * (as on a real piano), black keys are shorter and sit on top. Whites come
 * first so the blacks draw over them.
 */
export function rollKeys(lo: number, hi: number, RH: number, LW: number): RollKey[] {
  const yOf = (m: number) => (hi - m) * RH;
  const upper = Math.floor(RH / 2); // the part of a black row owned by the white key above it
  const whites: RollKey[] = [];
  const blacks: RollKey[] = [];
  for (let m = hi; m >= lo; m--) {
    if (isBlack(m)) {
      blacks.push({ midi: m, black: true, x: 0.5, y: yOf(m) + 0.5, width: Math.round(LW * 0.62), height: RH });
      continue;
    }
    let top = yOf(m);
    let bottom = top + RH;
    if (m + 1 <= hi && isBlack(m + 1)) top = m + 1 === hi ? yOf(m + 1) : yOf(m + 1) + upper;
    if (m - 1 >= lo && isBlack(m - 1)) bottom = m - 1 === lo ? yOf(m - 1) + RH : yOf(m - 1) + upper;
    whites.push({ midi: m, black: false, x: 0.5, y: top + 0.5, width: LW, height: bottom - top });
  }
  return [...whites, ...blacks];
}

/** Class for the vertical grid line before step `i`. */
export function rollLineClass(i: number, perBeat: number): string {
  return i % (perBeat * 4) === 0 ? 'mn-roll-bar' : i % perBeat === 0 ? 'mn-roll-beat' : 'mn-roll-step';
}

/** Draw a piano-roll grid. Shared by the widget and the editor's roll field. */
export function rollGrid(opts: RollGridOptions) {
  const CW = opts.cell ?? 22;
  const RH = opts.row ?? 14;
  const LW = 34;
  const rows = opts.hi - opts.lo + 1;
  const width = LW + opts.steps * CW;
  const height = rows * RH;
  const svg = s('svg', {
    class: 'mn-roll',
    viewBox: `0 0 ${width + 1} ${height + 1}`,
    width: width + 1,
    style: `max-width: ${Math.round((width + 1) * 1.45)}px`,
    role: 'img',
    'aria-label': 'Piano roll',
  });
  const yOf = (midi: number) => (opts.hi - midi) * RH;
  // Lines sit on half pixels so they render crisp; the outer edge is one even frame.
  for (let m = opts.hi; m >= opts.lo; m--) {
    svg.append(s('rect', { class: `mn-roll-row${isBlack(m) ? ' is-black' : ''}`, x: LW + 0.5, y: yOf(m) + 0.5, width: opts.steps * CW, height: RH }));
  }
  for (let i = 1; i < opts.steps; i++) {
    const x = LW + i * CW + 0.5;
    svg.append(s('line', { class: rollLineClass(i, opts.perBeat), x1: x, x2: x, y1: 0.5, y2: height + 0.5 }));
  }
  svg.append(s('rect', { class: 'mn-roll-frame', x: LW + 0.5, y: 0.5, width: opts.steps * CW, height }));
  const keyEls = new Map<number, SVGElement>();
  for (const k of rollKeys(opts.lo, opts.hi, RH, LW)) {
    const key = s('rect', {
      class: `mn-roll-key${k.black ? ' is-black' : ''}`,
      x: k.x,
      y: k.y,
      width: k.width,
      height: k.height,
      rx: k.black ? 1 : 0,
      'data-pitch': Note.fromMidi(k.midi),
    });
    keyEls.set(k.midi, key);
    svg.append(key);
  }
  for (let m = opts.hi; m >= opts.lo; m--) {
    if (m % 12 === 0)
      svg.append(
        s('text', { class: 'mn-roll-label', x: LW - 3, y: yOf(m) + RH / 2 + 0.5, 'text-anchor': 'end', 'dominant-baseline': 'central' }, `C${Math.floor(m / 12) - 1}`),
      );
  }
  const noteLayer = s('g');
  svg.append(noteLayer);
  for (const n of opts.notes) {
    const midi = Note.midi(n.pitch);
    if (midi == null || midi < opts.lo || midi > opts.hi || n.start >= opts.steps) continue;
    noteLayer.append(
      s('rect', {
        class: 'mn-roll-note',
        x: LW + n.start * CW + 2,
        y: yOf(midi) + 1.5,
        width: Math.min(n.length, opts.steps - n.start) * CW - 3,
        height: RH - 2,
        rx: 2,
      }),
    );
  }
  const playhead = s('rect', { class: 'mn-roll-playhead', x: LW + 0.5, y: 0.5, width: CW, height, visibility: 'hidden' });
  svg.append(playhead);
  return {
    el: svg,
    metrics: { CW, RH, LW, width, height },
    setPlayhead(step: number | null) {
      if (step === null) playhead.setAttribute('visibility', 'hidden');
      else {
        playhead.setAttribute('visibility', 'visible');
        playhead.setAttribute('x', String(LW + step * CW + 0.5));
      }
    },
    /** Light up the keys for the notes sounding now. */
    setActive(midis: number[]) {
      const set = new Set(midis);
      keyEls.forEach((el, m) => el.classList.toggle('is-active', set.has(m)));
    },
  };
}
