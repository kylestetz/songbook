import { resolve } from 'node:path';
import { defineConfig } from 'vite';

/**
 * Builds the standalone runtime that gets inlined into published HTML files:
 * theory + audio + widgets + styles, no app code.
 */
export default defineConfig({
  build: {
    outDir: resolve(import.meta.dirname, 'build/runtime'),
    // File names are fixed, so there's nothing stale to clear; emptying would also
    // briefly delete the files the app imports while `watch:runtime` rebuilds.
    emptyOutDir: false,
    cssCodeSplit: false,
    lib: {
      entry: resolve(import.meta.dirname, 'src/core/runtime/index.ts'),
      name: 'MusicNotes',
      formats: ['iife'],
      fileName: () => 'music-notes-runtime.js',
      cssFileName: 'music-notes-runtime',
    },
    minify: true,
  },
});
