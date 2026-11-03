import { constants as fsConstants, promises as fs, watch, type FSWatcher } from 'node:fs';
import path from 'node:path';
import { deriveExcerpt, deriveTitle } from '../core/markdown/frontmatter';
import type { NoteMeta } from '../shared/api';

const NOTE_EXT = /\.(md|markdown)$/i;

/** Make a title safe to use as a file name. */
export function fileNameForTitle(title: string): string {
  const clean = title
    .replace(/[/\\:*?"<>|#^[\]]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80)
    .replace(/[.\s]+$/, '');
  return clean || 'Untitled';
}

/** File-system backed note storage: one markdown file per note in a folder. */
export class NotesStore {
  private watcher: FSWatcher | null = null;
  private listeners = new Set<() => void>();
  private debounce: ReturnType<typeof setTimeout> | null = null;

  constructor(public folder: string) {}

  async init() {
    await fs.mkdir(this.folder, { recursive: true });
    this.startWatching();
  }

  setFolder(folder: string) {
    this.folder = folder;
    this.watcher?.close();
    return this.init();
  }

  onChange(fn: () => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private startWatching() {
    try {
      this.watcher = watch(this.folder, { persistent: false }, (_e, file) => {
        if (file && !NOTE_EXT.test(String(file))) return;
        if (this.debounce) clearTimeout(this.debounce);
        this.debounce = setTimeout(() => this.listeners.forEach((l) => l()), 250);
      });
    } catch {
      this.watcher = null;
    }
  }

  /** Resolve an id to an absolute path, refusing anything outside the folder. */
  resolve(id: string): string {
    const full = path.resolve(this.folder, id);
    const rel = path.relative(this.folder, full);
    if (rel.startsWith('..') || path.isAbsolute(rel)) throw new Error(`Invalid note id: ${id}`);
    return full;
  }

  async list(): Promise<NoteMeta[]> {
    const entries = await fs.readdir(this.folder, { withFileTypes: true });
    const notes = await Promise.all(
      entries
        .filter((e) => e.isFile() && NOTE_EXT.test(e.name) && !e.name.startsWith('.'))
        .map(async (e) => {
          const full = path.join(this.folder, e.name);
          const [content, stat] = await Promise.all([fs.readFile(full, 'utf8'), fs.stat(full)]);
          return {
            id: e.name,
            title: deriveTitle(content) || e.name.replace(NOTE_EXT, ''),
            excerpt: deriveExcerpt(content),
            modified: stat.mtimeMs,
          };
        }),
    );
    return notes.sort((a, b) => b.modified - a.modified);
  }

  read(id: string): Promise<string> {
    return fs.readFile(this.resolve(id), 'utf8');
  }

  private async uniqueName(base: string, except?: string): Promise<string> {
    let name = `${base}.md`;
    for (let i = 2; ; i++) {
      if (name === except) return name;
      try {
        await fs.access(path.join(this.folder, name));
        name = `${base} ${i}.md`;
      } catch {
        return name;
      }
    }
  }

  async create(content = ''): Promise<string> {
    const title = deriveTitle(content);
    const name = await this.uniqueName(fileNameForTitle(title || 'Untitled'));
    await fs.writeFile(path.join(this.folder, name), content, 'utf8');
    return name;
  }

  /** Save content; rename the file when the title changes. Returns the (possibly new) id. */
  async save(id: string, content: string): Promise<string> {
    const current = this.resolve(id);
    await fs.writeFile(current, content, 'utf8');
    const title = deriveTitle(content);
    if (!title) return id;
    const desiredBase = fileNameForTitle(title);
    const currentBase = id.replace(NOTE_EXT, '');
    // Already matches (allowing a " 2" style suffix)
    if (currentBase === desiredBase || new RegExp(`^${escapeRe(desiredBase)} \\d+$`).test(currentBase)) return id;
    const next = await this.uniqueName(desiredBase, id);
    if (next === id) return id;
    await fs.rename(current, path.join(this.folder, next));
    return next;
  }

  /** Copy a note to "<name> 2.md" (or the next free number); returns the new id. */
  async duplicate(id: string): Promise<string> {
    const source = this.resolve(id);
    const base = id.replace(NOTE_EXT, '').replace(/ \d+$/, '');
    const name = await this.uniqueName(base);
    await fs.copyFile(source, path.join(this.folder, name), fsConstants.COPYFILE_EXCL);
    return name;
  }

  async remove(id: string, trash: (p: string) => Promise<void>) {
    await trash(this.resolve(id));
  }

  /** Store an image in the "assets" folder; returns a markdown-relative src. */
  async saveAsset(name: string, data: ArrayBuffer): Promise<string> {
    const dir = path.join(this.folder, 'assets');
    await fs.mkdir(dir, { recursive: true });
    const ext = path.extname(name).toLowerCase() || '.png';
    const base = (path.basename(name, path.extname(name)).replace(/[^\w-]+/g, '-').replace(/^-+|-+$/g, '') || 'image').slice(0, 40);
    let file = `${base}${ext}`;
    for (let i = 2; ; i++) {
      try {
        await fs.access(path.join(dir, file));
        file = `${base}-${i}${ext}`;
      } catch {
        break;
      }
    }
    await fs.writeFile(path.join(dir, file), Buffer.from(data));
    return `assets/${file}`;
  }

  async assetDataUrl(src: string): Promise<string | null> {
    try {
      const full = this.resolve(decodeURI(src));
      const buf = await fs.readFile(full);
      const ext = path.extname(full).slice(1).toLowerCase();
      const mime = ext === 'svg' ? 'image/svg+xml' : ext === 'jpg' ? 'image/jpeg' : `image/${ext || 'png'}`;
      return `data:${mime};base64,${buf.toString('base64')}`;
    } catch {
      return null;
    }
  }
}

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
