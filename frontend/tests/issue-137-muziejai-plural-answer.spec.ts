// Issue #137 — grammar sentence "Čia yra muziej___." wrongly expected "muziejūs"
// instead of the correct nominative plural "muziejai".

import { test, expect } from '@playwright/test';

function makeFakeJwt(): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = btoa(JSON.stringify({ email: 'test@test.com', name: 'Test User', exp: 9999999999 }));
  return `${header}.${payload}.fakesignature`;
}

const MOCK_LESSONS = [
  {
    id: 17,
    title: 'Урок 17 — Именительный мн.ч.',
    level: 'advanced',
    cases: [8],
    task_count: 1,
    rules: [
      {
        question: 'Кто? Что? (мн.ч.)',
        name_ru: 'Именительный мн.ч.',
        usage: 'Подлежащее во множественном числе.',
        endings_sg: '—',
        endings_pl: '-ai, -iai, -os, -ės, -ūs, -ys',
        transform: null,
      },
    ],
    is_locked: false,
    best_score_pct: null,
  },
];

const MOCK_TASKS = [
  {
    type: 'sentence',
    display: 'Čia yra muziej___.',
    answer: 'ai',
    full_answer: 'muziejai',
    translation_ru: 'Здесь есть музеи.',
    base_lt: 'muziejus',
  },
];

const MOCK_GRAMMAR_PROGRAMS_ENROLLED = [
  { id: 1, title: 'Литовские падежи', title_en: null, description: null, difficulty: 1, enrolled: true },
];

test.describe('Issue #137 — muziejai is the correct nominative plural (not muziejūs)', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript((token) => {
      localStorage.setItem('fluent_token', token);
    }, makeFakeJwt());
    await page.route('**/api/grammar-programs', (r) => r.fulfill({ json: MOCK_GRAMMAR_PROGRAMS_ENROLLED }));
    await page.route('**/api/grammar/lessons', (r) => r.fulfill({ json: MOCK_LESSONS }));
    await page.route(/\/api\/grammar\/verb-lessons/, (r) => r.fulfill({ json: [] }));
    await page.route('**/api/grammar/lessons/17/tasks', (r) => r.fulfill({ json: MOCK_TASKS }));
    await page.route('**/api/grammar/lessons/17/results', (r) => r.fulfill({ json: { ok: true, passed: true } }));
  });

  test('answer "ai" for Čia yra muziej___ is accepted as correct', async ({ page }) => {
    await page.goto('/dashboard/grammar');
    await page.waitForSelector('[data-testid="subcategory-toggle"]', { timeout: 5000 });
    await page.locator('[data-testid="subcategory-toggle"]').first().click();
    await page.waitForSelector('.grid button', { timeout: 5000 });
    await page.locator('.grid button').first().click();

    await page.waitForSelector('input[type="text"]', { timeout: 5000 });
    await page.locator('input[type="text"]').fill('ai');
    await page.locator('input[type="text"]').press('Enter');

    await page.waitForTimeout(400);
    await expect(page.locator('[data-testid="dismiss-wrong"]')).not.toBeVisible();
  });

  test('wrong answer shows muziejai as correct (not muziejūs)', async ({ page }) => {
    await page.goto('/dashboard/grammar');
    await page.waitForSelector('[data-testid="subcategory-toggle"]', { timeout: 5000 });
    await page.locator('[data-testid="subcategory-toggle"]').first().click();
    await page.waitForSelector('.grid button', { timeout: 5000 });
    await page.locator('.grid button').first().click();

    await page.waitForSelector('input[type="text"]', { timeout: 5000 });
    await page.locator('input[type="text"]').fill('as');
    await page.locator('input[type="text"]').press('Enter');

    await expect(page.locator('[data-testid="dismiss-wrong"]')).toBeVisible({ timeout: 3000 });
    // The shown correct-answer value must be the semibold span next to "Правильный ответ", not the
    // fill-in-the-blank display (which just echoes back whatever the user typed).
    const shownAnswer = page.locator('[data-testid="dismiss-wrong"]').locator('..').locator('span.font-semibold');
    await expect(shownAnswer).toHaveText('muziejai');
  });
});
