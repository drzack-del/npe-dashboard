// Adding, editing and deleting a patient through the app, checking the database each time.
import { test, expect, signIn, openTab, dbQuery } from './fixtures.mjs';

const NAME = 'Automated Testpatient';

// A patient card in the list: the innermost block holding both the name and an Edit button.
const card = (page, name) => page.locator('div')
  .filter({ hasText: name })
  .filter({ has: page.getByRole('button', { name: /Edit/ }) })
  .last();

test.describe.configure({ mode: 'serial' });

test('adding a pending patient saves every field to the database', async ({ page }) => {
  await signIn(page, 'admin@demo-ortho.invalid');
  await openTab(page, 'Add NPE');
  await page.getByPlaceholder('John Smith').fill(NAME);
  await page.getByPlaceholder('(813) 555-0000').fill('5550199');
  await page.getByRole('button', { name: 'No', exact: true }).first().click(); // not Medicaid
  await page.getByRole('radio', { name: 'PEN' }).check();
  await page.getByPlaceholder('$500').fill('400');
  await page.getByPlaceholder('$5,800').fill('5600');
  await page.getByPlaceholder('24', { exact: true }).fill('20');
  await page.locator('select').filter({ has: page.locator('option[value="24"]') }).selectOption('24');
  await page.locator('select').filter({ has: page.locator('option', { hasText: 'Waiting on Finances' }) }).selectOption({ label: 'Waiting on Finances' });
  await page.getByRole('button', { name: 'No', exact: true }).nth(1).click(); // not a transfer
  await page.getByRole('button', { name: /Add Patient/ }).click();
  await expect(page.getByText(`${NAME} saved`)).toBeVisible();

  const rows = await dbQuery('SELECT * FROM public.patients WHERE name = $1', [NAME]);
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({
    practice_id: 'demo-ortho', location: 'North', phone: '5550199', pen: true, st: false,
    obstacle: 'Waiting on Finances', dp: '400', contract_amount: '5600',
    financed_months: 20, treatment_months: 24, is_medicaid: false, is_transfer_patient: false,
  });
  expect(rows[0].next_touch_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);

  const audit = await dbQuery(`SELECT count(*)::int AS n FROM private.security_events WHERE record_id = $1 AND event_name = 'insert'`, [rows[0].id]);
  expect(audit[0].n, 'the save is recorded in the audit log').toBe(1);
});

test('the new patient is still there after a reload', async ({ page }) => {
  await signIn(page, 'admin@demo-ortho.invalid');
  await openTab(page, 'All Patients');
  await expect(card(page, NAME)).toBeVisible();
});

test('editing a patient\'s notes saves to the database', async ({ page }) => {
  await signIn(page, 'admin@demo-ortho.invalid');
  await openTab(page, 'All Patients');
  await card(page, NAME).getByRole('button', { name: /Edit/ }).click();
  const notes = page.locator('label:text-is("Notes") + textarea');
  await notes.fill('Edited by the automated test');
  await page.getByRole('button', { name: /Save Changes/ }).click();
  await expect.poll(async () => (await dbQuery('SELECT notes FROM public.patients WHERE name = $1', [NAME]))[0]?.notes)
    .toBe('Edited by the automated test');
});

test('deleting a patient removes it from the database', async ({ page }) => {
  await signIn(page, 'admin@demo-ortho.invalid');
  await openTab(page, 'All Patients');
  page.once('dialog', dialog => dialog.accept());
  await card(page, NAME).getByRole('button', { name: /Delete/ }).click();
  await expect(page.getByText(NAME)).toHaveCount(0);
  await expect.poll(async () => (await dbQuery('SELECT count(*)::int AS n FROM public.patients WHERE name = $1', [NAME]))[0].n)
    .toBe(0);
});

// Known bug, being fixed in a separate session: "today" is computed in UTC, so in the evening
// (US time) a new patient's NPE date defaults to tomorrow. The browser here runs in a time zone
// whose date differs from UTC right now, so this reproduces at any hour. test.fail() keeps the
// suite green while the bug exists and flags it the moment the fix lands, so this line can go.
const utcHour = new Date().getUTCHours();
const zone = utcHour >= 10 ? 'Pacific/Kiritimati' : 'Etc/GMT+12';
test.describe('in a time zone whose date differs from UTC', () => {
  test.use({ timezoneId: zone });
  test('a new patient defaults to today\'s local date', async ({ page }) => {
    test.fail(true, 'Known bug: new-patient date uses UTC (fix in progress)');
    const localToday = new Intl.DateTimeFormat('en-CA', { timeZone: zone }).format(new Date());
    await signIn(page, 'admin@demo-ortho.invalid');
    await openTab(page, 'Add NPE');
    await expect(page.locator('input[type="date"]').nth(1)).toHaveValue(localToday);
  });
});
