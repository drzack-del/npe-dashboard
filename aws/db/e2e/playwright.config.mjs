// Automated click-through of the real CadenceIQ app against the local test stack.
// Run from aws/db:  npm run test:app   (or `npm test` for database + app checks together)
//
// Each run starts a fresh test database with fake data and deletes it afterwards, so tests
// always begin from the same known state. Nothing here can reach production: the app is
// handed the local backend's address directly, and every test fails if the browser tries to
// contact anything other than this machine.
import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { APP_ENV, GATEWAY_URL } from '../local-app/local-config.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../../..');
const APP_PORT = 5175;

export default defineConfig({
  testDir: here,
  // Tests share one database, so they run one at a time in a fixed order.
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [['list'], ['html', { outputFolder: path.join(here, 'report'), open: 'never' }]],
  outputDir: path.join(here, 'test-results'),
  use: {
    baseURL: `http://localhost:${APP_PORT}`,
    viewport: { width: 1280, height: 900 },
    timezoneId: 'America/New_York',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 900 } } }],
  webServer: [
    {
      command: 'node aws/db/local-app/start.mjs',
      cwd: repo,
      url: `${GATEWAY_URL}/__health`,
      reuseExistingServer: false,
      timeout: 120_000,
      stdout: 'ignore',
    },
    {
      command: `npx vite --mode awslocal --port ${APP_PORT} --strictPort`,
      cwd: repo,
      env: { ...process.env, ...APP_ENV },
      url: `http://localhost:${APP_PORT}`,
      reuseExistingServer: false,
      timeout: 120_000,
      stdout: 'ignore',
    },
  ],
});
