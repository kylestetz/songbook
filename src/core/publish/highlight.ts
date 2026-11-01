import { common, createLowlight } from 'lowlight';

export const lowlight = createLowlight(common);

/** Language aliases people commonly type after ``` */
const ALIASES: Record<string, string> = {
  js: 'javascript',
  jsx: 'javascript',
  ts: 'typescript',
  tsx: 'typescript',
  py: 'python',
  rb: 'ruby',
  sh: 'bash',
  shell: 'bash',
  zsh: 'bash',
  yml: 'yaml',
  md: 'markdown',
  html: 'xml',
  svg: 'xml',
  'c++': 'cpp',
  rs: 'rust',
  kt: 'kotlin',
};

export function resolveLanguage(lang: string): string | null {
  const l = (lang || '').trim().toLowerCase().split(/\s+/)[0];
  if (!l) return null;
  const name = ALIASES[l] ?? l;
  return lowlight.registered(name) ? name : null;
}

interface HastNode {
  type: string;
  value?: string;
  tagName?: string;
  properties?: { className?: string[] | string };
  children?: HastNode[];
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function toHtml(node: HastNode): string {
  if (node.type === 'text') return escapeHtml(node.value ?? '');
  const inner = (node.children ?? []).map(toHtml).join('');
  if (node.type === 'element') {
    const cls = node.properties?.className;
    const c = Array.isArray(cls) ? cls.join(' ') : cls;
    return `<span${c ? ` class="${escapeHtml(c)}"` : ''}>${inner}</span>`;
  }
  return inner;
}

/** Highlight code to an HTML string (highlight.js class names). */
export function highlightToHtml(code: string, lang: string): string {
  const name = resolveLanguage(lang);
  if (!name) return escapeHtml(code);
  try {
    return toHtml(lowlight.highlight(name, code) as unknown as HastNode);
  } catch {
    return escapeHtml(code);
  }
}

export interface HighlightRange {
  from: number;
  to: number;
  className: string;
}

/** Highlight code to flat class ranges (for editor decorations). */
export function highlightRanges(code: string, lang: string): HighlightRange[] {
  const name = resolveLanguage(lang);
  if (!name) return [];
  let tree: HastNode;
  try {
    tree = lowlight.highlight(name, code) as unknown as HastNode;
  } catch {
    return [];
  }
  const out: HighlightRange[] = [];
  let pos = 0;
  const walk = (node: HastNode, classes: string[]) => {
    if (node.type === 'text') {
      const len = (node.value ?? '').length;
      if (classes.length && len) out.push({ from: pos, to: pos + len, className: classes.join(' ') });
      pos += len;
      return;
    }
    let next = classes;
    if (node.type === 'element') {
      const cls = node.properties?.className;
      const c = Array.isArray(cls) ? cls : cls ? [cls] : [];
      next = [...classes, ...c];
    }
    for (const child of node.children ?? []) walk(child, next);
  };
  walk(tree, []);
  return out;
}
