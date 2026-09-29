import { test, expect, submitPassword, enterCode, signIn, signOut, currentCode, APP_HAS_TWO_STEP, TWO_STEP_GAP } from './fixtures.mjs';

test('a wrong password is rejected', async ({ page }) => {
  await submitPassword(page, 'admin@demo-ortho.invalid', 'not-the-right-password');
  await expect(page.getByText('Invalid login credentials')).toBeVisible();
  await expect(page.getByLabel('Authentication code')).toHaveCount(0);
});

test('a password alone does not open the app; a wrong code is rejected', async ({ page }) => {
  test.fail(!APP_HAS_TWO_STEP, TWO_STEP_GAP);
  await submitPassword(page, 'admin@demo-ortho.invalid');
  await expect(page.getByLabel('Authentication code')).toBeVisible();
  const real = await currentCode('admin@demo-ortho.invalid');
  await page.getByLabel('Authentication code').fill(real === '000000' ? '111111' : '000000');
  await page.getByRole('button', { name: 'Verify and continue' }).click();
  await expect(page.getByText('Invalid TOTP code entered')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign Out', exact: true })).toHaveCount(0);
});

test('signing in opens the practice dashboard', async ({ page }) => {
  await signIn(page, 'admin@demo-ortho.invalid');
  await expect(page.getByRole('banner').getByText('Demo Orthodontics (fake)')).toBeVisible();
  await expect(page.getByText(/Practice Health/)).toBeVisible();
});

test('reloading the page keeps you signed in', async ({ page }) => {
  await signIn(page, 'admin@demo-ortho.invalid');
  await page.reload();
  await expect(page.getByRole('button', { name: 'Sign Out', exact: true })).toBeVisible();
  await expect(page.getByRole('banner').getByText('Demo Orthodontics (fake)')).toBeVisible();
});

test('signing out returns to the login screen and a reload stays signed out', async ({ page }) => {
  await signIn(page, 'admin@demo-ortho.invalid');
  await signOut(page);
  await page.reload();
  await expect(page.getByPlaceholder('you@example.com')).toBeVisible();
  await expect(page.getByText('Demo Orthodontics (fake)')).toHaveCount(0);
});

test('a new staff member sets up an authenticator, then is asked for codes on later sign-ins', async ({ page }) => {
  test.fail(!APP_HAS_TWO_STEP, TWO_STEP_GAP);
  const email = 'new-tc@demo-ortho.invalid';
  await submitPassword(page, email);
  await expect(page.getByRole('button', { name: 'Set up two-step verification' })).toBeVisible();
  await page.getByRole('button', { name: 'Set up two-step verification' }).click();
  await expect(page.getByText('Scan this code with your authenticator app')).toBeVisible();
  await enterCode(page, email);
  await expect(page.getByRole('button', { name: 'Sign Out', exact: true })).toBeVisible();
  await expect(page.getByRole('banner').getByText('Nora New TC (fake)')).toBeVisible();

  await signOut(page);
  await submitPassword(page, email);
  await expect(page.getByText('Enter the code from your authenticator app.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Set up two-step verification' })).toHaveCount(0);
});
