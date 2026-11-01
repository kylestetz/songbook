import runtimeJs from '../../build/runtime/music-notes-runtime.js?raw';
import runtimeCss from '../../build/runtime/music-notes-runtime.css?raw';
import { splitFrontmatter } from '../core/markdown';
import { collectImageSources, renderDocument } from '../core/publish';
import { api } from './api';

/** Build a self-contained HTML page for a note and ask the host to save it. */
export async function buildHtml(markdown: string, fallbackTitle: string): Promise<string> {
  const { body } = splitFrontmatter(markdown);
  const images = new Map<string, string>();
  for (const src of collectImageSources(body)) {
    if (/^(https?:|data:)/.test(src)) continue;
    const data = await api.assetDataUrl(src);
    if (data) images.set(src, data);
  }
  return renderDocument(markdown, { runtimeJs, runtimeCss, images, fallbackTitle });
}

export async function exportNote(markdown: string, title: string): Promise<string | null> {
  const html = await buildHtml(markdown, title);
  const safe = title.replace(/[/\\:*?"<>|]/g, ' ').trim() || 'Untitled';
  return api.exportHtml(safe, html);
}
