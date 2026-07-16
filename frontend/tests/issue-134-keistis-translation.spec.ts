import { test, expect } from '@playwright/test';

function makeFakeJwt(): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = btoa(JSON.stringify({ email: 'test@test.com', name: 'Test User', exp: 9999999999 }));
  return `${header}.${payload}.fakesignature`;
}

const MOCK_LIST = {
  id: 294,
  title: 'Основные глаголы',
  title_en: null,
  description: null,
  description_en: null,
  words: [
    { id: 7330, lithuanian: 'keisti', translation_ru: 'менять', translation_en: 'to change, to exchange', hint: 'глагол', star: 1 },
    { id: 7331, lithuanian: 'keistis', translation_ru: 'обмениваться, меняться (местами)', translation_en: 'to exchange, to swap', hint: 'глагол', star: 1 },
  ],
};

test.describe('Issue #134 — keistis translation leads with обмениваться (not меняться)', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript((token) => {
      localStorage.setItem('fluent_token', token);
    }, makeFakeJwt());

    page.route('**/api/lists/294', (r) => r.fulfill({ json: MOCK_LIST }));
    page.route('**/api/me/quota', (r) => r.fulfill({ json: { is_premium: false, premium_active: false, premium_until: null, sessions_today: 0, daily_limit: 10, is_admin: false, is_superadmin: false } }));
  });

  test('keistis translation is обмениваться, меняться (местами)', async ({ page }) => {
    await page.goto('/dashboard/lists/294');
    await page.waitForSelector('text=keistis', { timeout: 7000 });
    await expect(page.getByText('обмениваться, меняться (местами)').first()).toBeVisible();
  });
});
