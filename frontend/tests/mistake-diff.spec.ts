import { test, expect } from '@playwright/test';

// Single word with a diacritic — allows us to test both wrong answer and near-miss
const SINGLE_WORD = [
  { id: 1, lithuanian: 'katė', translation_en: 'cat', translation_ru: 'кошка', hint: null, status: 'new' },
];

function makeFakeJwt(name: string): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = btoa(JSON.stringify({ email: 'test@test.com', name, exp: 9999999999 }));
  return `${header}.${payload}.fakesignature`;
}

test.describe('Mistake diff — stage 3', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript((token) => {
      localStorage.setItem('fluent_token', token);
      localStorage.setItem('fluent_complexity', 'medium');
    }, makeFakeJwt('Test User'));

    await page.route('**/api/lists/*/study**', async (route) => {
      await route.fulfill({ json: { words: SINGLE_WORD, distractors: [] } });
    });
    await page.route('**/api/words/*/progress', async (route) => {
      await route.fulfill({ json: { ok: true } });
    });
  });

  /**
   * Helper: navigate to the study page and advance past stage 1 using quality=5 ("Легко").
   * With one word and quality=5, the word is queued directly at stage 3, skipping stage 2.
   */
  async function reachStage3(page: Parameters<Parameters<typeof test>[1]>[0]) {
    await page.goto('/dashboard/lists/_/study');
    // Stage 1 flashcard — click "Легко" (quality=5) to go straight to stage 3
    await page.waitForSelector('button:has-text("Легко")', { timeout: 5000 });
    await page.locator('button').filter({ hasText: 'Легко' }).first().click();
    // Stage 3 input should now appear
    await page.waitForSelector('input[type="text"]', { timeout: 5000 });
  }

  test('wrong answer shows char-diff with red characters', async ({ page }) => {
    await reachStage3(page);

    await page.locator('input[type="text"]').fill('zzz');
    await page.locator('button:has-text("Проверить")').click();

    await expect(page.locator('[data-testid="dismiss-wrong"]')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('[data-testid="char-diff"]')).toBeVisible({ timeout: 2000 });

    // At least one character should be highlighted red (wrong char)
    const redSpans = page.locator('[data-testid="char-diff"] span.text-red-500');
    await expect(redSpans.first()).toBeVisible();

    // The correct word should appear bold in the diff
    const boldTarget = page.locator('[data-testid="char-diff"] span.font-bold');
    await expect(boldTarget).toBeVisible();
    await expect(boldTarget).toHaveText('katė');
  });

  test('near-miss (accent stripped) shows diff while marking correct', async ({ page }) => {
    // medium complexity: normalizeLt("kate") === normalizeLt("katė") → accepted as correct
    // but nearMiss is set because "kate" !== "katė", so CharDiff is shown
    await reachStage3(page);

    await page.locator('input[type="text"]').fill('kate');
    await page.waitForTimeout(50);
    await page.locator('input[type="text"]').press('Enter');

    // Should be accepted as correct
    await expect(page.locator('text=Правильно!')).toBeVisible({ timeout: 2000 });
    // CharDiff should appear showing the difference
    await expect(page.locator('[data-testid="char-diff"]')).toBeVisible({ timeout: 2000 });
    // The bold target shows the correct spelling
    const boldTarget = page.locator('[data-testid="char-diff"] span.font-bold');
    await expect(boldTarget).toHaveText('katė');
  });
});
