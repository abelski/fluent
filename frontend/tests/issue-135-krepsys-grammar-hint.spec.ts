// Issue #135 — grammar exercise "Jonas neša krep___." showed no base-word hint
// because "krepšys" (bag) was missing from backend/data/grammar/words.txt.

import { test, expect } from '@playwright/test';

function makeFakeJwt(): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = btoa(JSON.stringify({ email: 'test@test.com', name: 'Test User', exp: 9999999999 }));
  return `${header}.${payload}.fakesignature`;
}

const MOCK_LESSONS = [
  {
    id: 2,
    title: 'Урок 2 — Винительный',
    level: 'advanced',
    cases: [4],
    task_count: 1,
    rules: [
      {
        question: 'Ką?',
        name_ru: 'Винительный',
        usage: 'Прямое дополнение',
        endings_sg: '-ą / -į',
        endings_pl: '-us / -ius',
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
    display: 'Jonas neša krep___.',
    answer: 'šį',
    full_answer: 'krepšį',
    translation_ru: 'Йонас несёт сумку.',
    base_lt: 'krepšys',
  },
];

const MOCK_GRAMMAR_PROGRAMS_ENROLLED = [
  { id: 1, title: 'Литовские падежи', title_en: null, description: null, difficulty: 1, enrolled: true },
];

test.describe('Issue #135 — krepšys base-word hint shown for accusative sentence', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript((token) => {
      localStorage.setItem('fluent_token', token);
    }, makeFakeJwt());
    await page.route('**/api/grammar-programs', (r) => r.fulfill({ json: MOCK_GRAMMAR_PROGRAMS_ENROLLED }));
    await page.route('**/api/grammar/lessons', (r) => r.fulfill({ json: MOCK_LESSONS }));
    await page.route(/\/api\/grammar\/verb-lessons/, (r) => r.fulfill({ json: [] }));
    await page.route('**/api/grammar/lessons/2/tasks', (r) => r.fulfill({ json: MOCK_TASKS }));
    await page.route('**/api/grammar/lessons/2/results', (r) => r.fulfill({ json: { ok: true, passed: true } }));
  });

  test('accusative sentence shows krepšys as base form', async ({ page }) => {
    await page.goto('/dashboard/grammar');
    await page.waitForSelector('[data-testid="subcategory-toggle"]', { timeout: 5000 });
    await page.locator('[data-testid="subcategory-toggle"]').first().click();
    await page.waitForSelector('.grid button', { timeout: 5000 });
    await page.locator('.grid button').first().click();

    await page.waitForSelector('input[type="text"]', { timeout: 5000 });
    await expect(page.locator('text=krepšys')).toBeVisible({ timeout: 3000 });
  });
});
