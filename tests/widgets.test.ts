// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { WIDGETS, directiveFromValues, renderWidget, valuesFromDirective } from '../src/core/widgets';
import { WIDGETS as META } from '../src/core/widgets/registry-meta';
import { AudioEngine } from '../src/core/audio';
import { parseDirectiveAt, serializeDirective } from '../src/core/markdown/directive';

const ctx = { audio: new AudioEngine(), settings: () => ({ sound: 'piano', tempo: 96 }) };

describe('widget registry', () => {
  it('menu metadata matches the registry', () => {
    expect(META.map((m) => [m.name, m.title, m.kind])).toEqual(WIDGETS.map((w) => [w.name, w.title, w.kind]));
  });

  it('every field has a default-compatible key and every widget renders its defaults', () => {
    for (const w of WIDGETS) {
      const el = document.createElement(w.kind === 'inline' ? 'span' : 'div');
      renderWidget(el, w.name, { ...w.defaults }, ctx);
      expect(el.querySelector('.mn-error'), `${w.name} rendered an error`).toBeNull();
      expect(el.childElementCount, w.name).toBeGreaterThan(0);
      expect(w.summary(w.defaults)).toBeTruthy();
    }
  });

  it('renders a friendly error for bad input instead of throwing', () => {
    const el = document.createElement('div');
    renderWidget(el, 'guitar', { chord: 'nonsense' }, ctx);
    expect(el.textContent).toContain('voicing');
    renderWidget(el, 'scale', { root: 'H', mode: 'major' }, ctx);
    expect(el.querySelector('.mn-pill.is-invalid')).not.toBeNull();
    renderWidget(el, 'nope', {}, ctx);
    expect(el.textContent).toContain('Unknown widget');
  });
});

describe('scale widget', () => {
  it('lists the root and mode, then the intervals or note names', () => {
    const el = document.createElement('span');
    renderWidget(el, 'scale', valuesFromDirective({ name: 'scale', attrs: { root: 'C', mode: 'dorian' } }), ctx);
    expect(el.querySelector('.mn-scale-name')!.textContent).toBe('C Dorian');
    expect(el.querySelector('.mn-scale-tones')!.textContent).toBe('1 2 ♭3 4 5 6 ♭7');
    renderWidget(el, 'scale', valuesFromDirective({ name: 'scale', attrs: { root: 'Eb', mode: 'major', labels: 'notes' } }), ctx);
    expect(el.querySelector('.mn-scale-name')!.textContent).toBe('E♭ Major');
    expect(el.querySelector('.mn-scale-tones')!.textContent).toBe('E♭ F G A♭ B♭ C D');
  });
});

describe('scale pattern widget', () => {
  it('shows the steps and plays them up from C', () => {
    const el = document.createElement('span');
    renderWidget(el, 'steps', valuesFromDirective({ name: 'steps', label: 'wwh whww h', attrs: {} }), ctx);
    expect(el.querySelector('.mn-steps-list')!.textContent).toBe('W W H W H W W H');
    expect(el.querySelector('.mn-pill')!.getAttribute('title')).toBe('Play C D E F G G♯ A♯ C C♯');
    renderWidget(el, 'steps', { pattern: 'WXH' }, ctx);
    expect(el.querySelector('.mn-pill.is-invalid')).not.toBeNull();
  });
});

describe('interval widget', () => {
  it('shows either the two notes or the interval name', () => {
    const el = document.createElement('span');
    renderWidget(el, 'interval', { notes: 'C4 F4' }, ctx);
    expect(el.querySelector('.mn-pill')!.textContent).toBe('C4→F4');
    renderWidget(el, 'interval', { notes: 'C4 F4', show: 'name' }, ctx);
    expect(el.querySelector('.mn-pill')!.textContent).toBe('perfect fourth');
    renderWidget(el, 'interval', { notes: 'E C', show: 'name' }, ctx);
    expect(el.querySelector('.mn-pill')!.textContent).toBe('minor sixth');
  });
});

describe('values <-> directive', () => {
  it('omits defaults but keeps required fields', () => {
    const d = directiveFromValues('scale', { root: 'D', mode: 'dorian', octave: '4', labels: 'degrees', direction: 'up' });
    expect(d).toEqual({ name: 'scale', label: undefined, attrs: { root: 'D', mode: 'dorian' } });
  });
  it('maps the label field', () => {
    const d = directiveFromValues('chord', { symbol: 'Dm7', octave: '3' });
    expect(d).toEqual({ name: 'chord', label: 'Dm7', attrs: {} });
    expect(valuesFromDirective({ name: 'chord', label: 'Dm7', attrs: {} })).toEqual({ symbol: 'Dm7', octave: '3' });
  });
  it('keeps unknown attributes', () => {
    const v = valuesFromDirective({ name: 'note', label: 'C4', attrs: { future: 'yes' } });
    expect(directiveFromValues('note', v).attrs).toEqual({ future: 'yes' });
  });
});

describe('chords written as notes', () => {
  it('render with their label and survive a round trip', () => {
    const el = document.createElement('div');
    renderWidget(el, 'progression', { chords: 'Dm7 Fm(add9)[F3 Ab3 G3]' }, ctx);
    expect(el.querySelectorAll('.mn-prog-cell.is-invalid').length).toBe(0);
    expect(el.textContent).toContain('Fm(add9)');
    const g = document.createElement('div');
    renderWidget(g, 'guitar', { chord: '[F3 Ab3 G3]' }, ctx);
    expect(g.querySelector('.mn-error')).toBeNull();
    const d = directiveFromValues('chord', { symbol: 'Fmadd9[F3 Ab3 G3]', octave: '3' });
    expect(valuesFromDirective(d).symbol).toBe('Fmadd9[F3 Ab3 G3]');
  });
  it('survive a markdown round trip with their fingering', () => {
    const chords = 'Am7[A2 E3 G3 C4 E4 @x02010] | C#m7[C#3 G#3 B3 E4 @x-4-6-4-5-x]';
    const src = `${serializeDirective('block', directiveFromValues('progression', { chords }))}\n`;
    const parsed = parseDirectiveAt(src, 2)!.directive;
    expect(valuesFromDirective(parsed).chords).toBe(chords);
  });
  it('a chord symbol plays the exact voicing it was played with', () => {
    const played: string[][] = [];
    const audio = Object.assign(new AudioEngine(), { play: (notes: string[]) => void played.push(notes) });
    const el = document.createElement('span');
    renderWidget(el, 'chord', { symbol: 'Am7[A2 G3 C4 E4]', octave: '3' }, { ...ctx, audio });
    expect(el.textContent).toBe('Am7');
    (el.querySelector('.mn-pill') as HTMLElement).click();
    expect(played).toEqual([['A2', 'G3', 'C4', 'E4']]);
    const src = `${serializeDirective('inline', directiveFromValues('chord', { symbol: 'Am7[A2 G3 C4 E4 @x0x555]', octave: '3' }))} `;
    expect(valuesFromDirective(parseDirectiveAt(src, 1)!.directive).symbol).toBe('Am7[A2 G3 C4 E4 @x0x555]');
  });
});
