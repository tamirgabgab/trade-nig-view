// Starts the backend for the Playwright tests: offline, on the synthetic e2e fixtures, with a
// throw-away data directory. Cross-platform (Windows + Linux), so it is plain Node, not a shell.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const data = resolve(here, 'data');
const backend = resolve(here, '..', '..', 'backend');
const port = process.env.E2E_BACKEND_PORT ?? '8010';
const dataDir = mkdtempSync(join(tmpdir(), 'chartlab-e2e-'));

const child = spawn(
  'uv',
  [
    'run',
    'python',
    '-m',
    'uvicorn',
    '--factory',
    'app.main:create_app',
    '--host',
    '127.0.0.1',
    '--port',
    port,
  ],
  {
    cwd: backend,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: {
      ...process.env,
      OFFLINE: '1',
      FIXTURES_DIR: data,
      UNIVERSE_FILE: join(data, 'universe.toml'),
      CHARTLAB_DATA_DIR: dataDir,
      CHARTLAB_CORS_ORIGINS: 'http://127.0.0.1:5183',
      TIINGO_API_KEY: '',
    },
  },
);

const stop = () => {
  child.kill();
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
child.on('exit', (code) => {
  rmSync(dataDir, { recursive: true, force: true });
  process.exit(code ?? 0);
});
