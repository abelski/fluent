// Feature #5 — a mature word is asked to TYPE first, with no flashcard.
//
// Reviewing a well-known word used to open with a flashcard that showed the answer
// before asking anything, which made the "review" of a mature word almost free.
// Maturity is decided server-side (`_is_mature`: status = known AND
// sm2_reps >= MATURE_WORD_REPS) and arrives on each word as a `mature` flag; the
// client never re-derives it from SM-2 fields.
//
// A miss — or pressing «Забыл» — drops the word into the full learning flow:
// CARD → SELECT → ASSEMBLE → TYPE.
//
// See documentation/review-flow-stage-graph.md.

import { test, expect, type Page } from '@playwright/test';
import {
  mockStudy, stageOf, stageAfter, answerCorrectly, type MockWord,
} from './helpers/studyFlow';

const MATURE: MockWord = {
  id: 1, lithuanian: 'mašina', accented: null,
  translation_ru: 'машина', translation_en: 'car', hint: null,
  status: 'known', mature: true,
};

const NOT_MATURE: MockWord = { ...MATURE, id: 2, mature: false };

async function startStudy(page: Page, word: MockWord) {
  await mockStudy(page, [word]);
  await page.goto('/dashboard/lists/_/study');
}

test.describe('a mature word', () => {
  test('opens straight on the typing card — the flashcard never shows', async ({ page }) => {
    await startStudy(page, MATURE);

    expect(await stageOf(page)).toBe('type');
    await expect(page.getByText('Как будет по-литовски?')).toBeVisible();
    // The answer-revealing self-assessment card is not on screen.
    await expect(page.getByText('С трудом', { exact: true })).toHaveCount(0);
    await expect(page.getByText('Легко', { exact: true })).toHaveCount(0);
  });

  test('a correct answer completes it without any further drilling', async ({ page }) => {
    await startStudy(page, MATURE);
    expect(await stageOf(page)).toBe('type');
    await answerCorrectly(page, 'type', MATURE);

    // Session over — no flashcard, no select, no assemble.
    await expect(page.getByText('Что это означает?')).toHaveCount(0);
    await expect(page.getByTestId('syllable-tile-pool')).toHaveCount(0);
  });

  test('«Забыл» drops it into the full learning flow', async ({ page }) => {
    await startStudy(page, MATURE);
    expect(await stageOf(page)).toBe('type');

    const forgot = page.getByTestId('forgot-btn');
    await expect(forgot).toBeVisible();
    await forgot.click();

    // Routed through the existing wrong-answer path: the answer is revealed and
    // dismissed like any miss, so there is no second scoring path.
    const dismiss = page.getByTestId('dismiss-wrong');
    await dismiss.waitFor({ timeout: 7000 });
    await dismiss.click();

    // The missed syllable is drilled first, then the learning chain opens on the
    // reminder flashcard.
    expect(await stageAfter(page, 'type')).toBe('drill');
    await answerCorrectly(page, 'drill', MATURE);
    expect(await stageAfter(page, 'drill')).toBe('card');

    await answerCorrectly(page, 'card', MATURE);
    expect(await stageAfter(page, 'card')).toBe('select');
    await answerCorrectly(page, 'select', MATURE);
    expect(await stageAfter(page, 'select')).toBe('assemble');
    await answerCorrectly(page, 'assemble', MATURE);
    expect(await stageAfter(page, 'assemble')).toBe('type');
  });

  test('a wrong typed answer drops it into the learning flow too', async ({ page }) => {
    await startStudy(page, MATURE);
    expect(await stageOf(page)).toBe('type');

    await page.locator('input[type="text"]').fill('zzzzz');
    await page.locator('input[type="text"]').press('Enter');
    const dismiss = page.getByTestId('dismiss-wrong');
    await dismiss.waitFor({ timeout: 7000 });
    await dismiss.click();

    expect(await stageAfter(page, 'type')).toBe('drill');
    await answerCorrectly(page, 'drill', MATURE);
    expect(await stageAfter(page, 'drill')).toBe('card');
  });
});

test.describe('a non-mature word', () => {
  test('still opens on the flashcard', async ({ page }) => {
    await startStudy(page, NOT_MATURE);
    expect(await stageOf(page)).toBe('card');
    await expect(page.getByText('С трудом', { exact: true })).toBeVisible();
  });

  test('a word with no mature flag at all is treated as not mature', async ({ page }) => {
    const { mature, ...withoutFlag } = NOT_MATURE;
    await startStudy(page, withoutFlag as MockWord);
    expect(await stageOf(page)).toBe('card');
  });
});

test.describe('the review surface', () => {
  test('a mature word types first there as well', async ({ page }) => {
    await mockStudy(page, [MATURE], { review: true });
    await page.goto('/dashboard/review');

    expect(await stageOf(page)).toBe('type');
    await expect(page.getByText('С трудом', { exact: true })).toHaveCount(0);
  });

  test('«Забыл» is offered on the review typing card too', async ({ page }) => {
    await mockStudy(page, [MATURE], { review: true });
    await page.goto('/dashboard/review');

    await stageOf(page);
    await expect(page.getByTestId('forgot-btn')).toBeVisible();
  });
});
