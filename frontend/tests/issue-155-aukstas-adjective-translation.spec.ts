import { test, expect } from '@playwright/test';

function makeFakeJwt(): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = btoa(JSON.stringify({ email: 'test@test.com', name: 'Test User', exp: 9999999999 }));
  return `${header}.${payload}.fakesignature`;
}

const MOCK_STUDY = {
  words: [
    { id: 4050, lithuanian: 'aukštas', translation_ru: 'высокий', translation_en: 'tall, high', hint: 'būdvardis', status: 'new' },
    { id: 4026, lithuanian: 'aukšta', translation_ru: 'высокая', translation_en: 'tall / high (f.)', hint: 'būdvardis', status: 'new' },
  ],
  distractors: [
    { id: 9001, lithuanian: 'žemas', translation_ru: 'низкий', translation_en: 'low, short', hint: null, status: 'new' },
    { id: 9002, lithuanian: 'platus', translation_ru: 'широкий', translation_en: 'wide', hint: null, status: 'new' },
  ],
};

const MOCK_SETTINGS = {
  words_per_session: 10,
  new_words_ratio: 0.7,
  lesson_mode: 'thorough',
  use_question_timer: false,
  question_timer_seconds: 5,
};

test.describe('Issue #155 — aukštas (adjective) translates to высокий, not этаж', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript((token) => {
      localStorage.setItem('fluent_token', token);
    }, makeFakeJwt());

    await page.route('**/api/lists/*/study**', (r) => r.fulfill({ json: MOCK_STUDY }));
    await page.route('**/api/me/settings', (r) => r.fulfill({ json: MOCK_SETTINGS }));
    await page.route('**/api/words/*/progress', (r) => r.fulfill({ json: { ok: true } }));
  });

  test('aukštas flashcard shows высокий — not этаж', async ({ page }) => {
    await page.goto('/dashboard/lists/_/study');
    await page.waitForSelector('text=aukštas', { timeout: 8000 });
    await expect(page.getByText('высокий').first()).toBeVisible();
    await expect(page.getByText('этаж')).not.toBeVisible();
  });
});
