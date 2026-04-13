import { test, expect } from '@playwright/test';

function makeFakeJwt(): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = btoa(JSON.stringify({ email: 'test@test.com', name: 'Test User', exp: 9999999999 }));
  return `${header}.${payload}.fakesignature`;
}

const MOCK_LISTS = [
  {
    id: 180,
    title: 'Ekonomika ir finansai',
    title_en: null,
    description: 'Слова из экономических и социальных статей Конституции: труд, собственность, налоги, финансы, социальная защита',
    description_en: 'Words from the economic and social chapters of the Constitution: work, property, taxes, finances, social welfare',
    subcategory: 'constitution',
    word_count: 25,
  },
];

const MOCK_META = {
  constitution: {
    cefr_level: 'B2',
    difficulty: null,
    name_ru: 'Конституция',
    name_en: 'Constitution',
    article_url: null,
    article_name_ru: null,
    article_name_en: null,
    enrollment_count: 3,
  },
};

function setupRoutes(page: import('@playwright/test').Page) {
  page.route('**/api/lists', (r) => r.fulfill({ json: MOCK_LISTS }));
  page.route('**/api/subcategory-meta', (r) => r.fulfill({ json: MOCK_META }));
  page.route('**/api/me/programs', (r) => r.fulfill({ json: ['constitution'] }));
  page.route('**/api/me/quota', (r) =>
    r.fulfill({
      json: {
        is_premium: false,
        premium_active: false,
        premium_until: null,
        sessions_today: 0,
        daily_limit: 10,
        is_admin: false,
        is_superadmin: false,
      },
    })
  );
  page.route('**/api/me/lists-progress', (r) => r.fulfill({ json: {} }));
}

test.describe('Issue #38 — Ekonomika ir finansai list shows meaningful description', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript((token) => {
      localStorage.setItem('fluent_token', token);
    }, makeFakeJwt());
    setupRoutes(page);
  });

  test('list 180 shows a description that is not just the title', async ({ page }) => {
    await page.goto('/dashboard/lists');
    await page.waitForSelector('h2', { timeout: 7000 });

    // The description should mention economics/constitution scope, not just restate the title
    const description = page.getByText('Слова из экономических и социальных статей Конституции');
    await expect(description).toBeVisible();
  });

  test('list 180 description does not say "Экономика и финансы" (old title-only description)', async ({ page }) => {
    await page.goto('/dashboard/lists');
    await page.waitForSelector('h2', { timeout: 7000 });

    // The old description "Экономика и финансы" should no longer appear
    const oldDescription = page.getByText('Экономика и финансы', { exact: true });
    await expect(oldDescription).not.toBeVisible();
  });
});
