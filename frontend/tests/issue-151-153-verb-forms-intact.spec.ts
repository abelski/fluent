// Issues #151 / #153 — verb conjugation answers must be whole, correct forms.
//
// #153 reported "kalbė́ti — jis ... / Правильно: kalb̃" — the answer rendered as a stem
// plus a lone combining tilde. #151 is the class behind it: the book sets stress marks as
// ZERO-WIDTH glyphs positioned by absolute x, so splitting a row on whitespace turns the
// mark into its own token and shifts every later tense column one to the right. That put
// 169 marks-only cells in production, broke 71 infinitives, and left 124 conditional "tu"
// cells holding a past-tense form instead ("atsakei" where "atsakýtum" belongs).
//
// The extractor now reads chars and cuts rows at the page's real column corridors, and
// grammar_service refuses to serve a form that fails the same checks. These hit the live
// API rather than mocking, so they guard the production data itself.

import { test, expect } from '@playwright/test';

// Relative, so it inherits baseURL (see playwright.config.ts) and stays on one
// address family together with the browser.
const API = '/api/grammar/verb-lessons';

// One lesson per tense.
const LESSON_IDS = [200, 202, 204, 206, 208, 210];

// Task selection is random over a ~42-verb pool, so a single 20-task draw hits any given
// verb with only ~38% probability. Repeat so the sweep is effectively exhaustive.
const DRAWS_PER_LESSON = 5;

// A tone mark may only sit on a vowel or on l/m/n/r (mixed diphthongs). Anywhere else it
// is the displaced-tilde artifact — "kalbės̃" for "kalbė̃s".
const BAD_CARRIER = /[bcdfghjkpstvzčšž][̀́̃]/;
const MARKS_ONLY = /^[̀-ͯ]+$/;

/** Letters only — combining marks and whitespace removed. */
function baseLetters(s: string): string {
  return s.normalize('NFD').replace(/\p{M}/gu, '').replace(/\s/g, '');
}

/** Infinitive minus its -ti/-tis ending, folded to base letters. */
function stemOf(infinitive: string): string {
  const b = baseLetters(infinitive).toLowerCase();
  for (const suffix of ['tis', 'ti']) {
    if (b.endsWith(suffix)) return b.slice(0, -suffix.length);
  }
  return b;
}

// Conditional endings, folded to base letters. The mood is fully regular off the stem, so
// anything else in that column is a form that leaked in from a neighbouring tense.
const COND_ENDINGS = [
  'ciau', 'ciausi', 'tu', 'tusi', 'tum', 'tumei', 'tumeis', 'tumeisi',
  'tume', 'tumes', 'tumeme', 'tumemes', 'tute', 'tutes', 'tumete', 'tumetes',
];

test.describe('Issues #151/#153 — verb answers are whole, correct forms', () => {
  for (const lessonId of LESSON_IDS) {
    test(`lesson ${lessonId} serves intact forms`, async ({ request }) => {
      let checked = 0;

      for (let draw = 0; draw < DRAWS_PER_LESSON; draw++) {
        const res = await request.get(`${API}/${lessonId}/tasks`);
        expect(res.status()).toBe(200);

        const tasks = await res.json();
        expect(Array.isArray(tasks)).toBe(true);

        for (const task of tasks) {
          const where = `lesson ${lessonId}, ${task.verb_infinitive} (${task.person_label})`;
          const answer: string = task.answer;

          // #151: the 169 cells that were nothing but a combining accent.
          expect(answer, `${where}: answer is marks-only`).not.toMatch(MARKS_ONLY);
          expect(baseLetters(answer).length, `${where}: answer has no letters`)
            .toBeGreaterThan(0);

          // #153: "kalb̃" — a truncated stem, or a bare ending like "ame".
          expect(
            baseLetters(answer).length,
            `${where}: answer ${JSON.stringify(answer)} is shorter than its stem`,
          ).toBeGreaterThanOrEqual(stemOf(task.verb_infinitive).length);

          // The displaced-tilde class.
          expect(answer, `${where}: tone mark on a non-carrier`).not.toMatch(BAD_CARRIER);

          // A split word leaves an interior space. Legal exceptions: " / " and ", "
          // alternates (bū́ti prints "esù, būnù") and the "tegu X" imperative.
          const bare = answer
            .replace(/ \/ /g, '')
            .replace(/, /g, '')
            .replace(/^tegu /, '');
          expect(bare.trim(), `${where}: answer has an interior space`).not.toMatch(/\s/);

          // #151: the infinitive in the prompt was itself broken ("augi̇ǹ ti").
          expect(task.verb_infinitive, `${where}: infinitive has a space`)
            .not.toMatch(/\s/);

          // Lesson 208 is the conditional — the column that held past forms.
          if (lessonId === 208) {
            const alternates = answer.split('/').map((a) => a.trim()).filter(Boolean);
            const ok = alternates.some((alt) =>
              COND_ENDINGS.some((end) => baseLetters(alt).toLowerCase().endsWith(end)),
            );
            expect(ok, `${where}: ${JSON.stringify(answer)} is not a conditional form`)
              .toBe(true);
          }

          checked++;
        }
      }

      // An empty response must not pass silently.
      expect(checked, `lesson ${lessonId} returned no tasks`).toBeGreaterThan(0);
    });
  }

  test('kalbėti serves the complete present-tense forms', async ({ request }) => {
    // Sequential API draws; the 30s default is not enough, especially under -j2.
    test.setTimeout(180_000);

    // kalbėti is 1 of ~42 verbs and each draw is 20 tasks, so P(never drawn) over 40
    // draws is negligible.
    // The API shows one pronoun at a time (jis / ji / jie / jos all read the shared
    // third-person cell), so key on the displayed label rather than the table key.
    const expected: Record<string, string> = {
      'aš': 'kalbu',
      'tu': 'kalbi',
      'jis': 'kalba',
      'ji': 'kalba',
      'jie': 'kalba',
      'jos': 'kalba',
      'mes': 'kalbame',
      'jūs': 'kalbate',
    };

    // 20 draws × 20 tasks over a ~42-verb pool leaves P(never drawn) ≈ 7e-5.
    let seen = 0;
    for (let draw = 0; draw < 20; draw++) {
      const res = await request.get(`${API}/200/tasks`);
      expect(res.status()).toBe(200);

      for (const task of await res.json()) {
        if (baseLetters(task.verb_infinitive).toLowerCase() !== 'kalbeti') continue;
        seen++;

        const want = expected[task.person_label];
        expect(want, `unexpected person label ${task.person_label}`).toBeDefined();

        // Compared on base letters, so a later stress-mark correction does not break the
        // test — but "kalb" still fails hard.
        expect(
          baseLetters(task.answer).toLowerCase(),
          `kalbėti (${task.person_label}): served ${JSON.stringify(task.answer)}`,
        ).toBe(want);
      }
    }

    expect(seen, 'kalbėti was never drawn — cannot verify issue #153').toBeGreaterThan(0);
  });
});
