import { test, expect } from '@playwright/test';

function makeFakeJwt(): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = btoa(JSON.stringify({ email: 'test@test.com', name: 'Test User', exp: 9999999999 }));
  return `${header}.${payload}.fakesignature`;
}

const DEFAULT_SETTINGS = { words_per_session: 10, new_words_ratio: 0.7, lesson_mode: 'thorough', use_question_timer: false, question_timer_seconds: 5, email_consent: true, lang: 'ru' };
const DEFAULT_PHRASES_SETTINGS = { phrases_per_session: 10, new_phrases_ratio: 0.3 };

test.describe('Phrase settings ratio', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript((token) => localStorage.setItem('fluent_token', token), makeFakeJwt());
    await page.route('**/api/me/settings', async (route) => route.fulfill({ json: DEFAULT_SETTINGS }));
    await page.route('**/api/me/quota', async (route) => route.fulfill({ json: { is_premium: false, is_admin: false } }));
    await page.route('**/api/me/phrases-settings', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({ json: DEFAULT_PHRASES_SETTINGS });
      } else {
        await route.fulfill({ json: JSON.parse(route.request().postData() ?? '{}') });
      }
    });
  });

  test('phrases tab shows ratio slider', async ({ page }) => {
    await page.goto('/dashboard/settings');
    await page.waitForSelector('[data-testid="settings-tabs"]');
    await page.locator('[data-testid="tab-phrases"]').click();
    await expect(page.locator('[data-testid="phrases-ratio-slider"]')).toBeVisible();
  });

  test('phrases ratio slider default value is 30%', async ({ page }) => {
    await page.goto('/dashboard/settings');
    await page.locator('[data-testid="tab-phrases"]').click();
    await expect(page.locator('[data-testid="phrases-ratio-slider"]')).toHaveValue('30');
  });

  test('phrases per session slider still present', async ({ page }) => {
    await page.goto('/dashboard/settings');
    await page.locator('[data-testid="tab-phrases"]').click();
    await expect(page.locator('[data-testid="phrases-session-size-slider"]')).toBeVisible();
  });

  test('changing ratio slider updates the displayed value', async ({ page }) => {
    await page.goto('/dashboard/settings');
    await page.locator('[data-testid="tab-phrases"]').click();
    await page.locator('[data-testid="phrases-ratio-slider"]').fill('50');
    await expect(page.locator('[data-testid="phrases-ratio-slider"]')).toHaveValue('50');
  });
});
