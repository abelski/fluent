import { test, expect } from '@playwright/test';

// «Напомни что я мог забыть» (#26) — the remind button on the Грамматика hero
// card. Mock setup mirrors grammar-programs.spec.ts.

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
  lessons: [[1, 'basic', [4], 24, 'Galininkas Vns.'], [3, 'practice', [4], 20, 'Galininkas Vns.']],
  cases: { '4': ['Galininkas', 'Vienaskaita'] },
};

// lesson_filter: null (show every noun lesson) keeps these tests independent of
// the case-group lookup — that mapping is covered by grammar-programs.spec.ts.
const MOCK_PROGRAM = {
  id: 1,
  title: 'Литовские падежи',
  title_en: 'Lithuanian Cases',
  description: 'Все грамматические падежи литовского языка.',
  difficulty: 1,
  enrolled: true,
  lesson_filter: null,
  program_type: 'cases',
};

const REMIND_BUTTON_NAME = 'Напомни что я мог забыть';

test.describe('Grammar remind', () => {
  function setupCommonMocks(page: import('@playwright/test').Page) {
    page.route('**/api/admin/grammar/config', route => route.fulfill({ json: MOCK_CONFIG }));
    page.route('**/api/grammar/verb-lessons**', route => route.fulfill({ json: [] }));
    page.route('**/api/grammar-programs', route => route.fulfill({ json: [MOCK_PROGRAM] }));
  }

  test('passed practice lesson enables the button and starts an exercise', async ({ page }) => {
    await setFakeToken(page);
    setupCommonMocks(page);

    await page.route('**/api/grammar/lessons', (route) =>
      route.fulfill({
        json: [
          { id: 1, title: 'Galininkas', level: 'basic', cases: [4], task_count: 24, rules: [], is_locked: false, best_score_pct: null },
          { id: 3, title: 'Galininkas', level: 'practice', cases: [4], task_count: 20, rules: [], is_locked: false, best_score_pct: 0.9 },
        ],
      })
    );
    await page.route('**/api/grammar/remind/tasks', (route) =>
      route.fulfill({
        json: [
          { type: 'sentence', display: 'Laima mato brol___.', answer: 'į', full_answer: 'brolį', translation_ru: 'Лайма видит брата.' },
        ],
      })
    );

    await page.goto('/dashboard/grammar');
    const button = page.getByRole('button', { name: REMIND_BUTTON_NAME });
    await expect(button).toBeVisible();
    await expect(button).toBeEnabled();

    await button.click();
    await expect(page.getByRole('button', { name: 'Проверить' })).toBeVisible();
  });

  test('no passed practice lesson disables the button and shows a hint', async ({ page }) => {
    await setFakeToken(page);
    setupCommonMocks(page);

    await page.route('**/api/grammar/lessons', (route) =>
      route.fulfill({
        json: [
          { id: 1, title: 'Galininkas', level: 'basic', cases: [4], task_count: 24, rules: [], is_locked: false, best_score_pct: 0.9 },
        ],
      })
    );

    await page.goto('/dashboard/grammar');
    const button = page.getByRole('button', { name: REMIND_BUTTON_NAME });
    await expect(button).toBeVisible();
    await expect(button).toBeDisabled();
    await expect(page.getByText('Пройдите хотя бы один урок «Повторение», чтобы открыть')).toBeVisible();
  });
});
