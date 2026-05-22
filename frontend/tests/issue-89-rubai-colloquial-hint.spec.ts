import { test, expect } from '@playwright/test';

function makeFakeJwt(): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = btoa(JSON.stringify({ email: 'test@test.com', name: 'Test User', exp: 9999999999 }));
  return `${header}.${payload}.fakesignature`;
}

const MOCK_LIST = {
  id: 157,
  title: 'Drabužiai ir aksesuarai',
  title_en: null,
  description: null,
  description_en: null,
  words: [
    { id: 4207, lithuanian: 'rūbai', translation_ru: 'одежда', translation_en: 'clothes', hint: 'разг.', star: 0 },
    { id: 4178, lithuanian: 'drabužiai', translation_ru: 'одежда', translation_en: 'clothes', hint: 'daiktavardis', star: 0 },
  ],
};

test.describe('Issue #89 — rūbai shows разг. hint to disambiguate from drabužiai', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript((token) => {
      localStorage.setItem('fluent_token', token);
    }, makeFakeJwt());

    await page.route('**/api/lists/157', (r) => r.fulfill({ json: MOCK_LIST }));
    await page.route('**/api/me/quota', (r) => r.fulfill({ json: { is_premium: false, premium_active: false, premium_until: null, sessions_today: 0, daily_limit: 10, is_admin: false, is_superadmin: false } }));
  });

  test('rūbai shows разг. hint in the word list', async ({ page }) => {
    await page.goto('/dashboard/lists/157');
    await page.waitForSelector('text=rūbai', { timeout: 8000 });
    await expect(page.getByText('rūbai').first()).toBeVisible();
    await expect(page.getByText('drabužiai').first()).toBeVisible();
    await expect(page.getByText('разг.').first()).toBeVisible();
  });
});
