import type { MusicNotesApi } from '../../shared/api';
import { createBrowserApi } from './browser';

declare global {
  interface Window {
    musicNotes?: MusicNotesApi;
  }
}

/** The Electron preload API when running in the app, or a localStorage-backed stand-in in a plain browser. */
export const api: MusicNotesApi = window.musicNotes ?? createBrowserApi();
export const isElectron = !!window.musicNotes;
