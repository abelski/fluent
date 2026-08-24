// Issue #161 — "от: draugė" / "Labas, ___!" / "Привет, друг!" showed the wrong gender.
//
// Two layers, both covered here (see plans/triage/.../issue-161-drauge-vocative-gender-mismatch.md
// for the full root-cause writeup):
//
// (a) Live-data (Layer 2 — the actual reported bug): masculine and feminine vocative
//     "drauge" (draugas/draugė collide in the vocative — case_index=7) share one blank/answer
//     with no way for `_STEM_TO_NOMINATIVE` to disambiguate them, so it used to last-write-win
//     to "draugė" and label the masculine row "от: draugė" too. `base_lt` must now be null for
//     every case-7 "drauge" task, in every level (basic/advanced/practice) — that's what makes
//     the frontend hide the hint line (`task.base_lt &&` guard in GrammarTaskRunner.tsx).
// (b) Live-data (Layer 1 — content disambiguation): `display` for the two grammar_sentence rows
//     (masculine "Привет, друг!" and feminine "Привет, подруга!") must carry a parenthetical
//     "(draugas)"/"(draugė)" hint, matching the existing 416/417 precedent.
// (c) UI (mocked): with the fixed data (base_lt: null, display carrying the "(draugas)" suffix),
//     the "от: draugė" hint line does not render, and the disambiguating suffix is visible.

import { test, expect } from '@playwright/test';

// Absolute on purpose, matching issue-156/158/159's spec. A *relative* fetch would hit next dev
// on :3000 when the backend runs with DEV set, and get a 404 HTML page instead of the API — see
// "The backend redirects to :3000" in documentation/local-dev-gotchas.md. If page.goto fails
// with ERR_CONNECTION_REFUSED, the backend is in DEV mode: restart it with DEV=false so it
// serves frontend/out. Do NOT reach for PW_BASE_URL=http://127.0.0.1:8000 here — it makes the
// page origin 127.0.0.1 while this fetch targets localhost, and the backend's CORS allowlist
// has no 127.0.0.1 entry, so the fetch is blocked. Run on the default baseURL.
const BACKEND = 'http://localhost:8000';

function makeFakeJwt(): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = btoa(JSON.stringify({ email: 'test@test.com', name: 'Test User', exp: 9999999999 }));
  return `${header}.${payload}.fakesignature`;
}

type Lesson = { id: number; level: string; cases: number[] };
type Task = {
  type: string;
  display: string;
  answer: string;
  full_answer: string;
  translation_ru: string;
  base_lt: string | null;
};

test.describe('Issue #161 — vocative "drauge" gender disambiguation', () => {
  test('every case-7 "drauge" task has base_lt = null (no more "от: draugė" mislabel)', async ({ page }) => {
    await page.goto('/');

    const draugeRows = await page.evaluate(async (backend) => {
      const res = await fetch(`${backend}/api/grammar/lessons`);
      const lessons: Lesson[] = await res.json();
      const caseLessons = lessons.filter((l) => l.cases.length === 1 && l.cases[0] === 7);

      const found: (Task & { level: string })[] = [];
      for (const lesson of caseLessons) {
        const tasksRes = await fetch(`${backend}/api/grammar/lessons/${lesson.id}/tasks`);
        const tasks: Task[] = await tasksRes.json();
        for (const t of tasks) {
          if ((t.full_answer || '').toLowerCase() === 'drauge') found.push({ ...t, level: lesson.level });
        }
      }
      return found;
    }, BACKEND);

    // Sanity: the vocative pool does contain "drauge" tasks in at least one level.
    expect(draugeRows.length).toBeGreaterThan(0);
    for (const row of draugeRows) {
      expect(row.base_lt).toBeFalsy();
    }
  });

  test('display disambiguates masculine draugas vs. feminine draugė with a parenthetical hint', async ({
    page,
  }) => {
    await page.goto('/');

    const result = await page.evaluate(async (backend) => {
      const res = await fetch(`${backend}/api/grammar/lessons`);
      const lessons: Lesson[] = await res.json();
      const caseLessons = lessons.filter((l) => l.cases.length === 1 && l.cases[0] === 7);

      const masculine: Task[] = [];
      const feminine: Task[] = [];
      for (const lesson of caseLessons) {
        const tasksRes = await fetch(`${backend}/api/grammar/lessons/${lesson.id}/tasks`);
        const tasks: Task[] = await tasksRes.json();
        for (const t of tasks) {
          if ((t.full_answer || '').toLowerCase() !== 'drauge') continue;
          if (t.translation_ru === 'Привет, друг!') masculine.push(t);
          if (t.translation_ru === 'Привет, подруга!') feminine.push(t);
        }
      }
      return { masculine, feminine };
    }, BACKEND);

    expect(result.masculine.length).toBeGreaterThan(0);
    expect(result.feminine.length).toBeGreaterThan(0);

    for (const t of result.masculine) {
      expect(t.display).toContain('(draugas)');
      expect(t.display).not.toContain('(draugė)');
    }
    for (const t of result.feminine) {
      expect(t.display).toContain('(draugė)');
      expect(t.display).not.toContain('(draugas)');
    }
  });
});

// ── UI regression (mocked routes) ────────────────────────────────────────────

const MOCK_LESSONS = [
  {
    id: 40,
    title: 'Šauksmininkas Vns.',
    level: 'basic',
    cases: [7],
    task_count: 1,
    rules: [
      {
        question: 'Эй, ...!',
        name_ru: 'Звательный (Šauksmininkas)',
        usage: 'Прямое обращение к человеку или существу. Используется только в речи.',
        endings_sg: '-e, -i, -y, -a, -ia, -au, -iau, -ie',
        endings_pl: '-ai, -iai, -os, -ės',
        transform: '-as→-e (namas→name!), -ė→-e (gatvė→gatve!)',
      },
    ],
    is_locked: false,
    best_score_pct: null,
  },
];

const MOCK_TASKS = [
  {
    type: 'sentence',
    display: 'Labas, draug___! (draugas)',
    answer: 'e',
    full_answer: 'drauge',
    translation_ru: 'Привет, друг!',
    base_lt: null,
  },
];

const MOCK_GRAMMAR_PROGRAMS_ENROLLED = [
  { id: 1, title: 'Литовские падежи', title_en: null, description: null, difficulty: 1, enrolled: true },
];

test.describe('Issue #161 — masculine "drauge" task does not render the "от: draugė" hint', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript((token) => {
      localStorage.setItem('fluent_token', token);
    }, makeFakeJwt());
    await page.route('**/api/grammar-programs', (r) => r.fulfill({ json: MOCK_GRAMMAR_PROGRAMS_ENROLLED }));
    await page.route('**/api/grammar/lessons', (r) => r.fulfill({ json: MOCK_LESSONS }));
    await page.route(/\/api\/grammar\/verb-lessons/, (r) => r.fulfill({ json: [] }));
    await page.route('**/api/grammar/lessons/40/tasks', (r) => r.fulfill({ json: MOCK_TASKS }));
    await page.route('**/api/grammar/lessons/40/results', (r) => r.fulfill({ json: { ok: true, passed: true } }));
  });

  async function openLesson(page: import('@playwright/test').Page) {
    await page.goto('/dashboard/grammar');
    await page.waitForSelector('[data-testid="subcategory-toggle"]', { timeout: 5000 });
    await page.locator('[data-testid="subcategory-toggle"]').first().click();
    await page.waitForSelector('.grid button', { timeout: 5000 });
    await page.locator('.grid button').first().click();
    await page.waitForSelector('input[type="text"]', { timeout: 5000 });
  }

  test('the masculine draug___! task shows the (draugas) hint and no "от: draugė" line', async ({ page }) => {
    await openLesson(page);

    // The disambiguating suffix from `display` is visible...
    await expect(page.getByText('(draugas)')).toBeVisible();
    // ...but the old buggy "от: draugė" source-word hint (base_lt: null) must not render.
    await expect(page.getByText('от: draugė')).not.toBeVisible();
    await expect(page.getByText('от:', { exact: false })).not.toBeVisible();
  });
});
