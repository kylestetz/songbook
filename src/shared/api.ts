/** The contract between the renderer and whatever stores notes (Electron main, or the browser fallback). */

export interface NoteMeta {
  /** File name relative to the notes folder, e.g. "Blue in Green.md" */
  id: string;
  title: string;
  excerpt: string;
  /** ms since epoch */
  modified: number;
}

export interface SaveResult {
  /** The note's id after saving (it changes when the title-derived filename changes) */
  id: string;
}

export interface MusicNotesApi {
  platform: string;
  getFolder(): Promise<string>;
  chooseFolder(): Promise<string | null>;
  listNotes(): Promise<NoteMeta[]>;
  readNote(id: string): Promise<string>;
  /** Write content; the file may be renamed to match its title */
  saveNote(id: string, content: string): Promise<SaveResult>;
  createNote(content?: string): Promise<string>;
  deleteNote(id: string): Promise<void>;
  revealNote(id: string): Promise<void>;
  /** Save image bytes next to the notes; returns the relative src to use in markdown */
  saveAsset(noteId: string, name: string, data: ArrayBuffer): Promise<string>;
  /** Resolve a markdown image src to something an <img> can load */
  assetUrl(src: string): string;
  /** Read an image referenced by markdown as a data: URL (for publishing) */
  assetDataUrl(src: string): Promise<string | null>;
  /** Show a save dialog and write an exported HTML file */
  exportHtml(suggestedName: string, html: string): Promise<string | null>;
  openExternal(url: string): Promise<void>;
  /** Subscribe to app menu commands; returns an unsubscribe function */
  onMenu(handler: (command: string, arg?: unknown) => void): () => void;
  /** Notes folder changed on disk */
  onNotesChanged(handler: () => void): () => void;
}

/** Menu commands sent from the main process to the renderer. */
export type MenuCommand =
  | 'new-note'
  | 'export-html'
  | 'toggle-sidebar'
  | 'document-settings'
  | 'insert-widget'
  | 'find-note'
  | 'delete-note'
  | 'reveal-note'
  | 'format'
  | 'folder-changed';
