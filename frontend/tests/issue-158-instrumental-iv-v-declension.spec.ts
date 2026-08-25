// Issue #158 — the instrumental (Įnagininkas) rule card described only declensions I–III,
// while the exercise pool contains IV (sūnus, profesorius) and V (sesuo, duktė, vanduo)
// nouns. Because the learner types the *stem-relative* ending and the card was written in
// *nominative* terms, the card did not merely omit those forms — it actively mispredicted
// them ("-is/-ys→-iu" implies profesoriu, but the graded answer is profesoriumi).
//
// (a) Live-data: lesson 28 (basic, case 5) rule text now states the IV/V mappings — and,
//     since plan #9, states them *without* printing the graded answer word itself
//     (sūnumi/profesoriumi/seserimi/dukterimi were also exercise answers in this same
//     lesson, the second invariant; the card now maps from the dictionary form instead).
// (b) Live-data (the generalized guard for this whole bug class): for every lesson in a
//     GUARDED case, every ending the grader will accept must be derivable from that
//     lesson's own rule card — i.e. present somewhere in transform + endings_sg +
//     endings_pl. Plan #9 rewrote every noun case, so all of 2–13 are guarded now
//     (cases 1 and 14 have no lesson). Keep this list in sync with GUARDED_CASES in
//     backend/scripts/audit_case_rule_coverage.py.
// (c) Live-data: the sesuo row is "seserimi" (was wrongly stored as "seseria"; issue #156
//     fixed duktė and words.txt but missed this row, which passes the stem invariant).
// (d) UI (mocked): the longer rule text renders and still leaves the answer input usable
//     at 390×844, and the correct IV-declension ending is graded as correct.

import { test, expect } from '@playwright/test';

// Absolute on purpose, matching issue-156's spec. A *relative* fetch would hit next dev on
// :3000 when the backend runs with DEV set, and get a 404 HTML page instead of the API —
// see "The backend redirects to :3000" in documentation/local-dev-gotchas.md. If page.goto
// fails with ERR_CONNECTION_REFUSED, the backend is in DEV mode: restart it with DEV=false
// so it serves frontend/out. Do NOT reach for PW_BASE_URL=http://127.0.0.1:8000 here — it
// makes the page origin 127.0.0.1 while this fetch targets localhost, and the backend's CORS
// allowlist has no 127.0.0.1 entry, so the fetch is blocked. Run on the default baseURL.
const BACKEND = 'http://localhost:8000';

// Displays whose stem is truncated mid-cluster, so the expected answer is not expressible
// as an ending mapping at all (issue #135 / #52 territory) — sentence id 203.
const COVERAGE_ALLOWLIST = [{ display: 'Jonas neša krep___.', answer: 'šį' }];

// Keep in sync with GUARDED_CASES in backend/scripts/audit_case_rule_coverage.py.
const GUARDED_CASES = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];

function makeFakeJwt(): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = btoa(JSON.stringify({ email: 'test@test.com', name: 'Test User', exp: 9999999999 }));
  return `${header}.${payload}.fakesignature`;
}

type Rule = { name_ru: string; transform: string | null; endings_sg: string | null; endings_pl: string | null };
type Lesson = { id: number; level: string; cases: number[]; rules: Rule[] };
type Task = { type: string; display: string; answer: string; full_answer: string };

test.describe('Issue #158 — IV/V declension endings are derivable from the rule card', () => {
  test('lesson 28 instrumental rule states the IV and V declension mappings', async ({ page }) => {
    await page.goto('/');

    const rule = await page.evaluate(async (backend) => {
      const res = await fetch(`${backend}/api/grammar/lessons`);
      const lessons: Lesson[] = await res.json();
      const lesson = lessons.find((l) => l.id === 28);
      return lesson ? lesson.rules[0] : null;
    }, BACKEND);

    expect(rule).not.toBeNull();
    const transform = (rule!.transform || '').toLowerCase();

    // IV declension: -us→-umi, -ius→-iumi
    expect(transform).toContain('umi');
    expect(transform).toContain('iumi');
    // V declension: the two forms the reporter could not derive (sesuo/duktė → -erimi)
    expect(transform).toContain('erimi');
    expect(transform).toContain('sesuo');
    expect(transform).toContain('duktė');
    // …but the card must not hand the learner the graded word itself (second invariant,
    // plan #9): these four are answers in this very lesson's sentence pool.
    for (const answer of ['sūnumi', 'profesoriumi', 'seserimi', 'dukterimi']) {
      expect(transform).not.toContain(answer);
    }
    // the ending list the card advertises must carry the IV/V singular endings too
    expect(rule!.endings_sg).toContain('-umi');
    expect(rule!.endings_sg).toContain('-iumi');
    expect(rule!.endings_sg).toContain('-erimi');
  });

  test('every gradeable ending in a guarded case is derivable from that lesson rule card', async ({ page }) => {
    await page.goto('/');

    const violations = await page.evaluate(
      async ({ backend, allowlist, guarded }) => {
        const res = await fetch(`${backend}/api/grammar/lessons`);
        const lessons: Lesson[] = await res.json();
        // guarded noun-declension cases only (see GUARDED_CASES above). Practice-level
        // lessons are excluded: plan #8 made their `task.answer` the whole inflected word
        // (stem + ending) instead of just the ending, so it won't appear verbatim inside
        // the rule card's ending list even when the underlying ending is fine — the same
        // rows are also served at basic/advanced, where this check still covers them.
        const nounLessons = lessons.filter(
          (l) => l.level !== 'practice' && l.cases.length > 0 && l.cases.every((c) => guarded.includes(c)),
        );

        const bad: Array<{ lesson: number; display: string; answer: string; full: string }> = [];
        for (const lesson of nounLessons) {
          const haystack = (lesson.rules || [])
            .map((r) => [r.transform, r.endings_sg, r.endings_pl].filter(Boolean).join(' '))
            .join(' ')
            .toLowerCase();
          if (!haystack) continue;

          const tasksRes = await fetch(`${backend}/api/grammar/lessons/${lesson.id}/tasks`);
          const tasks: Task[] = await tasksRes.json();
          for (const task of tasks) {
            if (task.type !== 'sentence' || !task.answer) continue;
            if (haystack.includes(task.answer.toLowerCase())) continue;
            if (allowlist.some((a) => a.display === task.display && a.answer === task.answer)) continue;
            bad.push({ lesson: lesson.id, display: task.display, answer: task.answer, full: task.full_answer });
          }
        }
        return bad;
      },
      { backend: BACKEND, allowlist: COVERAGE_ALLOWLIST, guarded: GUARDED_CASES },
    );

    expect(violations).toEqual([]);
  });

  test('the sesuo instrumental row is seserimi, never seseria', async ({ page }) => {
    await page.goto('/');

    const rows = await page.evaluate(async (backend) => {
      const found: Task[] = [];
      // pool[i % len(pool)] after a shuffle — several fetches cover the case-5 pool
      for (let i = 0; i < 3; i++) {
        const res = await fetch(`${backend}/api/grammar/lessons/28/tasks`);
        const tasks: Task[] = await res.json();
        for (const t of tasks) {
          if ((t.full_answer || '').toLowerCase().startsWith('seser')) found.push(t);
        }
      }
      return found;
    }, BACKEND);

    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.full_answer).toBe('seserimi');
      expect(row.answer).toBe('erimi');
    }
  });
});

// ── UI regression (mocked routes) ────────────────────────────────────────────

// Mirrors the live case-5 card (plan #9) — examples map from the dictionary form and are
// never themselves a graded answer in this lesson.
const NEW_TRANSFORM =
  '-as→-u (agurkas→agurku), -ias/-is/-ys→-iu (maišelis→maišeliu, virdulys→virduliu), ' +
  '-a→-a (morka→morka), -ia→-ia (vyšnia→vyšnia), -ė→-e (bandelė→bandele); ' +
  'III ж.р. -is→-imi (žuvis→žuvimi); ' +
  'IV: -us→-umi (medus→medumi), -ius→-iumi (direktorius→direktoriumi); ' +
  'V: -uo→-eniu (vanduo→vandeniu), sesuo/duktė→-erimi.';

const MOCK_LESSONS = [
  {
    id: 5,
    title: 'Урок — Творительный падеж',
    level: 'basic',
    cases: [5],
    task_count: 1,
    rules: [
      {
        question: 'Кем? Чем? С кем?',
        name_ru: 'Творительный (Įnagininkas)',
        usage: 'Инструмент или совместность. После предлога su (с кем/чем).',
        endings_sg: '-u, -iu, -a, -ia, -e, -umi, -iumi, -imi',
        endings_pl: '-ais, -iais, -omis, -ėmis, -umis, -imis',
        transform: NEW_TRANSFORM,
      },
    ],
    is_locked: false,
    best_score_pct: null,
  },
];

const MOCK_TASKS = [
  {
    type: 'sentence',
    display: 'Petras dirba su profesor___.',
    answer: 'iumi',
    full_answer: 'profesoriumi',
    translation_ru: 'Пётр работает с профессором.',
    base_lt: 'profesorius',
  },
];

const MOCK_GRAMMAR_PROGRAMS_ENROLLED = [
  { id: 1, title: 'Литовские падежи', title_en: null, description: null, difficulty: 1, enrolled: true },
];

test.describe('Issue #158 — rule card renders the IV/V text and stays usable', () => {
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

  async function openLesson(page: import('@playwright/test').Page) {
    await page.goto('/dashboard/grammar');
    await page.waitForSelector('[data-testid="subcategory-toggle"]', { timeout: 5000 });
    await page.locator('[data-testid="subcategory-toggle"]').first().click();
    await page.waitForSelector('.grid button', { timeout: 5000 });
    await page.locator('.grid button').first().click();
    await page.waitForSelector('input[type="text"]', { timeout: 5000 });
  }

  test('the IV/V rule text is visible on the basic (always-expanded) card', async ({ page }) => {
    await openLesson(page);
    await expect(page.getByText('direktorius→direktoriumi')).toBeVisible();
    await expect(page.getByText('sesuo/duktė→-erimi')).toBeVisible();
  });

  test('answer input stays reachable at 390x844 with the longer rule text', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openLesson(page);

    const input = page.locator('input[type="text"]');
    await input.scrollIntoViewIfNeeded();
    await expect(input).toBeVisible();
    await input.fill('iumi');
    await expect(input).toHaveValue('iumi');

    // the page must not scroll sideways — the rule text has to wrap, not overflow
    const overflows = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    );
    expect(overflows).toBe(false);
  });

  test('typing the IV-declension ending "iumi" is graded correct', async ({ page }) => {
    await openLesson(page);
    await page.locator('input[type="text"]').fill('iumi');
    await page.locator('input[type="text"]').press('Enter');
    await page.waitForTimeout(400);
    await expect(page.locator('[data-testid="dismiss-wrong"]')).not.toBeVisible();
  });
});
