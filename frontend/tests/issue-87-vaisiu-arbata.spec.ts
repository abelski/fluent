import { test, expect } from '@playwright/test';

function makeFakeJwt(): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = btoa(JSON.stringify({ email: 'test@test.com', name: 'Test User', exp: 9999999999 }));
  return `${header}.${payload}.fakesignature`;
}

const MOCK_LIST = {
  id: 160,
  title: 'Gerimai',
  title_en: null,
  description: null,
  description_en: null,
  words: [
    { id: 3588, lithuanian: 'vaisių arbata', translation_ru: 'фруктовый чай', translation_en: 'fruit tea', hint: 'daiktavardis', star: 0 },
    { id: 3586, lithuanian: 'juoda arbata', translation_ru: 'чёрный чай', translation_en: 'black tea', hint: 'daiktavardis', star: 0 },
  ],
};

test.describe('Issue #87 — фруктовый чай is vaisių arbata (not vaisinė arbata)', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript((token) => {
      localStorage.setItem('fluent_token', token);
    }, makeFakeJwt());

    await page.route('**/api/lists/160', (r) => r.fulfill({ json: MOCK_LIST }));
    await page.route('**/api/me/quota', (r) => r.fulfill({ json: { is_premium: false, premium_active: false, premium_until: null, sessions_today: 0, daily_limit: 10, is_admin: false, is_superadmin: false } }));
  });

  test('фруктовый чай word displays vaisių arbata', async ({ page }) => {
    await page.goto('/dashboard/lists/160');
    await page.waitForSelector('text=vaisių arbata', { timeout: 8000 });
    await expect(page.getByText('vaisių arbata').first()).toBeVisible();
    await expect(page.getByText('vaisinė arbata')).not.toBeVisible();
  });
});
