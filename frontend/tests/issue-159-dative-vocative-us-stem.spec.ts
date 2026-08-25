// Issue #159 — the Dative (Naudininkas, case 3) and Vocative (Šauksmininkas, case 7) rule
// cards described only declensions I–III, the same gap issue #158 fixed for the instrumental
// (case 5) and left as tracked debt for the remaining cases. The reporter hit it on
// "Mama davė sumuštinį sūn___" (sūnui, from sūnus, declension IV) — the Dative card had no
// clause for u-stem nouns and instead carried an unlabeled duplicate "-ui" ending with
// nothing to explain where it came from.
//
// Case 7 is a coupled pair: grammar_sentence id=198 ("Ačiū, dukt___!") was itself
// linguistically wrong (graded "dukte" instead of "dukterie" per words.txt). Fixing the rule
// text alone would have recreated the #158 bug pattern inside case 7 (card and answer newly
// disagreeing), so both the rule row and the sentence row moved together.
//
// (a) Live-data: a lesson with cases [3] (Dative) states the IV-declension mapping and no
//     longer carries the unlabeled duplicate "-ui" ending.
// (b) Live-data: a lesson with cases [7] (Vocative) states the IV-declension mapping.
// (c) Live-data: no case-7 task is still graded "dukte"; the duktė row is "dukterie".
// (d) UI (mocked): the longer rule text renders and stays usable at 390×844.
//
// The IV/V-declension examples deliberately use words NOT drawn from either lesson's own
// exercise pool — an earlier draft of this fix reused the exercise words themselves, which
// let a student read the answer straight off the rule card instead of applying the pattern.
// duktė→dukterie was the worst case: it's the literal answer to sentence 198. Plan #9 then
// re-picked case 3's examples once more for real-world plausibility (a dative example has to
// be a plausible recipient: muziejus/direktorius, not turgus/vaisius) — hence this spec
// asserts the *mapping* rather than a particular example word. See "Rule-card examples must
// not equal an answer" in documentation/grammar-sentence-data-integrity.md.

import { test, expect } from '@playwright/test';

// Absolute on purpose, matching issue-158/156's spec. A *relative* fetch would hit next dev on
// :3000 when the backend runs with DEV set, and get a 404 HTML page instead of the API — see
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

type Rule = { name_ru: string; transform: string | null; endings_sg: string | null; endings_pl: string | null };
type Lesson = { id: number; level: string; cases: number[]; rules: Rule[] };
type Task = { type: string; display: string; answer: string; full_answer: string };

test.describe('Issue #159 — Dative/Vocative u-stem (declension IV) coverage', () => {
  test('a Dative (case 3) lesson rule states the IV declension mapping, no duplicate -ui', async ({ page }) => {
    await page.goto('/');

    const rule = await page.evaluate(async (backend) => {
      const res = await fetch(`${backend}/api/grammar/lessons`);
      const lessons: Lesson[] = await res.json();
      const lesson = lessons.find((l) => l.cases.length === 1 && l.cases[0] === 3);
      return lesson ? lesson.rules[0] : null;
    }, BACKEND);

    expect(rule).not.toBeNull();
    const transform = rule!.transform || '';

    // IV declension is now covered (this was the exact gap the reporter hit). Asserted as
    // the *mapping*, not a specific example word: plan #9 re-picked the examples for
    // real-world plausibility (a dative example should be a plausible recipient, so
    // turgus/vaisius — "to the market", "to the fruit" — gave way to muziejus/direktorius).
    expect(transform).toContain('-us→-ui');
    expect(transform).toContain('-ius→-iui');
    // …and never with a word this lesson itself grades (second invariant, plan #9).
    for (const answer of ['sūnui', 'profesoriui', 'aktoriui', 'broliui', 'mamai', 'draugei']) {
      expect(transform).not.toContain(answer);
    }

    // The old endings_sg carried an unlabeled duplicate "-ui" (once for -as→-ui, once
    // stray) with no matching transform clause. It must not still be duplicated.
    const uiOccurrences = (rule!.endings_sg || '').split(',').filter((e) => e.trim() === '-ui').length;
    expect(uiOccurrences).toBe(1);
  });

  test('a Vocative (case 7) lesson rule states the IV declension mapping', async ({ page }) => {
    await page.goto('/');

    const rule = await page.evaluate(async (backend) => {
      const res = await fetch(`${backend}/api/grammar/lessons`);
      const lessons: Lesson[] = await res.json();
      const lesson = lessons.find((l) => l.cases.length === 1 && l.cases[0] === 7);
      return lesson ? lesson.rules[0] : null;
    }, BACKEND);

    expect(rule).not.toBeNull();
    const transform = rule!.transform || '';

    // Non-exercise-pool examples again — turgus/vanduo, not sūnus/duktė (both of which are
    // themselves case-7 exercise answers).
    expect(transform).toContain('turgau');
    expect(transform).toContain('vandenie');
  });

  test('no Vocative (case 7) task is still graded "dukte"; the duktė row is dukterie', async ({ page }) => {
    await page.goto('/');

    const result = await page.evaluate(async (backend) => {
      const res = await fetch(`${backend}/api/grammar/lessons`);
      const lessons: Lesson[] = await res.json();
      const caseLessons = lessons.filter((l) => l.cases.length === 1 && l.cases[0] === 7);

      const dukteHits: (Task & { level: string })[] = [];
      const duktRows: (Task & { level: string })[] = [];
      for (const lesson of caseLessons) {
        const tasksRes = await fetch(`${backend}/api/grammar/lessons/${lesson.id}/tasks`);
        const tasks: Task[] = await tasksRes.json();
        for (const t of tasks) {
          if (t.type !== 'sentence') continue;
          const fa = (t.full_answer || '').toLowerCase();
          if (fa === 'dukte') dukteHits.push({ ...t, level: lesson.level });
          if (fa.startsWith('dukt')) duktRows.push({ ...t, level: lesson.level });
        }
      }
      return { dukteHits, duktRows };
    }, BACKEND);

    expect(result.dukteHits).toEqual([]);
    expect(result.duktRows.length).toBeGreaterThan(0);
    for (const row of result.duktRows) {
      expect(row.full_answer).toBe('dukterie');
      // Plan #8: practice-level sentence tasks strip the stem and grade the whole
      // inflected word (stem+ending), so "dukt" + "erie" is the correct practice-level
      // answer — only basic/advanced stay ending-only ("erie").
      const expectedAnswer = row.level === 'practice' ? 'dukterie' : 'erie';
      expect(row.answer).toBe(expectedAnswer);
    }
  });
});

// ── UI regression (mocked routes) ────────────────────────────────────────────

// Mirrors the live case-3 card (plan #9): every example is a plausible recipient and none
// of them is a graded answer in this lesson.
const NEW_DATIVE_TRANSFORM =
  '-as→-ui (kaimynas→kaimynui), -ias/-is/-ys→-iui (tėvelis→tėveliui), ' +
  '-a→-ai (padavėja→padavėjai), -ia→-iai (ponia→poniai), -ė→-ei (močiutė→močiutei); ' +
  'III ж.р. -is→-iai (žuvis→žuviai); ' +
  'IV: -us→-ui (muziejus→muziejui), -ius→-iui (direktorius→direktoriui); ' +
  'V: -uo→-eniui (šuo→šuniui), sesuo/duktė→-eriai.';

const MOCK_LESSONS = [
  {
    id: 34,
    title: 'Naudininkas Vns.',
    level: 'basic',
    cases: [3],
    task_count: 1,
    rules: [
      {
        question: 'Кому? Чему?',
        name_ru: 'Дательный (Naudininkas)',
        usage: 'Косвенное дополнение — кому что-то дают, предназначают или для кого делают.',
        endings_sg: '-ui, -iui, -ai, -iai, -ei',
        endings_pl: '-ams, -iams, -oms, -ėms, -ums, -ims',
        transform: NEW_DATIVE_TRANSFORM,
      },
    ],
    is_locked: false,
    best_score_pct: null,
  },
];

const MOCK_TASKS = [
  {
    type: 'sentence',
    display: 'Mama davė sumuštinį sūn___.',
    answer: 'ui',
    full_answer: 'sūnui',
    translation_ru: 'Мама дала бутерброд сыну.',
    base_lt: 'sūnus',
  },
];

const MOCK_GRAMMAR_PROGRAMS_ENROLLED = [
  { id: 1, title: 'Литовские падежи', title_en: null, description: null, difficulty: 1, enrolled: true },
];

test.describe('Issue #159 — Dative rule card renders the IV-stem text and stays usable', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript((token) => {
      localStorage.setItem('fluent_token', token);
    }, makeFakeJwt());
    await page.route('**/api/grammar-programs', (r) => r.fulfill({ json: MOCK_GRAMMAR_PROGRAMS_ENROLLED }));
    await page.route('**/api/grammar/lessons', (r) => r.fulfill({ json: MOCK_LESSONS }));
    await page.route(/\/api\/grammar\/verb-lessons/, (r) => r.fulfill({ json: [] }));
    await page.route('**/api/grammar/lessons/34/tasks', (r) => r.fulfill({ json: MOCK_TASKS }));
    await page.route('**/api/grammar/lessons/34/results', (r) => r.fulfill({ json: { ok: true, passed: true } }));
  });

  async function openLesson(page: import('@playwright/test').Page) {
    await page.goto('/dashboard/grammar');
    await page.waitForSelector('[data-testid="subcategory-toggle"]', { timeout: 5000 });
    await page.locator('[data-testid="subcategory-toggle"]').first().click();
    await page.waitForSelector('.grid button', { timeout: 5000 });
    await page.locator('.grid button').first().click();
    await page.waitForSelector('input[type="text"]', { timeout: 5000 });
  }

  test('the IV-declension rule text is visible on the basic (always-expanded) card', async ({ page }) => {
    await openLesson(page);
    await expect(page.getByText('muziejus→muziejui')).toBeVisible();
    await expect(page.getByText('direktorius→direktoriui')).toBeVisible();
  });

  test('answer input stays reachable at 390x844 with the longer rule text, no horizontal overflow', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openLesson(page);

    const input = page.locator('input[type="text"]');
    await input.scrollIntoViewIfNeeded();
    await expect(input).toBeVisible();
    await input.fill('ui');
    await expect(input).toHaveValue('ui');

    // the page must not scroll sideways — the rule text has to wrap, not overflow
    const overflows = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    );
    expect(overflows).toBe(false);
  });
});
