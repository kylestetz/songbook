import { MarkdownParser, MarkdownSerializer, defaultMarkdownSerializer, type MarkdownSerializerState } from 'prosemirror-markdown';
import type { Node as PMNode } from 'prosemirror-model';
import type Token from 'markdown-it/lib/token.mjs';
import { createMarkdownIt, escapeDirectiveText, serializeDirective, type Directive } from '../core/markdown';
import { directiveFromValues, valuesFromDirective } from '../core/widgets';
import { schema } from './schema';

const md = createMarkdownIt();

const widgetAttrs = (tok: Token) => {
  const d = tok.meta as Directive;
  return { name: d.name, values: valuesFromDirective(d) };
};

export const markdownParser = new MarkdownParser(schema, md, {
  blockquote: { block: 'blockquote' },
  paragraph: { block: 'paragraph' },
  list_item: { block: 'list_item' },
  bullet_list: { block: 'bullet_list', getAttrs: (_, tokens, i) => ({ tight: listIsTight(tokens, i) }) },
  ordered_list: {
    block: 'ordered_list',
    getAttrs: (tok, tokens, i) => ({ order: +(tok.attrGet('start') ?? 1), tight: listIsTight(tokens, i) }),
  },
  heading: { block: 'heading', getAttrs: (tok) => ({ level: +tok.tag.slice(1) }) },
  code_block: { block: 'code_block', noCloseToken: true },
  fence: { block: 'code_block', getAttrs: (tok) => ({ params: tok.info || '' }), noCloseToken: true },
  hr: { node: 'horizontal_rule', getAttrs: (tok) => ({ markup: tok.markup || '---' }) },
  image: {
    node: 'image',
    getAttrs: (tok) => ({
      src: tok.attrGet('src'),
      title: tok.attrGet('title') || null,
      alt: (tok.children?.[0] && tok.children[0].content) || null,
    }),
  },
  hardbreak: { node: 'hard_break' },
  em: { mark: 'em' },
  strong: { mark: 'strong' },
  s: { mark: 'strike' },
  link: {
    mark: 'link',
    getAttrs: (tok) => ({ href: tok.attrGet('href'), title: tok.attrGet('title') || null }),
  },
  code_inline: { mark: 'code', noCloseToken: true },
  directive_inline: { node: 'widget_inline', getAttrs: widgetAttrs },
  directive_block: { node: 'widget_block', getAttrs: widgetAttrs },
  table: { block: 'table' },
  thead: { ignore: true },
  tbody: { ignore: true },
  tr: { block: 'table_row' },
  th: { block: 'table_cell', getAttrs: cellAttrs },
  td: { block: 'table_cell', getAttrs: cellAttrs },
});

function cellAttrs(tok: Token) {
  const m = /text-align:\s*(left|center|right)/.exec(tok.attrGet('style') ?? '');
  return { align: m ? m[1] : null };
}

/** One cell's inline content as a single line of markdown, with pipes escaped. */
function cellMarkdown(cell: PMNode): string {
  if (!cell.content.size) return '';
  const doc = schema.topNodeType.create(null, schema.nodes.paragraph.create(null, cell.content));
  return markdownSerializer
    .serialize(doc)
    .trim()
    .replace(/\s*\n\s*/g, ' ')
    .replace(/\|/g, '\\|');
}

/** Write a table as a GFM pipe table, padding columns so the source lines up. */
function serializeTable(state: MarkdownSerializerState, node: PMNode) {
  const rows: string[][] = [];
  node.forEach((row) => {
    const cells: string[] = [];
    row.forEach((cell) => cells.push(cellMarkdown(cell)));
    rows.push(cells);
  });
  const header = node.firstChild!;
  const cols = Math.max(...rows.map((r) => r.length));
  const aligns = Array.from({ length: cols }, (_, i) => (i < header.childCount ? (header.child(i).attrs.align as string | null) : null));
  const widths = aligns.map((_, i) => Math.max(3, ...rows.map((r) => (r[i] ?? '').length)));
  const line = (cells: string[]) => `| ${cells.join(' | ')} |`;
  const pad = (s: string, i: number) => (aligns[i] === 'right' ? s.padStart(widths[i]) : s.padEnd(widths[i]));
  const delimiter = widths.map((w, i) => {
    const a = aligns[i];
    if (a === 'center') return `:${'-'.repeat(w - 2)}:`;
    if (a === 'left') return `:${'-'.repeat(w - 1)}`;
    if (a === 'right') return `${'-'.repeat(w - 1)}:`;
    return '-'.repeat(w);
  });
  rows.forEach((cells, r) => {
    state.write(line(widths.map((_, i) => pad(cells[i] ?? '', i))));
    state.ensureNewLine();
    if (r === 0) {
      state.write(line(delimiter));
      state.ensureNewLine();
    }
  });
  state.closeBlock(node);
}

function listIsTight(tokens: Token[], i: number) {
  while (++i < tokens.length) if (tokens[i].type !== 'list_item_open') return tokens[i].hidden;
  return false;
}

const base = defaultMarkdownSerializer;

export const markdownSerializer = new MarkdownSerializer(
  {
    ...base.nodes,
    bullet_list(state, node) {
      state.renderList(node, '  ', () => '- ');
    },
    horizontal_rule(state, node) {
      state.write(node.attrs.markup && /^(-{3,}|\*{3,}|_{3,})$/.test(node.attrs.markup) ? node.attrs.markup : '---');
      state.closeBlock(node);
    },
    text(state, node) {
      // Escape anything that would read back as a directive
      const text = node.text ?? '';
      const st = state as unknown as { inAutolink?: boolean; text: (t: string, escape?: boolean) => void };
      if (st.inAutolink) {
        st.text(text, false);
        return;
      }
      const escaped = escapeDirectiveText(text);
      if (escaped === text) state.text(text);
      else {
        // Split around inserted escapes so the backslashes survive state.text's own escaping
        const parts = escaped.split(/(\\:)/);
        for (const p of parts) {
          if (p === '\\:') state.write('\\:');
          else if (p) state.text(p);
        }
      }
    },
    widget_inline(state, node) {
      state.write(serializeDirective('inline', directiveFromValues(node.attrs.name, node.attrs.values)));
    },
    widget_block(state, node) {
      state.write(serializeDirective('block', directiveFromValues(node.attrs.name, node.attrs.values)));
      state.closeBlock(node);
    },
    table: serializeTable,
    // Rows and cells are written by `table`
    table_row() {},
    table_cell() {},
  },
  {
    ...base.marks,
    strike: { open: '~~', close: '~~', mixable: true, expelEnclosingWhitespace: true },
  },
);

export function parseMarkdown(body: string): PMNode {
  const doc = markdownParser.parse(body);
  return doc ?? schema.topNodeType.createAndFill()!;
}

export function serializeMarkdown(doc: PMNode): string {
  const out = markdownSerializer.serialize(doc, { tightLists: true });
  return out.trimEnd() + '\n';
}
