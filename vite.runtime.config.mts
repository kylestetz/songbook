import { resolve } from 'node:path';
import { defineConfig } from 'vite';

/**
 * Builds the standalone runtime that gets inlined into published HTML files:
 * theory + audio + widgets + styles, no app code.
 */
export default defineConfig({
  build: {
    outDir: resolve(import.meta.dirname, 'build/runtime'),
    emptyOutDir: true,
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
