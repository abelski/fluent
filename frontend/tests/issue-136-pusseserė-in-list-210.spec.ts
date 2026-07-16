import { test, expect } from '@playwright/test';

function makeFakeJwt(): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = btoa(JSON.stringify({ email: 'test@test.com', name: 'Test User', exp: 9999999999 }));
  return `${header}.${payload}.fakesignature`;
}

const MOCK_LIST = {
  id: 210,
  title: 'Čia mano šeima',
  title_en: null,
  description: null,
  description_en: null,
  words: [
    { id: 3277, lithuanian: 'pusbrolis', translation_ru: 'двоюродный брат', translation_en: 'cousin (male)', hint: 'daiktavardis', star: 1 },
    { id: 4017, lithuanian: 'pusseserė', translation_ru: 'двоюродная сестра', translation_en: 'cousin (female)', hint: 'daiktavardis', star: 1 },
  ],
};

test.describe('Issue #136 — list 210 uses pusseserė (not pusbrolė) for female cousin', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript((token) => {
      localStorage.setItem('fluent_token', token);
    }, makeFakeJwt());

    page.route('**/api/lists/210', (r) => r.fulfill({ json: MOCK_LIST }));
    page.route('**/api/me/quota', (r) => r.fulfill({ json: { is_premium: false, premium_active: false, premium_until: null, sessions_today: 0, daily_limit: 10, is_admin: false, is_superadmin: false } }));
  });

  test('pusseserė is present and pusbrolė is absent', async ({ page }) => {
    await page.goto('/dashboard/lists/210');
    await page.waitForSelector('text=pusseserė', { timeout: 7000 });
    await expect(page.getByText('pusseserė').first()).toBeVisible();
    await expect(page.getByText('pusbrolė')).not.toBeVisible();
  });
});
