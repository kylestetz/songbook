// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { EditorState, TextSelection, type Command } from 'prosemirror-state';
import { tableEditing } from 'prosemirror-tables';
import { parseMarkdown, serializeMarkdown } from '../src/editor/markdown';
import { schema } from '../src/editor/schema';
import { cellContentPos, insertTable, splitPipeRow, tableAction, tableKeymap, tableNormalizePlugin } from '../src/editor/tables';
import { renderBodyHtml } from '../src/core/publish';

const roundTrip = (md: string) => serializeMarkdown(parseMarkdown(md));

const TABLE = ['| Chord | Function |', '| ----- | -------- |', '| Cmaj7 | I        |', '| G7    | V        |', ''].join('\n');

function stateFor(md: string) {
  return EditorState.create({ doc: parseMarkdown(md), plugins: [tableNormalizePlugin(), tableEditing()] });
}
function run(state: EditorState, cmd: Command) {
  let next = state;
  expect(cmd(state, (tr) => (next = state.apply(tr)))).toBe(true);
  return next;
}
const md = (state: EditorState) => serializeMarkdown(state.doc);
const inCell = (state: EditorState, row: number, col: number) =>
  state.apply(state.tr.setSelection(TextSelection.create(state.doc, cellContentPos(state.doc, 0, row, col))));
const press = (state: EditorState, key: string) => {
  const plugin = tableKeymap(schema);
  let next = state;
  const handled = plugin.props.handleKeyDown!.call(plugin, { state, dispatch: (tr: never) => (next = state.apply(tr)) } as never, new KeyboardEvent('keydown', { key: key.split('-').pop(), shiftKey: key.startsWith('Shift-') }));
  return { handled, state: next };
};

describe('table markdown', () => {
  it('round-trips a table with padded columns', () => {
    expect(roundTrip(TABLE)).toBe(TABLE);
  });
  it('normalizes ragged source tables', () => {
    expect(roundTrip('|a|b|\n|-|-|\n|1|\n|2|3|4|\n')).toBe(['| a   | b   |', '| --- | --- |', '| 1   |     |', '| 2   | 3   |', ''].join('\n'));
  });
  it('keeps alignment, marks and inline widgets', () => {
    const src = ['| Chord     | Notes           | Bars |', '| :-------: | :-------------- | ---: |', '| **Cmaj7** | :notes[C E G B] |    4 |', ''].join('\n');
    expect(roundTrip(src)).toBe(src);
    const html = renderBodyHtml(src);
    expect(html).toContain('<th style="text-align:center">Chord</th>');
    expect(html).toContain('data-widget="notes"');
  });
  it('escapes pipes in cells, including inside code', () => {
    const src = ['| a      | b      |', '| ------ | ------ |', '| x \\| y | `p\\|q` |', ''].join('\n');
    const doc = parseMarkdown(src);
    const cells = doc.firstChild!.child(1);
    expect(cells.child(0).textContent).toBe('x | y');
    expect(cells.child(1).textContent).toBe('p|q');
    expect(roundTrip(src)).toBe(src);
  });
  it('works inside quotes and lists', () => {
    const src = ['> | q   | r   |', '> | --- | --- |', '> | 1   | 2   |', '', '- item', '', '  | a   |', '  | --- |', '  | b   |', ''].join('\n');
    expect(roundTrip(src)).toBe(src);
  });
});

describe('table editing', () => {
  it('adds, moves and deletes rows', () => {
    let s = stateFor(TABLE);
    s = run(s, tableAction(0, 'row', 2, { type: 'insert', side: 'after' }));
    expect(s.doc.firstChild!.childCount).toBe(4);
    s = run(s, tableAction(0, 'row', 1, { type: 'move', dir: 1 }));
    expect(s.doc.firstChild!.child(2).textContent).toBe('Cmaj7I');
    s = run(s, tableAction(0, 'row', 2, { type: 'delete' }));
    expect(s.doc.firstChild!.childCount).toBe(3);
    expect(s.doc.firstChild!.textContent).not.toContain('Cmaj7');
  });
  it('adds, aligns and deletes columns; new rows pick up the alignment', () => {
    let s = stateFor(TABLE);
    s = run(s, tableAction(0, 'col', 0, { type: 'insert', side: 'before' }));
    expect(s.doc.firstChild!.firstChild!.childCount).toBe(3);
    s = run(s, tableAction(0, 'col', 2, { type: 'align', align: 'center' }));
    s = run(s, tableAction(0, 'row', 2, { type: 'insert', side: 'after' }));
    expect(s.doc.firstChild!.child(3).child(2).attrs.align).toBe('center');
    expect(md(s).split('\n')[1]).toBe('| --- | ----- | :------: |');
    s = run(s, tableAction(0, 'col', 0, { type: 'delete' }));
    expect(md(s).split('\n')[0]).toBe('| Chord | Function |');
  });
  it('deleting the last column removes the table', () => {
    let s = stateFor('| a |\n|---|\n| b |\n\nafter\n');
    s = run(s, tableAction(0, 'col', 0, { type: 'delete' }));
    expect(md(s)).toBe('after\n');
  });
  it('inserts an empty 3×3 table into an empty paragraph', () => {
    let s = stateFor('');
    s = run(s, insertTable(schema));
    expect(md(s)).toBe(['|     |     |     |', '| --- | --- | --- |', '|     |     |     |', '|     |     |     |', ''].join('\n'));
  });
});

describe('table keys', () => {
  it('Enter moves down a row, and adds one at the bottom', () => {
    let s = inCell(stateFor(TABLE), 1, 1);
    let r = press(s, 'Enter');
    expect(r.handled).toBe(true);
    expect(r.state.selection.$from.parent.textContent).toBe('V');
    r = press(r.state, 'Enter');
    expect(r.state.doc.firstChild!.childCount).toBe(4);
    s = r.state;
    expect(s.selection.$from.parent.type.name).toBe('table_cell');
  });
  it('Tab on the last cell adds a row', () => {
    const s = inCell(stateFor(TABLE), 2, 1);
    const r = press(s, 'Tab');
    expect(r.state.doc.firstChild!.childCount).toBe(4);
  });
  it('typing a pipe row and Enter makes a table', () => {
    let s = stateFor('| Chord | **Roman** |\n');
    s = s.apply(s.tr.setSelection(TextSelection.create(s.doc, s.doc.firstChild!.nodeSize - 1)));
    const r = press(s, 'Enter');
    expect(r.handled).toBe(true);
    expect(md(r.state)).toBe(['| Chord | **Roman** |', '| ----- | --------- |', '|       |           |', ''].join('\n'));
  });
  it('splits typed pipe rows', () => {
    expect(splitPipeRow('| a |  b c |')).toEqual([[2, 3], [7, 10]]);
    expect(splitPipeRow('| a ||')).toEqual([[2, 3], [5, 5]]);
    expect(splitPipeRow('|---|---|')).toBeNull();
    expect(splitPipeRow('not | a table')).toBeNull();
  });
});
