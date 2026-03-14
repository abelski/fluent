import { test, expect } from '@playwright/test';

function makeFakeJwt(name: string): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = btoa(JSON.stringify({ email: 'test@test.com', name, exp: 9999999999 }));
  return `${header}.${payload}.fakesignature`;
}

test.describe('Mistake button', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript((token) => {
      localStorage.setItem('fluent_token', token);
      localStorage.setItem('cookie_consent', 'accepted');
    }, makeFakeJwt('Test User'));
    // Mock quota so Header doesn't error
    await page.route('**/api/me/quota', async (route) => {
      await route.fulfill({ json: { is_premium: false, premium_active: false, sessions_today: 0, daily_limit: 10, is_admin: false, is_superadmin: false } });
    });
  });

  test('floating mistake button is visible when logged in', async ({ page }) => {
    await page.goto('/dashboard/lists');
    await expect(page.locator('[data-testid="mistake-button"]')).toBeVisible({ timeout: 3000 });
  });

  test('clicking mistake button opens modal', async ({ page }) => {
    await page.goto('/dashboard/lists');
    await page.locator('[data-testid="mistake-button"]').click();
    await expect(page.locator('text=Сообщить об ошибке')).toBeVisible();
    await expect(page.locator('textarea')).toBeVisible();
  });

  test('submit button is disabled when textarea is empty', async ({ page }) => {
    await page.goto('/dashboard/lists');
    await page.locator('[data-testid="mistake-button"]').click();
    await expect(page.locator('[data-testid="mistake-submit"]')).toBeDisabled();
  });

  test('filling text enables submit button', async ({ page }) => {
    await page.goto('/dashboard/lists');
    await page.locator('[data-testid="mistake-button"]').click();
    await page.locator('textarea').fill('Неверный перевод слова');
    await expect(page.locator('[data-testid="mistake-submit"]')).toBeEnabled();
  });

  test('successful submission shows thank-you message', async ({ page }) => {
    await page.route('**/api/reports', async (route) => {
      await route.fulfill({ json: { ok: true, id: 1 } });
    });
    await page.goto('/dashboard/lists');
    await page.locator('[data-testid="mistake-button"]').click();
    await page.locator('textarea').fill('Ошибка в переводе');
    await page.locator('[data-testid="mistake-submit"]').click();
    await expect(page.locator('text=Спасибо! Отчёт отправлен.')).toBeVisible({ timeout: 3000 });
  });

  test('cancel button closes modal', async ({ page }) => {
    await page.goto('/dashboard/lists');
    await page.locator('[data-testid="mistake-button"]').click();
    await expect(page.locator('text=Сообщить об ошибке')).toBeVisible();
    await page.locator('text=Отмена').click();
    await expect(page.locator('text=Сообщить об ошибке')).not.toBeVisible();
  });
});
