import { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react';
import { NodeSelection, TextSelection } from 'prosemirror-state';
import { createEditor, type EditorHandle } from '../../editor';
import { getWidget, type WidgetContext, type WidgetValues } from '../../core/widgets';
import { api } from '../api';
import { WidgetMenu } from './WidgetMenu';
import { filterWidgets } from './widgetSearch';
import { WidgetModal, WidgetPopover } from './WidgetEditor';
import { LinkPopover, SelectionToolbar } from './SelectionToolbar';
import { IconPencil, IconTrash } from './icons';

export interface EditorPaneHandle {
  setContent(body: string): void;
  getMarkdown(): string;
  focus(): void;
  openInsertMenu(anchor?: DOMRect): void;
  openWidget(name: string): void;
  format(cmd: string): void;
  wordCount(): number;
}

interface Props {
  ctx: WidgetContext;
  noteId: string | null;
  onChange(): void;
  onWordCount(n: number): void;
}

type Modal = { mode: 'insert'; name: string; values: WidgetValues } | { mode: 'edit'; pos: number; name: string; values: WidgetValues };

function rectFromCoords(view: EditorHandle['view'], from: number, to: number): DOMRect {
  const a = view.coordsAtPos(from);
  const b = view.coordsAtPos(to);
  const left = Math.min(a.left, b.left);
  const right = Math.max(a.right, b.right);
  return new DOMRect(left, Math.min(a.top, b.top), right - left, Math.max(a.bottom, b.bottom) - Math.min(a.top, b.top));
}

export const EditorPane = forwardRef<EditorPaneHandle, Props>(function EditorPane({ ctx, noteId, onChange, onWordCount }, ref) {
  const mountRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<EditorHandle | null>(null);
  const [, setVersion] = useState(0);
  const [modal, setModal] = useState<Modal | null>(null);
  const [popover, setPopover] = useState<{ pos: number; name: string; values: WidgetValues; rect: DOMRect } | null>(null);
  const [menu, setMenu] = useState<{ anchor: DOMRect; query: string } | null>(null);
  const [menuActive, setMenuActive] = useState(0);
  const [link, setLink] = useState<{ initial: string; rect: DOMRect } | null>(null);
  const [mouseDown, setMouseDown] = useState(false);
  const raf = useRef(0);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const wordRef = useRef(onWordCount);
  wordRef.current = onWordCount;
  const noteIdRef = useRef(noteId);
  noteIdRef.current = noteId;

  const openLink = useCallback(() => {
    const ed = editorRef.current;
    if (!ed) return;
    const { from, to } = ed.view.state.selection;
    setLink({ initial: ed.getLink() ?? '', rect: rectFromCoords(ed.view, from, to) });
  }, []);

  // Create the editor once
  useLayoutEffect(() => {
    const ed = createEditor(mountRef.current!, '', ctx, {
      onChange: () => {
        onChangeRef.current();
      },
      onUpdate: () => {
        cancelAnimationFrame(raf.current);
        raf.current = requestAnimationFrame(() => setVersion((v) => v + 1));
      },
      onEditWidget: (pos) => {
        const w = ed.widgetAt(pos);
        if (!w) return;
        if (w.inline) {
          const dom = ed.view.nodeDOM(pos) as HTMLElement | null;
          const rect = dom?.getBoundingClientRect() ?? rectFromCoords(ed.view, pos, pos + 1);
          setPopover({ pos, name: w.name, values: w.values, rect });
        } else {
          setModal({ mode: 'edit', pos, name: w.name, values: w.values });
        }
      },
      onLink: openLink,
      saveImage: async (file) => api.saveAsset(noteIdRef.current ?? '', file.name || 'image.png', await file.arrayBuffer()),
      resolveImage: (src) => api.assetUrl(src),
    });
    editorRef.current = ed;
    return () => ed.destroy();
  }, []); // created once; callbacks read the latest props through refs

  useEffect(() => {
    const down = () => setMouseDown(true);
    const up = () => setMouseDown(false);
    const el = mountRef.current!;
    el.addEventListener('mousedown', down);
    window.addEventListener('mouseup', up);
    return () => {
      el.removeEventListener('mousedown', down);
      window.removeEventListener('mouseup', up);
    };
  }, []);

  const ed = editorRef.current;
  const slash = ed?.getSlash();
  const slashItems = slash?.active ? filterWidgets(slash.query) : [];
  const menuItems = menu ? filterWidgets(menu.query) : [];

  const startInsert = useCallback((name: string) => {
    const def = getWidget(name);
    if (!def) return;
    setMenu(null);
    setModal({ mode: 'insert', name, values: { ...def.defaults } });
  }, []);

  const pickFromSlash = useCallback(
    (name: string) => {
      editorRef.current?.consumeSlash();
      startInsert(name);
    },
    [startInsert],
  );

  // Keyboard handling for the slash menu (called from the ProseMirror plugin)
  const slashItemsRef = useRef(slashItems);
  slashItemsRef.current = slashItems;
  const menuActiveRef = useRef(menuActive);
  menuActiveRef.current = menuActive;
  useEffect(() => {
    if (!ed) return;
    ed.slash.current = {
      onKey(key) {
        const items = slashItemsRef.current;
        if (!items.length) return false;
        if (key === 'ArrowDown') setMenuActive((i) => (i + 1) % items.length);
        else if (key === 'ArrowUp') setMenuActive((i) => (i - 1 + items.length) % items.length);
        else if (key === 'Enter' || key === 'Tab') pickFromSlash(items[Math.min(menuActiveRef.current, items.length - 1)].name);
        return true;
      },
    };
  }, [ed, pickFromSlash]);

  useEffect(() => setMenuActive(0), [slash?.query, slash?.active, menu?.query]);

  useEffect(() => {
    if (ed) wordRef.current(ed.wordCount());
  });

  useImperativeHandle(ref, () => ({
    setContent(body) {
      setModal(null);
      setPopover(null);
      setMenu(null);
      editorRef.current?.setContent(body);
      const view = editorRef.current?.view;
      if (view) {
        view.dom.parentElement?.parentElement?.scrollTo?.({ top: 0 });
      }
    },
    getMarkdown: () => editorRef.current?.getMarkdown() ?? '',
    focus: () => editorRef.current?.focus(),
    openInsertMenu(anchor) {
      const ed = editorRef.current;
      if (!ed) return;
      const { from } = ed.view.state.selection;
      const rect = anchor ?? rectFromCoords(ed.view, from, from);
      setMenu({ anchor: rect, query: '' });
    },
    openWidget: (name) => startInsert(name),
    format(cmd) {
      const ed = editorRef.current;
      if (!ed) return;
      if (['strong', 'em', 'code', 'strike'].includes(cmd)) ed.toggleMark(cmd as 'strong');
      else if (cmd === 'link') openLink();
      else if (/^h[1-6]$/.test(cmd)) ed.setBlock('heading', +cmd[1]);
      else if (cmd === 'paragraph') ed.setBlock('paragraph');
      else if (cmd === 'code_block') ed.setBlock('code_block');
      else if (cmd === 'bullet_list' || cmd === 'ordered_list') ed.toggleList(cmd);
      else if (cmd === 'blockquote') ed.toggleBlockquote();
    },
    wordCount: () => editorRef.current?.wordCount() ?? 0,
  }));

  // Close the insert menu on outside click / escape
  useEffect(() => {
    if (!menu) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenu(null);
      else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setMenuActive((i) => (i + 1) % Math.max(1, menuItems.length));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setMenuActive((i) => (i - 1 + menuItems.length) % Math.max(1, menuItems.length));
      } else if (e.key === 'Enter' && menuItems[menuActive]) {
        e.preventDefault();
        startInsert(menuItems[menuActive].name);
      }
    };
    const onDown = (e: MouseEvent) => {
      const t = e.target as Element;
      if (!t.closest('.widget-menu') && !t.closest('[data-insert-toggle]')) setMenu(null);
    };
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('mousedown', onDown, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('mousedown', onDown, true);
    };
  }, [menu, menuItems, menuActive, startInsert]);

  // ----- Floating UI derived from editor state -----
  let slashStyle: React.CSSProperties | undefined;
  if (ed && slash?.active) {
    const c = ed.view.coordsAtPos(slash.from);
    const top = c.bottom + 6 + 360 > window.innerHeight ? Math.max(8, c.top - 6 - 360) : c.bottom + 6;
    slashStyle = { left: Math.min(c.left, window.innerWidth - 340), top };
  }

  const sel = ed?.view.state.selection;
  let selectionRect: DOMRect | null = null;
  let widgetSel: { pos: number; rect: DOMRect; inline: boolean } | null = null;
  if (ed && sel && ed.view.hasFocus() && !mouseDown && !modal && !popover && !link) {
    if (sel instanceof TextSelection && !sel.empty && !sel.$from.parent.type.spec.code) {
      selectionRect = rectFromCoords(ed.view, sel.from, sel.to);
    } else if (sel instanceof NodeSelection && sel.node.type.name === 'widget_inline') {
      const dom = ed.view.nodeDOM(sel.from) as HTMLElement | null;
      if (dom) widgetSel = { pos: sel.from, rect: dom.getBoundingClientRect(), inline: true };
    }
  }

  // Everything above is positioned from live editor coordinates, so re-render whenever
  // scrolling or resizing moves the anchor. Capture catches the .editor-scroll container.
  const isAnchored = !!(selectionRect || widgetSel || popover || link || slash?.active);
  useEffect(() => {
    if (!isAnchored) return;
    const reposition = () => {
      cancelAnimationFrame(raf.current);
      raf.current = requestAnimationFrame(() => setVersion((v) => v + 1));
    };
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);
    return () => {
      window.removeEventListener('scroll', reposition, true);
      window.removeEventListener('resize', reposition);
    };
  }, [isAnchored]);

  // Hide toolbars once their anchor scrolls out of the editor, rather than floating over the chrome.
  const scroller = mountRef.current?.closest('.editor-scroll')?.getBoundingClientRect();
  const inView = (r: DOMRect) => !scroller || (r.bottom > scroller.top && r.top < scroller.bottom);

  const popoverDom = ed && popover ? (ed.view.nodeDOM(popover.pos) as HTMLElement | null) : null;
  const linkRect = ed && sel && link ? rectFromCoords(ed.view, sel.from, sel.to) : null;

  return (
    <>
      <div className="editor-mount" ref={mountRef} />

      {ed && slash?.active && slashItems.length > 0 && (
        <WidgetMenu items={slashItems} ranked={!!slash.query.trim()} active={Math.min(menuActive, slashItems.length - 1)} onHover={setMenuActive} onPick={pickFromSlash} style={slashStyle} className="is-floating" />
      )}

      {menu && (
        <WidgetMenu
          items={menuItems}
          active={Math.min(menuActive, Math.max(0, menuItems.length - 1))}
          onHover={setMenuActive}
          onPick={startInsert}
          className="is-floating is-dropdown"
          style={{ left: Math.max(8, Math.min(menu.anchor.right - 320, window.innerWidth - 336)), top: menu.anchor.bottom + 6 }}
        />
      )}

      {ed && selectionRect && inView(selectionRect) && <SelectionToolbar editor={ed} rect={selectionRect} marks={ed.activeMarks()} onLink={openLink} />}

      {ed && widgetSel && inView(widgetSel.rect) && (
        <div
          className="widget-chip-toolbar"
          style={{
            left: widgetSel.rect.left + widgetSel.rect.width / 2,
            top: widgetSel.rect.top - 38 < 56 ? widgetSel.rect.bottom + 8 : widgetSel.rect.top - 38,
          }}
        >
          <button
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              const w = ed.widgetAt(widgetSel!.pos);
              if (w) setPopover({ pos: widgetSel!.pos, name: w.name, values: w.values, rect: widgetSel!.rect });
            }}
          >
            <IconPencil width={14} height={14} /> Edit
          </button>
          <button onMouseDown={(e) => e.preventDefault()} onClick={() => ed.deleteWidget(widgetSel!.pos)} title="Remove">
            <IconTrash width={14} height={14} />
          </button>
        </div>
      )}

      {ed && link && (
        <LinkPopover
          initial={link.initial}
          rect={linkRect ?? link.rect}
          onClose={() => {
            setLink(null);
            ed.focus();
          }}
          onSubmit={(href) => {
            ed.setLink(href);
            setLink(null);
          }}
        />
      )}

      {ed && popover && (
        <WidgetPopover
          name={popover.name}
          values={popover.values}
          anchor={popoverDom?.getBoundingClientRect() ?? popover.rect}
          onChange={(values) => {
            setPopover({ ...popover, values });
            ed.updateWidget(popover.pos, values);
          }}
          onDelete={() => {
            ed.deleteWidget(popover.pos);
            setPopover(null);
          }}
          onClose={() => {
            setPopover(null);
            const node = ed.view.state.doc.nodeAt(popover.pos);
            if (node) ed.view.dispatch(ed.view.state.tr.setSelection(TextSelection.create(ed.view.state.doc, popover.pos + node.nodeSize)));
            ed.focus();
          }}
        />
      )}

      {ed && modal && (
        <WidgetModal
          key={modal.mode === 'edit' ? `edit-${modal.pos}` : `insert-${modal.name}`}
          name={modal.name}
          initial={modal.values}
          mode={modal.mode}
          ctx={ctx}
          onCancel={() => {
            setModal(null);
            ed.focus();
          }}
          onSubmit={(values) => {
            if (modal.mode === 'insert') ed.insertWidget(modal.name, values);
            else ed.updateWidget(modal.pos, values);
            setModal(null);
            ed.focus();
          }}
          onDelete={
            modal.mode === 'edit'
              ? () => {
                  ed.deleteWidget(modal.pos);
                  setModal(null);
                }
              : undefined
          }
        />
      )}
    </>
  );
});
