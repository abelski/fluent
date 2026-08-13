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
    category: 'adaptation',
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
  category: 'adaptation',
  created_at: '2026-03-16T00:00:00',
  updated_at: '2026-03-16T00:00:00',
};

const MOCK_CATEGORY_ARTICLES = [
  {
    slug: 'verb-intro',
    title_ru: 'Введение в глаголы',
    title_en: 'Introduction to verbs',
    tags: ['grammar'],
    category: 'learning_materials',
    created_at: '2026-01-10T00:00:00',
  },
  {
    slug: 'prepare-for-lithuanian-a2',
    title_ru: 'Как подготовиться к экзамену A2',
    title_en: 'How to prepare for the Lithuanian A2 exam',
    tags: ['exam', 'a2'],
    category: 'adaptation',
    created_at: '2026-03-16T00:00:00',
  },
  {
    slug: 'welcome',
    title_ru: 'Добро пожаловать',
    title_en: 'Welcome',
    tags: [],
    category: 'blog',
    created_at: '2026-02-01T00:00:00',
  },
];

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
    await setFakeToken(page);
    await page.route('**/api/articles', async (route) => {
      await route.fulfill({ json: [] });
    });
    await page.goto('/dashboard/articles');
    await expect(page.getByRole('heading', { name: 'Статьи' })).toBeVisible();
  });

  test('shows empty state when no articles', async ({ page }) => {
    await setFakeToken(page);
    await page.route('**/api/articles', async (route) => {
      await route.fulfill({ json: [] });
    });
    await page.goto('/dashboard/articles');
    await expect(page.getByText('Статей пока нет.')).toBeVisible();
  });

  test('shows article cards with title and tags', async ({ page }) => {
    await setFakeToken(page);
    await page.route('**/api/articles', async (route) => {
      await route.fulfill({ json: MOCK_ARTICLES });
    });
    await page.goto('/dashboard/articles');
    await expect(page.getByText('Как подготовиться к экзамену A2')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('.bg-emerald-50', { hasText: 'exam' })).toBeVisible();
    await expect(page.locator('.bg-emerald-50', { hasText: 'a2' })).toBeVisible();
  });

  test('article card links to detail page', async ({ page }) => {
    await setFakeToken(page);
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
    await page.route('**/api/me/welcome', async (route) => route.fulfill({ json: { shown: true, content: null } }));
    await page.route('**/api/me/quota', async (route) => route.fulfill({ json: { premium_active: false, premium_until: null, sessions_today: 0, daily_limit: 5 } }));
    await page.route('**/api/me/custom-programs', async (route) => route.fulfill({ json: [] }));
    await page.route('**/api/me/lists-progress', async (route) => route.fulfill({ json: {} }));
    await page.route('**/api/me/programs', async (route) => route.fulfill({ json: ['a1_basics'] }));
    await page.goto('/dashboard/lists');
    await expect(page.getByRole('link', { name: 'Как подготовиться к A2' })).toBeVisible({ timeout: 5000 });
  });

  test('article link has correct href', async ({ page }) => {
    await setFakeToken(page);
    await page.route('**/api/lists', async (route) => route.fulfill({ json: MOCK_LISTS }));
    await page.route('**/api/subcategory-meta', async (route) => route.fulfill({ json: MOCK_SUBCAT_META }));
    await page.route('**/api/me/welcome', async (route) => route.fulfill({ json: { shown: true, content: null } }));
    await page.route('**/api/me/quota', async (route) => route.fulfill({ json: { premium_active: false, premium_until: null, sessions_today: 0, daily_limit: 5 } }));
    await page.route('**/api/me/custom-programs', async (route) => route.fulfill({ json: [] }));
    await page.route('**/api/me/lists-progress', async (route) => route.fulfill({ json: {} }));
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
  // Use a slug that has no pre-built static page so the backend falls back to the
  // '_' placeholder and ArticleContent fetches from the API (where the mock lives).
  const TEST_SLUG = 'test-article-detail';

  test('shows article title and body', async ({ page }) => {
    await setFakeToken(page);
    await page.route(`**/api/articles/${TEST_SLUG}`, async (route) => {
      await route.fulfill({ json: MOCK_ARTICLE_DETAIL });
    });
    await page.goto(`/dashboard/articles/${TEST_SLUG}`);
    await expect(page.getByRole('heading', { name: /Как подготовиться к экзамену A2/ }).first()).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('Текст статьи на русском.')).toBeVisible();
  });

  test('shows RU body when global lang is RU (default)', async ({ page }) => {
    await setFakeToken(page);
    await page.addInitScript(() => localStorage.removeItem('fluent_lang'));
    await page.route(`**/api/articles/${TEST_SLUG}`, async (route) => {
      await route.fulfill({ json: MOCK_ARTICLE_DETAIL });
    });
    await page.goto(`/dashboard/articles/${TEST_SLUG}`);
    await expect(page.getByText('Текст статьи на русском.')).toBeVisible({ timeout: 5000 });
  });

  test('shows back to articles link', async ({ page }) => {
    await setFakeToken(page);
    await page.route(`**/api/articles/${TEST_SLUG}`, async (route) => {
      await route.fulfill({ json: MOCK_ARTICLE_DETAIL });
    });
    await page.goto(`/dashboard/articles/${TEST_SLUG}`);
    await expect(page.getByText('К статьям')).toBeVisible({ timeout: 5000 });
  });
});

test.describe('Article category tabs', () => {
  test('shows all 4 category tabs', async ({ page }) => {
    await setFakeToken(page);
    await page.route('**/api/articles', async (route) => {
      await route.fulfill({ json: MOCK_CATEGORY_ARTICLES });
    });
    await page.goto('/dashboard/articles');
    await expect(page.getByRole('button', { name: 'Все' })).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole('button', { name: 'Учебные материалы' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Адаптация в Литве' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Блог' })).toBeVisible();
  });

  test('clicking a category tab filters the grid and updates the URL', async ({ page }) => {
    await setFakeToken(page);
    await page.route('**/api/articles', async (route) => {
      await route.fulfill({ json: MOCK_CATEGORY_ARTICLES });
    });
    await page.goto('/dashboard/articles');

    // All 3 articles visible by default.
    await expect(page.getByText('Введение в глаголы')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('Как подготовиться к экзамену A2')).toBeVisible();
    await expect(page.getByText('Добро пожаловать')).toBeVisible();

    await page.getByRole('button', { name: 'Учебные материалы' }).click();
    await expect(page).toHaveURL(/category=learning_materials/);
    await expect(page.getByText('Введение в глаголы')).toBeVisible();
    await expect(page.getByText('Как подготовиться к экзамену A2')).not.toBeVisible();
    await expect(page.getByText('Добро пожаловать')).not.toBeVisible();

    await page.getByRole('button', { name: 'Адаптация в Литве' }).click();
    await expect(page).toHaveURL(/category=adaptation/);
    await expect(page.getByText('Как подготовиться к экзамену A2')).toBeVisible();
    await expect(page.getByText('Введение в глаголы')).not.toBeVisible();

    await page.getByRole('button', { name: 'Все' }).click();
    await expect(page).not.toHaveURL(/category=/);
    await expect(page.getByText('Введение в глаголы')).toBeVisible();
    await expect(page.getByText('Как подготовиться к экзамену A2')).toBeVisible();
    await expect(page.getByText('Добро пожаловать')).toBeVisible();
  });

  test('existing slug URL /dashboard/articles/verb-intro still loads unchanged', async ({ page, baseURL }) => {
    // This slug has a pre-built static/SSR page, so it's served directly by Next
    // (not through the '_' placeholder + client-side API fetch), meaning browser-side
    // route mocking doesn't intercept it — assert against the real backend content
    // instead, confirming the category feature didn't break this indexed URL.
    await setFakeToken(page);
    const res = await page.request.get(`${baseURL}/api/articles/verb-intro`);
    const real = await res.json();

    await page.goto('/dashboard/articles/verb-intro');
    await expect(page.getByRole('heading', { name: real.title_ru }).first()).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('К статьям')).toBeVisible();
  });
});
