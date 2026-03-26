import { test, expect } from '@playwright/test';

// Simulates a numbers list with skaitvardis hint words
const NUMBERS_WORDS = [
  { id: 1, lithuanian: 'vienas', translation_en: 'one', translation_ru: 'один', hint: 'skaitvardis', status: 'new' },
  { id: 2, lithuanian: 'du', translation_en: 'two', translation_ru: 'два', hint: 'skaitvardis', status: 'new' },
  { id: 3, lithuanian: 'trys', translation_en: 'three', translation_ru: 'три', hint: 'skaitvardis', status: 'new' },
  { id: 4, lithuanian: 'keturi', translation_en: 'four', translation_ru: 'четыре', hint: 'skaitvardis', status: 'new' },
  { id: 5, lithuanian: 'penki', translation_en: 'five', translation_ru: 'пять', hint: 'skaitvardis', status: 'new' },
];

function makeFakeJwt(name: string): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = btoa(JSON.stringify({ email: 'test@test.com', name, exp: 9999999999 }));
  return `${header}.${payload}.fakesignature`;
}

test.describe('Numbers study — digit display', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript((token) => {
      localStorage.setItem('fluent_token', token);
    }, makeFakeJwt('Test User'));

    await page.route('**/api/lists/*/study**', async (route) => {
      await route.fulfill({ json: { words: NUMBERS_WORDS, distractors: [] } });
    });
    await page.route('**/api/words/*/progress', async (route) => {
      await route.fulfill({ json: { ok: true } });
    });
  });

  test('stage 1 shows digit for number word', async ({ page }) => {
    await page.goto('/dashboard/lists/_/study');
    // Stage 1: flashcard — digit should be visible
    await expect(page.locator('[data-testid="number-digit"]').first()).toBeVisible({ timeout: 5000 });
    await expect(page.locator('[data-testid="number-digit"]').first()).toHaveText('1');
  });

  test('stage 2 shows digit alongside lithuanian word', async ({ page }) => {
    await page.goto('/dashboard/lists/_/study');
    // Dismiss all 5 stage-1 cards so the first word reaches stage 2
    for (let i = 0; i < 5; i++) {
      await page.waitForSelector('button:has-text("Понял →")', { timeout: 3000 });
      await page.getByText('Понял →').click();
      await page.waitForTimeout(100);
    }
    // Stage 2: multiple choice — digit should be visible
    await expect(page.locator('[data-testid="number-digit"]').first()).toBeVisible({ timeout: 5000 });
  });

  test('non-number word does not show digit', async ({ page }) => {
    const NON_NUMBER_WORDS = [
      { id: 10, lithuanian: 'katė', translation_en: 'cat', translation_ru: 'кошка', hint: null, status: 'new' },
      { id: 11, lithuanian: 'šuo', translation_en: 'dog', translation_ru: 'собака', hint: null, status: 'new' },
      { id: 12, lithuanian: 'namas', translation_en: 'house', translation_ru: 'дом', hint: null, status: 'new' },
      { id: 13, lithuanian: 'vanduo', translation_en: 'water', translation_ru: 'вода', hint: null, status: 'new' },
      { id: 14, lithuanian: 'duona', translation_en: 'bread', translation_ru: 'хлеб', hint: null, status: 'new' },
    ];
    await page.route('**/api/lists/*/study**', async (route) => {
      await route.fulfill({ json: { words: NON_NUMBER_WORDS, distractors: [] } });
    });
    await page.goto('/dashboard/lists/_/study');
    await expect(page.locator('[data-testid="number-digit"]')).not.toBeVisible();
  });
});
