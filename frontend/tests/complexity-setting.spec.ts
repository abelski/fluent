import { test, expect } from '@playwright/test';

function makeFakeJwt(name: string): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = btoa(JSON.stringify({ email: 'test@test.com', name, exp: 9999999999 }));
  return `${header}.${payload}.fakesignature`;
}

test.describe('Complexity setting', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript((token) => {
      localStorage.setItem('fluent_token', token);
    }, makeFakeJwt('Test User'));
    await page.route('**/api/me/settings', async (route) => {
      await route.fulfill({ json: { words_per_session: 10, new_words_ratio: 0.7 } });
    });
    await page.route('**/api/me/quota', async (route) => {
      await route.fulfill({ json: { is_premium: false, premium_active: false, sessions_today: 0, daily_limit: 10, is_admin: false, is_superadmin: false } });
    });
  });

  test('complexity slider is visible on settings page', async ({ page }) => {
    await page.goto('/dashboard/settings');
    await expect(page.locator('[data-testid="complexity-slider"]')).toBeVisible({ timeout: 5000 });
  });

  test('moving slider to 1 stores easy in localStorage', async ({ page }) => {
    await page.goto('/dashboard/settings');
    await page.locator('[data-testid="complexity-slider"]').fill('1');
    const stored = await page.evaluate(() => localStorage.getItem('fluent_complexity'));
    expect(stored).toBe('easy');
  });

  test('complexity selection persists after page reload', async ({ page }) => {
    await page.goto('/dashboard/settings');
    await page.locator('[data-testid="complexity-slider"]').fill('3');
    await page.reload();
    await page.waitForSelector('[data-testid="complexity-slider"]');
    const stored = await page.evaluate(() => localStorage.getItem('fluent_complexity'));
    expect(stored).toBe('hard');
  });

  test('medium (value 2) is the default when nothing is stored', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.removeItem('fluent_complexity');
    });
    await page.goto('/dashboard/settings');
    const value = await page.locator('[data-testid="complexity-slider"]').inputValue();
    expect(value).toBe('2');
  });
});
