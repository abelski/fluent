// Issue #186 — the genitive-case sentence "Šalia draug___ yra parduotuvė."
// (There is a store near my friend) is semantically implausible — a store is a place,
// not something logically "next to a person". The fix replaces it with "Šalia park___ yra parduotuvė."
// (There is a store next to the park), changing the blank word from "draugo" to "parko".
//
// This spec verifies that no task in the genitive case (case_index 2 → lessons 10–12) pairs the word "draug"
// (friend) with "parduotuvė" (store).

import { test, expect } from '@playwright/test';

// Absolute URL matching issue-162's pattern — see that spec's comment.
const BACKEND = 'http://localhost:8000';

type Task = {
  type: string;
  display: string;
  answer: string;
  full_answer: string;
};

test.describe('Issue #186 — genitive case no longer pairs draug with parduotuvė', () => {
  test('no case-2 task pairs draug with parduotuvė', async ({ page }) => {
    await page.goto('/');

    const badPairs = await page.evaluate(async (backend) => {
      // case_index 2 = Kilmininkas Vns. = lessons 10/11/12; tasks are sampled, so fetch several times
      const tasks: Task[] = [];
      for (let i = 0; i < 5; i++) {
        for (const id of [10, 11, 12]) {
          const res = await fetch(`${backend}/api/grammar/lessons/${id}/tasks`);
          if (res.ok) tasks.push(...(await res.json()));
        }
      }
      if (tasks.length === 0) return ['no tasks fetched'];

      const found: string[] = [];
      for (const task of tasks) {
        const display = (task.display ?? '').toLowerCase();
        const fullAnswer = (task.full_answer ?? '').toLowerCase();
        // the blank hides the word ("Šalia ___ yra parduotuvė."), so "draug" lives in full_answer
        if (fullAnswer.includes('draug') && display.includes('parduotuvė')) {
          found.push(`${task.display} → ${task.full_answer}`);
        }
      }
      return found;
    }, BACKEND);

    expect(badPairs).toEqual([]);
  });
});
