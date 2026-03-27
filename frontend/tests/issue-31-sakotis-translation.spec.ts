import { test, expect } from '@playwright/test';

function makeFakeJwt(): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = btoa(JSON.stringify({ email: 'test@test.com', name: 'Test User', exp: 9999999999 }));
  return `${header}.${payload}.fakesignature`;
}

const MOCK_LIST = {
  id: 171,
  title: 'Patiekalai',
  title_en: null,
  description: null,
  description_en: null,
  words: [
    { id: 3609, lithuanian: 'šakotis', translation_ru: 'шакотис', translation_en: 'tree cake', hint: null, star: 0 },
    { id: 4892, lithuanian: 'šakotis, -io', translation_ru: 'шакотис', translation_en: 'tree cake', hint: null, star: 0 },
  ],
};

test.describe('Issue #31 — šakotis translation displays шакотис (not сакотис)', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript((token) => {
      localStorage.setItem('fluent_token', token);
    }, makeFakeJwt());

    page.route('**/api/lists/171', (r) => r.fulfill({ json: MOCK_LIST }));
    page.route('**/api/me/quota', (r) => r.fulfill({ json: { is_premium: false, premium_active: false, premium_until: null, sessions_today: 0, daily_limit: 10, is_admin: false, is_superadmin: false } }));
  });

  test('šakotis translation is шакотис (not сакотис)', async ({ page }) => {
    await page.goto('/dashboard/lists/171');
    await page.waitForSelector('text=шакотис', { timeout: 7000 });
    await expect(page.getByText('шакотис').first()).toBeVisible();
    await expect(page.getByText('сакотис')).not.toBeVisible();
  });
});
