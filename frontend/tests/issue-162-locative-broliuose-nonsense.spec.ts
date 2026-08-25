// Issue #162 — the Vietininkas (locative, cases 6 and 13) rule cards used `brolis` ("brother")
// as the illustrative masculine `-is`-declension example noun. Locative expresses
// physical/abstract containment ("where is X located"), and a kinship term for a person is not
// a plausible container/location — "in a brother" (brolyje) / "in brothers" (broliuose) doesn't
// parse as a real-world "where" answer, unlike the other examples in the same transform strings
// (namuose, knygose, gatvėse — houses, books, streets).
//
// Fix: grammar_case_rule rows id=10 (case 6) and id=9 (case 13) had their `transform` text
// updated to use `maišelis` ("bag/package") instead — a masculine `-is`-declension noun already
// used elsewhere in this rule set (case 7's vocative example), where "located inside a bag" is
// real-world plausible.
//
// (a)/(b) Live-data: every lesson whose `cases` list contains 13 (resp. 6) states the new
//     maišel- example and no longer carries the old brol- example.
// (c) Live-data: for those same lessons, no task's full_answer is brolyje/broliuose (the old,
//     nonsensical example word — confirms the fix didn't leave a stray answer behind) nor
//     maišelyje/maišeliuose (the new rule-card example word — confirms the fix didn't introduce
//     a fresh "rule-card example duplicates a graded answer" leak, per the invariant documented
//     in documentation/grammar-sentence-data-integrity.md).

import { test, expect } from '@playwright/test';

// Absolute on purpose, matching issue-158/159's spec. A *relative* fetch would hit next dev on
// :3000 when the backend runs with DEV set, and get a 404 HTML page instead of the API — see
// "The backend redirects to :3000" in documentation/local-dev-gotchas.md. Run on the default
// baseURL (not PW_BASE_URL=http://127.0.0.1:8000 — CORS allowlist has no 127.0.0.1 entry).
const BACKEND = 'http://localhost:8000';

type Rule = { name_ru: string; transform: string | null };
type Lesson = { id: number; level: string; cases: number[]; rules: Rule[] };
type Task = { type: string; display: string; answer: string; full_answer: string };

test.describe('Issue #162 — locative (cases 6, 13) no longer uses nonsensical brolis example', () => {
  test('every case-13 lesson transform drops broliuose and states maišeliuose', async ({ page }) => {
    await page.goto('/');

    const transforms = await page.evaluate(async (backend) => {
      const res = await fetch(`${backend}/api/grammar/lessons`);
      const lessons: Lesson[] = await res.json();
      const caseLessons = lessons.filter((l) => l.cases.includes(13));
      return caseLessons.map((l) => {
        const rule = l.rules.find((r) => true) || null; // single-case lessons carry one rule
        return rule ? rule.transform || '' : '';
      });
    }, BACKEND);

    expect(transforms.length).toBeGreaterThan(0);
    for (const transform of transforms) {
      expect(transform).not.toContain('broliuose');
      expect(transform).toContain('maišeliuose');
    }
  });

  test('every case-6 lesson transform drops brolyje and states maišelyje', async ({ page }) => {
    await page.goto('/');

    const transforms = await page.evaluate(async (backend) => {
      const res = await fetch(`${backend}/api/grammar/lessons`);
      const lessons: Lesson[] = await res.json();
      const caseLessons = lessons.filter((l) => l.cases.includes(6));
      return caseLessons.map((l) => {
        const rule = l.rules.find((r) => true) || null;
        return rule ? rule.transform || '' : '';
      });
    }, BACKEND);

    expect(transforms.length).toBeGreaterThan(0);
    for (const transform of transforms) {
      expect(transform).not.toContain('brolyje');
      expect(transform).toContain('maišelyje');
    }
  });

  test('no case-6 or case-13 task is graded brolyje/broliuose/maišelyje/maišeliuose', async ({ page }) => {
    await page.goto('/');

    const forbidden = ['brolyje', 'broliuose', 'maišelyje', 'maišeliuose'];

    const hits = await page.evaluate(
      async ({ backend, forbidden }) => {
        const res = await fetch(`${backend}/api/grammar/lessons`);
        const lessons: Lesson[] = await res.json();
        const targetLessons = lessons.filter((l) => l.cases.includes(6) || l.cases.includes(13));

        const found: { lessonId: number; level: string; full_answer: string }[] = [];
        for (const lesson of targetLessons) {
          const tasksRes = await fetch(`${backend}/api/grammar/lessons/${lesson.id}/tasks`);
          const tasks: Task[] = await tasksRes.json();
          for (const t of tasks) {
            const fa = (t.full_answer || '').toLowerCase();
            if (forbidden.includes(fa)) {
              found.push({ lessonId: lesson.id, level: lesson.level, full_answer: t.full_answer });
            }
          }
        }
        return found;
      },
      { backend: BACKEND, forbidden },
    );

    expect(hits).toEqual([]);
  });
});
