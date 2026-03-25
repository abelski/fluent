import { test, expect } from '@playwright/test';

function makeFakeJwt(name: string): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = btoa(JSON.stringify({ email: 'test@test.com', name, exp: 9999999999 }));
  return `${header}.${payload}.fakesignature`;
}

test.describe('User settings page', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript((token) => {
      localStorage.setItem('fluent_token', token);
    }, makeFakeJwt('Test User'));
    await page.route('**/api/me/settings', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({ json: { words_per_session: 10, new_words_ratio: 0.7 } });
      } else {
        const body = JSON.parse(route.request().postData() ?? '{}');
        await route.fulfill({ json: body });
      }
    });
    await page.route('**/api/me/quota', async (route) => {
      await route.fulfill({ json: { is_premium: false, premium_active: false, sessions_today: 0, daily_limit: 10, is_admin: false, is_superadmin: false } });
    });
  });

  test('settings page loads with default values', async ({ page }) => {
    await page.goto('/dashboard/settings');
    await expect(page.locator('[data-testid="session-size-value"]')).toHaveText('10');
    await expect(page.locator('[data-testid="ratio-slider"]')).toHaveValue('70');
  });

  test('save button updates settings and shows confirmation', async ({ page }) => {
    await page.goto('/dashboard/settings');
    await page.waitForSelector('[data-testid="session-size-slider"]');

    await page.locator('[data-testid="session-size-slider"]').fill('15');
    await page.locator('[data-testid="ratio-slider"]').fill('50');
    await page.locator('[data-testid="save-settings-btn"]').click();

    await expect(page.locator('[data-testid="saved-message"]')).toBeVisible({ timeout: 3000 });
  });

  test('settings page is reachable from /dashboard/settings', async ({ page }) => {
    await page.goto('/dashboard/settings');
    await expect(page.locator('[data-testid="session-size-slider"]')).toBeVisible({ timeout: 5000 });
  });

  test('unauthenticated user is redirected to login', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.removeItem('fluent_token');
    });
    await page.goto('/dashboard/settings');
    await expect(page).toHaveURL(/\/login/, { timeout: 5000 });
  });
});
