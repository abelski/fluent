// Issue #25 — grammar exercise base form mismatch: draugė vs draugas.
// The bug: both "draugas" and "draugė" share stem "draug". The backend was
// resolving base_lt via stem lookup only, so the last word in words.txt with
// that stem ("draugė") always won, even for masculine sentences like
// "Petras ieško draug___" (answer: draugo → base: draugas).

import { test, expect } from '@playwright/test';

const MOCK_LESSONS = [
  {
    id: 1,
    title: 'Урок 1 — Родительный',
    level: 'advanced',
    cases: [2],
    task_count: 2,
    rules: [
      {
        question: 'Кого? Чего?',
        name_ru: 'Родительный',
        usage: 'Отсутствие, отрицание, принадлежность',
        endings_sg: '-o / -ės',
        endings_pl: '-ų / -ių',
        transform: null,
      },
    ],
    is_locked: false,
    best_score_pct: null,
  },
];

// Sentence task as the fixed backend should return it:
// full_word="draugo" → _FORM_TO_NOMINATIVE resolves to "draugas", not "draugė".
const MOCK_TASKS_CORRECT = [
  {
    type: 'sentence',
    display: 'Petras ieško draug___.',
    answer: 'o',
    full_answer: 'draugo',
    translation_ru: 'Пятрас ищет друга.',
    base_lt: 'draugas',
  },
  {
    type: 'sentence',
    display: 'Rasa ieško draug___.',
    answer: 'ės',
    full_answer: 'draugės',
    translation_ru: 'Раса ищет подругу.',
    base_lt: 'draugė',
  },
];

test.describe('Issue #25 — grammar base form: draugas vs draugė', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/grammar/lessons', async (route) => {
      await route.fulfill({ json: MOCK_LESSONS });
    });
    await page.route('**/api/grammar/lessons/1/tasks', async (route) => {
      await route.fulfill({ json: MOCK_TASKS_CORRECT });
    });
    await page.route('**/api/grammar/lessons/1/results', async (route) => {
      await route.fulfill({ json: { ok: true, passed: true } });
    });
  });

  test('masculine sentence shows draugas as base form (not draugė)', async ({ page }) => {
    await page.goto('/dashboard/grammar');
    await page.waitForSelector('[data-testid="subcategory-toggle"]', { timeout: 5000 });
    await page.locator('[data-testid="subcategory-toggle"]').first().click();
    await page.waitForSelector('.grid button', { timeout: 5000 });
    await page.locator('.grid button').first().click();

    // Wait for lesson task to load
    await page.waitForSelector('input[type="text"]', { timeout: 5000 });

    // The first task is "Petras ieško draug___" with base_lt "draugas".
    // Verify that "draugas" is shown and "draugė" is NOT shown as the base form.
    await expect(page.locator('text=draugas')).toBeVisible({ timeout: 3000 });
    await expect(page.locator('text=draugė')).not.toBeVisible();
  });

  test('answer "o" for Petras ieško draug___ is accepted as correct', async ({ page }) => {
    await page.goto('/dashboard/grammar');
    await page.waitForSelector('[data-testid="subcategory-toggle"]', { timeout: 5000 });
    await page.locator('[data-testid="subcategory-toggle"]').first().click();
    await page.waitForSelector('.grid button', { timeout: 5000 });
    await page.locator('.grid button').first().click();

    await page.waitForSelector('input[type="text"]', { timeout: 5000 });

    // Submit the correct answer
    await page.locator('input[type="text"]').fill('o');
    await page.locator('input[type="text"]').press('Enter');

    // Should NOT show the wrong-answer dismiss button
    await page.waitForTimeout(400);
    await expect(page.locator('[data-testid="dismiss-wrong"]')).not.toBeVisible();
  });

  test('wrong answer for Petras ieško draug___ shows draugo as correct answer', async ({ page }) => {
    await page.goto('/dashboard/grammar');
    await page.waitForSelector('[data-testid="subcategory-toggle"]', { timeout: 5000 });
    await page.locator('[data-testid="subcategory-toggle"]').first().click();
    await page.waitForSelector('.grid button', { timeout: 5000 });
    await page.locator('.grid button').first().click();

    await page.waitForSelector('input[type="text"]', { timeout: 5000 });

    // Submit the wrong answer (old incorrect feminine ending)
    await page.locator('input[type="text"]').fill('ės');
    await page.locator('input[type="text"]').press('Enter');

    await expect(page.locator('[data-testid="dismiss-wrong"]')).toBeVisible({ timeout: 3000 });
    // Correct answer shown should be "draugo", not "draugės"
    await expect(page.locator('text=draugo')).toBeVisible();
  });
});
