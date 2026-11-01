import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import type { MusicNotesApi } from '../shared/api';

const api: MusicNotesApi = {
  platform: process.platform,
  getFolder: () => ipcRenderer.invoke('notes:folder'),
  chooseFolder: () => ipcRenderer.invoke('notes:choose-folder'),
  listNotes: () => ipcRenderer.invoke('notes:list'),
  readNote: (id) => ipcRenderer.invoke('notes:read', id),
  saveNote: (id, content) => ipcRenderer.invoke('notes:save', id, content),
  createNote: (content) => ipcRenderer.invoke('notes:create', content),
  deleteNote: (id) => ipcRenderer.invoke('notes:delete', id),
  revealNote: (id) => ipcRenderer.invoke('notes:reveal', id),
  saveAsset: (noteId, name, data) => ipcRenderer.invoke('assets:save', noteId, name, data),
  assetUrl: (src) => {
    if (/^(https?:|data:|blob:|mn-asset:)/.test(src)) return src;
    return `mn-asset://notes/${src.split('/').map(encodeURIComponent).join('/')}`;
  },
  assetDataUrl: (src) => ipcRenderer.invoke('assets:data-url', src),
  exportHtml: (name, html) => ipcRenderer.invoke('export:html', name, html),
  openExternal: (url) => ipcRenderer.invoke('app:open-external', url),
  onMenu: (handler) => {
    const fn = (_e: IpcRendererEvent, command: string, arg?: unknown) => handler(command, arg);
    ipcRenderer.on('menu', fn);
    return () => ipcRenderer.removeListener('menu', fn);
  },
  onNotesChanged: (handler) => {
    const fn = () => handler();
    ipcRenderer.on('notes:changed', fn);
    return () => ipcRenderer.removeListener('notes:changed', fn);
  },
};

contextBridge.exposeInMainWorld('musicNotes', api);
