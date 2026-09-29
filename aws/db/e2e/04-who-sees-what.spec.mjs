// Each account sees only what it should, checked on screen and against the database.
import { test, expect, signIn, openTab, dbQuery } from './fixtures.mjs';

const locationCounts = page => page.evaluate(() => {
  const text = document.body.innerText;
  const count = place => (text.match(new RegExp(`📍 ${place}`, 'g')) || []).length;
  return { North: count('North'), South: count('South'), Downtown: count('Downtown') };
});

test('the practice admin sees both of their offices and nothing from the other practice', async ({ page }) => {
  await signIn(page, 'admin@demo-ortho.invalid');
  await openTab(page, 'All Patients');
  await expect(page.getByText('📍 North').first()).toBeVisible();
  const counts = await locationCounts(page);
  expect(counts.North).toBeGreaterThan(0);
  expect(counts.South).toBeGreaterThan(0);
  expect(counts.Downtown).toBe(0);
});

test('the North office owner sees every North patient and no South patients', async ({ page }) => {
  await signIn(page, 'north-owner@demo-ortho.invalid');
  await openTab(page, 'All Patients');
  await expect(page.getByText('📍 North').first()).toBeVisible();
  const [{ n }] = await dbQuery(`SELECT count(*)::int AS n FROM public.patients WHERE practice_id = 'demo-ortho' AND location = 'North'`);
  const counts = await locationCounts(page);
  expect(counts).toEqual({ North: n, South: 0, Downtown: 0 });
});

test('another practice\'s admin sees only their own patients', async ({ page }) => {
  await signIn(page, 'other-admin@other-ortho.invalid');
  await expect(page.getByRole('banner').getByText('Other Orthodontics (fake)')).toBeVisible();
  await openTab(page, 'All Patients');
  await expect(page.getByText('📍 Downtown').first()).toBeVisible();
  const [{ n }] = await dbQuery(`SELECT count(*)::int AS n FROM public.patients WHERE practice_id = 'other-ortho'`);
  const counts = await locationCounts(page);
  expect(counts).toEqual({ North: 0, South: 0, Downtown: n });
  await expect(page.getByText('Demo Orthodontics (fake)')).toHaveCount(0);
});
