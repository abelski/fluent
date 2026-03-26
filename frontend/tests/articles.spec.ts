import { test, expect } from '@playwright/test';

// Fake but structurally valid JWT for UI tests
function makeFakeJwt(name: string, isAdmin = false): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = btoa(JSON.stringify({ email: 'test@test.com', name, is_admin: isAdmin, exp: 9999999999 }));
  return `${header}.${payload}.fakesignature`;
}

async function setFakeToken(page: import('@playwright/test').Page, isAdmin = false) {
  await page.addInitScript((token) => {
    localStorage.setItem('fluent_token', token);
  }, makeFakeJwt('Test User', isAdmin));
}

const MOCK_ARTICLES = [
  {
    slug: 'prepare-for-lithuanian-a2',
    title_ru: 'Как подготовиться к экзамену A2',
    title_en: 'How to prepare for the Lithuanian A2 exam',
    tags: ['exam', 'a2'],
    created_at: '2026-03-16T00:00:00',
  },
];

const MOCK_ARTICLE_DETAIL = {
  slug: 'prepare-for-lithuanian-a2',
  title_ru: 'Как подготовиться к экзамену A2',
  title_en: 'How to prepare for the Lithuanian A2 exam',
  body_ru: '# Подготовка\n\nТекст статьи на русском.',
  body_en: '# Preparation\n\nArticle text in English.',
  tags: ['exam', 'a2'],
  created_at: '2026-03-16T00:00:00',
  updated_at: '2026-03-16T00:00:00',
};

test.describe('Nav — Articles link', () => {
  test('shows Статьи in navigation', async ({ page }) => {
    await setFakeToken(page);
    await page.goto('/dashboard/lists');
    await expect(page.getByRole('link', { name: 'Статьи' })).toBeVisible();
  });

  test('Статьи link navigates to articles page', async ({ page }) => {
    await setFakeToken(page);
    await page.route('**/api/articles', async (route) => {
      await route.fulfill({ json: MOCK_ARTICLES });
    });
    await page.goto('/dashboard/lists');
    await page.getByRole('link', { name: 'Статьи' }).click();
    await expect(page).toHaveURL(/\/dashboard\/articles/);
    await expect(page.getByRole('link', { name: 'Статьи' })).toHaveClass(/bg-white/);
  });
});

test.describe('Articles list page', () => {
  test('shows page title and subtitle', async ({ page }) => {
    await page.route('**/api/articles', async (route) => {
      await route.fulfill({ json: [] });
    });
    await page.goto('/dashboard/articles');
    await expect(page.getByRole('heading', { name: 'Статьи' })).toBeVisible();
  });

  test('shows empty state when no articles', async ({ page }) => {
    await page.route('**/api/articles', async (route) => {
      await route.fulfill({ json: [] });
    });
    await page.goto('/dashboard/articles');
    await expect(page.getByText('Статей пока нет.')).toBeVisible();
  });

  test('shows article cards with title and tags', async ({ page }) => {
    await page.route('**/api/articles', async (route) => {
      await route.fulfill({ json: MOCK_ARTICLES });
    });
    await page.goto('/dashboard/articles');
    await expect(page.getByText('Как подготовиться к экзамену A2')).toBeVisible();
    await expect(page.locator('.bg-emerald-50', { hasText: 'exam' })).toBeVisible();
    await expect(page.locator('.bg-emerald-50', { hasText: 'a2' })).toBeVisible();
  });

  test('article card links to detail page', async ({ page }) => {
    await page.route('**/api/articles', async (route) => {
      await route.fulfill({ json: MOCK_ARTICLES });
    });
    await page.goto('/dashboard/articles');
    const link = page.getByRole('link', { name: /Как подготовиться/ });
    await expect(link).toHaveAttribute('href', /prepare-for-lithuanian-a2/);
  });
});

test.describe('Article link in vocabulary subcategory', () => {
  const MOCK_LISTS = [
    { id: 1, title: 'Базовые слова', description: null, subcategory: 'a1_basics', word_count: 10, cefr_level: null, difficulty: null },
  ];
  const MOCK_SUBCAT_META = {
    a1_basics: {
      cefr_level: 'A1',
      difficulty: 'easy',
      article_url: '/dashboard/articles/prepare-for-lithuanian-a2',
      article_name_ru: 'Как подготовиться к A2',
      article_name_en: 'How to prepare for A2',
    },
  };

  test('shows article link in subcategory header when article_url is set', async ({ page }) => {
    await setFakeToken(page);
    await page.route('**/api/lists', async (route) => route.fulfill({ json: MOCK_LISTS }));
    await page.route('**/api/subcategory-meta', async (route) => route.fulfill({ json: MOCK_SUBCAT_META }));
    await page.route('**/api/me/**', async (route) => route.fulfill({ json: {} }));
    await page.route('**/api/me/programs', async (route) => route.fulfill({ json: ['a1_basics'] }));
    await page.goto('/dashboard/lists');
    await expect(page.getByRole('link', { name: 'Как подготовиться к A2' })).toBeVisible({ timeout: 5000 });
  });

  test('article link has correct href', async ({ page }) => {
    await setFakeToken(page);
    await page.route('**/api/lists', async (route) => route.fulfill({ json: MOCK_LISTS }));
    await page.route('**/api/subcategory-meta', async (route) => route.fulfill({ json: MOCK_SUBCAT_META }));
    await page.route('**/api/me/**', async (route) => route.fulfill({ json: {} }));
    await page.route('**/api/me/programs', async (route) => route.fulfill({ json: ['a1_basics'] }));
    await page.goto('/dashboard/lists');
    const link = page.getByRole('link', { name: 'Как подготовиться к A2' });
    await expect(link).toHaveAttribute('href', '/dashboard/articles/prepare-for-lithuanian-a2');
  });

  test('no article link when article_url is missing', async ({ page }) => {
    await setFakeToken(page);
    await page.route('**/api/lists', async (route) => route.fulfill({ json: MOCK_LISTS }));
    await page.route('**/api/subcategory-meta', async (route) => route.fulfill({ json: { a1_basics: { cefr_level: 'A1', difficulty: null, article_url: null, article_name_ru: null, article_name_en: null } } }));
    await page.route('**/api/me/**', async (route) => route.fulfill({ json: {} }));
    await page.route('**/api/me/programs', async (route) => route.fulfill({ json: ['a1_basics'] }));
    await page.goto('/dashboard/lists');
    await expect(page.getByRole('link', { name: /Как подготовиться/ })).not.toBeVisible();
  });
});

test.describe('Article detail page', () => {
  test('shows article title and body', async ({ page }) => {
    await page.route('**/api/articles/prepare-for-lithuanian-a2', async (route) => {
      await route.fulfill({ json: MOCK_ARTICLE_DETAIL });
    });
    // Navigate directly to the static export placeholder route
    await page.goto('/dashboard/articles/prepare-for-lithuanian-a2');
    await expect(page.getByText('Как подготовиться к экзамену A2')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('Текст статьи на русском.')).toBeVisible();
  });

  test('shows RU body when global lang is RU (default)', async ({ page }) => {
    await page.addInitScript(() => localStorage.removeItem('fluent_lang'));
    await page.route('**/api/articles/prepare-for-lithuanian-a2', async (route) => {
      await route.fulfill({ json: MOCK_ARTICLE_DETAIL });
    });
    await page.goto('/dashboard/articles/prepare-for-lithuanian-a2');
    await expect(page.getByText('Текст статьи на русском.')).toBeVisible({ timeout: 5000 });
  });

  test('shows back to articles link', async ({ page }) => {
    await page.route('**/api/articles/prepare-for-lithuanian-a2', async (route) => {
      await route.fulfill({ json: MOCK_ARTICLE_DETAIL });
    });
    await page.goto('/dashboard/articles/prepare-for-lithuanian-a2');
    await expect(page.getByText('← К статьям')).toBeVisible({ timeout: 5000 });
  });
});
