import { test, expect } from '@playwright/test';

function makeFakeJwt(): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = btoa(JSON.stringify({ email: 'test@test.com', name: 'Test User', exp: 9999999999 }));
  return `${header}.${payload}.fakesignature`;
}

const MOCK_STUDY = {
  words: [
    { id: 5091, lithuanian: 'rezervuoti', translation_ru: 'резервировать, бронировать', translation_en: 'reserve, book', hint: null, status: 'new' },
    { id: 5094, lithuanian: 'rezervuoti', translation_ru: 'резервировать, бронировать', translation_en: 'reserve, book', hint: null, status: 'new' },
  ],
  distractors: [
    { id: 9001, lithuanian: 'dirbti', translation_ru: 'работать', translation_en: 'to work', hint: null, status: 'new' },
    { id: 9002, lithuanian: 'eiti', translation_ru: 'идти', translation_en: 'to go', hint: null, status: 'new' },
  ],
};

const MOCK_SETTINGS = {
  words_per_session: 10,
  new_words_ratio: 0.7,
  lesson_mode: 'thorough',
  use_question_timer: false,
  question_timer_seconds: 5,
};

test.describe('Issue #121 — rezervuoti translation is резервировать, бронировать (not зарезервировать)', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript((token) => {
      localStorage.setItem('fluent_token', token);
    }, makeFakeJwt());

    await page.route('**/api/lists/*/study**', (r) => r.fulfill({ json: MOCK_STUDY }));
    await page.route('**/api/me/settings', (r) => r.fulfill({ json: MOCK_SETTINGS }));
    await page.route('**/api/words/*/progress', (r) => r.fulfill({ json: { ok: true } }));
  });

  test('rezervuoti flashcard shows резервировать, бронировать — not зарезервировать', async ({ page }) => {
    await page.goto('/dashboard/lists/_/study');
    await page.waitForSelector('text=rezervuoti', { timeout: 8000 });
    await expect(page.getByText('резервировать, бронировать').first()).toBeVisible();
    await expect(page.getByText('зарезервировать')).not.toBeVisible();
  });
});
