import { test, expect } from '@playwright/test';

test.describe('Navigation', () => {
  test('landing page loads and shows branding', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('text=fluent').first()).toBeVisible();
  });

  test('nav shows Словари, Грамматика, Практика', async ({ page }) => {
    await page.goto('/dashboard/lists');
    await expect(page.getByRole('link', { name: 'Словари' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Грамматика' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Практика' })).toBeVisible();
  });

  test('Словари link is active on /dashboard/lists', async ({ page }) => {
    await page.goto('/dashboard/lists');
    const link = page.getByRole('link', { name: 'Словари' });
    await expect(link).toHaveClass(/bg-white\/10/);
  });

  test('Грамматика link navigates to grammar page', async ({ page }) => {
    await page.goto('/dashboard/lists');
    await page.getByRole('link', { name: 'Грамматика' }).click();
    await expect(page).toHaveURL(/\/dashboard\/grammar/);
    await expect(page.getByRole('link', { name: 'Грамматика' })).toHaveClass(/bg-white\/10/);
  });

  test('Практика link navigates to practice page', async ({ page }) => {
    await page.goto('/dashboard/lists');
    await page.getByRole('link', { name: 'Практика' }).click();
    await expect(page).toHaveURL(/\/dashboard\/practice/);
    await expect(page.getByRole('link', { name: 'Практика' })).toHaveClass(/bg-white\/10/);
  });
});

test.describe('Practice page', () => {
  test('shows coming soon text', async ({ page }) => {
    await page.goto('/dashboard/practice');
    await expect(page.getByRole('heading', { name: 'Практика' })).toBeVisible();
    await expect(page.getByText('Скоро здесь появятся упражнения')).toBeVisible();
  });
});

test.describe('Dashboard redirect', () => {
  test('/dashboard redirects to /dashboard/lists', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/dashboard\/lists/);
  });
});
