/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// GitHub Pages serves the site under /<repo>/; override with BASE_PATH when needed.
export default defineConfig({
  base: process.env.BASE_PATH ?? './',
  plugins: [react()],
  server: { watch: { usePolling: !!process.env.VITE_POLL } },
  build: {
    chunkSizeWarningLimit: 1500,
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: false,
  },
});
