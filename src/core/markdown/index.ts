import MarkdownIt from 'markdown-it';
import { directivePlugin, type DirectivePluginOptions } from './directive';
import { WIDGETS } from '../widgets/registry-meta';

const INLINE_WIDGETS = new Set(WIDGETS.filter((w) => w.kind === 'inline').map((w) => w.name));

export * from './directive';
export * from './frontmatter';

export interface MarkdownOptions extends DirectivePluginOptions {
  highlight?: (code: string, lang: string) => string;
}

/**
 * The single markdown dialect used everywhere: CommonMark + strikethrough +
 * directives. The editor and the publisher both parse with this, so what you
 * see while writing is what gets published.
 */
export function createMarkdownIt(opts: MarkdownOptions = {}): ReturnType<typeof MarkdownIt> {
  const md = new MarkdownIt('commonmark', {
    html: false,
    linkify: false,
    typographer: false,
    highlight: opts.highlight ? (code, lang) => opts.highlight!(code, lang) : undefined,
  });
  md.enable('strikethrough');
  md.use(directivePlugin, { isInline: (name) => INLINE_WIDGETS.has(name), ...opts });
  return md;
}
