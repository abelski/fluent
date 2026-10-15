import { test, expect } from '@playwright/test';

function makeFakeJwt(name: string): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = btoa(JSON.stringify({ email: 'test@test.com', name, exp: 9999999999 }));
  return `${header}.${payload}.fakesignature`;
}

async function setFakeToken(page: import('@playwright/test').Page) {
  await page.addInitScript((token) => {
    localStorage.setItem('fluent_token', token);
  }, makeFakeJwt('Test User'));
}

const MOCK_CATEGORIES = [
  {
    id: 1,
    name_ru: 'Конституция Литвы',
    name_en: 'Lithuanian Constitution',
    description_ru: 'Подготовка к экзамену на ПМЖ',
    sort_order: 0,
    test_count: 2,
    enrolled: false,
  },
  {
    id: 2,
    name_ru: 'История Литвы',
    name_en: 'History of Lithuania',
    description_ru: null,
    sort_order: 1,
    test_count: 1,
    enrolled: false,
  },
];

const MOCK_ENROLLED_CATEGORIES = [
  {
    id: 1,
    name_ru: 'Конституция Литвы',
    name_en: 'Lithuanian Constitution',
    description_ru: 'Подготовка к экзамену на ПМЖ',
    sort_order: 0,
    test_count: 2,
  },
];

const MOCK_TESTS = [
  {
    id: 10,
    title_ru: 'Тест по конституции',
    title_en: 'Constitution test',
    description_ru: 'Описание теста',
    description_en: null,
    question_count: 20,
    pass_threshold: 0.75,
    is_premium: false,
    active_question_count: 20,
  },
];

// #66: /dashboard/practice is the overview (full coverage in practice-bento.spec.ts); it reads
// GET /practice/categories (+ per-category /tests) and /me/practice-categories (last result).
async function mockPracticePage(page: import('@playwright/test').Page, enrolled: boolean) {
  await page.route('**/api/**', (route) => route.fulfill({ json: [] })); // fallback: never the real backend
  await page.route('**/api/practice/categories', (route) =>
    route.fulfill({ json: MOCK_CATEGORIES.map((c) => ({ ...c, enrolled: enrolled && c.id === 1 })) })
  );
  await page.route(/\/api\/practice\/categories\/\d+\/tests/, (route) =>
    route.fulfill({ json: MOCK_TESTS.map((t) => ({ ...t, lesson_text_lt: null, section_ru: null, section_en: null,
      is_final: false, is_locked: false, best_score_pct: null })) })
  );
  await page.route('**/api/me/quota', (route) => route.fulfill({ json: { premium_active: false } }));
}

test.describe('/dashboard/practice — overview', () => {
  test('no enrolled categories: onboarding hero and the catalogue instead of an empty state', async ({ page }) => {
    await setFakeToken(page);
    await mockPracticePage(page, false);
    await page.goto('/dashboard/practice');
    await expect(page.getByTestId('stats-card-practice')).toContainText('Выбери, к чему готовишься', { timeout: 5000 });
    // No category here has a final exam, so the hero offers the A2 start only.
    await expect(page.getByTestId('hero-start-a2')).toBeVisible();
    await expect(page.getByTestId('hero-start-practice')).toHaveCount(0);
    await expect(page.getByTestId('catalog-card-1')).toContainText('Конституция Литвы');
    await expect(page.getByTestId('catalog-card-2')).toContainText('История Литвы');
    await expect(page.getByTestId('in-progress-section')).toHaveCount(0);
  });

  test('#66: no link to the removed /dashboard/practice/programs page', async ({ page }) => {
    await setFakeToken(page);
    await mockPracticePage(page, true);
    await page.goto('/dashboard/practice');
    await expect(page.getByTestId('program-card-1')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('a[href*="/practice/programs"]')).toHaveCount(0);
  });

  test('shows the enrolled category as an in-progress card; the rest stays in the catalogue', async ({ page }) => {
    await setFakeToken(page);
    await mockPracticePage(page, true);
    await page.goto('/dashboard/practice');
    await expect(page.getByTestId('program-card-1')).toContainText('Конституция Литвы', { timeout: 5000 });
    await expect(page.getByTestId('program-card-1')).toContainText('0/1');
    await expect(page.getByTestId('catalog-card-2')).toBeVisible();
    await expect(page.getByTestId('catalog-card-1')).toHaveCount(0);
  });

  test('card → program page → a test row navigates to the category detail page', async ({ page }) => {
    await setFakeToken(page);
    await mockPracticePage(page, true);
    await page.goto('/dashboard/practice');
    await page.getByTestId('program-card-1').click();
    await expect(page).toHaveURL(/\/dashboard\/practice\/?\?program=1$/);
    await page.getByTestId('test-row').first().click();
    await expect(page).toHaveURL(/\/dashboard\/practice\/1\/?\?test=10/);
  });
});

// #66 — the /dashboard/practice/programs page is gone; the catalogue lives on the overview.

test.describe('/dashboard/practice/[id] — category detail page', () => {
  test('shows tests list', async ({ page }) => {
    await setFakeToken(page);
    await page.route('**/api/practice/categories/1/tests', (route) =>
      route.fulfill({ json: MOCK_TESTS })
    );
    await page.route('**/api/practice/categories', (route) =>
      route.fulfill({ json: MOCK_CATEGORIES })
    );
    await page.route('**/api/me/quota', (route) =>
      route.fulfill({ json: { premium_active: false } })
    );

    await page.goto('/dashboard/practice/1');
    await expect(page.getByText('Тест по конституции')).toBeVisible({ timeout: 5000 });
  });

  test('shows start exam button', async ({ page }) => {
    await setFakeToken(page);
    await page.route('**/api/practice/categories/1/tests', (route) =>
      route.fulfill({ json: MOCK_TESTS })
    );
    await page.route('**/api/practice/categories', (route) =>
      route.fulfill({ json: MOCK_CATEGORIES })
    );
    await page.route('**/api/me/quota', (route) =>
      route.fulfill({ json: { premium_active: false } })
    );

    await page.goto('/dashboard/practice/1');
    await expect(page.getByRole('button', { name: /Начать/ })).toBeVisible({ timeout: 5000 });
  });
});
