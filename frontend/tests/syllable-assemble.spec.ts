import { test, expect } from '@playwright/test';

// Tests for the syllable-assembly stage ('2a') in the vocabulary/words study
// flow: after a correct MCQ (stage 2) or reverse-MCQ (stage 2r) answer, a
// single-word entry is assembled from its shuffled syllables before the user
// is asked to type it from memory (stage 3). Multi-word phrases and
// slash-separated multi-form entries skip this stage entirely.

function makeFakeJwt(): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = btoa(JSON.stringify({ email: 'test@test.com', name: 'Test User', exp: 9999999999 }));
  return `${header}.${payload}.fakesignature`;
}

async function setFakeToken(page: import('@playwright/test').Page) {
  await page.addInitScript((token) => {
    localStorage.setItem('fluent_token', token);
  }, makeFakeJwt());
}

const MOCK_SETTINGS = {
  words_per_session: 10,
  new_words_ratio: 0.7,
  lesson_mode: 'thorough',
  use_question_timer: false,
  question_timer_seconds: 5,
};

async function mockRoutes(page: import('@playwright/test').Page, words: object[]) {
  await page.route('**/api/lists/*/study**', (r) => r.fulfill({ json: { words, distractors: [] } }));
  await page.route('**/api/me/settings', (r) => r.fulfill({ json: MOCK_SETTINGS }));
  await page.route('**/api/words/*/progress', (r) => r.fulfill({ json: { ok: true } }));
}

// Drives stage 1 -> stage 2/2r (quality=3, "С трудом") and clicks the correct
// MC option regardless of which of the two random MC stages appeared.
async function reachAssembleStage(page: import('@playwright/test').Page, lithuanian: string, translationRu: string) {
  await page.goto('/dashboard/lists/_/study');
  await page.getByText('С трудом', { exact: true }).click();
  const correctOption = page.locator('.grid button', { hasText: new RegExp(`^(${lithuanian}|${translationRu})$`) });
  await correctOption.waitFor({ timeout: 5000 });
  await correctOption.click();
}

async function clickSyllablesInOrder(page: import('@playwright/test').Page, syllables: string[]) {
  const pool = page.getByTestId('syllable-tile-pool');
  for (const syl of syllables) {
    await pool.getByRole('button', { name: syl, exact: true, disabled: false }).first().click();
  }
}

const AUTOMOBILIS = { id: 1, lithuanian: 'automobilis', translation_ru: 'машина', translation_en: 'car', hint: null, status: 'new' };
const ORO_UOSTAS = { id: 2, lithuanian: 'oro uostas', translation_ru: 'аэропорт', translation_en: 'airport', hint: null, status: 'new' };
const SLASH_FORM = { id: 3, lithuanian: 'airis / airė', translation_ru: 'ирландец', translation_en: 'Irish person', hint: null, status: 'new' };

test.describe('Syllable-assemble stage (2a) in vocabulary study', () => {
  test.beforeEach(async ({ page }) => {
    await setFakeToken(page);
  });

  test('single-word entry: correct MC answer shows the assemble screen with its syllables', async ({ page }) => {
    await mockRoutes(page, [AUTOMOBILIS]);
    await reachAssembleStage(page, 'automobilis', 'машина');

    await expect(page.getByText('Соберите слово из слогов')).toBeVisible({ timeout: 5000 });
    const tiles = await page.getByTestId('syllable-tile-pool').getByRole('button').allTextContents();
    expect(tiles.sort()).toEqual(['au', 'bi', 'lis', 'mo', 'to'].sort());
  });

  test('assembling correctly advances to stage 3 (typing)', async ({ page }) => {
    await mockRoutes(page, [AUTOMOBILIS]);
    await reachAssembleStage(page, 'automobilis', 'машина');
    await expect(page.getByTestId('syllable-tile-pool')).toBeVisible({ timeout: 5000 });

    await clickSyllablesInOrder(page, ['au', 'to', 'mo', 'bi', 'lis']);
    await expect(page.getByText('Правильно')).toBeVisible();
    await expect(page.locator('input[type="text"]')).toBeVisible({ timeout: 3000 });
  });

  test('assembling wrong shows dismiss footer, counts a mistake, retries once, then still reaches typing', async ({ page }) => {
    await mockRoutes(page, [AUTOMOBILIS]);
    await reachAssembleStage(page, 'automobilis', 'машина');
    await expect(page.getByTestId('syllable-tile-pool')).toBeVisible({ timeout: 5000 });

    // Wrong order
    await clickSyllablesInOrder(page, ['lis', 'au', 'to', 'mo', 'bi']);
    await expect(page.getByText('Не совсем')).toBeVisible();
    await expect(page.getByText('automobilis')).toBeVisible();
    await expect(page.getByText('1 ✗')).toBeVisible();

    await page.getByTestId('dismiss-wrong').click();

    // Retry: assemble screen shown again with a fresh, empty assembled row
    await expect(page.getByTestId('syllable-tile-pool')).toBeVisible({ timeout: 3000 });
    await expect(page.getByTestId('assembled-row').getByRole('button')).toHaveCount(0);

    // Fail again -> falls through to stage 3 regardless
    await clickSyllablesInOrder(page, ['lis', 'au', 'to', 'mo', 'bi']);
    await expect(page.getByText('Не совсем')).toBeVisible();
    await page.getByTestId('dismiss-wrong').click();
    await expect(page.locator('input[type="text"]')).toBeVisible({ timeout: 3000 });
  });

  test('clicking an assembled syllable returns it to the pool', async ({ page }) => {
    await mockRoutes(page, [AUTOMOBILIS]);
    await reachAssembleStage(page, 'automobilis', 'машина');
    await expect(page.getByTestId('syllable-tile-pool')).toBeVisible({ timeout: 5000 });

    const pool = page.getByTestId('syllable-tile-pool');
    await pool.getByRole('button', { name: 'au', exact: true }).click();
    await expect(page.getByTestId('assembled-row').getByRole('button', { name: 'au', exact: true })).toBeVisible();

    await page.getByTestId('assembled-row').getByRole('button', { name: 'au', exact: true }).click();
    await expect(page.getByTestId('assembled-row').getByRole('button')).toHaveCount(0);
    await expect(pool.getByRole('button', { name: 'au', exact: true })).toBeEnabled();
  });

  test('multi-word entry skips the assemble stage entirely', async ({ page }) => {
    await mockRoutes(page, [ORO_UOSTAS]);
    await reachAssembleStage(page, 'oro uostas', 'аэропорт');

    await expect(page.locator('input[type="text"]')).toBeVisible({ timeout: 5000 });
    await expect(page.getByTestId('syllable-tile-pool')).toHaveCount(0);
  });

  test('slash-form (multi-form) entry skips the assemble stage entirely', async ({ page }) => {
    await mockRoutes(page, [SLASH_FORM]);
    await reachAssembleStage(page, 'airis / airė', 'ирландец');

    await expect(page.locator('input[type="text"]')).toBeVisible({ timeout: 5000 });
    await expect(page.getByTestId('syllable-tile-pool')).toHaveCount(0);
  });
});
