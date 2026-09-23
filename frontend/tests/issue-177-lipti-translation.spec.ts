import { test, expect } from '@playwright/test';

function makeFakeJwt(): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = btoa(JSON.stringify({ email: 'test@test.com', name: 'Test User', exp: 9999999999 }));
  return `${header}.${payload}.fakesignature`;
}

const MOCK_LIST = {
  id: 196,
  title: 'Kaip nuvažiuoti į universitetą?',
  title_en: null,
  description: null,
  description_en: null,
  words: [
    { id: 5557, lithuanian: 'lipti', translation_ru: 'садиться (в транспорт)', translation_en: 'get on', hint: 'глагол', star: 1 },
  ],
};

test.describe('Issue #177 — lipti translation includes transport qualifier', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript((token) => {
      localStorage.setItem('fluent_token', token);
    }, makeFakeJwt());

    page.route('**/api/lists/196', (r) => r.fulfill({ json: MOCK_LIST }));
    page.route('**/api/me/quota', (r) => r.fulfill({ json: { is_premium: false, premium_active: false, premium_until: null, sessions_today: 0, daily_limit: 10, is_admin: false, is_superadmin: false } }));
  });

  test('lipti translation is садиться (в транспорт)', async ({ page }) => {
    await page.goto('/dashboard/lists/196');
    await page.waitForSelector('text=lipti', { timeout: 7000 });
    await expect(page.getByText('садиться (в транспорт)').first()).toBeVisible();
  });
});
