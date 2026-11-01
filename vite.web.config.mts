import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/** Run the renderer in a plain browser (notes stored in localStorage). */
export default defineConfig({
  root: resolve(import.meta.dirname, 'src/renderer'),
  plugins: [
    react(),
    {
      name: 'web-csp',
      transformIndexHtml: (html) => html.replace("script-src 'self'", "script-src 'self' 'unsafe-inline'"),
    },
  ],
  build: { outDir: resolve(import.meta.dirname, 'out/web'), emptyOutDir: true },
  server: { port: 5199 },
});
