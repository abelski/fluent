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
    { id: 3538, lithuanian: 'blynai',  translation_ru: 'блины', translation_en: 'pancakes', hint: null, star: 1 },
    { id: 5986, lithuanian: 'blynas',  translation_ru: 'блин',  translation_en: 'pancake',  hint: null, star: 1 },
  ],
};

test.describe('Issue #32 — blynas replaces blynelis in Patiekalai (list 171)', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript((token) => {
      localStorage.setItem('fluent_token', token);
    }, makeFakeJwt());
    page.route('**/api/lists/171', (r) => r.fulfill({ json: MOCK_LIST }));
    page.route('**/api/me/quota', (r) => r.fulfill({ json: { is_premium: false, premium_active: false, premium_until: null, sessions_today: 0, daily_limit: 10, is_admin: false, is_superadmin: false } }));
  });

  test('blynas (блин) is shown', async ({ page }) => {
    await page.goto('/dashboard/lists/171');
    await page.waitForSelector('text=blynas', { timeout: 7000 });
    await expect(page.getByText('blynas').first()).toBeVisible();
  });

  test('blynelis is not shown', async ({ page }) => {
    await page.goto('/dashboard/lists/171');
    await page.waitForSelector('text=blynas', { timeout: 7000 });
    await expect(page.getByText('blynelis')).not.toBeVisible();
  });
});
