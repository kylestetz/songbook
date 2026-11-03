import { keymap } from 'prosemirror-keymap';
import type { Node as PMNode, Schema } from 'prosemirror-model';
import { Plugin, TextSelection, type Command, type EditorState, type Transaction } from 'prosemirror-state';
import {
  CellSelection,
  TableMap,
  addColumn,
  addRow,
  goToNextCell,
  isInTable,
  moveTableColumn,
  moveTableRow,
  removeColumn,
  removeRow,
  selectionCell,
  type TableRect,
} from 'prosemirror-tables';
import type { EditorView, NodeView } from 'prosemirror-view';

export type TableAxis = 'row' | 'col';
export type CellAlign = 'left' | 'center' | 'right' | null;
export type TableAction =
  | { type: 'insert'; side: 'before' | 'after' }
  | { type: 'move'; dir: -1 | 1 }
  | { type: 'delete' }
  | { type: 'align'; align: CellAlign }
  | { type: 'delete-table' };

/** Where a row/column handle was clicked; the editor shows a menu for it. */
export interface TableMenuRequest {
  tablePos: number;
  axis: TableAxis;
  index: number;
  rect: DOMRect;
}

// ---------- Building tables ----------

export function createTable(schema: Schema, rows: (PMNode[] | null)[][], aligns: CellAlign[] = []): PMNode {
  const { table, table_row, table_cell } = schema.nodes;
  const width = Math.max(...rows.map((r) => r.length));
  return table.create(
    null,
    rows.map((cells) =>
      table_row.create(
        null,
        Array.from({ length: width }, (_, i) => table_cell.create({ align: aligns[i] ?? null }, cells[i] ?? null)),
      ),
    ),
  );
}

export function emptyTable(schema: Schema, cols = 3, rows = 3): PMNode {
  return createTable(schema, Array.from({ length: rows }, () => Array.from({ length: cols }, () => null)));
}

/** Position of the first cell's content in the table at `tablePos`, plus `row`/`col` offsets. */
export function cellContentPos(doc: PMNode, tablePos: number, row: number, col: number): number {
  const table = doc.nodeAt(tablePos)!;
  const map = TableMap.get(table);
  const r = Math.max(0, Math.min(map.height - 1, row));
  const c = Math.max(0, Math.min(map.width - 1, col));
  return tablePos + 1 + map.map[r * map.width + c] + 1;
}

/**
 * Find the cells of a typed `| a | b |` header row, as [from, to) offsets into
 * `text` (trimmed of surrounding spaces). Null when it isn't a pipe row.
 */
export function splitPipeRow(text: string): [number, number][] | null {
  const m = /^\s*\|(.*)\|\s*$/.exec(text);
  if (!m) return null;
  const base = text.indexOf('|') + 1;
  const cells: [number, number][] = [];
  let from = base;
  for (let i = base; i <= base + m[1].length; i++) {
    if (i < base + m[1].length && text[i] !== '|') continue;
    let a = from;
    let b = i;
    while (a < b && /\s/.test(text[a])) a++;
    while (b > a && /\s/.test(text[b - 1])) b--;
    cells.push([a, b]);
    from = i + 1;
  }
  // A delimiter row on its own isn't a header
  if (cells.every(([a, b]) => /^:?-+:?$/.test(text.slice(a, b)))) return null;
  return cells;
}

/** "| Chord | Function |" + Enter turns the line into a table with that header row. */
function pipeRowOnEnter(schema: Schema): Command {
  return (state, dispatch) => {
    const { $cursor } = state.selection as TextSelection;
    const para = $cursor?.parent;
    if (!$cursor || para!.type !== schema.nodes.paragraph || $cursor.parentOffset !== para!.content.size) return false;
    // Offsets in this string line up with positions in the paragraph (leaves count as one char)
    const text = para!.textBetween(0, para!.content.size, undefined, '\ufffc');
    let hasBreak = false;
    para!.forEach((n) => {
      if (n.type === schema.nodes.hard_break) hasBreak = true;
    });
    const cells = hasBreak ? null : splitPipeRow(text);
    if (!cells) return false;
    const header = cells.map(([a, b]) => {
      const nodes: PMNode[] = [];
      para!.content.cut(a, b).forEach((n) => nodes.push(n));
      return nodes;
    });
    const table = createTable(schema, [header, cells.map(() => null)]);
    const $para = state.doc.resolve($cursor.before());
    if (!$para.parent.canReplaceWith($para.index(), $para.index() + 1, table.type)) return false;
    if (dispatch) {
      const start = $cursor.before();
      const tr = state.tr.replaceWith(start, $cursor.after(), table);
      tr.setSelection(TextSelection.create(tr.doc, cellContentPos(tr.doc, start, 1, 0)));
      dispatch(tr.scrollIntoView());
    }
    return true;
  };
}

// ---------- Commands ----------

function tableAt(state: EditorState, tablePos: number) {
  const table = state.doc.nodeAt(tablePos);
  if (!table || table.type.spec.tableRole !== 'table') return null;
  return table;
}

function rectFor(table: PMNode, tablePos: number): TableRect {
  const map = TableMap.get(table);
  return { map, table, tableStart: tablePos + 1, left: 0, top: 0, right: map.width, bottom: map.height };
}

/** The table enclosing the selection: its position and the selected cell's row/column. */
export function selectedTableCell(state: EditorState): { tablePos: number; row: number; col: number } | null {
  if (!isInTable(state)) return null;
  const $cell = selectionCell(state);
  const tableStart = $cell.start(-1);
  const map = TableMap.get($cell.node(-1));
  const rect = map.findCell($cell.pos - tableStart);
  return { tablePos: tableStart - 1, row: rect.top, col: rect.left };
}

/** Insert an empty table at the selection, or after the current table when already in one. */
export function insertTable(schema: Schema): Command {
  return (state, dispatch) => {
    const node = emptyTable(schema);
    const tr = state.tr;
    const inTable = selectedTableCell(state);
    let tablePos: number;
    if (inTable) {
      tablePos = inTable.tablePos + state.doc.nodeAt(inTable.tablePos)!.nodeSize;
      tr.insert(tablePos, node);
    } else {
      const { $from } = state.selection;
      if ($from.parent.type === schema.nodes.paragraph && $from.parent.content.size === 0 && $from.depth >= 1) {
        tablePos = $from.before();
        tr.replaceWith(tablePos, $from.after(), node);
      } else {
        tr.replaceSelectionWith(node);
        // replaceSelectionWith may split the paragraph; find the table we just placed
        tablePos = -1;
        tr.doc.nodesBetween(tr.mapping.map(state.selection.from, -1), tr.mapping.map(state.selection.to), (n, pos) => {
          if (tablePos < 0 && n === node) tablePos = pos;
          return tablePos < 0;
        });
        if (tablePos < 0) return false;
      }
    }
    if (dispatch) {
      tr.setSelection(TextSelection.create(tr.doc, cellContentPos(tr.doc, tablePos, 0, 0)));
      dispatch(tr.scrollIntoView());
    }
    return true;
  };
}

/** Apply a row/column menu action to the table at `tablePos`. */
export function tableAction(tablePos: number, axis: TableAxis, index: number, action: TableAction): Command {
  return (state, dispatch) => {
    const table = tableAt(state, tablePos);
    if (!table) return false;
    const rect = rectFor(table, tablePos);
    const { map } = rect;
    const count = axis === 'row' ? map.height : map.width;
    const tr = state.tr;
    // Cursor target after the change, as [row, col]
    let focus: [number, number] | null = null;

    const deleteTable = () => {
      tr.delete(tablePos, tablePos + table.nodeSize);
      const $after = tr.doc.resolve(Math.min(tablePos, tr.doc.content.size));
      tr.setSelection(TextSelection.near($after, 1));
    };

    switch (action.type) {
      case 'delete-table':
        deleteTable();
        break;
      case 'insert': {
        const at = action.side === 'before' ? index : index + 1;
        if (axis === 'row') {
          addRow(tr, rect, at);
          focus = [at, 0];
        } else {
          addColumn(tr, rect, at);
          focus = [0, at];
        }
        break;
      }
      case 'delete':
        if (count <= 1) deleteTable();
        else {
          if (axis === 'row') removeRow(tr, rect, index);
          else removeColumn(tr, rect, index);
          focus = axis === 'row' ? [Math.min(index, count - 2), 0] : [0, Math.min(index, count - 2)];
        }
        break;
      case 'move': {
        const to = index + action.dir;
        if (to < 0 || to >= count) return false;
        const move = axis === 'row' ? moveTableRow : moveTableColumn;
        // These commands build their own transaction
        return move({ from: index, to, pos: tablePos + 1, select: true })(state, dispatch);
      }
      case 'align': {
        if (axis !== 'col') return false;
        for (let row = 0; row < map.height; row++) {
          const pos = tablePos + 1 + map.map[row * map.width + index];
          const cell = state.doc.nodeAt(pos)!;
          tr.setNodeMarkup(pos, undefined, { ...cell.attrs, align: action.align });
        }
        break;
      }
    }
    if (!dispatch) return true;
    if (focus) tr.setSelection(TextSelection.create(tr.doc, cellContentPos(tr.doc, tablePos, focus[0], focus[1])));
    dispatch(tr.scrollIntoView());
    return true;
  };
}

/** Select a whole row or column (shown while its menu is open). */
export function selectTableLine(tablePos: number, axis: TableAxis, index: number): Command {
  return (state, dispatch) => {
    const table = tableAt(state, tablePos);
    if (!table) return false;
    const map = TableMap.get(table);
    const at = (r: number, c: number) => state.doc.resolve(tablePos + 1 + map.map[r * map.width + c]);
    const sel =
      axis === 'row'
        ? CellSelection.rowSelection(at(index, 0), at(index, map.width - 1))
        : CellSelection.colSelection(at(0, index), at(map.height - 1, index));
    dispatch?.(state.tr.setSelection(sel));
    return true;
  };
}

// ---------- Keyboard ----------

/** Move to the same column in the next/previous row; Enter on the last row adds a row. */
function moveVertically(dir: 1 | -1, addAtEnd: boolean): Command {
  return (state, dispatch) => {
    const at = selectedTableCell(state);
    if (!at) return false;
    const table = state.doc.nodeAt(at.tablePos)!;
    const map = TableMap.get(table);
    const row = at.row + dir;
    if (row < 0) return true;
    if (row >= map.height) {
      if (!addAtEnd) return true;
      if (dispatch) {
        const tr = addRow(state.tr, rectFor(table, at.tablePos), map.height);
        tr.setSelection(TextSelection.create(tr.doc, cellContentPos(tr.doc, at.tablePos, row, at.col)));
        dispatch(tr.scrollIntoView());
      }
      return true;
    }
    dispatch?.(state.tr.setSelection(TextSelection.create(state.doc, cellContentPos(state.doc, at.tablePos, row, at.col))).scrollIntoView());
    return true;
  };
}

/** Tab on the last cell adds a row, like most table editors. */
const nextCellOrAddRow: Command = (state, dispatch) => {
  if (!isInTable(state)) return false;
  if (goToNextCell(1)(state, dispatch)) return true;
  const at = selectedTableCell(state)!;
  const table = state.doc.nodeAt(at.tablePos)!;
  const map = TableMap.get(table);
  if (dispatch) {
    const tr = addRow(state.tr, rectFor(table, at.tablePos), map.height);
    tr.setSelection(TextSelection.create(tr.doc, cellContentPos(tr.doc, at.tablePos, map.height, 0)));
    dispatch(tr.scrollIntoView());
  }
  return true;
};

/** Mod-Enter leaves the table: continue in a paragraph right after it. */
function exitTable(schema: Schema): Command {
  return (state, dispatch) => {
    const at = selectedTableCell(state);
    if (!at) return false;
    if (dispatch) {
      const after = at.tablePos + state.doc.nodeAt(at.tablePos)!.nodeSize;
      const next = state.doc.nodeAt(after);
      const tr = state.tr;
      if (!next || next.type !== schema.nodes.paragraph || next.content.size) tr.insert(after, schema.nodes.paragraph.create());
      tr.setSelection(TextSelection.create(tr.doc, after + 1));
      dispatch(tr.scrollIntoView());
    }
    return true;
  };
}

/** Keys that must win over the general keymap while in a table (and the "| a | b |" shortcut). */
export function tableKeymap(schema: Schema) {
  const inTable = (cmd: Command): Command => (state, dispatch, view) => isInTable(state) && cmd(state, dispatch, view);
  return keymap({
    Tab: nextCellOrAddRow,
    'Shift-Tab': inTable((state, dispatch) => goToNextCell(-1)(state, dispatch) || true),
    Enter: (state, dispatch, view) => pipeRowOnEnter(schema)(state, dispatch, view) || moveVertically(1, true)(state, dispatch, view),
    'Shift-Enter': moveVertically(-1, false),
    'Mod-Enter': exitTable(schema),
  });
}

// ---------- Normalization ----------

/** Keep each column's alignment in step with its header cell (new rows start unaligned). */
export function tableNormalizePlugin() {
  return new Plugin({
    appendTransaction(trs, _old, state) {
      if (!trs.some((tr) => tr.docChanged)) return null;
      let tr: Transaction | null = null;
      state.doc.descendants((node, pos) => {
        if (node.type.spec.tableRole !== 'table') return node.isBlock && !node.isTextblock;
        const header = node.firstChild!;
        let rowPos = pos + 1;
        node.forEach((row, _o, r) => {
          if (r > 0) {
            let cellPos = rowPos + 1;
            row.forEach((cell, _co, c) => {
              const align = c < header.childCount ? header.child(c).attrs.align : null;
              if (cell.attrs.align !== align) (tr ??= state.tr).setNodeMarkup(cellPos, undefined, { ...cell.attrs, align });
              cellPos += cell.nodeSize;
            });
          }
          rowPos += row.nodeSize;
        });
        return false;
      });
      return tr;
    },
  });
}

// ---------- Node view ----------

const PLUS =
  '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 3.5v9M3.5 8h9" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>';
const GRIP_H =
  '<svg viewBox="0 0 16 8" aria-hidden="true"><g fill="currentColor"><circle cx="4" cy="2" r="1.1"/><circle cx="8" cy="2" r="1.1"/><circle cx="12" cy="2" r="1.1"/><circle cx="4" cy="6" r="1.1"/><circle cx="8" cy="6" r="1.1"/><circle cx="12" cy="6" r="1.1"/></g></svg>';
const GRIP_V =
  '<svg viewBox="0 0 8 16" aria-hidden="true"><g fill="currentColor"><circle cx="2" cy="4" r="1.1"/><circle cx="2" cy="8" r="1.1"/><circle cx="2" cy="12" r="1.1"/><circle cx="6" cy="4" r="1.1"/><circle cx="6" cy="8" r="1.1"/><circle cx="6" cy="12" r="1.1"/></g></svg>';

function controlButton(className: string, title: string, svg: string) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = className;
  b.title = title;
  b.tabIndex = -1;
  b.innerHTML = svg;
  b.addEventListener('mousedown', (e) => e.preventDefault());
  return b;
}

/**
 * A table with Obsidian-style controls: hovering a cell shows grips for its row
 * and column (click for a menu), and "+" bars along the right and bottom edges
 * add a column or row.
 */
export class TableNodeView implements NodeView {
  dom: HTMLElement;
  contentDOM: HTMLElement;
  private scroll: HTMLElement;
  private table: HTMLTableElement;
  private rowGrip: HTMLButtonElement;
  private colGrip: HTMLButtonElement;
  private hover: { row: number; col: number } | null = null;

  constructor(
    private node: PMNode,
    private view: EditorView,
    private getPos: () => number | undefined,
    private onMenu: (req: TableMenuRequest) => void,
  ) {
    this.dom = document.createElement('div');
    this.dom.className = 'mn-table';
    this.scroll = document.createElement('div');
    this.scroll.className = 'mn-table-scroll';
    this.table = document.createElement('table');
    this.contentDOM = document.createElement('tbody');
    this.table.append(this.contentDOM);
    this.scroll.append(this.table);

    const controls = document.createElement('div');
    controls.className = 'mn-table-controls';
    controls.contentEditable = 'false';
    const addCol = controlButton('mn-table-add mn-table-add-col', 'Add column', PLUS);
    const addRowBtn = controlButton('mn-table-add mn-table-add-row', 'Add row', PLUS);
    this.rowGrip = controlButton('mn-table-grip mn-table-grip-row', 'Row options', GRIP_V);
    this.colGrip = controlButton('mn-table-grip mn-table-grip-col', 'Column options', GRIP_H);
    addCol.addEventListener('click', () => this.append('col'));
    addRowBtn.addEventListener('click', () => this.append('row'));
    this.rowGrip.addEventListener('click', () => this.openMenu('row'));
    this.colGrip.addEventListener('click', () => this.openMenu('col'));
    controls.append(addCol, addRowBtn, this.rowGrip, this.colGrip);

    this.dom.append(this.scroll, controls);
    this.dom.addEventListener('mouseover', (e) => this.onHover(e));
    this.dom.addEventListener('mouseleave', () => this.setHover(null));
    this.scroll.addEventListener('scroll', () => this.setHover(null));
  }

  private onHover(e: MouseEvent) {
    const target = e.target as Element;
    if (target.closest('.mn-table-controls')) return;
    const td = target.closest('td');
    if (!td || !this.contentDOM.contains(td)) return;
    const tr = td.parentElement as HTMLTableRowElement;
    this.setHover({ row: tr.rowIndex, col: (td as HTMLTableCellElement).cellIndex }, td as HTMLElement);
  }

  private setHover(hover: { row: number; col: number } | null, td?: HTMLElement) {
    this.hover = hover;
    this.dom.classList.toggle('is-hovering-cell', !!hover);
    if (!hover || !td) return;
    // Grips straddle the table's left/top edges, centred on the hovered row/column
    const box = this.dom.getBoundingClientRect();
    const cell = td.getBoundingClientRect();
    const row = (td.parentElement as HTMLElement).getBoundingClientRect();
    const tableBox = this.table.getBoundingClientRect();
    this.rowGrip.style.top = `${row.top - box.top + row.height / 2}px`;
    this.rowGrip.style.left = `${tableBox.left - box.left}px`;
    this.colGrip.style.left = `${cell.left - box.left + cell.width / 2}px`;
    this.colGrip.style.top = `${tableBox.top - box.top}px`;
  }

  private append(axis: TableAxis) {
    const pos = this.getPos();
    if (pos === undefined) return;
    const map = TableMap.get(this.node);
    const last = axis === 'row' ? map.height - 1 : map.width - 1;
    tableAction(pos, axis, last, { type: 'insert', side: 'after' })(this.view.state, this.view.dispatch);
    this.view.focus();
  }

  private openMenu(axis: TableAxis) {
    const pos = this.getPos();
    if (pos === undefined || !this.hover) return;
    const index = axis === 'row' ? this.hover.row : this.hover.col;
    selectTableLine(pos, axis, index)(this.view.state, this.view.dispatch);
    this.view.focus();
    this.onMenu({ tablePos: pos, axis, index, rect: (axis === 'row' ? this.rowGrip : this.colGrip).getBoundingClientRect() });
  }

  update(node: PMNode) {
    if (node.type !== this.node.type) return false;
    this.node = node;
    this.setHover(null);
    return true;
  }

  stopEvent(event: Event) {
    return !!(event.target as Element | null)?.closest?.('.mn-table-controls');
  }

  ignoreMutation(m: MutationRecord | { type: 'selection'; target: Node }) {
    if (m.type === 'selection') return false;
    return !this.contentDOM.contains(m.target);
  }
}
