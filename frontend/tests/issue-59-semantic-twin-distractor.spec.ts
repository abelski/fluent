import { test, expect } from '@playwright/test';

function makeFakeJwt(): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = btoa(JSON.stringify({ email: 'test@test.com', name: 'Test User', exp: 9999999999 }));
  return `${header}.${payload}.fakesignature`;
}

// mokininė is the session word; mokinė (same translation_ru) is a distractor — must be filtered out
const MOCK_STUDY = {
  words: [
    { id: 5993, lithuanian: 'mokininė', translation_ru: 'ученица', translation_en: 'female student', hint: null, status: 'new' },
    { id: 5994, lithuanian: 'mokinys', translation_ru: 'ученик', translation_en: 'male student', hint: null, status: 'new' },
  ],
  distractors: [
    // semantic twin — same translation_ru as mokininė; frontend must filter this out
    { id: 4025, lithuanian: 'mokinė', translation_ru: 'ученица', translation_en: 'female student', hint: null, status: 'new' },
    { id: 9001, lithuanian: 'draugas', translation_ru: 'друг', translation_en: 'friend', hint: null, status: 'new' },
    { id: 9002, lithuanian: 'mokytoja', translation_ru: 'учительница', translation_en: 'teacher', hint: null, status: 'new' },
  ],
};

const MOCK_SETTINGS = {
  words_per_session: 10,
  new_words_ratio: 0.7,
  lesson_mode: 'thorough',
  use_question_timer: false,
  question_timer_seconds: 5,
};

test.describe('Issue #59 — semantic twin distractor filtered in quiz', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript((token) => {
      localStorage.setItem('fluent_token', token);
    }, makeFakeJwt());

    await page.route('**/api/lists/*/study**', (r) => r.fulfill({ json: MOCK_STUDY }));
    await page.route('**/api/me/settings', (r) => r.fulfill({ json: MOCK_SETTINGS }));
    await page.route('**/api/words/*/progress', (r) => r.fulfill({ json: { ok: true } }));
  });

  test('mokinė (same translation as mokininė) never appears as a distractor option', async ({ page }) => {
    await page.goto('/dashboard/lists/_/study');

    // Drive through all stage-1 cards by clicking "Легко"
    const wordCount = MOCK_STUDY.words.length;
    for (let i = 0; i < wordCount; i++) {
      await page.waitForSelector('button:has-text("Легко")', { timeout: 6000 });
      await page.getByText('Легко').click();
      await page.waitForTimeout(350);
    }

    // Now in stage 2 / 2r — check that mokinė never appears as a button option
    // Collect all option button texts across both MC stages
    for (let round = 0; round < wordCount * 2; round++) {
      const easyBtn = page.locator('button:has-text("Легко")');
      const typeInput = page.locator('input[type="text"]');
      const optionButtons = page.locator('.grid button');

      const isStage1 = await easyBtn.isVisible().catch(() => false);
      if (isStage1) {
        await page.getByText('Легко').click();
        await page.waitForTimeout(350);
        continue;
      }

      const isStage3 = await typeInput.isVisible().catch(() => false);
      if (isStage3) break; // stop at typing stage, no distractors there

      const optionTexts = await optionButtons.allTextContents();
      const hasTwin = optionTexts.some((t) => t.trim() === 'mokinė');
      expect(hasTwin, `mokinė (semantic twin) must not appear as option — found in: ${JSON.stringify(optionTexts)}`).toBe(false);

      // Click the correct answer to advance
      const correctBtn = page.locator('.grid button').filter({ hasText: /^mokininė$|^mokinys$|^ученица$|^ученик$/ }).first();
      await correctBtn.click().catch(() => {});
      await page.waitForTimeout(400);
    }
  });
});
