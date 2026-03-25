import { test, expect } from '@playwright/test';

const WORDS = [
  { id: 1, lithuanian: 'katė', translation_en: 'cat', translation_ru: 'кошка', hint: null, status: 'new' },
  { id: 2, lithuanian: 'šuo', translation_en: 'dog', translation_ru: 'собака', hint: null, status: 'new' },
  { id: 3, lithuanian: 'namas', translation_en: 'house', translation_ru: 'дом', hint: null, status: 'new' },
  { id: 4, lithuanian: 'vanduo', translation_en: 'water', translation_ru: 'вода', hint: null, status: 'new' },
  { id: 5, lithuanian: 'duona', translation_en: 'bread', translation_ru: 'хлеб', hint: null, status: 'new' },
];

function makeFakeJwt(name: string): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = btoa(JSON.stringify({ email: 'test@test.com', name, exp: 9999999999 }));
  return `${header}.${payload}.fakesignature`;
}

test.describe('Retry logic — vocabulary study', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript((token) => {
      localStorage.setItem('fluent_token', token);
    }, makeFakeJwt('Test User'));
    await page.route('**/api/lists/*/study', async (route) => {
      await route.fulfill({ json: { words: WORDS, distractors: [] } });
    });
    await page.route('**/api/words/*/progress', async (route) => {
      await route.fulfill({ json: { ok: true } });
    });
  });

  test('stage 3 wrong answer: word is re-queued (session continues past expected end)', async ({ page }) => {
    await page.goto('/dashboard/lists/_/study');

    // Pass all 5 stage-1 cards
    for (let i = 0; i < 5; i++) {
      await page.waitForSelector('button:has-text("Понял →")', { timeout: 3000 });
      await page.getByText('Понял →').click();
      await page.waitForTimeout(100);
    }

    // Pass all 5 stage-2 (MCQ) cards by clicking the correct answer
    for (let i = 0; i < 5; i++) {
      await page.waitForSelector('text=Что это означает?', { timeout: 5000 });
      // Click the correct (emerald-colored) option — try each option until one is correct
      const options = page.locator('.grid button');
      const count = await options.count();
      let clicked = false;
      for (let j = 0; j < count && !clicked; j++) {
        const btn = options.nth(j);
        await btn.click();
        await page.waitForTimeout(300);
        // If correct, it auto-advances after 1200ms
        const dismissed = await page.locator('[data-testid="dismiss-wrong"]').isVisible();
        if (dismissed) {
          await page.locator('[data-testid="dismiss-wrong"]').click();
          await page.waitForTimeout(100);
        }
        clicked = true;
      }
      await page.waitForTimeout(1400);
    }

    // Now on stage 3 — type wrong answer for first word
    await page.waitForSelector('input[type="text"]', { timeout: 5000 });
    await page.locator('input[type="text"]').fill('xxxwrong');
    await page.locator('button:has-text("Проверить")').click();

    // Wrong → dismiss button appears
    await expect(page.locator('[data-testid="dismiss-wrong"]')).toBeVisible({ timeout: 3000 });
    await page.locator('[data-testid="dismiss-wrong"]').click();
    await page.waitForTimeout(200);

    // After fail + dismiss, session should NOT be done yet — retry card is in queue
    const isDone = await page.locator('text=Сессия завершена!').isVisible();
    expect(isDone).toBe(false);

    // Stage 3 input should still be visible (more words to answer)
    await expect(page.locator('input[type="text"]')).toBeVisible({ timeout: 3000 });
  });

  test('stage 3 wrong twice: MCQ (standalone) card appears before final retry typing', async ({ page }) => {
    // Use 2 words so stage 2 is skipped (< 4 words)
    const TWO_WORDS = [
      { id: 10, lithuanian: 'vienas', translation_en: 'one', translation_ru: 'один', hint: null, status: 'new' },
      { id: 11, lithuanian: 'du', translation_en: 'two', translation_ru: 'два', hint: null, status: 'new' },
    ];
    await page.route('**/api/lists/*/study', async (route) => {
      await route.fulfill({ json: { words: TWO_WORDS, distractors: [] } });
    });

    await page.goto('/dashboard/lists/_/study');

    // Pass both stage-1 cards
    for (let i = 0; i < 2; i++) {
      await page.waitForSelector('button:has-text("Понял →")', { timeout: 3000 });
      await page.getByText('Понял →').click();
      await page.waitForTimeout(100);
    }

    // Stage 3: fail word 1 (failCount → 1)
    await page.waitForSelector('input[type="text"]', { timeout: 5000 });
    await page.locator('input[type="text"]').fill('xxxwrong1');
    await page.locator('button:has-text("Проверить")').click();
    await expect(page.locator('[data-testid="dismiss-wrong"]')).toBeVisible({ timeout: 3000 });
    await page.locator('[data-testid="dismiss-wrong"]').click();
    await page.waitForTimeout(200);

    // Stage 3 word 2: pass it correctly (type 'du')
    await page.waitForSelector('input[type="text"]', { timeout: 5000 });
    await page.locator('input[type="text"]').fill('du');
    await page.locator('button:has-text("Проверить")').click();
    await page.waitForTimeout(1400);

    // Now word 1 retry (failCount 1) appears for stage 3 — fail it again
    await page.waitForSelector('input[type="text"]', { timeout: 5000 });
    await page.locator('input[type="text"]').fill('xxxwrong2');
    await page.locator('button:has-text("Проверить")').click();
    await expect(page.locator('[data-testid="dismiss-wrong"]')).toBeVisible({ timeout: 3000 });
    await page.locator('[data-testid="dismiss-wrong"]').click();
    await page.waitForTimeout(200);

    // After 2nd stage-3 fail: a standalone stage-1 flashcard should appear for word 1
    await expect(page.locator('button:has-text("Понял →")')).toBeVisible({ timeout: 3000 });
    // The flashcard should show the word (vienas), not the stage 3 input
    await expect(page.locator('input[type="text"]')).not.toBeVisible();

    // Confirm the flashcard
    await page.getByText('Понял →').click();
    await page.waitForTimeout(200);

    // Final stage-3 retry for word 1 (failCount 2) should now appear
    await expect(page.locator('input[type="text"]')).toBeVisible({ timeout: 3000 });
  });
});
