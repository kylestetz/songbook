// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { WIDGETS, directiveFromValues, renderWidget, valuesFromDirective } from '../src/core/widgets';
import { WIDGETS as META } from '../src/core/widgets/registry-meta';
import { AudioEngine } from '../src/core/audio';

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
    expect(el.querySelector('.mn-error')).not.toBeNull();
    renderWidget(el, 'nope', {}, ctx);
    expect(el.textContent).toContain('Unknown widget');
  });
});

describe('values <-> directive', () => {
  it('omits defaults but keeps required fields', () => {
    const d = directiveFromValues('scale', { root: 'D', mode: 'dorian', octave: '4', labels: 'degrees', chords: 'none', direction: 'up' });
    expect(d).toEqual({ name: 'scale', label: undefined, attrs: { root: 'D', mode: 'dorian', octave: '4' } });
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
});
