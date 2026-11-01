/**
 * Publishing: turn a Music Notes markdown document into a single,
 * self-contained HTML file. Widgets are emitted as placeholders carrying their
 * values as JSON; the inlined runtime hydrates them into interactive widgets.
 */
import type Token from 'markdown-it/lib/token.mjs';
import { createMarkdownIt, splitFrontmatter, effectiveSettings, deriveTitle, type DocSettings } from '../markdown';
import type { Directive } from '../markdown/directive';
import { getWidget, valuesFromDirective, widgetSummary } from '../widgets';
import { highlightToHtml, resolveLanguage } from './highlight';

export { highlightToHtml, highlightRanges, resolveLanguage } from './highlight';

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function widgetHtml(kind: 'inline' | 'block', d: Directive): string {
  const values = valuesFromDirective(d);
  const json = escapeHtml(JSON.stringify(values));
  const summary = escapeHtml(widgetSummary(d.name, values));
  const known = getWidget(d.name) ? '' : ' data-unknown';
  if (kind === 'inline') {
    return `<span class="mn-widget mn-widget-inline" data-widget="${escapeHtml(d.name)}" data-values="${json}"${known}>${summary}</span>`;
  }
  return `<div class="mn-widget mn-widget-block" data-widget="${escapeHtml(d.name)}" data-values="${json}"${known}><p class="mn-fallback">${summary}</p></div>`;
}

export interface RenderOptions {
  /** Map an image src (as written in markdown) to a URL to embed, e.g. a data: URL. */
  images?: Map<string, string>;
}

export function createPublishMarkdown(opts: RenderOptions = {}) {
  const md = createMarkdownIt({
    renderInline: (d) => widgetHtml('inline', d),
    renderBlock: (d) => widgetHtml('block', d),
    highlight: (code, lang) => {
      const name = resolveLanguage(lang);
      return `<pre><code class="hljs${name ? ` language-${name}` : ''}">${highlightToHtml(code, lang)}</code></pre>`;
    },
  });
  const defaultImage = md.renderer.rules.image!;
  md.renderer.rules.image = (tokens: Token[], idx: number, options: unknown, env: unknown, self: unknown) => {
    const token = tokens[idx];
    const src = token.attrGet('src') ?? '';
    const mapped = opts.images?.get(src);
    if (mapped) token.attrSet('src', mapped);
    token.attrSet('loading', 'lazy');
    return defaultImage(tokens, idx, options as never, env, self as never);
  };
  return md;
}

/** Collect every image src referenced by a document body. */
export function collectImageSources(body: string): string[] {
  const md = createMarkdownIt();
  const out = new Set<string>();
  const walk = (tokens: Token[]) => {
    for (const t of tokens) {
      if (t.type === 'image') {
        const src = t.attrGet('src');
        if (src) out.add(src);
      }
      if (t.children) walk(t.children);
    }
  };
  walk(md.parse(body, {}));
  return [...out];
}

export function renderBodyHtml(body: string, opts: RenderOptions = {}): string {
  return createPublishMarkdown(opts).render(body);
}

export interface DocumentOptions extends RenderOptions {
  /** Contents of the built runtime script (dist of src/core/runtime) */
  runtimeJs: string;
  /** Contents of the built runtime stylesheet */
  runtimeCss: string;
  /** Fallback title when the document has none */
  fallbackTitle?: string;
}

/** Render a complete, self-contained HTML page for a markdown document. */
export function renderDocument(markdown: string, opts: DocumentOptions): string {
  const { settings, body } = splitFrontmatter(markdown);
  const title = deriveTitle(markdown) || opts.fallbackTitle || 'Untitled';
  const html = renderBodyHtml(body, opts);
  const runtimeSettings = { ...effectiveSettings(settings) };
  const meta = settings as DocSettings;
  const safeJson = JSON.stringify(runtimeSettings).replace(/</g, '\\u003c');
  const safeJs = opts.runtimeJs.replace(/<\/script/gi, '<\\/script');
  const safeCss = opts.runtimeCss.replace(/<\/style/gi, '<\\/style');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="generator" content="Music Notes">
<title>${escapeHtml(title)}</title>
${typeof meta.description === 'string' ? `<meta name="description" content="${escapeHtml(meta.description)}">\n` : ''}${typeof meta.author === 'string' ? `<meta name="author" content="${escapeHtml(meta.author)}">\n` : ''}<style>
${safeCss}
</style>
</head>
<body class="mn-published">
<main class="mn-page">
<article class="mn-doc">
${html}</article>
${typeof meta.author === 'string' ? `<footer class="mn-byline">${escapeHtml(meta.author)}</footer>\n` : ''}</main>
<script type="application/json" id="mn-settings">${safeJson}</script>
<script>
${safeJs}
</script>
</body>
</html>
`;
}
