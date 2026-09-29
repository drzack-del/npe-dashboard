// Shared helpers for the app tests.
import { test as base, expect } from '@playwright/test';
import pg from 'pg';
import { GATEWAY_URL, PG_CONNECTION } from '../local-app/local-config.mjs';
import { LOCAL_TEST_PASSWORD } from '../local-app/demo-users.mjs';

// Console errors the app is expected to log in local testing (stubbed integrations, and the
// deliberate bad-password / bad-code checks). Anything else fails the test.
const EXPECTED_CONSOLE_ERRORS = [
  /Greyfinch is not connected in local testing/,
  /Failed to load resource: the server responded with a status of (400|422|503)/,
];

export const test = base.extend({
  // Runs for every test automatically.
  guard: [async ({ page }, use) => {
    const outsideRequests = [];
    const consoleErrors = [];
    page.on('request', req => {
      const { hostname, protocol } = new URL(req.url());
      if (!['localhost', '127.0.0.1'].includes(hostname) && !['data:', 'blob:'].includes(protocol)) outsideRequests.push(req.url());
    });
    page.on('console', msg => {
      if (msg.type() === 'error' && !EXPECTED_CONSOLE_ERRORS.some(re => re.test(msg.text()))) consoleErrors.push(msg.text());
    });
    page.on('pageerror', err => consoleErrors.push(`Uncaught: ${err.message}`));
    await use();
    expect(outsideRequests, 'the app must never contact anything outside this machine').toEqual([]);
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

// Full sign-in: password, then authenticator code. Resolves once the app shell is showing.
export async function signIn(page, email) {
  await submitPassword(page, email);
  await expect(page.getByLabel('Authentication code')).toBeVisible();
  await enterCode(page, email);
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
