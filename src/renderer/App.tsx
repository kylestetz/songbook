import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getAudioEngine } from '../core/audio';
import { effectiveSettings, joinFrontmatter, splitFrontmatter, type DocSettings } from '../core/markdown';
import type { WidgetContext } from '../core/widgets';
import type { NoteMeta } from '../shared/api';
import { api, isElectron } from './api';
import { EditorPane, type EditorPaneHandle } from './components/EditorPane';
import { IconPlus, IconShare, IconSidebar, IconSliders } from './components/icons';
import { SettingsPanel } from './components/SettingsPanel';
import { Sidebar } from './components/Sidebar';
import { exportNote } from './publish';

const SAVE_DELAY = 350;

export function App() {
  const [notes, setNotes] = useState<NoteMeta[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [settings, setSettingsState] = useState<DocSettings>({});
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    try {
      return localStorage.getItem('mn:sidebar') !== 'closed';
    } catch {
      return true;
    }
  });
  const [query, setQuery] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [words, setWords] = useState(0);
  const [status, setStatus] = useState<'saved' | 'saving' | 'error'>('saved');
  const [folder, setFolder] = useState('');
  const [toast, setToast] = useState<string | null>(null);

  const editor = useRef<EditorPaneHandle>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const idRef = useRef<string | null>(null);
  const settingsRef = useRef<DocSettings>({});
  const lastSaved = useRef<string>('');
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveChain = useRef<Promise<void>>(Promise.resolve());
  const dirty = useRef(false);

  const isMac = api.platform === 'darwin';

  // ----- Audio + widget context -----
  const ctx = useMemo<WidgetContext>(() => {
    const audio = getAudioEngine();
    return { audio, settings: () => effectiveSettings(settingsRef.current) };
  }, []);

  useEffect(() => {
    const eff = effectiveSettings(settings);
    const audio = getAudioEngine();
    audio.instrument = eff.sound;
    audio.tempo = eff.tempo;
    audio.setVolume(eff.volume);
  }, [settings]);

  // ----- Persistence -----
  const refreshList = useCallback(async () => {
    const list = await api.listNotes();
    setNotes(list);
    return list;
  }, []);

  const flushSave = useCallback(() => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    if (!dirty.current || !idRef.current) return saveChain.current;
    dirty.current = false;
    const content = joinFrontmatter(settingsRef.current, editor.current?.getMarkdown() ?? '');
    if (content === lastSaved.current) return saveChain.current;
    setStatus('saving');
    saveChain.current = saveChain.current.then(async () => {
      const id = idRef.current;
      if (!id) return;
      try {
        const res = await api.saveNote(id, content);
        lastSaved.current = content;
        if (res.id !== id && idRef.current === id) {
          idRef.current = res.id;
          setCurrentId(res.id);
        }
        setStatus(dirty.current ? 'saving' : 'saved');
        await refreshList();
      } catch (err) {
        console.error(err);
        setStatus('error');
      }
    });
    return saveChain.current;
  }, [refreshList]);

  const scheduleSave = useCallback(() => {
    dirty.current = true;
    setStatus('saving');
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => void flushSave(), SAVE_DELAY);
  }, [flushSave]);

  const openNote = useCallback(
    async (id: string) => {
      await flushSave();
      const content = await api.readNote(id);
      const { settings: s, body } = splitFrontmatter(content);
      idRef.current = id;
      settingsRef.current = s;
      lastSaved.current = content;
      setCurrentId(id);
      setSettingsState(s);
      editor.current?.setContent(body);
      try {
        localStorage.setItem('mn:last', id);
      } catch {
        /* ignore */
      }
    },
    [flushSave],
  );

  const newNote = useCallback(async () => {
    await flushSave();
    const id = await api.createNote('');
    await refreshList();
    await openNote(id);
    setQuery('');
    editor.current?.focus();
  }, [flushSave, openNote, refreshList]);

  const deleteNote = useCallback(
    async (id: string) => {
      const note = notes.find((n) => n.id === id);
      if (!window.confirm(`Move “${note?.title || 'Untitled'}” to the Trash?`)) return;
      if (id === idRef.current) {
        if (saveTimer.current) clearTimeout(saveTimer.current);
        dirty.current = false;
        await saveChain.current;
      }
      await api.deleteNote(id);
      const list = await refreshList();
      if (id === idRef.current) {
        idRef.current = null;
        if (list[0]) await openNote(list[0].id);
        else {
          setCurrentId(null);
          editor.current?.setContent('');
        }
      }
    },
    [notes, openNote, refreshList],
  );

  const updateSettings = useCallback(
    (s: DocSettings) => {
      settingsRef.current = s;
      setSettingsState(s);
      scheduleSave();
    },
    [scheduleSave],
  );

  const doExport = useCallback(async () => {
    if (!idRef.current) return;
    await flushSave();
    const content = joinFrontmatter(settingsRef.current, editor.current?.getMarkdown() ?? '');
    const note = notes.find((n) => n.id === idRef.current);
    const path = await exportNote(content, note?.title || 'Untitled');
    if (path) {
      setToast(`Exported ${path.split(/[\\/]/).pop()}`);
      setTimeout(() => setToast(null), 2600);
    }
  }, [flushSave, notes]);

  // ----- Startup -----
  useEffect(() => {
    void (async () => {
      setFolder(await api.getFolder());
      let list = await refreshList();
      if (!list.length) {
        await api.createNote('');
        list = await refreshList();
      }
      let last: string | null = null;
      try {
        last = localStorage.getItem('mn:last');
      } catch {
        /* ignore */
      }
      const pick = list.find((n) => n.id === last) ?? list[0];
      if (pick) await openNote(pick.id);
    })();
  }, []); // startup only

  // Save before the window closes
  useEffect(() => {
    const onUnload = () => void flushSave();
    window.addEventListener('beforeunload', onUnload);
    return () => window.removeEventListener('beforeunload', onUnload);
  }, [flushSave]);

  // External changes to the notes folder
  useEffect(
    () =>
      api.onNotesChanged(async () => {
        await refreshList();
        const id = idRef.current;
        if (!id || dirty.current) return;
        try {
          const content = await api.readNote(id);
          if (content !== lastSaved.current && !dirty.current) {
            const { settings: s, body } = splitFrontmatter(content);
            lastSaved.current = content;
            settingsRef.current = s;
            setSettingsState(s);
            editor.current?.setContent(body);
          }
        } catch {
          /* the file may have been renamed or removed */
        }
      }),
    [refreshList],
  );

  // ----- Menu commands -----
  const toggleSidebar = useCallback(() => {
    setSidebarOpen((o) => {
      try {
        localStorage.setItem('mn:sidebar', o ? 'closed' : 'open');
      } catch {
        /* ignore */
      }
      return !o;
    });
  }, []);

  useEffect(
    () =>
      api.onMenu(async (command, arg) => {
        switch (command) {
          case 'new-note':
            return newNote();
          case 'export-html':
            return doExport();
          case 'toggle-sidebar':
            return toggleSidebar();
          case 'document-settings':
            return setSettingsOpen((o) => !o);
          case 'insert-widget':
            if (typeof arg === 'string') editor.current?.openWidget(arg);
            else editor.current?.openInsertMenu();
            return;
          case 'find-note':
            setSidebarOpen(true);
            setTimeout(() => searchRef.current?.focus(), 0);
            return;
          case 'delete-note':
            if (idRef.current) return deleteNote(idRef.current);
            return;
          case 'reveal-note':
            if (idRef.current) return api.revealNote(idRef.current);
            return;
          case 'format':
            editor.current?.format(String(arg));
            return;
          case 'folder-changed': {
            setFolder(await api.getFolder());
            idRef.current = null;
            const list = await refreshList();
            if (list[0]) await openNote(list[0].id);
            else await newNote();
            return;
          }
        }
      }),
    [newNote, doExport, toggleSidebar, deleteNote, refreshList, openNote],
  );

  // Browser-only keyboard shortcuts (in Electron the app menu provides these)
  useEffect(() => {
    if (isElectron) return;
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.key === '\\') {
        e.preventDefault();
        toggleSidebar();
      } else if (e.key === ',') {
        e.preventDefault();
        setSettingsOpen((o) => !o);
      } else if (e.key.toLowerCase() === 'k' && e.shiftKey) {
        e.preventDefault();
        editor.current?.openInsertMenu();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggleSidebar]);

  const current = notes.find((n) => n.id === currentId);

  return (
    <div className={`app${sidebarOpen ? '' : ' sidebar-closed'}${isMac ? ' is-mac' : ''}`}>
      <Sidebar
        ref={searchRef}
        notes={notes}
        currentId={currentId}
        query={query}
        onQuery={setQuery}
        onSelect={(id) => void openNote(id)}
        onNew={() => void newNote()}
        onDelete={(id) => void deleteNote(id)}
        folderName={folder}
        isMac={isMac}
      />
      <main className="main">
        <header className="topbar drag">
          <div className="topbar-left no-drag">
            <button className="icon-button" onClick={toggleSidebar} title="Toggle sidebar (⌘\)" aria-label="Toggle sidebar">
              <IconSidebar />
            </button>
          </div>
          <div className="topbar-title">{current?.title || ''}</div>
          <div className="topbar-right no-drag">
            <button
              className="icon-button"
              data-insert-toggle
              onClick={(e) => editor.current?.openInsertMenu((e.currentTarget as HTMLElement).getBoundingClientRect())}
              title="Insert widget (/)"
              aria-label="Insert widget"
            >
              <IconPlus />
            </button>
            <button
              className={`icon-button${settingsOpen ? ' is-on' : ''}`}
              data-settings-toggle
              onClick={() => setSettingsOpen((o) => !o)}
              title="Document settings (⌘,)"
              aria-label="Document settings"
            >
              <IconSliders />
            </button>
            <button className="icon-button" onClick={() => void doExport()} title="Export as HTML (⇧⌘E)" aria-label="Export as HTML">
              <IconShare />
            </button>
          </div>
          {settingsOpen && <SettingsPanel settings={settings} onChange={updateSettings} onClose={() => setSettingsOpen(false)} />}
        </header>
        <div className="editor-scroll" onMouseDown={(e) => {
          // Clicking the empty area below the text focuses the end of the document
          if (e.target === e.currentTarget) {
            e.preventDefault();
            editor.current?.focus();
          }
        }}>
          <div className="editor-column">
            <EditorPane ref={editor} ctx={ctx} noteId={currentId} onChange={scheduleSave} onWordCount={setWords} />
          </div>
        </div>
        <footer className="statusbar">
          <span className={`status-dot is-${status}`} title={status === 'saved' ? 'Saved' : status === 'saving' ? 'Saving…' : 'Could not save'} />
          <span>
            {words} {words === 1 ? 'word' : 'words'}
          </span>
        </footer>
        {toast && <div className="toast">{toast}</div>}
      </main>
    </div>
  );
}
