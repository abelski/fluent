import { test, expect } from '@playwright/test';

// ── helpers ───────────────────────────────────────────────────────────────────

function makeFakeJwt(name: string): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = btoa(JSON.stringify({ email: 'test@test.com', name, exp: 9999999999 }));
  return `${header}.${payload}.fakesignature`;
}

async function setFakeToken(page: import('@playwright/test').Page) {
  await page.addInitScript((token) => {
    localStorage.setItem('fluent_token', token);
  }, makeFakeJwt('Test User'));
}

// ── /extension — Chrome extension page ─────────────────────────────────────────

test.describe('/extension — Chrome extension page', () => {
  test('loads with version, download link, and the nav header intact', async ({ page }) => {
    await setFakeToken(page);
    await page.route('**/api/me/quota', (route) =>
      route.fulfill({ json: { is_admin: false, is_superadmin: false, is_redactor: false, user_id: 'u1', sessions_today: 0, daily_limit: 3, premium_active: false, is_premium: false, premium_until: null } })
    );
    await page.route('**/api/extension/info', (route) => route.fulfill({ json: { version: '9.9.9' } }));

    await page.goto('/extension');

    await expect(page.locator('h1')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('9.9.9')).toBeVisible();

    const downloadLink = page.getByTestId('extension-download-link');
    await expect(downloadLink).toHaveAttribute('href', /\/api\/extension\/download$/);

    // Nav header (logo + nav links) must still render on this page.
    await expect(page.locator('header')).toBeVisible();
  });
});

// ── /pricing — new Premium feature line ────────────────────────────────────────

test.describe('/pricing — Chrome extension feature line', () => {
  test('lists the Chrome extension as a Premium feature (RU default)', async ({ page }) => {
    await page.goto('/pricing');
    await expect(page.getByText('Расширение Chrome — перевод слов на любом сайте')).toBeVisible({ timeout: 5000 });
  });
});
