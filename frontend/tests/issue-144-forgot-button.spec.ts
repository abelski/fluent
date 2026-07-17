import { test, expect } from '@playwright/test';

// Test for issue #144: the phrase study session had no honest way out when the
// user forgot the answer — stage 1 (type the blanked word) forced a wrong guess,
// and stage 2's "Show answer" silently let the user copy the answer for a
// quality-5 score. A small "Забыл" button now reveals the answer through the
// existing wrong-answer path (mistake counted, phrase re-queued).
// See plans/triage/issue-144-forgot-button-phrase-study.md

function makeFakeJwt(name: string): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = btoa(JSON.stringify({ email: 'test@test.com', name, exp: 9999999999 }));
  return `${header}.${payload}.fakesignature`;
}

async function setFakeToken(page: import('@playwright/test').Page) {
  await page.addInitScript((token) => {
    localStorage.setItem('fluent_token', token);
  }, makeFakeJwt('Test User'));
}

const PHRASE = {
  id: 1,
  text: 'Aš noriu juodos kavos',
  translation: 'Я хочу чёрного кофе',
  blank_word: 'noriu',
  mcq_distractors: ['galiu', 'turiu', 'matau'],
  next_review: null,
};

function mockRoutes(page: import('@playwright/test').Page, lessonStage: number) {
  return Promise.all([
    page.route('**/api/me/phrase-lists/2/study*', async (route) => {
      await route.fulfill({ json: { phrases: [{ ...PHRASE, lesson_stage: lessonStage }] } });
    }),
    page.route('**/api/me/phrase-lists/phrases/1/progress', async (route) => {
      await route.fulfill({ json: { lesson_stage: lessonStage, next_review: null, interval: 1 } });
    }),
  ]);
}

test.describe('Issue #144 — Forgot button in phrase study', () => {
  test('stage 1 type step: Forgot reveals the word and counts a mistake', async ({ page }) => {
    await setFakeToken(page);
    await mockRoutes(page, 1);

    await page.goto('/dashboard/phrases/lists/2/study');

    // Stage 1 starts with the MCQ sub-step — answer it correctly to reach typing
    await expect(page.getByTestId('phrase-session-stage1-mcq')).toBeVisible({ timeout: 5000 });
    await page.getByRole('button', { name: 'noriu', exact: true }).click();
    await expect(page.getByTestId('phrase-session-stage1-type')).toBeVisible({ timeout: 3000 });

    // The small Forgot button is available without typing anything
    await expect(page.getByTestId('forgot-btn')).toBeVisible();
    await page.getByTestId('forgot-btn').click();

    // Answer is revealed with a neutral label (no "Not quite" — nothing was attempted)
    // and the mistake counter increments
    await expect(page.getByText('Правильный ответ:')).toBeVisible();
    await expect(page.getByText('Не совсем')).toHaveCount(0);
    await expect(page.locator('.text-red-700', { hasText: 'noriu' })).toBeVisible();
    await expect(page.getByText('1 ✗')).toBeVisible();

    // Continuing leads into the syllable practice interstitial (existing wrong path)
    await page.getByRole('button', { name: 'Понял, дальше →' }).click();
    await expect(page.getByText('Отработайте слово')).toBeVisible({ timeout: 3000 });
  });

  test('stage 2: Forgot with empty input shows the full phrase, not a diff', async ({ page }) => {
    await setFakeToken(page);
    await mockRoutes(page, 2);

    await page.goto('/dashboard/phrases/lists/2/study');

    await expect(page.getByTestId('phrase-session-stage2')).toBeVisible({ timeout: 5000 });
    await expect(page.getByTestId('forgot-btn')).toBeVisible();
    await page.getByTestId('forgot-btn').click();

    // Correct answer is shown plainly with a neutral label
    // (no "Not quite", no all-red CharDiff for an empty answer)
    await expect(page.getByText('Правильный ответ:')).toBeVisible();
    await expect(page.getByText('Не совсем')).toHaveCount(0);
    await expect(page.getByText('Aš noriu juodos kavos')).toBeVisible();
    await expect(page.getByText('1 ✗')).toBeVisible();

    // Continuing skips the syllable drill (there is no typed mistake to practice)
    // and goes straight to the re-queued phrase — the typing step again
    await page.getByRole('button', { name: 'Понял, дальше →' }).click();
    await expect(page.getByText('Отработайте слово')).toHaveCount(0);
    await expect(page.getByTestId('phrase-session-stage2')).toBeVisible({ timeout: 3000 });
    await expect(page.getByTestId('forgot-btn')).toBeVisible();
  });
});
