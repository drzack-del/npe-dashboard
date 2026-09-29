// Shared helpers for the app tests.
import { test as base, expect } from '@playwright/test';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { GATEWAY_URL, PG_CONNECTION } from '../local-app/local-config.mjs';

// The production Supabase project. Versions of the app that have its address built in are
// answered by the local test stack instead; the request never leaves this machine.
const PRODUCTION_SUPABASE_HOST = 'flhvblepqsuvsmscmmxm.supabase.co';
const LOCAL_HOSTS = ['localhost', '127.0.0.1'];
import { LOCAL_TEST_PASSWORD } from '../local-app/demo-users.mjs';

// Two-step verification (SecurityGate) ships with the pending security update. Tests of it
// are marked as known gaps on versions of the app that do not have it yet.
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
export const APP_HAS_TWO_STEP = existsSync(path.join(repo, 'src/SecurityGate.jsx'));
export const TWO_STEP_GAP = 'Known gap in this version: no two-step verification yet (it ships with the pending security update)';

// Console errors the app is expected to log in local testing (stubbed integrations, and the
// deliberate bad-password / bad-code checks). Anything else fails the test.
const EXPECTED_CONSOLE_ERRORS = [
  /Greyfinch is not connected in local testing/,
  /Failed to load resource: the server responded with a status of (400|422|503)/,
];

export const test = base.extend({
  // Network lock, installed on the browser context before any page exists, so it covers every
  // request from the first one: nothing may leave this machine. Requests for the production
  // Supabase address are answered by the local stack; anything else outside is cut off before
  // it is sent, and the test fails.
  blockedRequests: async ({}, use) => { await use([]); },
  context: async ({ context, blockedRequests }, use) => {
    await context.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (LOCAL_HOSTS.includes(url.hostname) || ['data:', 'blob:'].includes(url.protocol)) return route.continue();
      if (url.hostname === PRODUCTION_SUPABASE_HOST) {
        const response = await route.fetch({ url: `${GATEWAY_URL}${url.pathname}${url.search}` });
        return route.fulfill({ response });
      }
      blockedRequests.push(url.href);
      return route.abort('blockedbyclient');
    });
    // Live connections (websockets) are not covered by route(); only local ones (the dev
    // server's reload channel) may open.
    await context.routeWebSocket(/.*/, ws => {
      if (LOCAL_HOSTS.includes(new URL(ws.url()).hostname)) return ws.connectToServer();
      blockedRequests.push(ws.url());
      return ws.close();
    });
    await use(context);
  },
  // Runs for every test automatically.
  guard: [async ({ page, blockedRequests }, use) => {
    const consoleErrors = [];
    page.on('console', msg => {
      if (msg.type() === 'error' && !EXPECTED_CONSOLE_ERRORS.some(re => re.test(msg.text()))) consoleErrors.push(msg.text());
    });
    page.on('pageerror', err => consoleErrors.push(`Uncaught: ${err.message}`));
    await use();
    expect(blockedRequests, 'the app tried to contact something outside this machine (blocked before it was sent)').toEqual([]);
    expect(consoleErrors, 'unexpected errors in the browser console').toEqual([]);
    await expect(page.getByText('Something went wrong'), 'the app crashed to its error screen').toHaveCount(0);
  }, { auto: true }],
});
export { expect };

export async function currentCode(email) {
  const res = await fetch(`${GATEWAY_URL}/__dev/totp?email=${encodeURIComponent(email)}`);
  return (await res.json()).code;
}

export async function submitPassword(page, email, password = LOCAL_TEST_PASSWORD) {
  await page.goto('/');
  await page.getByPlaceholder('you@example.com').fill(email);
  await page.getByPlaceholder('Enter your password').fill(password);
  await page.getByPlaceholder('Enter your password').press('Enter');
}

export async function enterCode(page, email) {
  await page.getByLabel('Authentication code').fill(await currentCode(email));
  await page.getByRole('button', { name: 'Verify and continue' }).click();
}

// Full sign-in: password, then the authenticator code on versions that ask for one.
// Resolves once the app shell is showing.
export async function signIn(page, email) {
  await submitPassword(page, email);
  if (APP_HAS_TWO_STEP) {
    await expect(page.getByLabel('Authentication code')).toBeVisible();
    await enterCode(page, email);
  }
  await expect(page.getByRole('button', { name: 'Sign Out', exact: true })).toBeVisible();
}

export async function signOut(page) {
  await page.getByRole('button', { name: 'Sign Out', exact: true }).click();
  await expect(page.getByPlaceholder('you@example.com')).toBeVisible();
}

export async function openTab(page, label) {
  await page.getByRole('button', { name: new RegExp(label) }).first().click();
}

// Reads the test database directly, to confirm what the app shows is what was stored.
export async function dbQuery(sql, params = []) {
  const client = new pg.Client(PG_CONNECTION);
  await client.connect();
  try {
    return (await client.query(sql, params)).rows;
  } finally {
    await client.end();
  }
}
