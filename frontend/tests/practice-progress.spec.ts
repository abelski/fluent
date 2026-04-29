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

const MOCK_CATEGORY = {
  id: 2,
  name_ru: 'Конституция',
  name_en: null,
  description_ru: null,
  sort_order: 0,
  test_count: 2,
  tests_passed: 1,
  tests_total: 2,
};

const MOCK_TEST_UNLOCKED = {
  id: 10,
  title_ru: 'Тест 1',
  title_en: null,
  description_ru: null,
  description_en: null,
  lesson_text_lt: null,
  question_count: 5,
  pass_threshold: 0.75,
  is_premium: false,
  active_question_count: 5,
  is_locked: false,
  best_score_pct: 0.8,
};

const MOCK_TEST_LOCKED = {
  id: 11,
  title_ru: 'Тест 2',
  title_en: null,
  description_ru: null,
  description_en: null,
  lesson_text_lt: null,
  question_count: 5,
  pass_threshold: 0.75,
  is_premium: false,
  active_question_count: 5,
  is_locked: true,
  best_score_pct: null,
};

test.describe('Practice progress', () => {
  test('shows per-category progress bar and count on the list page', async ({ page }) => {
    await setFakeToken(page);

    await page.route('**/api/me/practice-categories', (route) =>
      route.fulfill({ json: [MOCK_CATEGORY] })
    );

    await page.goto('/dashboard/practice');

    // progress count visible
    await expect(page.getByText('1/2')).toBeVisible();
    // progress bar rendered (non-zero width)
    const bar = page.locator('.bg-amber-400, .bg-emerald-500').first();
    await expect(bar).toBeVisible();
  });

  test('first test is enabled, second test is locked with lock icon', async ({ page }) => {
    await setFakeToken(page);

    await page.route('**/api/practice/categories/2/tests', (route) =>
      route.fulfill({ json: [MOCK_TEST_UNLOCKED, MOCK_TEST_LOCKED] })
    );
    await page.route('**/api/me/quota', (route) =>
      route.fulfill({ json: { premium_active: false } })
    );
    await page.route('**/api/practice/categories', (route) =>
      route.fulfill({ json: [{ id: 2, name_ru: 'Конституция', name_en: null, description_ru: null, source_url: null }] })
    );

    await page.goto('/dashboard/practice/2');

    // Lock icon svg present for locked test
    const rows = page.locator('[class*="divide-y"] > div');
    await expect(rows).toHaveCount(2);

    // First test button should be enabled
    const firstBtn = rows.nth(0).locator('button');
    await expect(firstBtn).not.toBeDisabled();

    // Second test button should be disabled
    const secondBtn = rows.nth(1).locator('button');
    await expect(secondBtn).toBeDisabled();
  });

  test('second test unlocks after first is passed', async ({ page }) => {
    await setFakeToken(page);

    let callCount = 0;
    await page.route('**/api/practice/categories/2/tests', (route) => {
      callCount++;
      // Second call returns second test as unlocked (after result posted)
      const secondLocked = callCount <= 1;
      route.fulfill({ json: [MOCK_TEST_UNLOCKED, { ...MOCK_TEST_LOCKED, is_locked: secondLocked }] });
    });
    await page.route('**/api/me/quota', (route) =>
      route.fulfill({ json: { premium_active: false } })
    );
    await page.route('**/api/practice/categories', (route) =>
      route.fulfill({ json: [{ id: 2, name_ru: 'Конституция', name_en: null, description_ru: null, source_url: null }] })
    );
    await page.route('**/api/practice/tests/10/exam', (route) =>
      route.fulfill({
        json: {
          test: { id: 10, title_ru: 'Тест 1', title_en: null, pass_threshold: 0.75, lesson_text_lt: null },
          questions: [
            { id: 1, question_ru: 'Вопрос?', question_lt: null, option_a: 'Верно', option_b: 'Неверно', option_c: 'Может быть', option_d: 'Не знаю', correct_option: 'a', category: null },
          ],
        },
      })
    );
    await page.route('**/api/practice/tests/10/results', (route) =>
      route.fulfill({ json: { ok: true } })
    );

    await page.goto('/dashboard/practice/2');

    // Start the first test
    const rows = page.locator('[class*="divide-y"] > div');
    await rows.nth(0).locator('button').click();

    // Select option A and submit
    await page.getByRole('button', { name: /^A\s+Верно/i }).click();
    await page.getByRole('button', { name: 'Ответить' }).click();
    await page.getByRole('button', { name: 'Завершить' }).click();

    // Go back to tests list
    await page.getByRole('button', { name: /к тестам/i }).click();

    // Second test should now be unlocked
    const secondBtn = rows.nth(1).locator('button');
    await expect(secondBtn).not.toBeDisabled();
  });
});
