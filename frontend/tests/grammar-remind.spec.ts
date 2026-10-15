import { test, expect } from '@playwright/test';

// «Повторить пройденное» (#26, #66): the review run draws from passed «Смешанный» lessons.
// Since #66 it lives on the program («Пройдено» / the finished program's header / the
// «Завершённые» row) and is scoped to it with `?program_id=`. Fully mocked.

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
  lessons: [],
  cases: { '4': ['Galininkas', 'Vienaskaita'] },
};

// lesson_filter: null (show every noun lesson) keeps these tests independent of
// the case-group lookup — that mapping is covered by grammar-bento.spec.ts.
const MOCK_PROGRAM = {
  id: 1,
  title: 'Литовские падежи',
  title_en: 'Lithuanian Cases',
  description: 'Все грамматические падежи литовского языка.',
  difficulty: 1,
  enrolled: true,
  lesson_filter: null,
  program_type: 'cases',
  last_result_at: null,
};

const lesson = (id: number, title: string, level: string, best: number | null) =>
  ({ id, title, level, cases: [4], task_count: 10, rules: [], is_locked: false, best_score_pct: best });

const TASK = { type: 'sentence', display: 'Laima mato brol___.', answer: 'į', full_answer: 'brolį', translation_ru: 'Лайма видит брата.' };

test.describe('Grammar remind', () => {
  async function setup(page: import('@playwright/test').Page, lessons: unknown[], remindStatus = 200) {
    await setFakeToken(page);
    const remind: string[] = [];
    await page.route('**/api/**', (route) => route.fulfill({ json: [] })); // fallback: never the real backend
    await page.route('**/api/admin/grammar/config', (route) => route.fulfill({ json: MOCK_CONFIG }));
    await page.route('**/api/grammar-programs', (route) => route.fulfill({ json: [MOCK_PROGRAM] }));
    await page.route('**/api/grammar/lessons', (route) => route.fulfill({ json: lessons }));
    await page.route('**/api/grammar/remind/tasks**', (route) => {
      remind.push(new URL(route.request().url()).search);
      return remindStatus === 200
        ? route.fulfill({ json: [TASK] })
        : route.fulfill({ status: remindStatus, json: { detail: 'no_passed_practice' } });
    });
    return remind;
  }

  test('a passed «Смешанный» lesson offers the review in «Пройдено»; it starts an exercise for this program', async ({ page }) => {
    const remind = await setup(page, [
      lesson(1, 'Galininkas', 'basic', 0.9), lesson(3, 'Galininkas', 'practice', 0.9),
      lesson(4, 'Naudininkas', 'basic', null),
    ]);
    await page.goto('/dashboard/grammar?program=1');
    await page.getByTestId('passed-card').locator('summary').click();
    const button = page.getByTestId('passed-review');
    await expect(button).toHaveText('Повторить · ~10 заданий');
    await expect(page.getByTestId('passed-card')).toContainText('Короткая сессия из пройденного, сначала слабое');
    await button.click();
    await expect(page.getByRole('button', { name: 'Проверить' })).toBeVisible();
    expect(remind).toEqual(['?program_id=1']);
  });

  test('no passed «Смешанный» lesson: no review button anywhere', async ({ page }) => {
    await setup(page, [lesson(1, 'Galininkas', 'basic', 0.9), lesson(2, 'Galininkas', 'advanced', 0.9)]);
    await page.goto('/dashboard/grammar?program=1');
    await expect(page.getByTestId('passed-card')).toBeVisible();
    await expect(page.getByTestId('program-next')).toContainText('✓ Все уроки пройдены');
    await expect(page.getByTestId('program-review')).toHaveCount(0);
    await expect(page.getByTestId('passed-review')).toHaveCount(0);
    await page.goto('/dashboard/grammar');
    await page.getByTestId('completed-section').locator('summary').click();
    await expect(page.getByTestId('completed-row-1')).toBeVisible();
    await expect(page.getByTestId('completed-review')).toHaveCount(0);
    await expect(page.getByTestId('hero-review')).toHaveCount(0);
  });

  test('the server says there is nothing to review (404): a line, not a spinner', async ({ page }) => {
    await setup(page, [lesson(1, 'Galininkas', 'basic', 0.9), lesson(3, 'Galininkas', 'practice', 0.9)], 404);
    await page.goto('/dashboard/grammar?program=1');
    await page.getByTestId('program-review').click();
    await expect(page.getByTestId('grammar-remind-none')).toHaveText(
      'Пока нечего повторять: пройди хотя бы один урок «Смешанный» в этой программе.');
    await expect(page.getByTestId('program-header')).toBeVisible();
  });

  test('daily limit (429) shows the limit screen', async ({ page }) => {
    await setup(page, [lesson(1, 'Galininkas', 'basic', 0.9), lesson(3, 'Galininkas', 'practice', 0.9)], 429);
    await page.goto('/dashboard/grammar?program=1');
    await page.getByTestId('program-review').click();
    await expect(page.getByTestId('grammar-blocked-quota')).toBeVisible();
  });
});
