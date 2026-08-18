// Issue #156 — grammar sentence "Mama eina su dukt___." graded against 'eria' but
// displayed 'dukteri' as the correct answer; both were wrong. Correct instrumental
// singular of duktė is "dukterimi" (answer_ending 'erimi', full_word 'dukterimi').
//
// (a) Live-data test hits the real lesson-29 tasks endpoint (advanced, case_index 5 —
//     Įnagininkas/instrumental, task_count=35) and asserts the invariant the grader
//     actually relies on: stem(display) + answer === full_answer, case-insensitively.
//     Some rows legitimately carry a non-inflecting multi-word prefix in full_answer
//     (ordinal-number sentences), so the check is boundary-aware — full_answer must
//     equal stem+answer, or end with a whole extra word plus stem+answer — matching
//     the server-side `_sentence_invariant_holds` guard in grammar_service.py.
// (b) UI regression test with mocked routes pins the specific dukterimi row: typing
//     the correct ending must not show the "wrong" banner, and typing the old buggy
//     ending must show "dukterimi" (not "dukteri"/"dukteria") as the correct answer.

import { test, expect } from '@playwright/test';

function makeFakeJwt(): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = btoa(JSON.stringify({ email: 'test@test.com', name: 'Test User', exp: 9999999999 }));
  return `${header}.${payload}.fakesignature`;
}

test.describe('Issue #156 — live lesson-29 (instrumental) task data is internally consistent', () => {
  test('every sentence task satisfies stem(display) + answer === full_answer (boundary-aware)', async ({ page }) => {
    await page.goto('/');

    const result = await page.evaluate(async () => {
      type Task = {
        type: string;
        display: string;
        answer: string;
        full_answer: string;
      };

      const violations: Task[] = [];
      const dukterimiRows: Task[] = [];

      // pool[i % len(pool)] after a shuffle — a handful of fetches gives good coverage
      // of the case-5 pool even if it's larger than one response's task_count.
      for (let i = 0; i < 3; i++) {
        const res = await fetch('http://localhost:8000/api/grammar/lessons/29/tasks');
        const tasks: Task[] = await res.json();
        for (const task of tasks) {
          if (task.type !== 'sentence') continue;
          const m = task.display.match(/([^\s]+)___/);
          if (!m) continue;
          const stem = m[1].toLowerCase();
          const built = stem + (task.answer || '').toLowerCase();
          const full = (task.full_answer || '').toLowerCase();
          const holds = full === built || full.endsWith(' ' + built);
          if (!holds) violations.push(task);
          if (full.startsWith('dukter')) dukterimiRows.push(task);
        }
      }

      return { violations, dukterimiRows };
    });

    expect(result.violations).toEqual([]);

    expect(result.dukterimiRows.length).toBeGreaterThan(0);
    for (const row of result.dukterimiRows) {
      expect(row.full_answer).toBe('dukterimi');
      expect(row.answer).toBe('erimi');
      expect(row.full_answer).not.toBe('dukteri');
      expect(row.full_answer).not.toBe('dukteria');
    }
  });
});

const MOCK_LESSONS = [
  {
    id: 5,
    title: 'Урок — Творительный падеж',
    level: 'advanced',
    cases: [5],
    task_count: 1,
    rules: [
      {
        question: 'Kuo?',
        name_ru: 'Творительный (Įnagininkas)',
        usage: 'Орудие или сопровождение действия.',
        endings_sg: '-u, -iu, -a, -e, -imi',
        endings_pl: '-ais, -iais, -omis, -ėmis, -imis',
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
    display: 'Mama eina su dukt___.',
    answer: 'erimi',
    full_answer: 'dukterimi',
    translation_ru: 'Мама идёт с дочерью.',
    base_lt: 'duktė',
  },
];

const MOCK_GRAMMAR_PROGRAMS_ENROLLED = [
  { id: 1, title: 'Литовские падежи', title_en: null, description: null, difficulty: 1, enrolled: true },
];

test.describe('Issue #156 — dukterimi is the correct instrumental (not dukteri/dukteria)', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript((token) => {
      localStorage.setItem('fluent_token', token);
    }, makeFakeJwt());
    await page.route('**/api/grammar-programs', (r) => r.fulfill({ json: MOCK_GRAMMAR_PROGRAMS_ENROLLED }));
    await page.route('**/api/grammar/lessons', (r) => r.fulfill({ json: MOCK_LESSONS }));
    await page.route(/\/api\/grammar\/verb-lessons/, (r) => r.fulfill({ json: [] }));
    await page.route('**/api/grammar/lessons/5/tasks', (r) => r.fulfill({ json: MOCK_TASKS }));
    await page.route('**/api/grammar/lessons/5/results', (r) => r.fulfill({ json: { ok: true, passed: true } }));
  });

  test('answer "erimi" for Mama eina su dukt___ is accepted as correct', async ({ page }) => {
    await page.goto('/dashboard/grammar');
    await page.waitForSelector('[data-testid="subcategory-toggle"]', { timeout: 5000 });
    await page.locator('[data-testid="subcategory-toggle"]').first().click();
    await page.waitForSelector('.grid button', { timeout: 5000 });
    await page.locator('.grid button').first().click();

    await page.waitForSelector('input[type="text"]', { timeout: 5000 });
    await page.locator('input[type="text"]').fill('erimi');
    await page.locator('input[type="text"]').press('Enter');

    await page.waitForTimeout(400);
    await expect(page.locator('[data-testid="dismiss-wrong"]')).not.toBeVisible();
  });

  test('wrong answer "eria" shows dukterimi as correct (not dukteri/dukteria)', async ({ page }) => {
    await page.goto('/dashboard/grammar');
    await page.waitForSelector('[data-testid="subcategory-toggle"]', { timeout: 5000 });
    await page.locator('[data-testid="subcategory-toggle"]').first().click();
    await page.waitForSelector('.grid button', { timeout: 5000 });
    await page.locator('.grid button').first().click();

    await page.waitForSelector('input[type="text"]', { timeout: 5000 });
    await page.locator('input[type="text"]').fill('eria');
    await page.locator('input[type="text"]').press('Enter');

    await expect(page.locator('[data-testid="dismiss-wrong"]')).toBeVisible({ timeout: 3000 });
    // The shown correct-answer value must be the semibold span next to "Правильный ответ", not the
    // fill-in-the-blank display (which just echoes back whatever the user typed).
    const shownAnswer = page.locator('[data-testid="dismiss-wrong"]').locator('..').locator('span.font-semibold');
    await expect(shownAnswer).toHaveText('dukterimi');
  });
});
