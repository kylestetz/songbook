import type { Node as PMNode } from 'prosemirror-model';
import { NodeSelection } from 'prosemirror-state';
import type { EditorView, NodeView } from 'prosemirror-view';
import { renderWidget, type WidgetContext, type WidgetInstance } from '../core/widgets';

export interface NodeViewOptions {
  ctx: WidgetContext;
  onEditWidget: (pos: number) => void;
  resolveImage: (src: string) => string;
}

function sameValues(a: Record<string, string>, b: Record<string, string>) {
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  return ka.length === kb.length && ka.every((k) => a[k] === b[k]);
}

const PENCIL =
  '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M11.2 2.3a1.5 1.5 0 0 1 2.1 2.1l-7.6 7.6-2.9.8.8-2.9 7.6-7.6z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>';

export class WidgetView implements NodeView {
  dom: HTMLElement;
  private inner: HTMLElement;
  private instance: WidgetInstance | void = undefined;
  private node: PMNode;
  private inline: boolean;

  constructor(node: PMNode, private view: EditorView, private getPos: () => number | undefined, private opts: NodeViewOptions) {
    this.node = node;
    this.inline = node.type.name === 'widget_inline';
    this.dom = document.createElement(this.inline ? 'span' : 'div');
    this.dom.className = `mn-widget mn-widget-${this.inline ? 'inline' : 'block'}`;
    this.inner = document.createElement(this.inline ? 'span' : 'div');
    this.inner.className = 'mn-widget-inner';
    this.dom.append(this.inner);
    if (!this.inline) {
      const bar = document.createElement('div');
      bar.className = 'mn-widget-toolbar';
      const edit = document.createElement('button');
      edit.type = 'button';
      edit.className = 'mn-widget-edit';
      edit.title = 'Edit widget';
      edit.setAttribute('data-interactive', '');
      edit.innerHTML = `${PENCIL}<span>Edit</span>`;
      edit.addEventListener('mousedown', (e) => e.preventDefault());
      edit.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.edit();
      });
      bar.append(edit);
      this.dom.append(bar);
    }
    this.dom.addEventListener('dblclick', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.edit();
    });
    this.render();
  }

  private edit() {
    const pos = this.getPos();
    if (pos === undefined) return;
    this.view.dispatch(this.view.state.tr.setSelection(NodeSelection.create(this.view.state.doc, pos)));
    this.opts.onEditWidget(pos);
  }

  private render() {
    this.instance?.destroy?.();
    this.dom.setAttribute('data-widget', this.node.attrs.name);
    this.instance = renderWidget(this.inner, this.node.attrs.name, this.node.attrs.values, this.opts.ctx);
  }

  update(node: PMNode) {
    if (node.type !== this.node.type) return false;
    const changed = node.attrs.name !== this.node.attrs.name || !sameValues(node.attrs.values, this.node.attrs.values);
    this.node = node;
    if (changed) this.render();
    return true;
  }

  selectNode() {
    this.dom.classList.add('ProseMirror-selectednode');
  }

  deselectNode() {
    this.dom.classList.remove('ProseMirror-selectednode');
  }

  stopEvent(event: Event) {
    const target = event.target as Element | null;
    if (!target || !(target instanceof Element)) return false;
    // Inline pills: let ProseMirror select the node on mousedown; the pill plays on click.
    if (this.inline && event.type === 'mousedown') return false;
    if (event.type.startsWith('drag')) return !!target.closest('[data-interactive]');
    return !!target.closest('[data-interactive]');
  }

  ignoreMutation() {
    return true;
  }

  destroy() {
    this.instance?.destroy?.();
  }
}

export class ImageView implements NodeView {
  dom: HTMLImageElement;
  constructor(private node: PMNode, private opts: NodeViewOptions) {
    this.dom = document.createElement('img');
    this.apply();
  }
  private apply() {
    this.dom.src = this.opts.resolveImage(this.node.attrs.src);
    this.dom.setAttribute('data-src', this.node.attrs.src);
    if (this.node.attrs.alt) this.dom.alt = this.node.attrs.alt;
    if (this.node.attrs.title) this.dom.title = this.node.attrs.title;
  }
  update(node: PMNode) {
    if (node.type !== this.node.type) return false;
    this.node = node;
    this.apply();
    return true;
  }
}

/** Code block with an editable language label. */
export class CodeBlockView implements NodeView {
  dom: HTMLElement;
  contentDOM: HTMLElement;
  private lang: HTMLInputElement;

  constructor(private node: PMNode, private view: EditorView, private getPos: () => number | undefined) {
    this.dom = document.createElement('div');
    this.dom.className = 'mn-codeblock';
    const pre = document.createElement('pre');
    this.contentDOM = document.createElement('code');
    pre.append(this.contentDOM);
    this.lang = document.createElement('input');
    this.lang.className = 'mn-codeblock-lang';
    this.lang.placeholder = 'language';
    this.lang.spellcheck = false;
    this.lang.value = node.attrs.params;
    this.lang.setAttribute('data-interactive', '');
    this.lang.addEventListener('change', () => this.commitLang());
    this.lang.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === 'Escape') {
        e.preventDefault();
        this.commitLang();
        this.view.focus();
      }
    });
    const langWrap = document.createElement('div');
    langWrap.className = 'mn-codeblock-meta';
    langWrap.contentEditable = 'false';
    langWrap.append(this.lang);
    this.dom.append(langWrap, pre);
  }

  private commitLang() {
    const pos = this.getPos();
    if (pos === undefined) return;
    const value = this.lang.value.trim();
    if (value === this.node.attrs.params) return;
    this.view.dispatch(this.view.state.tr.setNodeMarkup(pos, undefined, { ...this.node.attrs, params: value }));
  }

  update(node: PMNode) {
    if (node.type !== this.node.type) return false;
    this.node = node;
    if (document.activeElement !== this.lang) this.lang.value = node.attrs.params;
    return true;
  }

  stopEvent(event: Event) {
    return event.target === this.lang;
  }

  ignoreMutation(m: MutationRecord | { type: 'selection'; target: Node }) {
    return !this.contentDOM.contains(m.target);
  }
}
