import { forwardRef, useMemo } from 'react';
import type { NoteMeta } from '../../shared/api';
import { IconCompose, IconSearch, IconTrash } from './icons';

interface Props {
  notes: NoteMeta[];
  currentId: string | null;
  query: string;
  onQuery(q: string): void;
  onSelect(id: string): void;
  onNew(): void;
  onDelete(id: string): void;
  folderName: string;
  isMac: boolean;
}

function formatDate(ms: number): string {
  const d = new Date(ms);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  const diff = (now.getTime() - ms) / 86400000;
  if (diff < 7) return d.toLocaleDateString(undefined, { weekday: 'long' });
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: d.getFullYear() === now.getFullYear() ? undefined : 'numeric' });
}

export const Sidebar = forwardRef<HTMLInputElement, Props>(function Sidebar(props, searchRef) {
  const { notes, currentId, query, onQuery, onSelect, onNew, onDelete, folderName, isMac } = props;
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return notes;
    return notes.filter((n) => n.title.toLowerCase().includes(q) || n.excerpt.toLowerCase().includes(q));
  }, [notes, query]);

  return (
    <aside className="sidebar">
      <div className={`sidebar-header drag${isMac ? ' is-mac' : ''}`}>
        <button className="icon-button no-drag" onClick={onNew} title="New note (⌘N)" aria-label="New note">
          <IconCompose />
        </button>
      </div>
      <div className="sidebar-search">
        <IconSearch width={14} height={14} />
        <input ref={searchRef} value={query} onChange={(e) => onQuery(e.target.value)} placeholder="Search" aria-label="Search notes" />
      </div>
      <nav className="note-list" aria-label="Notes">
        {filtered.map((n) => (
          <div
            key={n.id}
            role="button"
            tabIndex={0}
            className={`note-item${n.id === currentId ? ' is-selected' : ''}`}
            onClick={() => onSelect(n.id)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onSelect(n.id);
            }}
          >
            <div className="note-item-title">{n.title || 'Untitled'}</div>
            <div className="note-item-meta">
              <span className="note-item-date">{formatDate(n.modified)}</span>
              {n.excerpt ? <span className="note-item-excerpt">{n.excerpt}</span> : null}
            </div>
            <button
              className="note-item-delete"
              title="Move to Trash"
              aria-label="Move to Trash"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(n.id);
              }}
            >
              <IconTrash width={14} height={14} />
            </button>
          </div>
        ))}
        {!filtered.length && <div className="note-list-empty">{query ? 'No matching notes' : 'No notes yet'}</div>}
      </nav>
      <div className="sidebar-footer" title={folderName}>
        {notes.length} {notes.length === 1 ? 'note' : 'notes'}
      </div>
    </aside>
  );
});
