import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests: the real backend (offline, synthetic fixtures in e2e/data) behind the Vite dev
 * server, driven by Chromium. Ports differ from `dev` (8000/5173) so a running app is not hit.
 * Run: `npm run e2e -- --trace off`.
 */
const BACKEND_PORT = 8010;
const FRONTEND_PORT = 5183;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 1 : 0,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  reporter: process.env['CI'] ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://127.0.0.1:${String(FRONTEND_PORT)}`,
    viewport: { width: 1280, height: 800 },
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
    },
  ],
  webServer: [
    {
      command: 'node e2e/serve-backend.mjs',
      url: `http://127.0.0.1:${String(BACKEND_PORT)}/api/health`,
      env: { E2E_BACKEND_PORT: String(BACKEND_PORT) },
      reuseExistingServer: false,
      timeout: 180_000,
    },
    {
      command: `npx vite --host 127.0.0.1 --port ${String(FRONTEND_PORT)}`,
      url: `http://127.0.0.1:${String(FRONTEND_PORT)}`,
      env: { CHARTLAB_BACKEND_URL: `http://127.0.0.1:${String(BACKEND_PORT)}` },
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
