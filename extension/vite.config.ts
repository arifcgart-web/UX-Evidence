import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

/**
 * Build 1 of 2 — popup (HTML entry) + background service worker.
 *
 * Both ship as ES modules: MV3 service workers support `"type": "module"`,
 * and the popup is a normal document.
 *
 * The content script needs a different output format (IIFE, single file) and
 * is therefore built separately by `vite.content.config.ts`.
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@shared': fileURLToPath(new URL('../shared', import.meta.url)) },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'esnext',
    sourcemap: false,
    rollupOptions: {
      input: {
        popup: fileURLToPath(new URL('popup.html', import.meta.url)),
        annotate: fileURLToPath(new URL('annotate.html', import.meta.url)),
        background: fileURLToPath(new URL('src/background/service-worker.ts', import.meta.url)),
      },
      output: {
        // The manifest references these paths literally, so keep them stable.
        entryFileNames: (chunk) =>
          chunk.name === 'background' ? 'background.js' : 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
});
