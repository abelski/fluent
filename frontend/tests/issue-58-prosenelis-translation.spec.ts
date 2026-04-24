import { test, expect } from '@playwright/test';

function makeFakeJwt(): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = btoa(JSON.stringify({ email: 'test@test.com', name: 'Test User', exp: 9999999999 }));
  return `${header}.${payload}.fakesignature`;
}

const MOCK_STUDY = {
  words: [
    { id: 6037, lithuanian: 'prosenelis', translation_ru: 'прадед', translation_en: 'great-grandfather', hint: null, status: 'new' },
    { id: 6038, lithuanian: 'senelis', translation_ru: 'дедушка', translation_en: 'grandfather', hint: null, status: 'new' },
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

test.describe('Issue #58 — prosenelis translation is прадед (not внук)', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript((token) => {
      localStorage.setItem('fluent_token', token);
    }, makeFakeJwt());

    await page.route('**/api/lists/*/study**', (r) => r.fulfill({ json: MOCK_STUDY }));
    await page.route('**/api/me/settings', (r) => r.fulfill({ json: MOCK_SETTINGS }));
    await page.route('**/api/words/*/progress', (r) => r.fulfill({ json: { ok: true } }));
  });

  test('prosenelis flashcard shows прадед, not внук', async ({ page }) => {
    await page.goto('/dashboard/lists/_/study');
    // Stage 1 flashcard shows the Lithuanian word and its translation
    await page.waitForSelector('text=prosenelis', { timeout: 8000 });
    await expect(page.getByText('просenelis').or(page.getByText('prosenelis')).first()).toBeVisible();
    await expect(page.getByText('прадед').first()).toBeVisible();
    await expect(page.getByText('внук')).not.toBeVisible();
  });
});
