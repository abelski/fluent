import { test, expect } from '@playwright/test';

// Tests for the assemble-phrase exercise (originally issue #145, since moved).
// Stage 1 now starts with two tile-assembly sub-steps before MCQ + type-word:
//   1. from-LT: the Lithuanian phrase is shown, assemble its translation
//   2. to-LT:  the translation is shown, assemble the Lithuanian phrase
// Each direction only appears when the server sent tiles for that text
// (>3 words); otherwise it is skipped. Stage 2 is pure typed recall again.

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

const LT_TEXT = 'Aš noriu juodos kavos dabar';
const RU_TEXT = 'Я хочу чёрный кофе сейчас';

const LONG_PHRASE = {
  id: 1,
  text: LT_TEXT,
  translation: RU_TEXT,
  translation_en: null,
  alt_texts: null,
  lesson_stage: 1,
  blank_word: 'noriu',
  mcq_distractors: ['galiu', 'turiu', 'matau'],
  word_tiles: ['kavos', 'Aš', 'dabar', 'noriu', 'juodos'],
  translation_tiles: ['кофе', 'Я', 'сейчас', 'хочу', 'чёрный'],
  translation_en_tiles: null,
  next_review: null,
};

const SHORT_PHRASE = {
  id: 2,
  text: 'Labas rytas',
  translation: 'Доброе утро',
  translation_en: null,
  alt_texts: null,
  lesson_stage: 1,
  blank_word: 'rytas',
  mcq_distractors: ['vakaras', 'naktis', 'diena'],
  word_tiles: null,
  translation_tiles: null,
  translation_en_tiles: null,
  next_review: null,
};

// Long LT phrase whose translation is too short to tile — to-LT direction only
const LT_ONLY_TILES_PHRASE = {
  ...LONG_PHRASE,
  id: 3,
  translation_tiles: null,
};

// Short LT phrase with a long translation — from-LT direction only
const RU_ONLY_TILES_PHRASE = {
  ...LONG_PHRASE,
  id: 4,
  word_tiles: null,
};

const STAGE2_PHRASE = { ...LONG_PHRASE, id: 5, lesson_stage: 2 };

function mockRoutes(
  page: import('@playwright/test').Page,
  phrases: object[],
  progressBodies?: Array<Record<string, unknown>>,
) {
  return Promise.all([
    page.route('**/api/me/phrase-lists/2/study*', async (route) => {
      await route.fulfill({ json: { phrases } });
    }),
    page.route('**/api/me/phrase-lists/phrases/*/progress', async (route) => {
      if (progressBodies) progressBodies.push(route.request().postDataJSON());
      await route.fulfill({ json: { lesson_stage: 1, next_review: null, interval: 1 } });
    }),
  ]);
}

async function clickTilesInOrder(page: import('@playwright/test').Page, words: string[]) {
  const pool = page.getByTestId('tile-pool');
  for (const word of words) {
    await pool.getByRole('button', { name: word, exact: true, disabled: false }).first().click();
  }
}

test.describe('Stage-1 assemble-phrase exercise (both directions)', () => {
  test('from-LT assembly, then to-LT assembly, then MCQ', async ({ page }) => {
    await setFakeToken(page);
    await mockRoutes(page, [LONG_PHRASE]);

    await page.goto('/dashboard/phrases/lists/2/study');

    // From-LT sub-step first: LT prompt, RU translation tiles in the pool
    await expect(page.getByTestId('phrase-session-stage1-assemble-from-lt')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('Соберите перевод из слов')).toBeVisible();
    await expect(page.getByText(LT_TEXT)).toBeVisible();
    await expect(page.getByTestId('tile-pool').getByRole('button')).toHaveCount(5);
    await clickTilesInOrder(page, ['Я', 'хочу', 'чёрный', 'кофе', 'сейчас']);
    // (The 'Правильно! ✓' feedback flashes for 900ms — asserting the next
    // sub-step instead keeps this test stable under parallel load.)

    // To-LT sub-step next: RU prompt, LT tiles, pool reset to 5 fresh tiles
    await expect(page.getByTestId('phrase-session-stage1-assemble-to-lt')).toBeVisible({ timeout: 3000 });
    await expect(page.getByText('Соберите фразу из слов')).toBeVisible();
    await expect(page.getByTestId('assembled-row').getByRole('button')).toHaveCount(0);
    await clickTilesInOrder(page, ['Aš', 'noriu', 'juodos', 'kavos', 'dabar']);

    // Then the MCQ sub-step — no progress POST happened between sub-steps
    await expect(page.getByTestId('phrase-session-stage1-mcq')).toBeVisible({ timeout: 3000 });
    // No mistake was counted
    await expect(page.getByText('1 ✗')).toHaveCount(0);
  });

  test('wrong to-LT assembly records the misplaced word as mistake_word', async ({ page }) => {
    await setFakeToken(page);
    const bodies: Array<Record<string, unknown>> = [];
    await mockRoutes(page, [LONG_PHRASE], bodies);

    await page.goto('/dashboard/phrases/lists/2/study');
    await expect(page.getByTestId('phrase-session-stage1-assemble-from-lt')).toBeVisible({ timeout: 5000 });
    await clickTilesInOrder(page, ['Я', 'хочу', 'чёрный', 'кофе', 'сейчас']);
    await expect(page.getByTestId('phrase-session-stage1-assemble-to-lt')).toBeVisible({ timeout: 3000 });

    // Assemble the Lithuanian phrase in a wrong order
    await clickTilesInOrder(page, ['dabar', 'Aš', 'noriu', 'juodos', 'kavos']);
    await expect(page.getByText('Не совсем')).toBeVisible();
    await expect(page.locator('.text-red-700', { hasText: LT_TEXT })).toBeVisible();
    await expect(page.getByText('1 ✗')).toBeVisible();

    // Continue → progress POST carries quality 1 + the first misplaced LT word
    await page.getByRole('button', { name: 'Понял, дальше →' }).click();
    await expect.poll(() => bodies.length).toBeGreaterThan(0);
    expect(bodies[0]).toMatchObject({ quality: 1, stage_completed: 1, mistake_word: 'Aš' });

    // Stage-1 mistakes re-queue as gap_retry, which re-runs assembly first
    // (never MCQ) before landing on typing the blanked word.
    await expect(page.getByTestId('phrase-session-stage1-assemble-from-lt')).toBeVisible({ timeout: 3000 });
    await clickTilesInOrder(page, ['Я', 'хочу', 'чёрный', 'кофе', 'сейчас']);
    await expect(page.getByTestId('phrase-session-stage1-assemble-to-lt')).toBeVisible({ timeout: 3000 });
    await clickTilesInOrder(page, ['Aš', 'noriu', 'juodos', 'kavos', 'dabar']);

    // MCQ is skipped on gap_retry — straight to typing the blanked word
    await expect(page.getByTestId('phrase-session-stage1-type')).toBeVisible({ timeout: 3000 });
    await expect(page.getByTestId('phrase-session-stage1-mcq')).toHaveCount(0);
  });

  test('wrong from-LT assembly sends no mistake_word (translation words must not pollute LT mistakes)', async ({ page }) => {
    await setFakeToken(page);
    const bodies: Array<Record<string, unknown>> = [];
    await mockRoutes(page, [LONG_PHRASE], bodies);

    await page.goto('/dashboard/phrases/lists/2/study');
    await expect(page.getByTestId('phrase-session-stage1-assemble-from-lt')).toBeVisible({ timeout: 5000 });

    await clickTilesInOrder(page, ['сейчас', 'Я', 'хочу', 'чёрный', 'кофе']);
    await expect(page.getByText('Не совсем')).toBeVisible();
    // Wrong feedback shows the direction's target — the translation, not the LT text
    await expect(page.locator('.text-red-700', { hasText: RU_TEXT })).toBeVisible();

    await page.getByRole('button', { name: 'Понял, дальше →' }).click();
    await expect.poll(() => bodies.length).toBeGreaterThan(0);
    expect(bodies[0]).toMatchObject({ quality: 1, stage_completed: 1 });
    expect(bodies[0]).not.toHaveProperty('mistake_word');
  });

  test('clicking an assembled word returns it to the pool', async ({ page }) => {
    await setFakeToken(page);
    await mockRoutes(page, [LONG_PHRASE]);

    await page.goto('/dashboard/phrases/lists/2/study');
    await expect(page.getByTestId('phrase-session-stage1-assemble-from-lt')).toBeVisible({ timeout: 5000 });

    await page.getByTestId('tile-pool').getByRole('button', { name: 'Я', exact: true }).click();
    await expect(page.getByTestId('assembled-row').getByRole('button', { name: 'Я', exact: true })).toBeVisible();

    await page.getByTestId('assembled-row').getByRole('button', { name: 'Я', exact: true }).click();
    await expect(page.getByTestId('assembled-row').getByRole('button')).toHaveCount(0);
    await expect(page.getByTestId('tile-pool').getByRole('button', { name: 'Я', exact: true })).toBeEnabled();
  });

  test('translation too short to tile: only the to-LT direction appears', async ({ page }) => {
    await setFakeToken(page);
    await mockRoutes(page, [LT_ONLY_TILES_PHRASE]);

    await page.goto('/dashboard/phrases/lists/2/study');
    await expect(page.getByTestId('phrase-session-stage1-assemble-to-lt')).toBeVisible({ timeout: 5000 });
    await expect(page.getByTestId('phrase-session-stage1-assemble-from-lt')).toHaveCount(0);

    await clickTilesInOrder(page, ['Aš', 'noriu', 'juodos', 'kavos', 'dabar']);
    await expect(page.getByTestId('phrase-session-stage1-mcq')).toBeVisible({ timeout: 3000 });
  });

  test('LT phrase too short to tile: only the from-LT direction appears', async ({ page }) => {
    await setFakeToken(page);
    await mockRoutes(page, [RU_ONLY_TILES_PHRASE]);

    await page.goto('/dashboard/phrases/lists/2/study');
    await expect(page.getByTestId('phrase-session-stage1-assemble-from-lt')).toBeVisible({ timeout: 5000 });

    await clickTilesInOrder(page, ['Я', 'хочу', 'чёрный', 'кофе', 'сейчас']);
    await expect(page.getByTestId('phrase-session-stage1-mcq')).toBeVisible({ timeout: 3000 });
    await expect(page.getByTestId('phrase-session-stage1-assemble-to-lt')).toHaveCount(0);
  });

  test('both tile sets null: stage 1 starts at the MCQ', async ({ page }) => {
    await setFakeToken(page);
    await mockRoutes(page, [SHORT_PHRASE]);

    await page.goto('/dashboard/phrases/lists/2/study');
    await expect(page.getByTestId('phrase-session-stage1-mcq')).toBeVisible({ timeout: 5000 });
    await expect(page.getByTestId('tile-pool')).toHaveCount(0);
  });

  test('mistake on a phrase with no tiles: gap_retry still skips straight to typing', async ({ page }) => {
    await setFakeToken(page);
    await mockRoutes(page, [SHORT_PHRASE]);

    await page.goto('/dashboard/phrases/lists/2/study');
    await expect(page.getByTestId('phrase-session-stage1-mcq')).toBeVisible({ timeout: 5000 });

    // Select a wrong MCQ option to trigger the mistake re-queue
    const wrongOption = page.getByRole('button', { name: SHORT_PHRASE.mcq_distractors[0], exact: true });
    await wrongOption.click();
    await page.getByRole('button', { name: 'Понял, дальше →' }).click();

    // No tiles in either direction — gap_retry falls back to typing, not assembly
    await expect(page.getByTestId('phrase-session-stage1-type')).toBeVisible({ timeout: 3000 });
    await expect(page.getByTestId('tile-pool')).toHaveCount(0);
  });

  test('stage 2 is pure typed recall — no assembly (regression for the move)', async ({ page }) => {
    await setFakeToken(page);
    await mockRoutes(page, [STAGE2_PHRASE]);

    await page.goto('/dashboard/phrases/lists/2/study');
    await expect(page.getByTestId('phrase-session-stage2')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('textarea')).toBeVisible();
    await expect(page.getByTestId('tile-pool')).toHaveCount(0);
  });

  test('mistake on an already-learned (stage 2) phrase re-drills: assemble (to-LT only) → MCQ → type blank word → retype', async ({ page }) => {
    await setFakeToken(page);
    await mockRoutes(page, [STAGE2_PHRASE]);

    await page.goto('/dashboard/phrases/lists/2/study');
    await expect(page.getByTestId('phrase-session-stage2')).toBeVisible({ timeout: 5000 });

    // "Forgot" the full phrase → wrong result with no typed attempt, then continue
    await page.getByTestId('forgot-btn').click();
    await page.getByRole('button', { name: 'Понял, дальше →' }).click();

    // Re-queued as a stage2_retry: only the to-LT assembly (never from-LT/translation)
    await expect(page.getByTestId('phrase-session-stage1-assemble-to-lt')).toBeVisible({ timeout: 3000 });
    await expect(page.getByTestId('phrase-session-stage1-assemble-from-lt')).toHaveCount(0);
    await clickTilesInOrder(page, ['Aš', 'noriu', 'juodos', 'kavos', 'dabar']);

    // MCQ is NOT skipped for stage2_retry (unlike gap_retry)
    await expect(page.getByTestId('phrase-session-stage1-mcq')).toBeVisible({ timeout: 3000 });
    await page.getByRole('button', { name: STAGE2_PHRASE.blank_word, exact: true }).click();

    // Then type the blanked word
    await expect(page.getByTestId('phrase-session-stage1-type')).toBeVisible({ timeout: 3000 });
    await page.getByPlaceholder(/./).fill(STAGE2_PHRASE.blank_word);
    await page.getByRole('button', { name: '→' }).click();
    await page.getByRole('button', { name: 'Дальше →' }).click();

    // Drill complete → falls through to the real stage-2 full-phrase retype
    await expect(page.getByTestId('phrase-session-stage2')).toBeVisible({ timeout: 3000 });
    await expect(page.locator('textarea')).toBeVisible();
    await expect(page.getByTestId('tile-pool')).toHaveCount(0);
  });
});
