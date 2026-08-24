// Plan #8 — grammar practice-level: type the full word, not just the ending.
//
// At level="practice", the backend strips the stem out of `display` (so the blank
// stands for the whole word) and grades against the full inflected word instead of
// just the ending. This spec mocks a practice-level lesson end-to-end and confirms:
//   (a) the rendered sentence shows no stem text before the input,
//   (b) typing only the ending is graded wrong, typing the full word is graded correct,
//   (c) the base_lt dictionary-form hint still shows at practice level.

import { test, expect } from '@playwright/test';

function makeFakeJwt(name: string): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = btoa(JSON.stringify({ email: 'test@test.com', name, exp: 9999999999 }));
  return `${header}.${payload}.fakesignature`;
}

// Lesson id 130 doesn't collide with other specs' mocked lesson ids. Must stay
// below 200 — the frontend treats any lesson id >= 200 as a verb lesson
// (`isVerbLesson`) and fetches it from a different endpoint.
const MOCK_LESSONS = [
  {
    id: 130,
    title: 'Урок — практика',
    level: 'practice',
    cases: [4],
    task_count: 1,
    rules: [],
    is_locked: false,
    best_score_pct: null,
  },
];

// Sentence task as the backend serves it at practice level: stem already stripped
// out of `display`, and `answer` is the whole inflected word, not just the ending.
const MOCK_TASKS_PRACTICE = [
  {
    type: 'sentence',
    display: 'Laima mato ___.',
    answer: 'brolį',
    full_answer: 'brolį',
    translation_ru: 'Лайма видит брата.',
    base_lt: 'brolis',
  },
];

const MOCK_GRAMMAR_PROGRAMS_ENROLLED = [
  { id: 1, title: 'Литовские падежи', title_en: null, description: null, difficulty: 1, enrolled: true },
];

test.describe('Plan #8 — grammar practice level requires full word', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript((token) => {
      localStorage.setItem('fluent_token', token);
    }, makeFakeJwt('Test User'));
    await page.route('**/api/grammar-programs', async (route) => {
      await route.fulfill({ json: MOCK_GRAMMAR_PROGRAMS_ENROLLED });
    });
    await page.route('**/api/grammar/lessons', async (route) => {
      await route.fulfill({ json: MOCK_LESSONS });
    });
    await page.route(/\/api\/grammar\/verb-lessons/, async (route) => {
      await route.fulfill({ json: [] });
    });
    await page.route('**/api/grammar/lessons/130/tasks', async (route) => {
      await route.fulfill({ json: MOCK_TASKS_PRACTICE });
    });
    await page.route('**/api/grammar/lessons/130/results', async (route) => {
      await route.fulfill({ json: { ok: true, passed: true } });
    });
  });

  async function goToPracticeLesson(page: import('@playwright/test').Page) {
    await page.goto('/dashboard/grammar');
    await page.waitForSelector('[data-testid="subcategory-toggle"]', { timeout: 5000 });
    await page.locator('[data-testid="subcategory-toggle"]').first().click();
    await page.waitForSelector('.grid button', { timeout: 5000 });
    await page.locator('.grid button').first().click();
    await page.waitForSelector('input[type="text"]', { timeout: 5000 });
  }

  test('sentence display shows no stem text before the input', async ({ page }) => {
    await goToPracticeLesson(page);

    // The sentence paragraph is scoped via its distinguishing `font-mono` class
    // (InlineSentenceInput's outer <p>) so this doesn't match the separate base_lt
    // hint paragraph, which uses different (non font-mono) classes.
    const sentenceParagraph = page.locator('p.font-mono');
    await expect(sentenceParagraph).toBeVisible();
    const text = (await sentenceParagraph.textContent()) ?? '';
    // No stem ("brol") leaked into the display — only "Laima mato" + the blank remain.
    expect(text).not.toContain('brol');
    expect(text).toContain('Laima mato');
  });

  test('typing only the ending ("į") is graded wrong at practice level', async ({ page }) => {
    await goToPracticeLesson(page);

    await page.locator('input[type="text"]').fill('į');
    await page.locator('input[type="text"]').press('Enter');

    await expect(page.locator('[data-testid="dismiss-wrong"]')).toBeVisible({ timeout: 3000 });
  });

  test('typing the full word ("brolį") is graded correct at practice level', async ({ page }) => {
    await goToPracticeLesson(page);

    await page.locator('input[type="text"]').fill('brolį');
    await page.locator('input[type="text"]').press('Enter');

    await page.waitForTimeout(400);
    await expect(page.locator('[data-testid="dismiss-wrong"]')).not.toBeVisible();
  });

  test('on a wrong guess, the shown correct answer is the full word "brolį"', async ({ page }) => {
    await goToPracticeLesson(page);

    await page.locator('input[type="text"]').fill('į');
    await page.locator('input[type="text"]').press('Enter');

    await expect(page.locator('[data-testid="dismiss-wrong"]')).toBeVisible({ timeout: 3000 });
    await expect(page.locator('text=brolį')).toBeVisible();
  });

  test('the base_lt dictionary-form hint ("от: brolis") stays visible at practice level', async ({ page }) => {
    await goToPracticeLesson(page);

    await expect(page.locator('text=/от:\\s*brolis/')).toBeVisible();
  });
});
