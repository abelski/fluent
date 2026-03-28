import { test, expect } from '@playwright/test';

test.describe('Feedback form', () => {
  test.beforeEach(async ({ page }) => {
    // Dismiss cookie consent banner so it doesn't intercept footer clicks
    await page.addInitScript(() => {
      localStorage.setItem('cookie_consent', 'accepted');
    });
    await page.route('**/api/footer-articles', async (route) => {
      await route.fulfill({ json: [] });
    });
    await page.route('**/api/articles', async (route) => {
      await route.fulfill({ json: [] });
    });
  });

  async function gotoAndWaitHydration(page: import('@playwright/test').Page, url: string) {
    await page.goto(url);
    // Wait for React hydration: the footer button's click handler is only attached
    // after client-side hydration, so wait for networkidle before interacting.
    await page.waitForLoadState('networkidle');
  }

  test('"Написать нам" button is visible in footer', async ({ page }) => {
    await page.goto('/dashboard/articles');
    await expect(page.locator('[data-testid="footer-feedback-btn"]')).toBeVisible({ timeout: 5000 });
  });

  test('clicking footer button opens feedback modal', async ({ page }) => {
    await gotoAndWaitHydration(page, '/dashboard/articles');
    await page.locator('[data-testid="footer-feedback-btn"]').click();
    await expect(page.locator('[data-testid="feedback-email"]')).toBeVisible();
    await expect(page.locator('[data-testid="feedback-message"]')).toBeVisible();
  });

  test('submit button is disabled when fields are empty', async ({ page }) => {
    await gotoAndWaitHydration(page, '/dashboard/articles');
    await page.locator('[data-testid="footer-feedback-btn"]').click();
    await expect(page.locator('[data-testid="feedback-submit"]')).toBeDisabled();
  });

  test('submit button enabled when both fields filled', async ({ page }) => {
    await gotoAndWaitHydration(page, '/dashboard/articles');
    await page.locator('[data-testid="footer-feedback-btn"]').click();
    await page.locator('[data-testid="feedback-email"]').fill('user@example.com');
    await page.locator('[data-testid="feedback-message"]').fill('Отличное приложение!');
    await expect(page.locator('[data-testid="feedback-submit"]')).toBeEnabled();
  });

  test('successful submission shows confirmation message', async ({ page }) => {
    await page.route('**/api/feedback', async (route) => {
      await route.fulfill({ json: { ok: true } });
    });
    await gotoAndWaitHydration(page, '/dashboard/articles');
    await page.locator('[data-testid="footer-feedback-btn"]').click();
    await page.locator('[data-testid="feedback-email"]').fill('user@example.com');
    await page.locator('[data-testid="feedback-message"]').fill('Отличное приложение!');
    await page.locator('[data-testid="feedback-submit"]').click();
    await expect(page.locator('text=Сообщение отправлено!')).toBeVisible({ timeout: 3000 });
  });

  test('cancel button closes the modal', async ({ page }) => {
    await gotoAndWaitHydration(page, '/dashboard/articles');
    await page.locator('[data-testid="footer-feedback-btn"]').click();
    await expect(page.locator('[data-testid="feedback-email"]')).toBeVisible();
    await page.locator('text=Отмена').click();
    await expect(page.locator('[data-testid="feedback-email"]')).not.toBeVisible();
  });
});
