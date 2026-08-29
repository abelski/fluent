// Issue #164 — numeral grammar exercise sentences (case_index 15 "Числительные:
// Именительный" and 16 "Числительные: Винительный") leaked hand-authored metadata like
// "(3, f.)" or a bare "(2)" straight into the displayed sentence text. The annotation was a
// private authoring aid (numeral count + grammatical gender, used to pick the correct declined
// form) baked into `backend/scripts/seed_numbers_grammar.py`'s SENTENCES literal and never
// stripped before being seeded — `grammar_service.py::_generate_sentence_tasks` forwards
// `row.display` to the frontend essentially verbatim, so it rendered raw inside the exercise
// question (GrammarTaskRunner.tsx's InlineSentenceInput splits `display` on "___" and prints
// both halves directly around the input).
//
// Fix: production `grammar_sentence` rows (68 total across case_index 15/16) had the trailing
// "(N, gender.)" / bare "(N)" annotation stripped from `display`, the seed script's SENTENCES
// literal was cleaned so a future --reset can't reintroduce it, and an admin-side guard now
// rejects any new `display` ending in a parenthetical.
//
// This is a live-data test (like issue-159/162): it hits the real running backend rather than
// mocking, because the bug was a data-cleanliness issue, not a rendering bug — the regression
// that matters is "does the DB/seed still carry the leaked annotation", which only a live-data
// check can catch. `display` is exactly what InlineSentenceInput renders verbatim around the
// blank (before/after = display.split('___')), so asserting on the API's `display` field is
// equivalent to asserting on the rendered sentence text.
//
// Lessons 71 (case 15, advanced) and 77 (case 16, advanced) both have task_count === the full
// sentence pool size (35), so a single /tasks call deterministically returns every row for that
// case — no need to retry across the randomized shuffle to guarantee coverage.

import { test, expect } from '@playwright/test';

// Absolute on purpose, matching issue-158/159/162's spec. A *relative* fetch would hit next dev
// on :3000 when the backend runs with DEV set, and get a 404 HTML page instead of the API — see
// "The backend redirects to :3000" in documentation/local-dev-gotchas.md. Run on the default
// baseURL (not PW_BASE_URL=http://127.0.0.1:8000 — CORS allowlist has no 127.0.0.1 entry).
const BACKEND = 'http://localhost:8000';

type Lesson = { id: number; level: string; cases: number[] };
type Task = { type: string; display: string; answer: string; full_answer: string };

// Matches a trailing "(3, f.)"-style gendered annotation or a bare "(2)" straggler at the end
// of the sentence — the exact leaked-authoring-metadata pattern reported in issue #164.
const LEAKED_ANNOTATION_RE = /\([0-9]+(?:,\s*[a-z]+\.)?\)\s*$/;

async function fetchCaseTasks(page: import('@playwright/test').Page, caseIndex: number): Promise<Task[] | null> {
  return page.evaluate(
    async ({ backend, caseIndex }) => {
      const res = await fetch(`${backend}/api/grammar/lessons`);
      const lessons: Lesson[] = await res.json();
      const lesson = lessons.find(
        (l) => l.level === 'advanced' && l.cases.length === 1 && l.cases[0] === caseIndex,
      );
      if (!lesson) return null;
      const tasksRes = await fetch(`${backend}/api/grammar/lessons/${lesson.id}/tasks`);
      return tasksRes.json();
    },
    { backend: BACKEND, caseIndex },
  );
}

test.describe('Issue #164 — numeral sentences no longer leak authoring metadata', () => {
  for (const caseIndex of [15, 16]) {
    test(`case ${caseIndex} sentences carry no trailing (N[, gender].) annotation`, async ({ page }) => {
      await page.goto('/');

      const tasks = await fetchCaseTasks(page, caseIndex);

      expect(tasks).not.toBeNull();
      expect(tasks!.length).toBeGreaterThan(0);
      for (const task of tasks!) {
        expect(task.display).not.toMatch(LEAKED_ANNOTATION_RE);
      }
    });
  }

  test('the id=231 "dienos praėjo" sentence (case 15) renders clean, no trailing parenthetical', async ({ page }) => {
    await page.goto('/');

    const tasks = await fetchCaseTasks(page, 15);
    expect(tasks).not.toBeNull();

    const target = tasks!.find((t) => t.display.includes('dienos pra'));
    expect(target).toBeDefined();
    // Exact reported regression: this used to read '___ dienos praėjo labai greitai. (3, f.)'.
    expect(target!.display).toBe('___ dienos praėjo labai greitai.');
    expect(target!.display).not.toMatch(LEAKED_ANNOTATION_RE);
  });
});
