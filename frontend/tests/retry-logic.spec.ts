import { test, expect } from '@playwright/test';

const WORDS = [
  { id: 1, lithuanian: 'vienas', translation_en: 'one', translation_ru: 'один', hint: null, status: 'new' },
  { id: 2, lithuanian: 'du', translation_en: 'two', translation_ru: 'два', hint: null, status: 'new' },
  { id: 3, lithuanian: 'trys', translation_en: 'three', translation_ru: 'три', hint: null, status: 'new' },
  { id: 4, lithuanian: 'keturi', translation_en: 'four', translation_ru: 'четыре', hint: null, status: 'new' },
  { id: 5, lithuanian: 'penki', translation_en: 'five', translation_ru: 'пять', hint: null, status: 'new' },
];

const RU_MAP: Record<string, string> = {
  vienas: 'один', du: 'два', trys: 'три', keturi: 'четыре', penki: 'пять',
};

function makeFakeJwt(name: string): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = btoa(JSON.stringify({ email: 'test@test.com', name, exp: 9999999999 }));
  return `${header}.${payload}.fakesignature`;
}

/** Click the correct stage-2 option for the current card. */
async function passStage2Card(page: import('@playwright/test').Page) {
  await page.waitForSelector('text=Что это означает?', { timeout: 5000 });
  const ltWord = (await page.locator('text=Что это означает?').locator('~ p').first().textContent() ?? '').trim();
  const correctRu = RU_MAP[ltWord];
  if (correctRu) {
    await page.waitForSelector(`button:has-text("${correctRu}")`, { timeout: 3000 });
    await page.locator('button').filter({ hasText: correctRu }).first().click();
  } else {
    await page.locator('.grid button').first().click();
  }
  await page.waitForTimeout(1400); // wait for auto-advance after correct answer
}

test.describe('Retry logic — vocabulary study', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript((token) => {
      localStorage.setItem('fluent_token', token);
    }, makeFakeJwt('Test User'));
    await page.route('**/api/lists/*/study**', async (route) => {
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

    // Pass all 5 stage-2 cards by clicking the correct answer each time
    for (let i = 0; i < 5; i++) {
      await passStage2Card(page);
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
    const TWO_WORDS = [
      { id: 10, lithuanian: 'vienas', translation_en: 'one', translation_ru: 'один', hint: null, status: 'new' },
      { id: 11, lithuanian: 'du', translation_en: 'two', translation_ru: 'два', hint: null, status: 'new' },
    ];
    await page.route('**/api/lists/*/study**', async (route) => {
      await route.fulfill({ json: { words: TWO_WORDS, distractors: [] } });
    });

    await page.goto('/dashboard/lists/_/study');

    // Pass both stage-1 cards
    for (let i = 0; i < 2; i++) {
      await page.waitForSelector('button:has-text("Понял →")', { timeout: 3000 });
      await page.getByText('Понял →').click();
      await page.waitForTimeout(100);
    }

    // Pass both stage-2 cards
    for (let i = 0; i < 2; i++) {
      await passStage2Card(page);
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

    // After 2nd stage-3 fail: a standalone stage-2 MCQ card should appear for word 1
    await expect(page.locator('text=Что это означает?')).toBeVisible({ timeout: 3000 });
    // The flashcard should NOT show the stage-3 input
    await expect(page.locator('input[type="text"]')).not.toBeVisible();

    // Pass the standalone stage-2 card
    await passStage2Card(page);

    // Final stage-3 retry for word 1 (failCount 2) should now appear
    await expect(page.locator('input[type="text"]')).toBeVisible({ timeout: 3000 });
  });
});
