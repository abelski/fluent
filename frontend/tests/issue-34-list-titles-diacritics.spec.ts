import { test, expect } from '@playwright/test';

function makeFakeJwt(): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = btoa(JSON.stringify({ email: 'test@test.com', name: 'Test User', exp: 9999999999 }));
  return `${header}.${payload}.fakesignature`;
}

// Mock lists containing the Lithuanian diacritics titles updated in issue #34.
// The subcategory is enrolled so all lists are shown in /dashboard/lists.
const MOCK_LISTS_WITH_DIACRITICS = [
  { id: 156, title: 'Būdvardžiai',          title_en: null, description: null, description_en: null, subcategory: 'lt_basics', word_count: 10 },
  { id: 173, title: 'Šeima ir žmonės',      title_en: null, description: null, description_en: null, subcategory: 'lt_basics', word_count: 15 },
  { id: 178, title: 'Veiksmažodžiai',       title_en: null, description: null, description_en: null, subcategory: 'lt_basics', word_count: 20 },
  { id: 162, title: 'Įvairiai',             title_en: null, description: null, description_en: null, subcategory: 'lt_basics', word_count: 8 },
  { id: 164, title: 'Laikas ir metų laikai',title_en: null, description: null, description_en: null, subcategory: 'lt_basics', word_count: 12 },
];

const MOCK_META = {
  lt_basics: {
    cefr_level: 'A1', difficulty: null,
    name_ru: 'Литовский базовый', name_en: 'Lithuanian basics',
    article_url: null, article_name_ru: null, article_name_en: null,
    enrollment_count: 3,
  },
};

function setupRoutes(page: import('@playwright/test').Page) {
  page.route('**/api/lists',              (r) => r.fulfill({ json: MOCK_LISTS_WITH_DIACRITICS }));
  page.route('**/api/subcategory-meta',   (r) => r.fulfill({ json: MOCK_META }));
  page.route('**/api/me/programs',        (r) => r.fulfill({ json: ['lt_basics'] }));
  page.route('**/api/me/quota',           (r) => r.fulfill({ json: { is_premium: false, premium_active: false, premium_until: null, sessions_today: 0, daily_limit: 10, is_admin: false, is_superadmin: false } }));
  page.route('**/api/me/lists-progress',  (r) => r.fulfill({ json: {} }));
}

// Navigate to /dashboard/lists and wait until the group is auto-expanded and list cards appear.
async function goToListsAndWait(page: import('@playwright/test').Page) {
  await page.goto('/dashboard/lists');
  // The page auto-expands the enrolled subcategory; wait for any list card heading (h2) to appear.
  await page.waitForSelector('h2', { timeout: 7000 });
}

test.describe('Issue #34 — Lithuanian list titles with diacritics render correctly on /dashboard/lists', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript((token) => {
      localStorage.setItem('fluent_token', token);
    }, makeFakeJwt());
    setupRoutes(page);
  });

  test('shows Būdvardžiai (ū, ž) correctly', async ({ page }) => {
    await goToListsAndWait(page);
    await expect(page.getByRole('heading', { name: 'Būdvardžiai' })).toBeVisible();
  });

  test('shows Šeima ir žmonės (Š, ž, ė) correctly', async ({ page }) => {
    await goToListsAndWait(page);
    await expect(page.getByRole('heading', { name: 'Šeima ir žmonės' })).toBeVisible();
  });

  test('shows Veiksmažodžiai (ž) correctly', async ({ page }) => {
    await goToListsAndWait(page);
    await expect(page.getByRole('heading', { name: 'Veiksmažodžiai' })).toBeVisible();
  });

  test('shows Įvairiai (Į) correctly', async ({ page }) => {
    await goToListsAndWait(page);
    await expect(page.getByRole('heading', { name: 'Įvairiai' })).toBeVisible();
  });

  test('shows Laikas ir metų laikai (ų) correctly', async ({ page }) => {
    await goToListsAndWait(page);
    await expect(page.getByRole('heading', { name: 'Laikas ir metų laikai' })).toBeVisible();
  });

  test('all five diacritic titles are visible simultaneously', async ({ page }) => {
    await goToListsAndWait(page);
    await expect(page.getByRole('heading', { name: 'Būdvardžiai' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Šeima ir žmonės' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Veiksmažodžiai' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Įvairiai' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Laikas ir metų laikai' })).toBeVisible();
  });
});
