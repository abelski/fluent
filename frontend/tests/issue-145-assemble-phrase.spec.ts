import { test, expect } from '@playwright/test';

// Test for issue #145: phrases longer than 3 words get a new stage-2 sub-step —
// assemble the phrase by clicking shuffled word tiles — before the full typed
// recall. Short phrases (≤3 words, word_tiles: null) go straight to typing.
// See plans/triage/issue-145-assemble-phrase-exercise-type.md

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

const LONG_PHRASE = {
  id: 1,
  text: 'Aš noriu juodos kavos dabar',
  translation: 'Я хочу чёрный кофе сейчас',
  alt_texts: null,
  lesson_stage: 2,
  blank_word: 'noriu',
  mcq_distractors: ['galiu', 'turiu', 'matau'],
  word_tiles: ['kavos', 'Aš', 'dabar', 'noriu', 'juodos'],
  next_review: null,
};

const SHORT_PHRASE = {
  id: 2,
  text: 'Labas rytas',
  translation: 'Доброе утро',
  alt_texts: null,
  lesson_stage: 2,
  blank_word: 'rytas',
  mcq_distractors: ['vakaras', 'naktis', 'diena'],
  word_tiles: null,
  next_review: null,
};

function mockRoutes(page: import('@playwright/test').Page, phrases: object[]) {
  return Promise.all([
    page.route('**/api/me/phrase-lists/2/study*', async (route) => {
      await route.fulfill({ json: { phrases } });
    }),
    page.route('**/api/me/phrase-lists/phrases/*/progress', async (route) => {
      await route.fulfill({ json: { lesson_stage: 2, next_review: null, interval: 1 } });
    }),
  ]);
}

async function clickTilesInOrder(page: import('@playwright/test').Page, words: string[]) {
  const pool = page.getByTestId('tile-pool');
  for (const word of words) {
    await pool.getByRole('button', { name: word, exact: true, disabled: false }).first().click();
  }
}

test.describe('Issue #145 — Assemble-phrase exercise', () => {
  test('long phrase: assembling correctly advances to the typing step', async ({ page }) => {
    await setFakeToken(page);
    await mockRoutes(page, [LONG_PHRASE]);

    await page.goto('/dashboard/phrases/lists/2/study');

    // Assembly sub-step appears first, with all tiles in the pool
    await expect(page.getByTestId('phrase-session-stage2-assemble')).toBeVisible({ timeout: 5000 });
    await expect(page.getByTestId('tile-pool').getByRole('button')).toHaveCount(5);

    // Click tiles in the correct order
    await clickTilesInOrder(page, ['Aš', 'noriu', 'juodos', 'kavos', 'dabar']);

    // Positive feedback, then transition to the classic typing step
    await expect(page.getByText('Правильно! ✓ Теперь напишите всю фразу.')).toBeVisible();
    await expect(page.getByTestId('phrase-session-stage2')).toBeVisible({ timeout: 3000 });
    await expect(page.locator('textarea')).toBeVisible();
    // No mistake was counted
    await expect(page.getByText('1 ✗')).toHaveCount(0);
  });

  test('long phrase: wrong assembly counts a mistake and re-queues', async ({ page }) => {
    await setFakeToken(page);
    await mockRoutes(page, [LONG_PHRASE]);

    await page.goto('/dashboard/phrases/lists/2/study');
    await expect(page.getByTestId('phrase-session-stage2-assemble')).toBeVisible({ timeout: 5000 });

    // Assemble in a wrong order
    await clickTilesInOrder(page, ['dabar', 'Aš', 'noriu', 'juodos', 'kavos']);

    // Wrong feedback shows the correct phrase and the mistake counter increments
    await expect(page.getByText('Не совсем')).toBeVisible();
    await expect(page.locator('.text-red-700', { hasText: 'Aš noriu juodos kavos dabar' })).toBeVisible();
    await expect(page.getByText('1 ✗')).toBeVisible();

    // Continue → the phrase is re-queued and assembly restarts fresh
    await page.getByRole('button', { name: 'Понял, дальше →' }).click();
    await expect(page.getByTestId('phrase-session-stage2-assemble')).toBeVisible({ timeout: 3000 });
    await expect(page.getByTestId('assembled-row').getByRole('button')).toHaveCount(0);
  });

  test('clicking an assembled word returns it to the pool', async ({ page }) => {
    await setFakeToken(page);
    await mockRoutes(page, [LONG_PHRASE]);

    await page.goto('/dashboard/phrases/lists/2/study');
    await expect(page.getByTestId('phrase-session-stage2-assemble')).toBeVisible({ timeout: 5000 });

    await page.getByTestId('tile-pool').getByRole('button', { name: 'Aš', exact: true }).click();
    await expect(page.getByTestId('assembled-row').getByRole('button', { name: 'Aš', exact: true })).toBeVisible();

    await page.getByTestId('assembled-row').getByRole('button', { name: 'Aš', exact: true }).click();
    await expect(page.getByTestId('assembled-row').getByRole('button')).toHaveCount(0);
    await expect(page.getByTestId('tile-pool').getByRole('button', { name: 'Aš', exact: true })).toBeEnabled();
  });

  test('short phrase (word_tiles null) goes straight to typing', async ({ page }) => {
    await setFakeToken(page);
    await mockRoutes(page, [SHORT_PHRASE]);

    await page.goto('/dashboard/phrases/lists/2/study');

    await expect(page.getByTestId('phrase-session-stage2')).toBeVisible({ timeout: 5000 });
    await expect(page.getByTestId('phrase-session-stage2-assemble')).toHaveCount(0);
    await expect(page.locator('textarea')).toBeVisible();
  });
});
