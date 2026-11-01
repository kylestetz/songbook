import { parse, stringify } from 'yaml';

/**
 * Document-level settings live in YAML front matter:
 *
 *   ---
 *   title: Notes on "Blue in Green"
 *   sound: epiano
 *   tempo: 72
 *   ---
 */
export interface DocSettings {
  title?: string;
  author?: string;
  description?: string;
  /** Default instrument for widgets */
  sound?: string;
  /** Beats per minute for sequenced widgets */
  tempo?: number;
  /** 0..1 master volume */
  volume?: number;
  [key: string]: unknown;
}

export const DEFAULT_SETTINGS = {
  sound: 'piano',
  tempo: 96,
  volume: 0.8,
};

const FM_RE = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;

export interface SplitDocument {
  settings: DocSettings;
  body: string;
  /** True if the document had a (parseable) front matter block */
  hasFrontmatter: boolean;
}

export function splitFrontmatter(markdown: string): SplitDocument {
  const m = FM_RE.exec(markdown);
  if (!m) return { settings: {}, body: markdown, hasFrontmatter: false };
  try {
    const data = parse(m[1]);
    const settings = data && typeof data === 'object' && !Array.isArray(data) ? (data as DocSettings) : {};
    return { settings, body: markdown.slice(m[0].length).replace(/^\r?\n/, ''), hasFrontmatter: true };
  } catch {
    return { settings: {}, body: markdown, hasFrontmatter: false };
  }
}

export function joinFrontmatter(settings: DocSettings, body: string): string {
  const clean: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(settings)) {
    if (v === undefined || v === null || v === '') continue;
    clean[k] = v;
  }
  if (!Object.keys(clean).length) return body;
  const yaml = stringify(clean, { lineWidth: 0 }).trimEnd();
  return `---\n${yaml}\n---\n\n${body}`;
}

/** Resolve effective settings with defaults applied. */
export function effectiveSettings(s: DocSettings) {
  const tempo = Number(s.tempo);
  const volume = Number(s.volume);
  return {
    sound: typeof s.sound === 'string' && s.sound ? s.sound : DEFAULT_SETTINGS.sound,
    tempo: Number.isFinite(tempo) && tempo > 10 && tempo < 400 ? tempo : DEFAULT_SETTINGS.tempo,
    volume: Number.isFinite(volume) && volume >= 0 && volume <= 1 ? volume : DEFAULT_SETTINGS.volume,
  };
}

/** Best-effort title: front matter title, first heading, or first line. */
export function deriveTitle(markdown: string): string {
  const { settings, body } = splitFrontmatter(markdown);
  if (typeof settings.title === 'string' && settings.title.trim()) return settings.title.trim();
  for (const raw of body.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    if (/^(```|~~~|::|---|\*\*\*)/.test(line)) continue;
    return stripInline(line.replace(/^#{1,6}\s+/, '').replace(/^[>*+-]\s+/, '').replace(/^\d+\.\s+/, ''));
  }
  return '';
}

/** First prose paragraph after the title, as plain text. */
export function deriveExcerpt(markdown: string, max = 140): string {
  const { body } = splitFrontmatter(markdown);
  const lines = body.split('\n');
  let seenTitle = false;
  const parts: string[] = [];
  let inFence = false;
  for (const raw of lines) {
    const line = raw.trim();
    if (/^(```|~~~)/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence || !line) {
      if (parts.length) break;
      continue;
    }
    if (!seenTitle) {
      seenTitle = true;
      continue;
    }
    if (/^(#{1,6}\s|::|---|\*\*\*|!\[)/.test(line)) {
      if (parts.length) break;
      continue;
    }
    parts.push(stripInline(line.replace(/^[>*+-]\s+/, '').replace(/^\d+\.\s+/, '')));
    if (parts.join(' ').length > max) break;
  }
  const text = parts.join(' ');
  return text.length > max ? text.slice(0, max - 1).trimEnd() + '…' : text;
}

function stripInline(s: string): string {
  return s
    .replace(/:([a-z][\w-]*)\[([^\]]*)\](\{[^}]*\})?/gi, '$2')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*_`~]/g, '')
    .trim();
}
