import { test, expect } from '@playwright/test';

function makeFakeJwt(): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = btoa(JSON.stringify({ email: 'test@test.com', name: 'Test User', exp: 9999999999 }));
  return `${header}.${payload}.fakesignature`;
}

const MOCK_STUDY = {
  words: [
    { id: 6036, lithuanian: 'prosenutė', translation_ru: 'прабабушка', translation_en: 'great-grandmother', hint: null, status: 'new' },
    { id: 4016, lithuanian: 'anūkė', translation_ru: 'внучка', translation_en: 'granddaughter', hint: null, status: 'new' },
  ],
  distractors: [
    { id: 9001, lithuanian: 'brolis', translation_ru: 'брат', translation_en: 'brother', hint: null, status: 'new' },
    { id: 9002, lithuanian: 'sesuo', translation_ru: 'сестра', translation_en: 'sister', hint: null, status: 'new' },
  ],
};

const MOCK_SETTINGS = {
  words_per_session: 10,
  new_words_ratio: 0.7,
  lesson_mode: 'thorough',
  use_question_timer: false,
  question_timer_seconds: 5,
};

test.describe('Issue #62 — prosenutė translation is прабабушка (not внучка)', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript((token) => {
      localStorage.setItem('fluent_token', token);
    }, makeFakeJwt());

    await page.route('**/api/lists/*/study**', (r) => r.fulfill({ json: MOCK_STUDY }));
    await page.route('**/api/me/settings', (r) => r.fulfill({ json: MOCK_SETTINGS }));
    await page.route('**/api/words/*/progress', (r) => r.fulfill({ json: { ok: true } }));
  });

  test('prosenutė flashcard shows прабабушка, not внучка', async ({ page }) => {
    await page.goto('/dashboard/lists/_/study');
    await page.waitForSelector('text=prosenutė', { timeout: 8000 });
    await expect(page.getByText('prosenutė').first()).toBeVisible();
    await expect(page.getByText('прабабушка').first()).toBeVisible();
    await expect(page.getByText('внучка')).not.toBeVisible();
  });
});
