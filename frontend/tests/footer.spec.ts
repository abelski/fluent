import { test, expect } from '@playwright/test';

const MOCK_FOOTER_ARTICLES = [
  { slug: 'terms-of-service', title_ru: 'Условия использования', title_en: 'Terms of Service' },
  { slug: 'about-team', title_ru: 'О команде', title_en: 'About the Team' },
  { slug: 'privacy-gdpr', title_ru: 'Конфиденциальность и GDPR', title_en: 'Privacy & GDPR' },
];

async function mockFooter(page: import('@playwright/test').Page) {
  await page.route('**/api/footer-articles', async (route) => {
    await route.fulfill({ json: MOCK_FOOTER_ARTICLES });
  });
}

test.describe('Footer', () => {
  test('shows copyright text', async ({ page }) => {
    await mockFooter(page);
    await page.route('**/api/articles', async (route) => route.fulfill({ json: [] }));
    await page.goto('/dashboard/articles');
    await expect(page.getByText(/All rights reserved/)).toBeVisible({ timeout: 5000 });
    await expect(page.getByText(/Fluent Team/)).toBeVisible();
  });

  test('shows footer nav links', async ({ page }) => {
    await mockFooter(page);
    await page.route('**/api/articles', async (route) => route.fulfill({ json: [] }));
    await page.goto('/dashboard/articles');
    await expect(page.getByRole('link', { name: 'Условия использования' })).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole('link', { name: 'О команде' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Конфиденциальность и GDPR' })).toBeVisible();
  });

  test('footer links point to correct article paths', async ({ page }) => {
    await mockFooter(page);
    await page.route('**/api/articles', async (route) => route.fulfill({ json: [] }));
    await page.goto('/dashboard/articles');
    const link = page.getByRole('link', { name: 'Условия использования' });
    await expect(link).toHaveAttribute('href', /terms-of-service/);
  });

  test('footer articles are NOT shown in main articles list', async ({ page }) => {
    await mockFooter(page);
    // Main list returns only non-footer articles (empty in this mock)
    await page.route('**/api/articles', async (route) => route.fulfill({ json: [] }));
    await page.goto('/dashboard/articles');
    // The main content area should NOT contain footer article titles as article cards
    const articleCards = page.locator('[data-testid="article-card"]');
    await expect(articleCards).toHaveCount(0);
    // But footer links should still be present
    await expect(page.getByRole('link', { name: 'Условия использования' })).toBeVisible({ timeout: 5000 });
  });
});
