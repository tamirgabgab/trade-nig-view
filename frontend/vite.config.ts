/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const backendUrl = process.env['CHARTLAB_BACKEND_URL'] ?? 'http://127.0.0.1:8000';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    // The learn pages test reads ../docs/indicators (KaTeX check).
    fs: { allow: ['.', '../docs'] },
    proxy: {
      '/api': { target: backendUrl, changeOrigin: true },
    },
  },
  css: {
    modules: { localsConvention: 'camelCaseOnly' },
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: { modules: { classNameStrategy: 'non-scoped' } },
    restoreMocks: true,
  },
});
