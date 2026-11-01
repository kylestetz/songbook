import { baseKeymap, chainCommands, exitCode, setBlockType, toggleMark } from 'prosemirror-commands';
import { redo, undo } from 'prosemirror-history';
import { undoInputRule } from 'prosemirror-inputrules';
import { keymap } from 'prosemirror-keymap';
import type { Schema } from 'prosemirror-model';
import { liftListItem, sinkListItem, splitListItem } from 'prosemirror-schema-list';
import { TextSelection, type Command } from 'prosemirror-state';

const mac = typeof navigator !== 'undefined' ? /Mac|iP(hone|[oa]d)/.test(navigator.platform) : false;

/** Backspace at the start of a heading or code block turns it back into a paragraph. */
function resetBlockOnBackspace(schema: Schema): Command {
  return (state, dispatch) => {
    const { $cursor } = state.selection as TextSelection;
    if (!$cursor || $cursor.parentOffset > 0) return false;
    const parent = $cursor.parent;
    if (parent.type === schema.nodes.heading || (parent.type === schema.nodes.code_block && parent.content.size === 0)) {
      return setBlockType(schema.nodes.paragraph)(state, dispatch);
    }
    return false;
  };
}

/** "```lang" + Enter starts a code block. */
function fenceOnEnter(schema: Schema): Command {
  return (state, dispatch) => {
    const { $cursor } = state.selection as TextSelection;
    if (!$cursor || $cursor.parent.type !== schema.nodes.paragraph) return false;
    const m = /^```([\w+#-]*)$/.exec($cursor.parent.textContent);
    if (!m || $cursor.parentOffset !== $cursor.parent.content.size) return false;
    if (dispatch) {
      const start = $cursor.before();
      const tr = state.tr.replaceWith(start, $cursor.after(), schema.nodes.code_block.create({ params: m[1] }));
      tr.setSelection(TextSelection.create(tr.doc, start + 1));
      dispatch(tr.scrollIntoView());
    }
    return true;
  };
}

/** Three Enters at the end of a code block (two trailing blank lines) exit it. */
function exitCodeOnTripleEnter(schema: Schema): Command {
  return (state, dispatch) => {
    const { $cursor } = state.selection as TextSelection;
    if (!$cursor || $cursor.parent.type !== schema.nodes.code_block) return false;
    const text = $cursor.parent.textContent;
    if ($cursor.parentOffset !== text.length || !text.endsWith('\n\n')) return false;
    if (dispatch) {
      const tr = state.tr.delete($cursor.pos - 2, $cursor.pos);
      const after = tr.mapping.map($cursor.after());
      tr.insert(after, schema.nodes.paragraph.create());
      tr.setSelection(TextSelection.create(tr.doc, after + 1));
      dispatch(tr.scrollIntoView());
    }
    return true;
  };
}

export function buildKeymaps(schema: Schema, opts: { onLink?: () => void } = {}) {
  const m = schema.marks;
  const n = schema.nodes;
  const keys: Record<string, Command> = {
    'Mod-z': chainCommands(undoInputRule, undo),
    'Shift-Mod-z': redo,
    Backspace: chainCommands(undoInputRule, resetBlockOnBackspace(schema)),
    'Mod-b': toggleMark(m.strong),
    'Mod-i': toggleMark(m.em),
    'Mod-e': toggleMark(m.code),
    'Mod-`': toggleMark(m.code),
    'Shift-Mod-x': toggleMark(m.strike),
    'Shift-Enter': chainCommands(exitCode, (state, dispatch) => {
      dispatch?.(state.tr.replaceSelectionWith(n.hard_break.create()).scrollIntoView());
      return true;
    }),
    'Mod-Enter': exitCode,
    Enter: chainCommands(fenceOnEnter(schema), exitCodeOnTripleEnter(schema), splitListItem(n.list_item)),
    'Mod-[': liftListItem(n.list_item),
    'Mod-]': sinkListItem(n.list_item),
    Tab: sinkListItem(n.list_item),
    'Shift-Tab': liftListItem(n.list_item),
    'Mod-Alt-0': setBlockType(n.paragraph),
    'Shift-Ctrl-0': setBlockType(n.paragraph),
  };
  if (!mac) keys['Mod-y'] = redo;
  for (let i = 1; i <= 6; i++) {
    keys[`Mod-Alt-${i}`] = setBlockType(n.heading, { level: i });
    keys[`Shift-Ctrl-${i}`] = setBlockType(n.heading, { level: i });
  }
  if (opts.onLink) {
    keys['Mod-k'] = () => {
      opts.onLink!();
      return true;
    };
  }
  return [keymap(keys), keymap(baseKeymap)];
}
