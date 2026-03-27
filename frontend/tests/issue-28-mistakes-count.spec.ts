import { test, expect } from '@playwright/test';

// Two words with distinct translations so we can reliably pass stage 2
const WORDS = [
  { id: 1, lithuanian: 'vienas', translation_en: 'one', translation_ru: 'один', hint: null, status: 'new' },
  { id: 2, lithuanian: 'du', translation_en: 'two', translation_ru: 'два', hint: null, status: 'new' },
];

const RU_MAP: Record<string, string> = { vienas: 'один', du: 'два' };
const LT_MAP: Record<string, string> = { vienas: 'vienas', du: 'du' };

function makeFakeJwt(): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = btoa(JSON.stringify({ email: 'test@test.com', name: 'Test', exp: 9999999999 }));
  return `${header}.${payload}.fakesignature`;
}

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
  await page.waitForTimeout(1400);
}

async function passStage3Card(page: import('@playwright/test').Page) {
  await page.waitForSelector('input[type="text"]', { timeout: 5000 });
  // Read the hint text to know which word we're on, then type correct answer
  // The prompt shows the Russian translation — look for it in the heading
  const promptText = await page.locator('p.text-2xl, p.text-4xl').first().textContent() ?? '';
  const lt = Object.entries(RU_MAP).find(([, ru]) => promptText.includes(ru))?.[0];
  const answer = lt ? LT_MAP[lt] : 'vienas';
  await page.locator('input[type="text"]').fill(answer);
  await page.locator('button:has-text("Проверить")').click();
  await page.waitForTimeout(1400);
}

test.describe('Issue #28 — mistakes counter on results screen', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript((token) => {
      localStorage.setItem('fluent_token', token);
    }, makeFakeJwt());
    await page.route('**/api/lists/*/study**', async (route) => {
      await route.fulfill({ json: { words: WORDS, distractors: [] } });
    });
    await page.route('**/api/words/*/progress', async (route) => {
      await route.fulfill({ json: { ok: true } });
    });
  });

  test('results show non-zero mistakes when user answered wrong during session', async ({ page }) => {
    await page.goto('/dashboard/lists/_/study');

    // Pass both stage-1 cards
    for (let i = 0; i < 2; i++) {
      await page.waitForSelector('button:has-text("Понял →")', { timeout: 3000 });
      await page.getByText('Понял →').click();
      await page.waitForTimeout(100);
    }

    // Pass both stage-2 cards correctly
    for (let i = 0; i < 2; i++) {
      await passStage2Card(page);
    }

    // Stage 3 — deliberately answer word 1 wrong
    await page.waitForSelector('input[type="text"]', { timeout: 5000 });
    await page.locator('input[type="text"]').fill('xxxwrong');
    await page.locator('button:has-text("Проверить")').click();
    await expect(page.locator('[data-testid="dismiss-wrong"]')).toBeVisible({ timeout: 3000 });
    await page.locator('[data-testid="dismiss-wrong"]').click();

    // 1 mistake out of 2 words = 50% >= 25% threshold → session ends immediately
    await expect(page.locator('text=Сессия завершена!')).toBeVisible({ timeout: 5000 });

    // Errors box must show 1 (one word had a wrong answer), not 0
    const errorsBox = page.locator('div').filter({ hasText: 'Ошибок' }).locator('div.text-amber-600').first();
    const errorsText = await errorsBox.textContent();
    expect(Number(errorsText?.trim())).toBeGreaterThan(0);
  });

  test('results show zero mistakes when all answers were correct first time', async ({ page }) => {
    await page.goto('/dashboard/lists/_/study');

    // Pass both stage-1 cards
    for (let i = 0; i < 2; i++) {
      await page.waitForSelector('button:has-text("Понял →")', { timeout: 3000 });
      await page.getByText('Понял →').click();
      await page.waitForTimeout(100);
    }

    // Pass both stage-2 cards correctly
    for (let i = 0; i < 2; i++) {
      await passStage2Card(page);
    }

    // Pass both stage-3 cards correctly
    await page.waitForSelector('input[type="text"]', { timeout: 5000 });
    await page.locator('input[type="text"]').fill('vienas');
    await page.locator('button:has-text("Проверить")').click();
    await page.waitForTimeout(1400);

    await page.waitForSelector('input[type="text"]', { timeout: 5000 });
    await page.locator('input[type="text"]').fill('du');
    await page.locator('button:has-text("Проверить")').click();
    await page.waitForTimeout(1400);

    // Results screen
    await expect(page.locator('text=Сессия завершена!')).toBeVisible({ timeout: 5000 });

    // Errors box should show 0
    const errorsBox = page.locator('div').filter({ hasText: 'Ошибок' }).locator('div.text-amber-600').first();
    const errorsText = await errorsBox.textContent();
    expect(Number(errorsText?.trim())).toBe(0);
  });
});
