import { test, expect } from '@playwright/test';

const LISTS = [
  {
    id: 1,
    title: 'Числа 1–20',
    title_en: 'Numbers 1–20',
    description: 'Базовые числительные',
    description_en: 'Basic numerals',
    subcategory: 'a1_basics',
    word_count: 20,
  },
  {
    id: 2,
    title: 'Цвета',
    title_en: null,        // no English translation — should fall back to Russian
    description: null,
    description_en: null,
    subcategory: 'a1_basics',
    word_count: 10,
  },
];

const LIST_DETAIL = {
  id: 1,
  title: 'Числа 1–20',
  title_en: 'Numbers 1–20',
  description: 'Базовые числительные',
  description_en: 'Basic numerals',
  words: [],
};

function makeFakeJwt(): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = btoa(JSON.stringify({ email: 'test@test.com', name: 'Test', exp: 9999999999 }));
  return `${header}.${payload}.fakesig`;
}

function setupRoutes(page: import('@playwright/test').Page) {
  page.route('**/api/me/quota', (route) =>
    route.fulfill({ json: { is_premium: false, premium_active: false, sessions_today: 0, daily_limit: 10, is_admin: false, is_superadmin: false } })
  );
  page.route('**/api/me/programs', (route) => route.fulfill({ json: ['a1_basics'] }));
  page.route('**/api/subcategory-meta', (route) => route.fulfill({ json: { a1_basics: { cefr_level: 'A1', difficulty: null, article_url: null, article_name_ru: null, article_name_en: null, name_ru: 'Базовый A1', name_en: 'Basic A1' } } }));
  page.route('**/api/lists', (route) => route.fulfill({ json: LISTS }));
  page.route('**/api/me/lists-progress', (route) => route.fulfill({ json: {} }));
  page.route('**/api/lists/1', (route) => route.fulfill({ json: LIST_DETAIL }));
}

test.describe('List title localization — /dashboard/lists', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript((token) => {
      localStorage.setItem('fluent_token', token);
    }, makeFakeJwt());
    setupRoutes(page);
  });

  test('shows Russian title when lang is RU (default)', async ({ page }) => {
    await page.addInitScript(() => localStorage.removeItem('fluent_lang'));
    await page.goto('/dashboard/lists');
    await expect(page.getByText('Числа 1–20').first()).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('Numbers 1–20')).not.toBeVisible();
  });

  test('shows English title when lang is EN', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('fluent_lang', 'en'));
    await page.goto('/dashboard/lists');
    await expect(page.getByText('Numbers 1–20').first()).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('Числа 1–20')).not.toBeVisible();
  });

  test('falls back to Russian title when title_en is null and lang is EN', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('fluent_lang', 'en'));
    await page.goto('/dashboard/lists');
    // 'Цвета' has no title_en — must still be visible in EN mode
    await expect(page.getByText('Цвета').first()).toBeVisible({ timeout: 5000 });
  });
});

test.describe('List title localization — /dashboard/lists/[id]', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript((token) => {
      localStorage.setItem('fluent_token', token);
    }, makeFakeJwt());
    setupRoutes(page);
  });

  test('detail page shows Russian title when lang is RU', async ({ page }) => {
    await page.addInitScript(() => localStorage.removeItem('fluent_lang'));
    await page.goto('/dashboard/lists/1');
    await expect(page.getByRole('heading', { name: 'Числа 1–20' })).toBeVisible({ timeout: 5000 });
  });

  test('detail page shows English title when lang is EN', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('fluent_lang', 'en'));
    await page.goto('/dashboard/lists/1');
    await expect(page.getByRole('heading', { name: 'Numbers 1–20' })).toBeVisible({ timeout: 5000 });
  });

  test('detail page shows English description when lang is EN', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('fluent_lang', 'en'));
    await page.goto('/dashboard/lists/1');
    await expect(page.getByText('Basic numerals')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('Базовые числительные')).not.toBeVisible();
  });
});
