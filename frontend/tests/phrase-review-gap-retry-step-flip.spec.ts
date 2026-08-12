// /dashboard/phrases/review — after failing a gap fill, the re-queued retry briefly
// rendered as another gap fill and then visibly flipped to the assembly exercise.
//
// A wrong stage-1 answer splices two `gap_retry` items plus a `full_retake` into the queue
// and advances the index. `stage1Step` was only recomputed in the card-reset effect, which
// runs *after* the commit — so React painted one frame of the new card using the previous
// card's step ('type'). The assembly branch renders above the gap-fill branch and is
// selected by stage1Step, so the stale 'type' fell through to the gap fill, then corrected
// itself to 'assemble_from_lt' a frame later.
//
// advanceQueue now sets the step alongside the index, so both land in one commit.

import { test, expect } from '@playwright/test';

function makeFakeJwt(): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = btoa(JSON.stringify({ email: 'test@test.com', name: 'Test User', exp: 9999999999 }));
  return `${header}.${payload}.fakesignature`;
}

// lesson_stage 1 with translation tiles, so a gap_retry opens on 'assemble_from_lt'.
const PHRASE = {
  id: 7001,
  text: 'Aš noriu gerti kavos',
  translation: 'Я хочу пить кофе',
  translation_en: null,
  alt_texts: null,
  lesson_stage: 1,
  blank_word: 'noriu',
  mcq_distractors: ['galiu', 'turiu', 'einu'],
  // null so the first pass is assemble_from_lt → mcq → type. translation_tiles are what
  // matter here: they are what makes the re-queued gap_retry open on the assembly.
  word_tiles: null,
  translation_tiles: ['кофе', 'Я', 'пить', 'хочу'],
  translation_en_tiles: null,
  next_review: null,
};

const SETTINGS = {
  words_per_session: 10,
  new_words_ratio: 0.7,
  lesson_mode: 'thorough',
  use_question_timer: false,
  question_timer_seconds: 5,
};

test.describe('Phrase review — gap_retry does not flip exercise type', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript((token) => {
      localStorage.setItem('fluent_token', token);
      localStorage.setItem('fluent_complexity', 'medium');
    }, makeFakeJwt());

    await page.route('**/api/phrases/review', (r) => r.fulfill({ json: { phrases: [PHRASE] } }));
    await page.route('**/api/me/settings', (r) => r.fulfill({ json: SETTINGS }));
    await page.route('**/api/phrases/*/progress', (r) =>
      r.fulfill({ json: { lesson_stage: 1, next_review: null, interval: 1 } }));
  });

  test('failing the gap fill goes straight to the assembly, with no gap-fill flash', async ({ page }) => {
    await page.goto('/dashboard/phrases/review');

    // The session opens on the from-LT assembly for this phrase.
    const assemble = page.getByTestId('phrase-session-stage1-assemble-from-lt');
    const gapFill = page.getByTestId('phrase-session-stage1-type');
    await expect(assemble).toBeVisible({ timeout: 8000 });

    // Assemble the translation correctly, then pass the MCQ, to reach the gap fill.
    for (const word of ['Я', 'хочу', 'пить', 'кофе']) {
      await page.getByTestId('tile-pool').getByRole('button', { name: word, exact: true }).click();
    }

    const mcq = page.getByTestId('phrase-session-stage1-mcq');
    await expect(mcq).toBeVisible({ timeout: 8000 });
    await mcq.getByRole('button', { name: PHRASE.blank_word, exact: true }).click();

    await expect(gapFill).toBeVisible({ timeout: 8000 });

    // Fail the gap fill — this is what queues the gap_retry.
    await gapFill.locator('input').first().fill('visiskaiNeteisingas');
    await page.keyboard.press('Enter');

    // A wrong gap fill drills the missed word first; only then does the queue advance.
    await expect(page.getByText('ОТРАБОТАЙТЕ СЛОВО')).toBeVisible({ timeout: 8000 });
    const syllableInput = page.locator('input:visible').first();
    await syllableInput.fill(PHRASE.blank_word);
    await syllableInput.press('Enter');

    // The flash lasts a single commit, so polling with isVisible() is far too slow to
    // see it — record every DOM commit instead. The observer captures the intermediate
    // state even when it is painted for one frame.
    await page.evaluate(() => {
      const seen: string[] = [];
      (window as unknown as { __steps: string[] }).__steps = seen;
      const record = () => {
        const el = document.querySelector('main[data-testid]');
        const id = el?.getAttribute('data-testid') ?? '';
        if (id && seen[seen.length - 1] !== id) seen.push(id);
      };
      record();
      new MutationObserver(record).observe(document.body, {
        childList: true, subtree: true, attributes: true, attributeFilter: ['data-testid'],
      });
    });

    await expect(assemble).toBeVisible({ timeout: 15_000 });

    const steps: string[] = await page.evaluate(
      () => (window as unknown as { __steps: string[] }).__steps,
    );

    // After the syllable drill the next card is a gap_retry, which must open directly on
    // the assembly. Any gap-fill commit in between is the stale-step flash.
    const flashIdx = steps.indexOf('phrase-session-stage1-type');
    expect(
      flashIdx,
      `gap fill flashed before the assembly — commit sequence: ${JSON.stringify(steps)}`,
    ).toBe(-1);
    expect(steps).toContain('phrase-session-stage1-assemble-from-lt');
  });
});
