import { setBlockType, toggleMark, wrapIn, lift } from 'prosemirror-commands';
import { dropCursor } from 'prosemirror-dropcursor';
import { gapCursor } from 'prosemirror-gapcursor';
import { history } from 'prosemirror-history';
import { Fragment, Slice, type Node as PMNode, type MarkType } from 'prosemirror-model';
import { wrapInList } from 'prosemirror-schema-list';
import { EditorState, NodeSelection, TextSelection, type Transaction } from 'prosemirror-state';
import { tableEditing } from 'prosemirror-tables';
import { EditorView } from 'prosemirror-view';
import type { WidgetContext, WidgetValues } from '../core/widgets';
import { getWidget } from '../core/widgets';
import { buildInputRules } from './inputrules';
import { buildKeymaps } from './keymap';
import { markdownParser, parseMarkdown, serializeMarkdown } from './markdown';
import { CodeBlockView, ImageView, WidgetView } from './nodeviews';
import {
  dismissSlash,
  highlightPlugin,
  placeholderPlugin,
  slashKey,
  slashPlugin,
  trailingParagraphPlugin,
  type SlashHandlers,
  type SlashState,
} from './plugins';
import { schema } from './schema';
import {
  TableNodeView,
  insertTable,
  selectedTableCell,
  tableAction,
  tableKeymap,
  tableNormalizePlugin,
  type TableAction,
  type TableAxis,
  type TableMenuRequest,
} from './tables';

export { schema, parseMarkdown, serializeMarkdown };
export type { SlashState, TableAction, TableAxis, TableMenuRequest };

export interface EditorCallbacks {
  /** The document changed (call getMarkdown() to serialize; it's lazy for speed) */
  onChange?: () => void;
  /** Any state change (selection, slash menu, ...) */
  onUpdate?: (view: EditorView) => void;
  onEditWidget?: (pos: number) => void;
  onLink?: () => void;
  /** Save a pasted/dropped image file; return the markdown src to use */
  saveImage?: (file: File) => Promise<string | null>;
  resolveImage?: (src: string) => string;
  /** A table row/column handle was clicked */
  onTableMenu?: (req: TableMenuRequest) => void;
}

export interface EditorHandle {
  view: EditorView;
  setContent(body: string): void;
  getMarkdown(): string;
  focus(): void;
  destroy(): void;
  slash: { current: SlashHandlers | null };
  getSlash(): SlashState | undefined;
  dismissSlash(): void;
  /** Delete the "/query" text of an active slash command */
  consumeSlash(): void;
  insertWidget(name: string, values: WidgetValues): void;
  updateWidget(pos: number, values: WidgetValues): void;
  deleteWidget(pos: number): void;
  widgetAt(pos: number): { name: string; values: WidgetValues; inline: boolean } | null;
  toggleMark(name: 'strong' | 'em' | 'code' | 'strike'): void;
  setBlock(type: 'paragraph' | 'heading' | 'code_block', level?: number): void;
  toggleList(type: 'bullet_list' | 'ordered_list'): void;
  toggleBlockquote(): void;
  setLink(href: string | null): void;
  getLink(): string | null;
  insertImage(src: string, alt?: string): void;
  insertTable(): void;
  tableAction(tablePos: number, axis: TableAxis, index: number, action: TableAction): void;
  /** Whether the selection is inside a table (only inline content goes there) */
  inTable(): boolean;
  activeMarks(): Set<string>;
  wordCount(): number;
}

function createState(body: string, plugins: ReturnType<typeof buildPlugins>) {
  return EditorState.create({ doc: parseMarkdown(body), plugins });
}

function buildPlugins(cb: EditorCallbacks, slash: { current: SlashHandlers | null }) {
  return [
    // The slash menu must see Enter/arrows before the keymaps do
    slashPlugin(slash),
    buildInputRules(schema),
    // Tab/Enter in a table move between cells instead of indenting/splitting
    tableKeymap(schema),
    ...buildKeymaps(schema, { onLink: cb.onLink }),
    history(),
    dropCursor({ color: 'var(--mn-accent)', width: 2 }),
    gapCursor(),
    placeholderPlugin('Start writing…', 'Type / to add a musical widget'),
    highlightPlugin(),
    trailingParagraphPlugin(schema),
    tableNormalizePlugin(),
    // Last, so the gap cursor gets first go at arrow keys
    tableEditing(),
  ];
}

function markActive(state: EditorState, type: MarkType) {
  const { from, $from, to, empty } = state.selection;
  if (empty) return !!type.isInSet(state.storedMarks || $from.marks());
  return state.doc.rangeHasMark(from, to, type);
}

export function createEditor(mount: HTMLElement, body: string, ctx: WidgetContext, cb: EditorCallbacks = {}): EditorHandle {
  const slash: { current: SlashHandlers | null } = { current: null };
  const plugins = buildPlugins(cb, slash);
  const nodeViewOpts = {
    ctx,
    onEditWidget: (pos: number) => cb.onEditWidget?.(pos),
    resolveImage: (src: string) => cb.resolveImage?.(src) ?? src,
  };

  const handleFiles = (view: EditorView, files: File[], pos?: number) => {
    const images = files.filter((f) => f.type.startsWith('image/'));
    if (!images.length || !cb.saveImage) return false;
    void (async () => {
      for (const file of images) {
        const src = await cb.saveImage!(file);
        if (!src) continue;
        const node = schema.nodes.image.create({ src, alt: file.name.replace(/\.[^.]+$/, '') });
        const tr = view.state.tr;
        if (pos !== undefined) tr.insert(pos, node);
        else tr.replaceSelectionWith(node);
        view.dispatch(tr.scrollIntoView());
      }
    })();
    return true;
  };

  const view: EditorView = new EditorView(mount, {
    state: createState(body, plugins),
    attributes: { class: 'mn-doc mn-editor', spellcheck: 'true' },
    nodeViews: {
      widget_block: (node, v, getPos) => new WidgetView(node, v, getPos, nodeViewOpts),
      widget_inline: (node, v, getPos) => new WidgetView(node, v, getPos, nodeViewOpts),
      image: (node) => new ImageView(node, nodeViewOpts),
      code_block: (node, v, getPos) => new CodeBlockView(node, v, getPos),
      table: (node, v, getPos) => new TableNodeView(node, v, getPos, (req) => cb.onTableMenu?.(req)),
    },
    dispatchTransaction(tr: Transaction) {
      const next = view.state.apply(tr);
      view.updateState(next);
      if (tr.docChanged) cb.onChange?.();
      cb.onUpdate?.(view);
    },
    // Paste markdown as rich content (so widget syntax becomes widgets)
    clipboardTextParser(text, $context, plain) {
      if (plain || $context.parent.type.spec.code) {
        return new Slice(Fragment.from(schema.text(text)), 0, 0);
      }
      const doc = markdownParser.parse(text);
      if (!doc) return Slice.empty;
      // A single paragraph pastes inline
      if (doc.childCount === 1 && doc.firstChild!.type === schema.nodes.paragraph) {
        return new Slice(doc.firstChild!.content, 0, 0);
      }
      return new Slice(doc.content, 1, 1);
    },
    clipboardTextSerializer(slice) {
      const doc = schema.topNodeType.createAndFill(undefined, slice.content.firstChild?.isInline ? schema.nodes.paragraph.create(null, slice.content) : slice.content);
      return doc ? serializeMarkdown(doc).trimEnd() : slice.content.textBetween(0, slice.content.size, '\n\n');
    },
    handlePaste(v, event) {
      const files = Array.from(event.clipboardData?.files ?? []);
      return files.length ? handleFiles(v, files) : false;
    },
    handleDrop(v, event) {
      const files = Array.from((event as DragEvent).dataTransfer?.files ?? []);
      if (!files.length) return false;
      const pos = v.posAtCoords({ left: (event as DragEvent).clientX, top: (event as DragEvent).clientY })?.pos;
      event.preventDefault();
      return handleFiles(v, files, pos);
    },
    handleClick(_v, _pos, event) {
      // Cmd/Ctrl-click opens links
      const a = (event.target as HTMLElement).closest('a');
      if (a && (event.metaKey || event.ctrlKey)) {
        window.open(a.getAttribute('href') ?? '', '_blank');
        return true;
      }
      return false;
    },
  });

  const run = (cmd: (s: EditorState, d?: (tr: Transaction) => void) => boolean) => {
    cmd(view.state, view.dispatch);
    view.focus();
  };

  const handle: EditorHandle = {
    view,
    slash,
    setContent(next: string) {
      view.updateState(createState(next, plugins));
      cb.onUpdate?.(view);
    },
    getMarkdown: () => serializeMarkdown(view.state.doc),
    focus: () => view.focus(),
    destroy: () => view.destroy(),
    getSlash: () => slashKey.getState(view.state),
    dismissSlash: () => dismissSlash(view),
    consumeSlash() {
      const st = slashKey.getState(view.state);
      if (!st?.active) return;
      view.dispatch(view.state.tr.delete(st.from, st.to));
    },
    insertWidget(name, values) {
      const def = getWidget(name);
      if (!def) return;
      const inline = def.kind === 'inline';
      const node = (inline ? schema.nodes.widget_inline : schema.nodes.widget_block).create({ name, values });
      const { state } = view;
      const tr = state.tr;
      if (inline) {
        tr.replaceSelectionWith(node, false);
      } else {
        const { $from } = state.selection;
        const parent = $from.parent;
        const cell = selectedTableCell(state);
        if (cell) {
          // Block widgets can't live in a cell; put it right after the table
          const after = cell.tablePos + state.doc.nodeAt(cell.tablePos)!.nodeSize;
          tr.insert(after, node);
          tr.setSelection(NodeSelection.create(tr.doc, after));
        } else if (parent.type === schema.nodes.paragraph && parent.content.size === 0 && $from.depth >= 1) {
          tr.replaceWith($from.before(), $from.after(), node);
          tr.setSelection(NodeSelection.create(tr.doc, $from.before()));
        } else {
          tr.replaceSelectionWith(node);
        }
      }
      view.dispatch(tr.scrollIntoView());
      // Put the cursor after the widget so typing continues naturally
      const sel = view.state.selection;
      if (sel instanceof NodeSelection) {
        const after = sel.to;
        const $after = view.state.doc.resolve(after);
        const next = $after.nodeAfter;
        if (next && next.isTextblock) view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, after + 1)));
      }
      view.focus();
    },
    updateWidget(pos, values) {
      const node = view.state.doc.nodeAt(pos);
      if (!node || !node.type.name.startsWith('widget_')) return;
      const tr = view.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, values });
      tr.setSelection(NodeSelection.create(tr.doc, pos));
      view.dispatch(tr);
    },
    deleteWidget(pos) {
      const node = view.state.doc.nodeAt(pos);
      if (!node) return;
      view.dispatch(view.state.tr.delete(pos, pos + node.nodeSize));
      view.focus();
    },
    widgetAt(pos) {
      const node: PMNode | null = view.state.doc.nodeAt(pos);
      if (!node || !node.type.name.startsWith('widget_')) return null;
      return { name: node.attrs.name, values: node.attrs.values, inline: node.type.name === 'widget_inline' };
    },
    toggleMark(name) {
      run(toggleMark(schema.marks[name]));
    },
    setBlock(type, level) {
      const { $from } = view.state.selection;
      const nodeType = schema.nodes[type];
      if ($from.parent.type === nodeType && (type !== 'heading' || $from.parent.attrs.level === level)) {
        run(setBlockType(schema.nodes.paragraph));
      } else {
        run(setBlockType(nodeType, type === 'heading' ? { level } : undefined));
      }
    },
    toggleList(type) {
      const { $from } = view.state.selection;
      for (let d = $from.depth; d > 0; d--) {
        if ($from.node(d).type === schema.nodes[type]) {
          run(lift);
          return;
        }
      }
      run(wrapInList(schema.nodes[type]));
    },
    toggleBlockquote() {
      const { $from } = view.state.selection;
      for (let d = $from.depth; d > 0; d--) {
        if ($from.node(d).type === schema.nodes.blockquote) {
          run(lift);
          return;
        }
      }
      run(wrapIn(schema.nodes.blockquote));
    },
    getLink() {
      const { $from, from, to } = view.state.selection;
      const type = schema.marks.link;
      let href: string | null = null;
      view.state.doc.nodesBetween(from, Math.max(to, from + 1), (n) => {
        const m = type.isInSet(n.marks);
        if (m) href = m.attrs.href;
      });
      if (!href) {
        const m = type.isInSet($from.marks());
        if (m) href = m.attrs.href;
      }
      return href;
    },
    setLink(href) {
      const { state } = view;
      const type = schema.marks.link;
      let { from, to } = state.selection;
      if (state.selection.empty) {
        // Expand to the link (or word) around the cursor
        const $pos = state.selection.$from;
        const parent = $pos.parent;
        const start = $pos.start();
        let s = $pos.parentOffset;
        let e = $pos.parentOffset;
        const text = parent.textBetween(0, parent.content.size, undefined, (n) =>
          n.type.name === 'hard_break' ? '\n' : '￼',
        );
        while (s > 0 && /\S/.test(text[s - 1])) s--;
        while (e < text.length && /\S/.test(text[e])) e++;
        from = start + s;
        to = start + e;
      }
      const tr = state.tr.removeMark(from, to, type);
      if (href) {
        if (from === to) {
          tr.insertText(href, from);
          to = from + href.length;
        }
        tr.addMark(from, to, type.create({ href }));
      }
      view.dispatch(tr);
      view.focus();
    },
    insertImage(src, alt) {
      view.dispatch(view.state.tr.replaceSelectionWith(schema.nodes.image.create({ src, alt: alt ?? null })).scrollIntoView());
      view.focus();
    },
    insertTable() {
      run(insertTable(schema));
    },
    tableAction(tablePos, axis, index, action) {
      run(tableAction(tablePos, axis, index, action));
    },
    inTable: () => !!selectedTableCell(view.state),
    activeMarks() {
      const out = new Set<string>();
      for (const name of ['strong', 'em', 'code', 'strike', 'link']) if (markActive(view.state, schema.marks[name])) out.add(name);
      return out;
    },
    wordCount() {
      const text = view.state.doc.textBetween(0, view.state.doc.content.size, ' ', ' ');
      return (text.match(/\S+/g) ?? []).length;
    },
  };
  return handle;
}
