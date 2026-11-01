/**
 * Generic directive syntax (after the CommonMark "generic directives" proposal):
 *
 *   inline:  :name[label]{key=value key2="quoted value" flag}
 *   block:   ::name[label]{key=value}        (alone on a line)
 *
 * Every Music Notes widget is stored this way, so documents stay plain,
 * readable markdown.
 */
import type MarkdownItCtor from 'markdown-it';
import type Token from 'markdown-it/lib/token.mjs';

type MarkdownIt = ReturnType<typeof MarkdownItCtor>;
import type StateInline from 'markdown-it/lib/rules_inline/state_inline.mjs';
import type StateBlock from 'markdown-it/lib/rules_block/state_block.mjs';

export interface Directive {
  name: string;
  label?: string;
  attrs: Record<string, string>;
}

const NAME_RE = /^[a-z][a-z0-9-]*/i;

/** Parse `[label]{attrs}` starting at `pos` (right after the name). */
function parseTail(src: string, pos: number): { label?: string; attrs: Record<string, string>; end: number } | null {
  let label: string | undefined;
  let attrs: Record<string, string> = {};
  if (src[pos] === '[') {
    let depth = 0;
    let i = pos;
    let out = '';
    for (; i < src.length; i++) {
      const ch = src[i];
      if (ch === '\\' && i + 1 < src.length) {
        out += src[i + 1];
        i++;
        continue;
      }
      if (ch === '\n') return null;
      if (ch === '[') {
        depth++;
        if (depth === 1) continue;
      } else if (ch === ']') {
        depth--;
        if (depth === 0) break;
      }
      out += ch;
    }
    if (depth !== 0) return null;
    label = out;
    pos = i + 1;
  }
  if (src[pos] === '{') {
    const res = parseAttrs(src, pos);
    if (!res) return null;
    attrs = res.attrs;
    pos = res.end;
  }
  return { label, attrs, end: pos };
}

/** Parse an attribute block `{a=1 b="two words" flag}` starting at the `{`. */
export function parseAttrs(src: string, start: number): { attrs: Record<string, string>; end: number } | null {
  if (src[start] !== '{') return null;
  const attrs: Record<string, string> = {};
  let i = start + 1;
  const skipWs = () => {
    while (i < src.length && (src[i] === ' ' || src[i] === '\t')) i++;
  };
  while (i < src.length) {
    skipWs();
    if (src[i] === '}') return { attrs, end: i + 1 };
    const m = /^[a-zA-Z_][\w-]*/.exec(src.slice(i));
    if (!m) return null;
    const key = m[0];
    i += key.length;
    skipWs();
    if (src[i] === '=') {
      i++;
      skipWs();
      const q = src[i];
      if (q === '"' || q === "'") {
        let val = '';
        i++;
        while (i < src.length && src[i] !== q) {
          if (src[i] === '\\' && i + 1 < src.length) {
            val += src[i + 1];
            i += 2;
            continue;
          }
          if (src[i] === '\n') return null;
          val += src[i++];
        }
        if (src[i] !== q) return null;
        i++;
        attrs[key] = val;
      } else {
        const vm = /^[^\s}"'=]+/.exec(src.slice(i));
        if (!vm) return null;
        attrs[key] = vm[0];
        i += vm[0].length;
      }
    } else {
      attrs[key] = 'true';
    }
  }
  return null;
}

/** Try to parse a directive whose name begins at `pos` (after the colons). */
export function parseDirectiveAt(src: string, pos: number): { directive: Directive; end: number } | null {
  const m = NAME_RE.exec(src.slice(pos));
  if (!m) return null;
  const name = m[0];
  const after = pos + name.length;
  if (src[after] !== '[' && src[after] !== '{') return null;
  const tail = parseTail(src, after);
  if (!tail) return null;
  return { directive: { name, label: tail.label, attrs: tail.attrs }, end: tail.end };
}

function quoteValue(v: string): string {
  if (v !== '' && /^[^\s}"'=\\]+$/.test(v)) return v;
  return `"${v.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

export function serializeAttrs(attrs: Record<string, string | undefined>): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === '') continue;
    parts.push(v === 'true' ? k : `${k}=${quoteValue(v)}`);
  }
  return parts.length ? `{${parts.join(' ')}}` : '';
}

function escapeLabel(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/\[/g, '\\[').replace(/\]/g, '\\]');
}

export function serializeDirective(kind: 'inline' | 'block', d: Directive): string {
  const prefix = kind === 'inline' ? ':' : '::';
  const label = d.label !== undefined && d.label !== '' ? `[${escapeLabel(d.label)}]` : '';
  let attrs = serializeAttrs(d.attrs);
  // Directives must have a label or attrs to be recognized
  if (!label && !attrs) attrs = kind === 'inline' ? '[]' : '{}';
  return `${prefix}${d.name}${label}${attrs}`;
}

/** Escape text so literal ":name[" sequences aren't read back as directives. */
export function escapeDirectiveText(text: string): string {
  return text.replace(/(^|[^\w\\:]):([a-z][a-z0-9-]*)(?=[[{])/gi, '$1\\:$2');
}

export interface DirectivePluginOptions {
  renderInline?: (d: Directive) => string;
  renderBlock?: (d: Directive) => string;
}

export function directivePlugin(md: MarkdownIt, opts: DirectivePluginOptions = {}): void {
  md.inline.ruler.before('link', 'directive_inline', (state: StateInline, silent: boolean) => {
    const { src, pos } = state;
    if (src.charCodeAt(pos) !== 0x3a /* : */) return false;
    const prev = pos > 0 ? src[pos - 1] : '';
    if (prev && /[\w:]/.test(prev)) return false;
    if (src[pos + 1] === ':') return false;
    const res = parseDirectiveAt(src, pos + 1);
    if (!res) return false;
    if (!silent) {
      const token = state.push('directive_inline', 'span', 0);
      token.meta = res.directive;
      token.markup = src.slice(pos, res.end);
    }
    state.pos = res.end;
    return true;
  });

  md.block.ruler.before(
    'paragraph',
    'directive_block',
    (state: StateBlock, startLine: number, _endLine: number, silent: boolean) => {
      const start = state.bMarks[startLine] + state.tShift[startLine];
      const max = state.eMarks[startLine];
      if (state.sCount[startLine] - state.blkIndent >= 4) return false;
      const line = state.src.slice(start, max);
      if (!line.startsWith('::') || line.startsWith(':::')) return false;
      const res = parseDirectiveAt(line, 2);
      if (!res || line.slice(res.end).trim() !== '') return false;
      if (silent) return true;
      const token = state.push('directive_block', 'div', 0);
      token.meta = res.directive;
      token.block = true;
      token.map = [startLine, startLine + 1];
      token.markup = line;
      state.line = startLine + 1;
      return true;
    },
    { alt: ['paragraph', 'reference', 'blockquote', 'list'] },
  );

  md.renderer.rules.directive_inline = (tokens: Token[], idx: number) => {
    const d = tokens[idx].meta as Directive;
    return opts.renderInline ? opts.renderInline(d) : md.utils.escapeHtml(tokens[idx].markup);
  };
  md.renderer.rules.directive_block = (tokens: Token[], idx: number) => {
    const d = tokens[idx].meta as Directive;
    return opts.renderBlock ? opts.renderBlock(d) + '\n' : `<p>${md.utils.escapeHtml(tokens[idx].markup)}</p>\n`;
  };
}
