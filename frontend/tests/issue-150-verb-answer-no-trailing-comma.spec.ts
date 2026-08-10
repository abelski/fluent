// Issue #150 — "yrà, (в правильном ответе лишняя запятая)"
//
// The `verb` table was seeded from a PDF whose text layer emitted stray punctuation.
// Verb 24 (bū́ti) had every `indicative_present` form ending in a comma, so the correct
// answer rendered as "yrà," — and because normalizeLt strips stress accents but NOT
// punctuation, typing "yra" was graded wrong.
//
// These hit the live API rather than mocking, so they guard the production data itself.

import { test, expect } from '@playwright/test';

const API = 'http://localhost:8000/api/grammar/verb-lessons';

// One lesson per tense.
const LESSON_IDS = [200, 202, 204, 206, 208, 210];

// Task selection is random and the pool is ~42 verbs, so a single 20-task draw hits any
// given verb with only ~38% probability. Repeat so the sweep is effectively exhaustive.
const DRAWS_PER_LESSON = 5;

const STRAY_DOT_ABOVE = 'i̇'; // "i" + COMBINING DOT ABOVE

test.describe('Issue #150 — verb answers carry no extraction artifacts', () => {
  for (const lessonId of LESSON_IDS) {
    test(`lesson ${lessonId} serves clean answers`, async ({ request }) => {
      let checked = 0;

      for (let draw = 0; draw < DRAWS_PER_LESSON; draw++) {
        const res = await request.get(`${API}/${lessonId}/tasks`);
        expect(res.status()).toBe(200);

        const tasks = await res.json();
        expect(Array.isArray(tasks)).toBe(true);

        for (const task of tasks) {
          const where = `lesson ${lessonId}, ${task.verb_infinitive} (${task.person_label})`;

          // The reported defect: a comma inside the expected answer makes it ungradeable.
          expect(task.answer, `${where}: answer contains a comma`).not.toContain(',');

          // A comma-only fix would leave this behind, and it fails grading the same way.
          expect(task.answer, `${where}: answer contains stray U+0307`)
            .not.toContain(STRAY_DOT_ABOVE);

          // Display-only, but same seed defect: "быть, являться," → trailing comma.
          expect(task.translation_ru, `${where}: translation has a trailing comma`)
            .not.toMatch(/,\s*$/);

          checked++;
        }
      }

      expect(checked, `lesson ${lessonId} returned no tasks to check`).toBeGreaterThan(0);
    });
  }

  // The verb from the report (bū́ti, 3rd person) is drawn only ~1% of the time, so
  // asserting on it here would skip or flake roughly one run in ten. That specific
  // string is pinned deterministically instead, in
  // backend/tests/test_verb_conjugation_tasks.py::test_yra_is_served_without_the_reported_comma
  // The sweeps above cover the same invariant across whatever the API actually serves.
});
