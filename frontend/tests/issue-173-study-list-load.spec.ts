import { test, expect } from '@playwright/test';
import { mockStudy, stageOf, waitForAnyStage, answerCorrectly, type MockWord } from './helpers/studyFlow';

// Issue #173 — UI regression guard only. The actual fix (killing the two N+1 DB
// round trips in backend/verb_lookup.py) is proven by backend/tests/test_verb_lookup.py's
// query-count assertions; this spec never hits Wiktionary or times anything. It just
// confirms /dashboard/lists/[id]/study still renders a list of plain, personal-list-style
// words that carry no verb_present_3p/verb_past_3p (list 316 in the report had none) —
// i.e. `getVerbForms()` returning null for every word must not break the session.

const PLAIN_WORDS: MockWord[] = [
  { id: 1, lithuanian: 'obuolys', accented: null, translation_ru: 'яблоко', translation_en: 'apple', hint: null, status: 'new', mature: false },
  { id: 2, lithuanian: 'namas', accented: null, translation_ru: 'дом', translation_en: 'house', hint: null, status: 'new', mature: false },
  { id: 3, lithuanian: 'gatvė', accented: null, translation_ru: 'улица', translation_en: 'street', hint: null, status: 'new', mature: false },
];

test('study session renders a list of plain non-verb words with no principal forms', async ({ page }) => {
  await mockStudy(page, PLAIN_WORDS);
  await page.goto('/dashboard/lists/_/study');

  expect(await stageOf(page)).toBe('card');
  await expect(page.getByText(PLAIN_WORDS[0].lithuanian)).toBeVisible();
  // No verb has forms — the "infinitive – present – past" line must never render.
  await expect(page.getByTestId('verb-forms')).toHaveCount(0);

  // Advance one card to confirm the session keeps moving (whichever card comes next —
  // with several words queued, the deck interleaves per-word chains, so the very next
  // card may legitimately be another word's flashcard rather than stage 2) and that no
  // downstream stage trips over the missing verb fields either.
  await answerCorrectly(page, 'card', PLAIN_WORDS[0]);
  expect(await waitForAnyStage(page)).not.toBeNull();
  await expect(page.getByTestId('verb-forms')).toHaveCount(0);
});
