import type { Node as PMNode, Schema } from 'prosemirror-model';
import { NodeSelection, Plugin, PluginKey, type EditorState } from 'prosemirror-state';
import { Decoration, DecorationSet, type EditorView } from 'prosemirror-view';
import { highlightRanges, type HighlightRange } from '../core/publish/highlight';

/** Placeholder text for an empty document, and a hint on the focused empty line. */
export function placeholderPlugin(text: string, hint: string) {
  return new Plugin({
    props: {
      decorations(state) {
        const { doc, selection } = state;
        const decos: Decoration[] = [];
        if (doc.childCount === 1 && doc.firstChild!.isTextblock && doc.firstChild!.content.size === 0) {
          decos.push(Decoration.node(0, doc.firstChild!.nodeSize, { class: 'is-placeholder', 'data-placeholder': text }));
        } else if (selection.empty) {
          const $from = selection.$from;
          const parent = $from.parent;
          if (parent.type.name === 'paragraph' && parent.content.size === 0 && $from.depth <= 1) {
            decos.push(Decoration.node($from.before(), $from.after(), { class: 'is-hint', 'data-placeholder': hint }));
          }
        }
        return decos.length ? DecorationSet.create(doc, decos) : null;
      },
    },
  });
}

/** Syntax highlighting for code blocks, via lowlight. */
export function highlightPlugin() {
  const cache = new WeakMap<PMNode, HighlightRange[]>();
  const build = (doc: PMNode) => {
    const decos: Decoration[] = [];
    doc.descendants((node, pos) => {
      if (node.type.name !== 'code_block') return true;
      let local = cache.get(node);
      if (!local) {
        local = highlightRanges(node.textContent, node.attrs.params);
        cache.set(node, local);
      }
      for (const r of local) decos.push(Decoration.inline(pos + 1 + r.from, pos + 1 + r.to, { class: r.className }));
      return false;
    });
    return DecorationSet.create(doc, decos);
  };
  return new Plugin<DecorationSet>({
    state: {
      init: (_, state) => build(state.doc),
      apply: (tr, old) => (tr.docChanged ? build(tr.doc) : old),
    },
    props: {
      decorations(state) {
        return this.getState(state);
      },
    },
  });
}

/**
 * Widgets can't show the native text selection (they're user-select: none),
 * so mark the ones that fall inside a text range selection.
 */
export function widgetSelectionPlugin() {
  return new Plugin({
    props: {
      decorations(state) {
        const { selection, doc } = state;
        if (selection.empty || selection instanceof NodeSelection) return null;
        const decos: Decoration[] = [];
        for (const { $from, $to } of selection.ranges) {
          doc.nodesBetween($from.pos, $to.pos, (node, pos) => {
            if (node.type.name === 'widget_inline' || node.type.name === 'widget_block') {
              decos.push(Decoration.node(pos, pos + node.nodeSize, { class: 'is-in-selection' }));
              return false;
            }
            return true;
          });
        }
        return decos.length ? DecorationSet.create(doc, decos) : null;
      },
    },
  });
}

/** Keep an empty paragraph at the end so you can always type after a widget. */
export function trailingParagraphPlugin(schema: Schema) {
  return new Plugin({
    appendTransaction(_trs, _old, state) {
      const last = state.doc.lastChild;
      if (last && last.type === schema.nodes.paragraph) return null;
      return state.tr.insert(state.doc.content.size, schema.nodes.paragraph.create());
    },
  });
}

// ---------- Slash menu ----------

export interface SlashState {
  active: boolean;
  /** Position of the "/" */
  from: number;
  /** Cursor position */
  to: number;
  query: string;
  /** "/" position the user dismissed with Escape */
  dismissedAt: number | null;
}

export const slashKey = new PluginKey<SlashState>('slash');

const inactive: SlashState = { active: false, from: 0, to: 0, query: '', dismissedAt: null };

export interface SlashHandlers {
  /** Return true if the key was handled by the menu */
  onKey(key: string): boolean;
}

export function slashPlugin(handlers: { current: SlashHandlers | null }) {
  return new Plugin<SlashState>({
    key: slashKey,
    state: {
      init: () => inactive,
      apply(tr, prev, _old, state: EditorState): SlashState {
        const meta = tr.getMeta(slashKey) as { dismiss?: boolean } | undefined;
        const sel = state.selection;
        let dismissedAt = prev.dismissedAt;
        if (meta?.dismiss && prev.active) dismissedAt = prev.from;
        if (!sel.empty) return { ...inactive, dismissedAt: null };
        const $from = sel.$from;
        if (!$from.parent.isTextblock || $from.parent.type.spec.code) return { ...inactive, dismissedAt: null };
        // Hard breaks (Shift+Enter) read as newlines so "/" right after one still opens the menu
        const before = $from.parent.textBetween(Math.max(0, $from.parentOffset - 30), $from.parentOffset, undefined, (n) =>
          n.type.name === 'hard_break' ? '\n' : '￼',
        );
        // The query may contain spaces ("/chord pro"); the menu hides once nothing matches.
        const m = /(?:^|\s)\/((?:[a-z]+(?: [a-z]+)* ?)?)$/i.exec(before);
        if (!m) return { ...inactive, dismissedAt: null };
        const from = $from.pos - m[1].length - 1;
        if (dismissedAt === from) return { ...inactive, dismissedAt };
        return { active: true, from, to: $from.pos, query: m[1], dismissedAt: null };
      },
    },
    props: {
      handleKeyDown(view, event) {
        const st = slashKey.getState(view.state);
        if (!st?.active) return false;
        if (event.key === 'Escape') {
          view.dispatch(view.state.tr.setMeta(slashKey, { dismiss: true }));
          return true;
        }
        if (['ArrowUp', 'ArrowDown', 'Enter', 'Tab'].includes(event.key)) {
          return handlers.current?.onKey(event.key) ?? false;
        }
        return false;
      },
    },
  });
}

export function dismissSlash(view: EditorView) {
  view.dispatch(view.state.tr.setMeta(slashKey, { dismiss: true }));
}
