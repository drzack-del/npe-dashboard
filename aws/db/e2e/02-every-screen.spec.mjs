// Opens every tab for each kind of account. The shared guard fails the test on any crash,
// unexpected console error, or request that leaves this machine.
import { test, expect, signIn, openTab, dbQuery } from './fixtures.mjs';

const ACCOUNTS = [
  { who: 'practice admin', email: 'admin@demo-ortho.invalid',
    tabs: ['Dashboard', 'Follow-Up Queue', 'Add NPE', 'All Patients', 'Medicaid Pipeline', 'Bonus Audit', 'On-Time Audit', "Today's Activity"] },
  { who: 'treatment coordinator', email: 'tc@demo-ortho.invalid',
    tabs: ['Dashboard', 'Follow-Up Queue', 'Add NPE', 'All Patients', 'Medicaid Pipeline', 'On-Time Audit', "Today's Activity"] },
  { who: 'location owner', email: 'north-owner@demo-ortho.invalid',
    tabs: ['Dashboard', 'All Patients', 'Settings'] },
];

for (const account of ACCOUNTS) {
  test(`every screen opens without errors for the ${account.who}`, async ({ page }) => {
    await signIn(page, account.email);
    for (const tab of account.tabs) {
      await test.step(tab, async () => {
        await openTab(page, tab);
        await page.waitForLoadState('networkidle');
        await expect(page.getByRole('button', { name: 'Sign Out', exact: true })).toBeVisible();
      });
    }
  });
}

test('the treatment coordinator does not get owner-only tabs', async ({ page }) => {
  await signIn(page, 'tc@demo-ortho.invalid');
  await expect(page.getByRole('button', { name: /Bonus Audit/ })).toHaveCount(0);
});

test('the dashboard\'s NPE count for this month matches the database', async ({ page }) => {
  const month = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date()).slice(0, 7);
  const [{ n }] = await dbQuery(`SELECT count(*)::int AS n FROM public.patients WHERE practice_id = 'demo-ortho' AND npe_date LIKE $1`, [`${month}-%`]);
  await signIn(page, 'admin@demo-ortho.invalid');
  const npeCell = page.getByRole('cell', { name: /^NPEs \d+/ }).first();
  await expect(npeCell).toBeVisible();
  expect(Number((await npeCell.innerText()).match(/\d+/)[0])).toBe(n);
  await expect(page.getByRole('cell', { name: 'North', exact: true })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'South', exact: true })).toBeVisible();
});
