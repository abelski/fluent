import { test, expect } from '@playwright/test';

function makeFakeJwt(): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = btoa(JSON.stringify({ email: 'test@test.com', name: 'Test User', exp: 9999999999 }));
  return `${header}.${payload}.fakesignature`;
}

const MOCK_STUDY = {
  words: [
    { id: 3338, lithuanian: 'vištiena', translation_ru: 'курятина', translation_en: 'chicken (meat)', hint: null, status: 'new' },
    { id: 3339, lithuanian: 'vištiena', translation_ru: 'курятина', translation_en: 'chicken (meat)', hint: null, status: 'new' },
  ],
  distractors: [
    { id: 6054, lithuanian: 'višta', translation_ru: 'курица', translation_en: 'chicken', hint: null, status: 'new' },
    { id: 9002, lithuanian: 'mėsa', translation_ru: 'мясо', translation_en: 'meat', hint: null, status: 'new' },
  ],
};

const MOCK_SETTINGS = {
  words_per_session: 10,
  new_words_ratio: 0.7,
  lesson_mode: 'thorough',
  use_question_timer: false,
  question_timer_seconds: 5,
};

test.describe('Issue #185 — vištiena translation is курятина (chicken meat), not курица (chicken)', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript((token) => {
      localStorage.setItem('fluent_token', token);
    }, makeFakeJwt());

    await page.route('**/api/lists/*/study**', (r) => r.fulfill({ json: MOCK_STUDY }));
    await page.route('**/api/me/settings', (r) => r.fulfill({ json: MOCK_SETTINGS }));
    await page.route('**/api/words/*/progress', (r) => r.fulfill({ json: { ok: true } }));
  });

  test('vištiena flashcard shows курятина (chicken meat) — not курица (chicken)', async ({ page }) => {
    await page.goto('/dashboard/lists/_/study');
    await page.waitForSelector('text=vištiena', { timeout: 8000 });
    await expect(page.getByText('курятина').first()).toBeVisible();
    await expect(page.getByText('курица')).not.toBeVisible();
  });
});
