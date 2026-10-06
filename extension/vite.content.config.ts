import { defineConfig } from 'vite';
import { fileURLToPath, URL } from 'node:url';

/**
 * Build 2 of 2 — the content script.
 *
 * Content scripts are not ES modules, so this has to be a single self-contained
 * IIFE. It is deliberately dependency-free (no React, no Supabase) because it
 * is injected into third-party pages and should stay small and side-effect free.
 */
export default defineConfig({
  resolve: {
    alias: { '@shared': fileURLToPath(new URL('../shared', import.meta.url)) },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: false, // the main build already populated dist/
    target: 'esnext',
    sourcemap: false,
    cssCodeSplit: false,
    lib: {
      entry: fileURLToPath(new URL('src/capture/content.ts', import.meta.url)),
      formats: ['iife'],
      name: 'UXEvidenceCapture',
      fileName: () => 'content.js',
    },
    rollupOptions: { output: { extend: true } },
  },
});
