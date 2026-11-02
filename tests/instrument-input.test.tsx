// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { progressionWidget } from '../src/core/widgets/progression';
import { InstrumentPanel } from '../src/renderer/components/InstrumentInput';
import type { WidgetValues } from '../src/core/widgets';

vi.mock('../src/core/audio', () => ({ getAudioEngine: () => ({ play() {}, sequence() {} }) }));

const field = progressionWidget.fields[0];
const FRETS = 16;

/** Mounts the panel on the guitar tab, feeding each change back in like the editor does. */
function mount(initial: WidgetValues, tab = 'guitar') {
  localStorage.setItem('mn.inputMethod', tab);
  const el = document.createElement('div');
  document.body.append(el);
  let values = initial;
  const root: Root = createRoot(el);
  const render = () =>
    root.render(
      <InstrumentPanel
        field={field}
        values={values}
        onChange={(v) => {
          values = v;
          render();
        }}
      />,
    );
  act(render);
  const button = (text: string) => {
    const all = [...el.querySelectorAll('button')];
    return all.find((b) => b.textContent === text) ?? all.find((b) => b.textContent!.includes(text))!;
  };
  return {
    el,
    get chords() {
      return values.chords;
    },
    /** `string` counts from the low string, as frets are written. */
    fret(string: number, fret: number) {
      const cell = el.querySelectorAll('.ii-cell')[string * FRETS + fret];
      act(() => void cell.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })));
    },
    shape(frets: (number | null)[]) {
      frets.forEach((f, s) => f !== null && this.fret(s, f));
    },
    click: (text: string) => act(() => button(text).click()),
    button,
    label: () => el.querySelector<HTMLInputElement>('.instrument-label')!,
    placed: () => el.querySelectorAll('.ii-pick').length,
    unmount: () => act(() => root.unmount()),
  };
}

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

describe('playing a progression on the fretboard', () => {
  let p: ReturnType<typeof mount>;
  afterEach(() => p.unmount());

  it('keeps the exact strings of a voicing with a standard name', () => {
    p = mount({ chords: '' });
    // A C major triad high on the neck, with no open strings: not the stock C shape
    p.shape([null, 3, 5, 5, 5, null]);
    p.click('Add');
    expect(p.chords).toBe('C[C3 G3 C4 E4 @x3555x]');
  });

  it('tells apart the same notes on different strings', () => {
    p = mount({ chords: '' });
    p.shape([null, 0, null, null, null, 0]);
    p.click('Add');
    p.shape([null, 0, null, null, 5, null]);
    p.click('Add');
    const [a, b] = p.chords.match(/@\S+?(?=\])/g)!;
    expect([a, b]).toEqual(['@x0xxx0', '@x0xx5x']);
  });

  it('shows the same strings again when the chord is reopened', () => {
    p = mount({ chords: '' });
    p.shape([null, 3, 5, 5, 5, null]);
    p.click('Add');
    p.click('New chord');
    expect(p.placed()).toBe(0);
    p.click('C');
    expect(p.placed()).toBe(4);
    // Editing one string leaves the others where they were
    p.fret(5, 3);
    expect(p.chords).toMatch(/@x35553\]$/);
  });

  it('renames a voicing without touching its notes', () => {
    p = mount({ chords: '' });
    p.shape([null, 0, 2, 0, 1, 0]);
    p.click('Add');
    const before = p.chords;
    const notes = before.slice(before.indexOf('['));
    p.click(before.slice(0, before.indexOf('[')));
    act(() => {
      const input = p.label();
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, 'Sad');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(p.chords).toBe(`Sad${notes}`);
    expect(notes).toContain('@x02010');
  });

  it('keeps octaves when played on the piano, without a fingering', () => {
    p = mount({ chords: '' }, 'piano');
    const key = (i: number) =>
      act(() => void p.el.querySelectorAll('.ii-key-white')[i].dispatchEvent(new MouseEvent('mousedown', { bubbles: true })));
    key(7); // C4
    key(9); // E4
    key(11); // G4
    p.click('Add');
    expect(p.chords).toBe('C[C4 E4 G4]');
  });

  it('leaves other chords and bar lines alone', () => {
    p = mount({ chords: 'Dm7 | G7' });
    p.click('G7');
    p.shape([3, null, null, null, null, null]);
    expect(p.chords.startsWith('Dm7 | ')).toBe(true);
    expect(p.chords).toContain('@');
  });
});
