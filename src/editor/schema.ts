import { Schema, type NodeSpec, type MarkSpec } from 'prosemirror-model';

/**
 * The editor schema mirrors the markdown dialect in core/markdown: CommonMark
 * blocks and marks, strikethrough, and two widget node types (inline/block)
 * that map 1:1 to `:name[...]{...}` and `::name[...]{...}` directives.
 */
const nodes: Record<string, NodeSpec> = {
  doc: { content: 'block+' },

  paragraph: {
    content: 'inline*',
    group: 'block',
    parseDOM: [{ tag: 'p' }],
    toDOM: () => ['p', 0],
  },

  heading: {
    attrs: { level: { default: 1 } },
    content: 'inline*',
    group: 'block',
    defining: true,
    parseDOM: [1, 2, 3, 4, 5, 6].map((level) => ({ tag: `h${level}`, attrs: { level } })),
    toDOM: (node) => [`h${node.attrs.level}`, 0],
  },

  blockquote: {
    content: 'block+',
    group: 'block',
    defining: true,
    parseDOM: [{ tag: 'blockquote' }],
    toDOM: () => ['blockquote', 0],
  },

  horizontal_rule: {
    group: 'block',
    attrs: { markup: { default: '---' } },
    parseDOM: [{ tag: 'hr' }],
    toDOM: () => ['div', { class: 'mn-hr' }, ['hr']],
  },

  code_block: {
    content: 'text*',
    group: 'block',
    code: true,
    defining: true,
    marks: '',
    attrs: { params: { default: '' } },
    parseDOM: [
      {
        tag: 'pre',
        preserveWhitespace: 'full',
        getAttrs: (node) => ({ params: (node as HTMLElement).getAttribute('data-params') || '' }),
      },
    ],
    toDOM: (node) => ['pre', node.attrs.params ? { 'data-params': node.attrs.params } : {}, ['code', 0]],
  },

  ordered_list: {
    content: 'list_item+',
    group: 'block',
    attrs: { order: { default: 1 }, tight: { default: true } },
    parseDOM: [
      {
        tag: 'ol',
        getAttrs: (dom) => ({
          order: (dom as HTMLElement).hasAttribute('start') ? +(dom as HTMLElement).getAttribute('start')! : 1,
          tight: (dom as HTMLElement).hasAttribute('data-tight'),
        }),
      },
    ],
    toDOM: (node) => ['ol', { start: node.attrs.order == 1 ? null : node.attrs.order, 'data-tight': node.attrs.tight ? 'true' : null }, 0],
  },

  bullet_list: {
    content: 'list_item+',
    group: 'block',
    attrs: { tight: { default: true } },
    parseDOM: [{ tag: 'ul', getAttrs: (dom) => ({ tight: (dom as HTMLElement).hasAttribute('data-tight') }) }],
    toDOM: (node) => ['ul', { 'data-tight': node.attrs.tight ? 'true' : null }, 0],
  },

  list_item: {
    content: 'block+',
    defining: true,
    parseDOM: [{ tag: 'li' }],
    toDOM: () => ['li', 0],
  },

  /** A block widget: `::scale{root=D mode=dorian}` */
  widget_block: {
    group: 'block',
    atom: true,
    selectable: true,
    draggable: true,
    attrs: { name: { default: '' }, values: { default: {} } },
    parseDOM: [
      {
        tag: 'div[data-widget]',
        getAttrs: (dom) => widgetAttrsFromDom(dom as HTMLElement),
      },
    ],
    toDOM: (node) => [
      'div',
      { 'data-widget': node.attrs.name, 'data-values': JSON.stringify(node.attrs.values), class: 'mn-widget mn-widget-block' },
    ],
  },

  text: { group: 'inline' },

  /** An inline widget: `:note[C4]` */
  widget_inline: {
    group: 'inline',
    inline: true,
    atom: true,
    selectable: true,
    draggable: true,
    attrs: { name: { default: '' }, values: { default: {} } },
    parseDOM: [
      {
        tag: 'span[data-widget]',
        getAttrs: (dom) => widgetAttrsFromDom(dom as HTMLElement),
      },
    ],
    toDOM: (node) => [
      'span',
      { 'data-widget': node.attrs.name, 'data-values': JSON.stringify(node.attrs.values), class: 'mn-widget mn-widget-inline' },
    ],
  },

  image: {
    inline: true,
    attrs: { src: {}, alt: { default: null }, title: { default: null } },
    group: 'inline',
    draggable: true,
    parseDOM: [
      {
        tag: 'img[src]',
        getAttrs: (dom) => ({
          src: (dom as HTMLElement).getAttribute('data-src') || (dom as HTMLElement).getAttribute('src'),
          title: (dom as HTMLElement).getAttribute('title'),
          alt: (dom as HTMLElement).getAttribute('alt'),
        }),
      },
    ],
    toDOM: (node) => ['img', { src: node.attrs.src, alt: node.attrs.alt, title: node.attrs.title }],
  },

  hard_break: {
    inline: true,
    group: 'inline',
    selectable: false,
    parseDOM: [{ tag: 'br' }],
    toDOM: () => ['br'],
  },
};

function widgetAttrsFromDom(dom: HTMLElement) {
  let values = {};
  try {
    values = JSON.parse(dom.getAttribute('data-values') || '{}');
  } catch {
    /* ignore */
  }
  return { name: dom.getAttribute('data-widget'), values };
}

const marks: Record<string, MarkSpec> = {
  em: {
    parseDOM: [{ tag: 'i' }, { tag: 'em' }, { style: 'font-style=italic' }, { style: 'font-style=normal', clearMark: (m) => m.type.name === 'em' }],
    toDOM: () => ['em'],
  },
  strong: {
    parseDOM: [
      { tag: 'strong' },
      { tag: 'b', getAttrs: (node) => (node as HTMLElement).style.fontWeight !== 'normal' && null },
      { style: 'font-weight=400', clearMark: (m) => m.type.name === 'strong' },
      { style: 'font-weight', getAttrs: (value) => /^(bold(er)?|[5-9]\d{2,})$/.test(value as string) && null },
    ],
    toDOM: () => ['strong'],
  },
  strike: {
    parseDOM: [{ tag: 's' }, { tag: 'del' }, { tag: 'strike' }, { style: 'text-decoration=line-through' }],
    toDOM: () => ['s'],
  },
  link: {
    attrs: { href: {}, title: { default: null } },
    inclusive: false,
    parseDOM: [
      {
        tag: 'a[href]',
        getAttrs: (dom) => ({ href: (dom as HTMLElement).getAttribute('href'), title: (dom as HTMLElement).getAttribute('title') }),
      },
    ],
    toDOM: (node) => ['a', { href: node.attrs.href, title: node.attrs.title }],
  },
  code: {
    code: true,
    parseDOM: [{ tag: 'code' }],
    toDOM: () => ['code'],
  },
};

export const schema = new Schema({ nodes, marks });
