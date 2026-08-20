// Feature #5 — the reworked stage graph for a word session.
//
//   non-mature word → CARD ─«Легко»────→ TYPE ──miss──→ difficult chain
//                          └«С трудом»──────────────────→ difficult chain
//   difficult chain = SELECT → ASSEMBLE → TYPE
//   a miss anywhere in a chain → once per word: +2 ASSEMBLE +2 TYPE
//
// Before this, «Легко» + a typing miss demoted to MC → reverse MC → type (no
// assemble), «С трудом» ran one MC then typing, and the assemble stage was reserved
// for single-word entries. See documentation/review-flow-stage-graph.md.
//
// The fixtures use a single-word session on purpose: with one word the chain is the
// whole queue, so the sequence of exercises is deterministic and the scheduler's
// interleaving randomness cannot make the assertions flaky.

import { test, expect, type Page } from '@playwright/test';
import {
  mockStudy, stageOf, stageAfter, waitForAnyStage, answerCorrectly, answerWrong,
  MOCK_SETTINGS, type MockWord, type Stage,
} from './helpers/studyFlow';

const WORD: MockWord = {
  id: 1, lithuanian: 'mašina', accented: null,
  translation_ru: 'машина', translation_en: 'car', hint: null,
  status: 'known', mature: false,
};

// A second word so the multiple-choice screens have a wrong option to click.
const DISTRACTOR: MockWord = {
  id: 2, lithuanian: 'namas', accented: null,
  translation_ru: 'дом', translation_en: 'house', hint: null,
  status: 'new', mature: false,
};

async function startSession(page: Page, settings = MOCK_SETTINGS) {
  await mockStudy(page, [WORD], { distractors: [DISTRACTOR], settings });
  await page.goto('/dashboard/lists/_/study');
}

/** Answer everything correctly to the end, returning the exercises that were shown. */
async function drainCorrectly(page: Page, max = 30): Promise<Stage[]> {
  const seen: Stage[] = [];
  for (let i = 0; i < max; i++) {
    // Waits through the ~1.2s gap between cards; null means the session ended.
    const stage = await waitForAnyStage(page);
    if (stage === null) break;
    seen.push(stage);
    await answerCorrectly(page, stage, WORD);
    // A correct answer holds the card for ~1.2s before the queue advances.
    await page.waitForTimeout(1500);
  }
  return seen;
}

const count = (seen: Stage[], stage: Stage) => seen.filter((s) => s === stage).length;

test.describe('«Легко» path', () => {
  test('goes straight to typing — no select, no assemble', async ({ page }) => {
    await startSession(page);
    expect(await stageOf(page)).toBe('card');
    await answerCorrectly(page, 'card', WORD, /* easy */ true);
    expect(await stageAfter(page, 'card')).toBe('type');
  });

  test('a typing miss demotes the word to the difficult chain', async ({ page }) => {
    await startSession(page);
    await answerCorrectly(page, 'card', WORD, true);
    expect(await stageAfter(page, 'card')).toBe('type');

    await answerWrong(page, 'type', WORD);

    // A typing miss always drills the missed syllable first (the '3s' card, kept
    // deliberately adjacent), and only then runs the demoted chain.
    expect(await stageAfter(page, 'type')).toBe('drill');
    await answerCorrectly(page, 'drill', WORD);

    // Demoted: select → assemble → type, in that order.
    expect(await stageAfter(page, 'drill')).toBe('select');
    await answerCorrectly(page, 'select', WORD);
    expect(await stageAfter(page, 'select')).toBe('assemble');
    await answerCorrectly(page, 'assemble', WORD);
    expect(await stageAfter(page, 'assemble')).toBe('type');
  });
});

test.describe('«С трудом» path', () => {
  test('runs select → assemble → type in order', async ({ page }) => {
    await startSession(page);
    await answerCorrectly(page, 'card', WORD);

    expect(await stageAfter(page, 'card')).toBe('select');
    await answerCorrectly(page, 'select', WORD);
    expect(await stageAfter(page, 'select')).toBe('assemble');
    await answerCorrectly(page, 'assemble', WORD);
    expect(await stageAfter(page, 'assemble')).toBe('type');
  });

  test('a clean run shows each exercise exactly once', async ({ page }) => {
    await startSession(page);
    await answerCorrectly(page, 'card', WORD);
    await stageAfter(page, 'card');

    const seen = await drainCorrectly(page);
    expect(count(seen, 'select')).toBe(1);
    expect(count(seen, 'assemble')).toBe(1);
    expect(count(seen, 'type')).toBe(1);
  });
});

test.describe('the mistake penalty', () => {
  test('a miss adds 2 assemble + 2 type on top of the rest of the chain', async ({ page }) => {
    await startSession(page);
    await answerCorrectly(page, 'card', WORD);
    expect(await stageAfter(page, 'card')).toBe('select');

    await answerWrong(page, 'select', WORD);

    // The chain still owes one assemble and one type; the penalty adds 2 of each.
    const seen = await drainCorrectly(page);
    expect(count(seen, 'assemble')).toBe(3);
    expect(count(seen, 'type')).toBe(3);
  });

  test('the penalty is charged once per word, not once per mistake', async ({ page }) => {
    await startSession(page);
    await answerCorrectly(page, 'card', WORD);
    expect(await stageAfter(page, 'card')).toBe('select');

    await answerWrong(page, 'select', WORD);
    expect(await stageAfter(page, 'select')).toBe('assemble');

    // A second miss must NOT buy another +2/+2 — it only re-queues the failed card.
    await answerWrong(page, 'assemble', WORD);

    const seen = await drainCorrectly(page);
    // 3 assemble cards were owed; the failed one comes back once more = 4 total.
    expect(count(seen, 'assemble')).toBe(4 - 1); // one was consumed by the miss above
    expect(count(seen, 'type')).toBe(3);
  });

  // Quick mode's lighter 1+1 penalty (`buildPenaltyCards`) is deliberately NOT
  // asserted through the UI here. Quick mode also keeps its pre-existing 25%-mistake
  // early abort, and in a single-word session one mistake is 100% — so the lesson
  // ends before any penalty card can be shown. Making the penalty observable would
  // need a 5+ word session, where the scheduler interleaves several words and the
  // per-word card counts stop being deterministic. What IS worth guarding is that
  // feature #5 did not break that abort, which is what this asserts.
  test('quick mode still aborts the lesson early on a mistake', async ({ page }) => {
    await startSession(page, { ...MOCK_SETTINGS, lesson_mode: 'quick' });
    await answerCorrectly(page, 'card', WORD);
    expect(await stageAfter(page, 'card')).toBe('select');

    await answerWrong(page, 'select', WORD);

    // No further exercises — the session jumps to the match round / done screen.
    const seen = await drainCorrectly(page);
    expect(seen).toEqual([]);
    await expect(page.getByTestId('result-ended-early').or(page.getByText('Соотнеси слово с переводом')))
      .toBeVisible({ timeout: 10000 });
  });
});

test.describe('the flashcard itself', () => {
  test('offers exactly the two self-assessment answers', async ({ page }) => {
    await startSession(page);
    await stageOf(page);
    await expect(page.getByText('С трудом', { exact: true })).toBeVisible();
    await expect(page.getByText('Легко', { exact: true })).toBeVisible();
  });
});
