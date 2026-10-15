import { test, expect } from '@playwright/test';

// Grammar programs: enrol / open / remove. Since #66 the catalogue lives on the overview
// («Программы» / «Другие программы») and each program has its page on `?program=<id>`;
// the separate /dashboard/grammar/programs page is gone. Fully mocked.

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

const MOCK_CONFIG = {
  lessons: [[1, 'basic', [4], 24, 'Galininkas Vns.']],
  cases: { '4': ['Galininkas', 'Vienaskaita'] },
};

const MOCK_PROGRAM = {
  id: 1,
  title: 'Литовские падежи',
  title_en: 'Lithuanian Cases',
  description: 'Все грамматические падежи литовского языка.',
  difficulty: 1,
  lesson_filter: '["Vienaskaita","Daugiskaita"]',
  program_type: 'cases',
  last_result_at: null,
};

const MOCK_LESSON = {
  id: 1,
  title: 'Galininkas',
  level: 'basic',
  cases: [4],
  task_count: 24,
  rules: [],
  is_locked: false,
  best_score_pct: null,
};

test.describe('Grammar programs', () => {
  async function setupCommonMocks(page: import('@playwright/test').Page, enrolled: boolean) {
    await page.route('**/api/**', (route) => route.fulfill({ json: [] })); // fallback: never the real backend
    await page.route('**/api/admin/grammar/config', (route) => route.fulfill({ json: MOCK_CONFIG }));
    await page.route('**/api/grammar-programs', (route) => route.fulfill({ json: [{ ...MOCK_PROGRAM, enrolled }] }));
    await page.route('**/api/grammar/lessons', (route) => route.fulfill({ json: [MOCK_LESSON] }));
  }

  test('not enrolled: no-programs hero plus the catalogue; no /programs link any more', async ({ page }) => {
    await setFakeToken(page);
    await setupCommonMocks(page, false);
    await page.goto('/dashboard/grammar');
    await expect(page.getByTestId('hero-start-cases')).toBeVisible();
    await expect(page.getByTestId('catalog-card-1')).toContainText('Литовские падежи');
    await expect(page.getByTestId('catalog-card-1-add')).toHaveText('Добавить');
    await expect(page.locator('a[href*="/grammar/programs"]')).toHaveCount(0);
  });

  test('enrolled: the in-progress card opens the program page with its topics', async ({ page }) => {
    await setFakeToken(page);
    await setupCommonMocks(page, true);
    await page.goto('/dashboard/grammar');
    await page.getByTestId('program-card-1').click();
    await expect(page).toHaveURL(/\/dashboard\/grammar\/?\?program=1$/);
    await expect(page.getByTestId('program-header')).toContainText('Литовские падежи');
    await expect(page.getByTestId('topic-row')).toContainText('Galininkas');
    // Nothing attempted yet: «Начать», not «Продолжить».
    await expect(page.getByTestId('program-continue')).toHaveText('Начать');
    await page.getByTestId('program-back').click();
    await expect(page).toHaveURL(/\/dashboard\/grammar\/?$/);
  });

  test('unenroll (after confirm) shows the no-programs hero', async ({ page }) => {
    await setFakeToken(page);
    await setupCommonMocks(page, true);
    let deleted = false;
    await page.route('**/api/me/grammar-programs/1', (route) => {
      deleted = route.request().method() === 'DELETE';
      return route.fulfill({ json: { ok: true } });
    });

    await page.goto('/dashboard/grammar?program=1');
    await page.getByTestId('program-menu').click();
    await page.getByTestId('unenroll-button').click();
    await page.getByTestId('unenroll-confirm-button').click();
    await expect(page.getByTestId('hero-start-cases')).toHaveText('Начать с падежей');
    await expect(page.getByTestId('grammar-hero-count')).toHaveText('0');
    await expect(page.getByTestId('unenroll-button')).toHaveCount(0);
    expect(deleted).toBe(true);
  });
});
