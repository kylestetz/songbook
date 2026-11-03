// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { Schema } from 'prosemirror-model';
import { EditorState } from 'prosemirror-state';
import { slashKey, slashPlugin } from '../src/editor/plugins';
import { WIDGETS } from '../src/core/widgets';
import { filterWidgets } from '../src/renderer/components/widgetSearch';

const names = (query: string) => filterWidgets(query).map((w) => w.name);

describe('filterWidgets', () => {
  it('returns the registry in order for an empty query', () => {
    expect(filterWidgets('  ')).toEqual(WIDGETS);
  });

  it('ranks title matches ahead of description matches', () => {
    expect(names('chord')).toEqual(['chord', 'progression', 'guitar', 'piano', 'notes', 'scale', 'circle']);
  });

  it('puts an exact match first, even when an earlier widget also matches', () => {
    expect(names('notes')[0]).toBe('notes');
    expect(names('note').slice(0, 2)).toEqual(['note', 'notes']);
    expect(names('piano')[0]).toBe('piano');
    expect(names('pianoroll')).toEqual(['pianoroll']);
  });

  it('treats plurals like their singular', () => {
    expect(names('chords')[0]).toBe('chord');
    expect(names('scales')[0]).toBe('scale');
  });

  it('matches later words, initials and abbreviations in a title', () => {
    expect(names('roll')[0]).toBe('pianoroll');
    expect(names('fifths')[0]).toBe('circle');
    expect(names('cof')[0]).toBe('circle');
    expect(names('chrd')[0]).toBe('chord');
    expect(names('gtr')[0]).toBe('guitar');
  });

  it('requires every word of the query to match, in any order', () => {
    expect(names('chord pro')[0]).toBe('progression');
    expect(names('chord guitar')[0]).toBe('guitar');
    expect(names('guitar zebra')).toEqual([]);
  });

  it('still finds widgets by what they do', () => {
    expect(names('melody')).toEqual(['pianoroll']);
    expect(names('fretboard')).toEqual(['guitar']);
  });

  it('does not match single letters or descriptions mid-word', () => {
    expect(names('r')).toEqual(['pianoroll']);
    expect(names('elody')).toEqual([]);
  });

  it('returns nothing when nothing matches', () => {
    expect(names('zebra')).toEqual([]);
  });
});

describe('slash query', () => {
  const schema = new Schema({ nodes: { doc: { content: 'text*' }, text: {} } });
  const slashFor = (text: string) => {
    const state = EditorState.create({ schema, plugins: [slashPlugin({ current: null })] });
    return slashKey.getState(state.apply(state.tr.insertText(text)))!;
  };

  it('keeps the menu open across spaces', () => {
    expect(slashFor('/chord pro')).toMatchObject({ active: true, query: 'chord pro', from: 0 });
    expect(slashFor('hello /chord ')).toMatchObject({ active: true, query: 'chord ', from: 6 });
  });

  it('only opens on a slash at the start of a word, followed directly by the query', () => {
    expect(slashFor('/').active).toBe(true);
    expect(slashFor('either/or').active).toBe(false);
    expect(slashFor('/ chord').active).toBe(false);
    expect(slashFor('/chord  pro').active).toBe(false);
  });

  it('rejects a long non-matching query without catastrophic backtracking', () => {
    const start = performance.now();
    expect(slashFor(`/${'a'.repeat(27)}1`).active).toBe(false);
    expect(performance.now() - start).toBeLessThan(100);
  });
});
