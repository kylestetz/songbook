import { Note } from '@tonaljs/tonal';
import { CIRCLE_MAJOR, CIRCLE_MINOR, parseKey, prettyAccidentals, voiceChord } from '../theory';
import { card, h, s, soundFor } from './dom';
import { CAPTION_FIELD, SOUND_FIELD, WIDGET_ICONS } from './common';
import type { WidgetDefinition } from './types';

const MAJOR_ROMAN: Record<number, string> = { [-1]: 'IV', 0: 'I', 1: 'V' };
const MINOR_ROMAN: Record<number, string> = { [-1]: 'ii', 0: 'vi', 1: 'iii' };

function keySignature(idx: number): string {
  if (idx === 0) return 'No sharps or flats';
  if (idx === 6) return '6 sharps / 6 flats';
  if (idx < 6) return `${idx} sharp${idx > 1 ? 's' : ''}`;
  return `${12 - idx} flat${12 - idx > 1 ? 's' : ''}`;
}

export const circleWidget: WidgetDefinition = {
  name: 'circle',
  title: 'Circle of fifths',
  description: 'Keys around the circle, with a key and its closest chords highlighted',
  kind: 'block',
  icon: WIDGET_ICONS.circle,
  fields: [
    { key: 'key', label: 'Key', type: 'key', required: true },
    CAPTION_FIELD,
    SOUND_FIELD,
  ],
  defaults: { key: 'C' },
  summary: (v) => `Circle of fifths${v.key ? ` in ${v.key}` : ''}`,
  render(el, values, ctx) {
    const key = parseKey(values.key) ?? parseKey('C')!;
    // Index of the relative major in the circle
    const majorTonic = key.minor ? Note.transpose(key.tonic, '3m') : key.tonic;
    const idx = CIRCLE_MAJOR.findIndex((k) => Note.chroma(k) === Note.chroma(majorTonic));
    const { el: frame, body } = card({
      kind: 'circle',
      title: `${prettyAccidentals(key.label)}`,
      subtitle: keySignature(idx),
      caption: values.caption,
    });
    const size = 300;
    const c = size / 2;
    const R1 = 142;
    const R2 = 100;
    const R3 = 62;
    const svg = s('svg', { class: 'mn-circle', viewBox: `0 0 ${size} ${size}`, width: size, role: 'img', 'aria-label': 'Circle of fifths' });

    const polar = (r: number, a: number) => [c + r * Math.cos(a), c + r * Math.sin(a)];
    const wedge = (r0: number, r1: number, i: number) => {
      const a0 = ((i - 0.5) * 30 - 90) * (Math.PI / 180);
      const a1 = ((i + 0.5) * 30 - 90) * (Math.PI / 180);
      const [x0, y0] = polar(r1, a0);
      const [x1, y1] = polar(r1, a1);
      const [x2, y2] = polar(r0, a1);
      const [x3, y3] = polar(r0, a0);
      return `M${x0},${y0} A${r1},${r1} 0 0 1 ${x1},${y1} L${x2},${y2} A${r0},${r0} 0 0 0 ${x3},${y3} Z`;
    };
    const instrument = () => soundFor(values, ctx);

    for (let i = 0; i < 12; i++) {
      let rel = (i - idx + 12) % 12;
      if (rel > 6) rel -= 12;
      const inKey = Math.abs(rel) <= 1;
      for (const ring of ['major', 'minor'] as const) {
        const name = ring === 'major' ? CIRCLE_MAJOR[i] : CIRCLE_MINOR[i];
        const isTonic = rel === 0 && (ring === 'major') !== key.minor;
        const g = s('g', {
          class: `mn-circle-seg is-${ring}${inKey ? ' is-in-key' : ''}${isTonic ? ' is-tonic' : ''}`,
          'data-interactive': '',
          role: 'button',
          tabindex: '-1',
        });
        const [r0, r1] = ring === 'major' ? [R2, R1] : [R3, R2];
        g.append(s('path', { d: wedge(r0, r1, i) }));
        const a = (i * 30 - 90) * (Math.PI / 180);
        const [tx, ty] = polar((r0 + r1) / 2 + (inKey ? 5 : 0), a);
        const label = ring === 'major' ? name : `${name}m`;
        g.append(s('text', { x: tx, y: ty, 'text-anchor': 'middle', 'dominant-baseline': 'central' }, prettyAccidentals(label)));
        if (inKey) {
          const [rx, ry] = polar((r0 + r1) / 2 - 11, a);
          const roman = key.minor
            ? ring === 'major'
              ? { [-1]: 'VI', 0: 'III', 1: 'VII' }[rel]!
              : { [-1]: 'iv', 0: 'i', 1: 'v' }[rel]!
            : ring === 'major'
              ? MAJOR_ROMAN[rel]
              : MINOR_ROMAN[rel];
          g.append(s('text', { class: 'mn-circle-roman', x: rx, y: ry, 'text-anchor': 'middle', 'dominant-baseline': 'central' }, roman));
        }
        g.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          const symbol = ring === 'major' ? name : `${name}m`;
          ctx.audio.play(voiceChord(symbol, ring === 'major' ? 3 : 3), { instrument: instrument(), duration: 1.4, strum: 0.015 });
          g.classList.add('is-active');
          setTimeout(() => g.classList.remove('is-active'), 400);
        });
        svg.append(g);
      }
    }
    svg.append(s('circle', { class: 'mn-circle-hub', cx: c, cy: c, r: R3 - 4 }));
    svg.append(
      s('text', { class: 'mn-circle-center', x: c, y: c - 6, 'text-anchor': 'middle', 'dominant-baseline': 'central' }, prettyAccidentals(key.tonic + (key.minor ? 'm' : ''))),
    );
    svg.append(s('text', { class: 'mn-circle-center-sub', x: c, y: c + 14, 'text-anchor': 'middle', 'dominant-baseline': 'central' }, key.minor ? 'minor' : 'major'));
    body.append(h('div', { class: 'mn-circle-wrap' }, svg));
    el.append(frame);
  },
};
