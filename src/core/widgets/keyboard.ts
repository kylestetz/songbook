import { s } from './dom';

export interface KeyMark {
  label?: string;
  /** "filled" draws a solid dot; "tone" (default) an outlined one */
  tone?: 'filled' | 'tone';
}

export interface KeyboardOptions {
  /** Inclusive midi range; snapped outward to white keys */
  from: number;
  to: number;
  marks?: Map<number, KeyMark>;
  onKey?: (midi: number) => void;
  height?: number;
}

const BLACK = new Set([1, 3, 6, 8, 10]);
export const isBlack = (midi: number) => BLACK.has(((midi % 12) + 12) % 12);

/** Choose a comfortable keyboard range that contains all midis. */
export function keyboardRange(midis: number[], minSemitones = 23): { from: number; to: number } {
  if (!midis.length) return { from: 60, to: 83 };
  const lo = Math.min(...midis);
  const hi = Math.max(...midis);
  let from = lo - (lo % 12); // C below
  let to = hi + (11 - (hi % 12)); // B above
  if (hi % 12 === 0 && hi > lo) to = hi; // end on a top C rather than adding an octave
  while (to - from < minSemitones) to += 12;
  // Trim a top C ending to a full octave if it makes the range less lopsided
  if (to - from > 47) {
    from = Math.max(21, lo - 2);
    to = Math.min(108, hi + 2);
    while (isBlack(from)) from--;
    while (isBlack(to)) to++;
  }
  return { from, to };
}

export function keyboard(opts: KeyboardOptions) {
  let { from, to } = opts;
  while (isBlack(from)) from--;
  while (isBlack(to)) to++;
  const W = 24;
  const H = opts.height ?? 96;
  const BW = 14;
  const BH = Math.round(H * 0.62);
  const whites: number[] = [];
  for (let m = from; m <= to; m++) if (!isBlack(m)) whites.push(m);
  const width = whites.length * W;
  const svg = s('svg', {
    class: 'mn-keyboard',
    viewBox: `0 0 ${width + 1} ${H + 1}`,
    width: width + 1,
    style: `max-width: ${Math.round(whites.length * 31)}px`,
    role: 'img',
    'aria-label': 'Piano keyboard',
  });
  const keyEls = new Map<number, SVGGElement>();
  const whiteLayer = s('g');
  const blackLayer = s('g');
  svg.append(whiteLayer, blackLayer);

  const mark = opts.marks ?? new Map<number, KeyMark>();
  /** A round marker centred on (cx, cy). */
  const dot = (cx: number, cy: number, size: number) => s('circle', { class: 'mn-key-dot', cx, cy, r: size / 2 });
  /** Labels of three or more characters (♭13, ♯11) get a smaller size to fit the circle. */
  const labelClass = (label: string, small: boolean) =>
    ['mn-key-label', small ? 'mn-key-label-sm' : '', [...label].length > 2 ? 'is-long' : ''].filter(Boolean).join(' ');
  let x = 0;
  for (let m = from; m <= to; m++) {
    const black = isBlack(m);
    const mk = mark.get(m);
    const cls = ['mn-key', black ? 'mn-key-black' : 'mn-key-white', mk ? `is-marked is-${mk.tone ?? 'tone'}` : '']
      .filter(Boolean)
      .join(' ');
    const g = s('g', { class: cls, 'data-midi': m });
    if (!black) {
      g.append(s('rect', { x: x + 0.5, y: 0.5, width: W, height: H, rx: 1.5 }));
      if (mk?.label) {
        g.append(dot(x + 0.5 + W / 2, H - 14, 18));
        g.append(s('text', { class: labelClass(mk.label, false), x: x + 0.5 + W / 2, y: H - 14, 'text-anchor': 'middle', 'dominant-baseline': 'central' }, mk.label));
      } else if (mk) {
        g.append(dot(x + 0.5 + W / 2, H - 14, 9));
      } else if (m % 12 === 0) {
        g.append(s('text', { class: 'mn-key-c', x: x + 0.5 + W / 2, y: H - 8, 'text-anchor': 'middle' }, `C${Math.floor(m / 12) - 1}`));
      }
      whiteLayer.append(g);
      x += W;
    } else {
      const bx = x - BW / 2 + 0.5;
      g.append(s('rect', { x: bx, y: 0.5, width: BW, height: BH, rx: 1 }));
      if (mk) {
        g.append(dot(bx + BW / 2, BH - 11, mk.label ? 13 : 7));
        if (mk.label)
          g.append(s('text', { class: labelClass(mk.label, true), x: bx + BW / 2, y: BH - 11, 'text-anchor': 'middle', 'dominant-baseline': 'central' }, mk.label));
      }
      blackLayer.append(g);
    }
    if (opts.onKey) {
      g.setAttribute('data-interactive', '');
      g.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        opts.onKey!(m);
        g.classList.add('is-pressed');
        setTimeout(() => g.classList.remove('is-pressed'), 180);
      });
    }
    keyEls.set(m, g);
  }

  return {
    el: svg,
    setActive(midis: number[]) {
      const set = new Set(midis);
      keyEls.forEach((g, m) => g.classList.toggle('is-active', set.has(m)));
    },
  };
}
