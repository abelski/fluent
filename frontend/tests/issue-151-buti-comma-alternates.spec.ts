// Issue #151 follow-on — bū́ti's comma-separated alternates must be gradeable.
//
// The book prints two present paradigms for bū́ti in one cell ("esù, būnù" / "yrà, bū̃na").
// Before the re-extraction, production held only a truncated "esù," — issue #150 stripped
// the trailing comma and the answer became plain "esù". Reading the page correctly now
// restores the full cell, and isAnswerMatch only split alternates on "/", so a learner
// typing "esu" would have been marked wrong.
//
// isAnswerMatch now treats "," as an alternate separator too. This drives the real
// grammar UI so it guards the shipped function, not a copy of it.

import { test, expect } from '@playwright/test';

function makeFakeJwt(): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = btoa(JSON.stringify({ email: 'test@test.com', name: 'Test User', exp: 9999999999 }));
  return `${header}.${payload}.fakesignature`;
}

const LESSON = {
  id: 200,
  level: 'basic',
  tense_key: 'indicative_present',
  task_count: 1,
  title: 'Настоящее время',
  is_locked: false,
  best_score_pct: null,
};

const TASK = {
  type: 'verb_conjugation',
  verb_infinitive: 'bū́ti',
  translation_ru: 'быть, являться',
  tense_label: 'Настоящее время',
  person_label: 'aš',
  answer: 'esù, būnù',
};

async function openLesson(page: import('@playwright/test').Page) {
  await page.goto('/dashboard/grammar');

  const toggle = page.getByTestId('subcategory-toggle').first();
  await toggle.click();

  // The lesson cards render in the panel that follows the toggle. Matching by title
  // instead would also match the toggle itself — which would just collapse it again.
  await page.locator('[data-testid="subcategory-toggle"] + div button').first().click();

  await expect(page.getByText('bū́ti', { exact: false }).first()).toBeVisible({ timeout: 8000 });
}

test.describe('Issue #151 — bū́ti comma alternates are accepted', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript((token) => {
      localStorage.setItem('fluent_token', token);
    }, makeFakeJwt());

    await page.route('**/api/grammar/lessons', (r) => r.fulfill({ json: [] }));
    await page.route('**/api/grammar/progress', (r) => r.fulfill({ json: {} }));
    await page.route('**/api/grammar-programs', (r) =>
      r.fulfill({ json: [{ program_type: 'verbs', key: 'verbs', enrolled: true }] }));
    await page.route('**/api/grammar/verb-lessons?program_type=verbs', (r) =>
      r.fulfill({ json: [LESSON] }));
    await page.route('**/api/grammar/verb-lessons?program_type=verb_cases', (r) =>
      r.fulfill({ json: [] }));
    await page.route('**/api/grammar/verb-lessons/200/tasks', (r) => r.fulfill({ json: [TASK] }));
    await page.route('**/api/grammar/verb-lessons/200/results', (r) => r.fulfill({ json: { ok: true } }));
  });

  test('typing the first alternate "esu" is graded correct', async ({ page }) => {
    await openLesson(page);

    await page.locator('input[type="text"]').first().fill('esu');
    await page.getByRole('button', { name: 'Проверить' }).click();

    // The wrong-answer panel carries this testid; a correct answer must not show it.
    await expect(page.getByTestId('dismiss-wrong')).toHaveCount(0);
  });

  test('typing the second alternate "bunu" is graded correct', async ({ page }) => {
    await openLesson(page);

    await page.locator('input[type="text"]').first().fill('bunu');
    await page.getByRole('button', { name: 'Проверить' }).click();

    await expect(page.getByTestId('dismiss-wrong')).toHaveCount(0);
  });

  test('a genuinely wrong answer is still rejected, and the reveal is complete', async ({ page }) => {
    await openLesson(page);

    await page.locator('input[type="text"]').first().fill('visiskaiNeteisingas');
    await page.getByRole('button', { name: 'Проверить' }).click();

    await expect(page.getByTestId('dismiss-wrong')).toBeVisible();

    // The reveal must show the whole cell — this is the #153 symptom's UI surface.
    const reveal = page.locator('span.font-semibold').filter({ hasText: 'esù' }).first();
    await expect(reveal).toBeVisible();
    await expect(reveal).toHaveText(TASK.answer);
  });
});
