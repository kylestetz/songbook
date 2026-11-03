/**
 * A browser-only implementation of the notes API backed by localStorage.
 * Lets the renderer run with `npm run web` for quick UI iteration and demos.
 */
import welcome from '../../../resources/welcome.md?raw';
import { deriveExcerpt, deriveTitle } from '../../core/markdown/frontmatter';
import type { MusicNotesApi, NoteMeta } from '../../shared/api';

interface Stored {
  content: string;
  modified: number;
}

const KEY = 'music-notes:notes';

function load(): Record<string, Stored> {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    /* ignore */
  }
  return { 'Welcome to Music Notes.md': { content: welcome, modified: Date.now() } };
}

function persist(notes: Record<string, Stored>) {
  try {
    localStorage.setItem(KEY, JSON.stringify(notes));
  } catch {
    /* storage full or unavailable */
  }
}

function fileName(title: string) {
  return (title.replace(/[/\\:*?"<>|#^[\]]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || 'Untitled') + '.md';
}

export function createBrowserApi(): MusicNotesApi {
  const notes = load();
  const unique = (name: string, except?: string) => {
    let n = name;
    for (let i = 2; notes[n] && n !== except; i++) n = name.replace(/\.md$/, ` ${i}.md`);
    return n;
  };
  return {
    platform: 'web',
    getFolder: async () => 'Browser storage',
    chooseFolder: async () => null,
    listNotes: async (): Promise<NoteMeta[]> =>
      Object.entries(notes)
        .map(([id, n]) => ({ id, title: deriveTitle(n.content) || id.replace(/\.md$/, ''), excerpt: deriveExcerpt(n.content), modified: n.modified }))
        .sort((a, b) => b.modified - a.modified),
    readNote: async (id) => notes[id]?.content ?? '',
    saveNote: async (id, content) => {
      let next = id;
      const title = deriveTitle(content);
      if (title) {
        const desired = fileName(title);
        if (desired !== id && !new RegExp(`^${desired.replace(/\.md$/, '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\d+\\.md$`).test(id)) {
          next = unique(desired, id);
        }
      }
      if (next !== id) delete notes[id];
      notes[next] = { content, modified: Date.now() };
      persist(notes);
      return { id: next };
    },
    createNote: async (content = '') => {
      const id = unique(fileName(deriveTitle(content) || 'Untitled'));
      notes[id] = { content, modified: Date.now() };
      persist(notes);
      return id;
    },
    deleteNote: async (id) => {
      delete notes[id];
      persist(notes);
    },
    revealNote: async () => {},
    duplicateNote: async (id) => {
      const id2 = unique(id);
      notes[id2] = { content: notes[id]?.content ?? '', modified: Date.now() };
      persist(notes);
      return id2;
    },
    openNoteExternally: async () => {},
    showNoteMenu: async () => false,
    saveAsset: (_noteId, name, data) =>
      new Promise((resolve) => {
        const ext = name.split('.').pop()?.toLowerCase() ?? 'png';
        const blob = new Blob([data], { type: ext === 'svg' ? 'image/svg+xml' : `image/${ext === 'jpg' ? 'jpeg' : ext}` });
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.readAsDataURL(blob);
      }),
    assetUrl: (src) => src,
    assetDataUrl: async (src) => (src.startsWith('data:') ? src : null),
    exportHtml: async (name, html) => {
      const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `${name}.html`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      return `${name}.html`;
    },
    openExternal: async (url) => {
      window.open(url, '_blank');
    },
    onMenu: () => () => {},
    onNotesChanged: () => () => {},
  };
}
