import { test, expect, type Page } from '@playwright/test';
import { mockStudy, stageOf, stageAfter, answerCorrectly, type MockWord } from './helpers/studyFlow';

// Feature #20: a verb word carries its principal forms into the study session and
// shows them as "suprasti – supranta – suprato" next to the word.
//
// The load-bearing part of this spec is the NEGATIVE half. The line starts with
// `word.lithuanian`, which is exactly the answer the user is being asked to produce
// on the reverse MCQ ('2r'), the assemble card ('2a') and the typing card (3) — so
// showing it there *before* the user answers leaks the answer. On stage 1
// (flashcard) and stage 2 (forward MCQ) the Lithuanian word is the prompt, so the
// line shows straight away; on those other three stages it appears only once the
// answer has been submitted and is already revealed on screen. A regression that
// renders it unconditionally there is a real spoiler bug, which is what the
// "not visible before answering" assertions guard.

const SUPRASTI: MockWord = {
  id: 1, lithuanian: 'suprasti', accented: null,
  translation_ru: 'понимать', translation_en: 'to understand', hint: null,
  status: 'new', mature: false,
  part_of_speech: 'verb', verb_present_3p: 'supranta', verb_past_3p: 'suprato',
};

const FORMS_LINE = 'suprasti – supranta – suprato';

/**
 * Pin `Math.random`, whose only branching use in QuizSession is
 * `selectStage()` (`< 0.5 ? 2 : '2r'`) — the SELECT direction is otherwise a coin
 * flip, and this spec needs to assert on each direction separately. Its other uses
 * are shuffles, which stay valid with a constant.
 */
async function pinSelectDirection(page: Page, direction: 'forward' | 'reverse') {
  await page.addInitScript((v) => { Math.random = () => v; }, direction === 'forward' ? 0.1 : 0.9);
}

async function startSession(page: Page, word: MockWord) {
  await mockStudy(page, [word]);
  await page.goto('/dashboard/lists/_/study');
  expect(await stageOf(page)).toBe('card');
}

const verbForms = (page: Page) => page.getByTestId('verb-forms');

test('stage 1 (flashcard) shows the three principal forms', async ({ page }) => {
  await startSession(page, SUPRASTI);
  await expect(verbForms(page)).toHaveText(FORMS_LINE);
});

test('stage 2 (forward MCQ, Lithuanian is the prompt) shows the forms', async ({ page }) => {
  await pinSelectDirection(page, 'forward');
  await startSession(page, SUPRASTI);

  await answerCorrectly(page, 'card', SUPRASTI);
  expect(await stageAfter(page, 'card')).toBe('select');
  await expect(page.getByText('Что это означает?')).toBeVisible();
  await expect(verbForms(page)).toHaveText(FORMS_LINE);
});

test('stage 2r (reverse MCQ) hides the forms until the answer is given', async ({ page }) => {
  await pinSelectDirection(page, 'reverse');
  await startSession(page, SUPRASTI);

  await answerCorrectly(page, 'card', SUPRASTI);
  expect(await stageAfter(page, 'card')).toBe('select');
  await expect(page.getByText('Выберите литовское слово')).toBeVisible();
  // The options list literally contains the Lithuanian word — showing the line
  // here would hand over the answer.
  await expect(verbForms(page)).toHaveCount(0);

  await answerCorrectly(page, 'select', SUPRASTI);
  await expect(verbForms(page)).toHaveText(FORMS_LINE);
});

test('stages 2a (assemble) and 3 (type) hide the forms until the answer is given', async ({ page }) => {
  await pinSelectDirection(page, 'forward');
  await startSession(page, SUPRASTI);

  await answerCorrectly(page, 'card', SUPRASTI);
  expect(await stageAfter(page, 'card')).toBe('select');
  await answerCorrectly(page, 'select', SUPRASTI);

  expect(await stageAfter(page, 'select')).toBe('assemble');
  await expect(verbForms(page)).toHaveCount(0);
  await answerCorrectly(page, 'assemble', SUPRASTI);
  await expect(verbForms(page)).toHaveText(FORMS_LINE);

  expect(await stageAfter(page, 'assemble')).toBe('type');
  await expect(verbForms(page)).toHaveCount(0);
  await answerCorrectly(page, 'type', SUPRASTI);
  await expect(verbForms(page)).toHaveText(FORMS_LINE);
});

test('a non-verb word never shows the line', async ({ page }) => {
  await startSession(page, {
    id: 2, lithuanian: 'automobilis', accented: null,
    translation_ru: 'машина', translation_en: 'car', hint: null, status: 'new', mature: false,
  });
  await expect(verbForms(page)).toHaveCount(0);
});

test('a verb with only one conjugated form known shows no partial line', async ({ page }) => {
  // part_of_speech was resolved but the lookup only produced the present form —
  // half a triple ("suprasti – supranta – null") must never reach the card.
  await startSession(page, {
    ...SUPRASTI, id: 3, verb_past_3p: null,
  });
  await expect(verbForms(page)).toHaveCount(0);
});
