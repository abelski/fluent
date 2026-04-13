import { test, expect } from '@playwright/test';

const WORDS = [
  { id: 1, lithuanian: 'katė', translation_en: 'cat', translation_ru: 'кошка', hint: null, status: 'new' },
  { id: 2, lithuanian: 'šuo', translation_en: 'dog', translation_ru: 'собака', hint: null, status: 'new' },
];

// Maps Russian translation → Lithuanian (for driving stage 3 in tests)
const RU_TO_LT: Record<string, string> = {
  кошка: 'katė',
  собака: 'šuo',
};

function makeFakeJwt(): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = btoa(JSON.stringify({ email: 'test@test.com', name: 'Test User', exp: 9999999999 }));
  return `${header}.${payload}.fakesignature`;
}

async function setupSession(page: import('@playwright/test').Page) {
  await page.addInitScript((token) => {
    localStorage.setItem('fluent_token', token);
  }, makeFakeJwt());

  await page.route('**/api/lists/*/study**', (r) =>
    r.fulfill({ json: { words: WORDS, distractors: [] } })
  );
  await page.route('**/api/me/settings', (r) =>
    r.fulfill({
      json: {
        words_per_session: 10,
        new_words_ratio: 0.7,
        lesson_mode: 'thorough',
        use_question_timer: false,
        question_timer_seconds: 5,
      },
    })
  );
  await page.route('**/api/words/*/progress', (r) => r.fulfill({ json: { ok: true } }));
}

/** Click "Легко" for each stage-1 card (all words). With quality=5, each word moves straight to stage 3. */
async function driveStage1(page: import('@playwright/test').Page) {
  for (let i = 0; i < WORDS.length; i++) {
    await page.waitForSelector('button:has-text("Легко")', { timeout: 5000 });
    await page.getByText('Легко').click();
    // Wait longer than the 200ms blockUntilRef guard in handleStage1Quality
    await page.waitForTimeout(350);
  }
}

/** For each stage-3 card, detect the Russian translation on screen and type the correct Lithuanian word. */
async function driveStage3(page: import('@playwright/test').Page) {
  for (let i = 0; i < WORDS.length; i++) {
    await page.waitForSelector('text=Как будет по-литовски?', { timeout: 5000 });

    // Detect which word is shown by checking which Russian translation is visible
    let ltWord = WORDS[i].lithuanian; // fallback
    for (const [ru, lt] of Object.entries(RU_TO_LT)) {
      const visible = await page.getByText(ru, { exact: true }).isVisible();
      if (visible) { ltWord = lt; break; }
    }

    await page.locator('input[type="text"]').fill(ltWord);
    await page.keyboard.press('Enter');
    // Wait for correct-answer auto-advance (1200ms) + buffer
    await page.waitForTimeout(1600);
  }
}

/** Drive through all stages and land on the match round screen. */
async function reachMatchRound(page: import('@playwright/test').Page) {
  await page.goto('/dashboard/lists/_/study');
  await driveStage1(page);
  await driveStage3(page);
  await page.waitForSelector('[data-testid="match-left-0"]', { timeout: 5000 });
}

/** Pair all left items with their correct right items using data-testid buttons. */
async function pairAllWords(page: import('@playwright/test').Page) {
  for (let i = 0; i < WORDS.length; i++) {
    const leftBtn = page.locator(`[data-testid="match-left-${i}"]`);
    const ruTranslation = (await leftBtn.textContent())?.trim() ?? '';
    const ltWord = RU_TO_LT[ruTranslation] ?? '';

    await leftBtn.click();
    await page.waitForTimeout(100);

    await page.locator('[data-testid^="match-right-"]').filter({ hasText: ltWord }).click();
    await page.waitForTimeout(200);
  }
}

test.describe('Match round — appears after study session', () => {
  test.beforeEach(async ({ page }) => {
    await setupSession(page);
  });

  test('match round screen shows after completing a lesson', async ({ page }) => {
    await page.goto('/dashboard/lists/_/study');
    await driveStage1(page);
    await driveStage3(page);

    await expect(page.getByText('Соотнеси слово с переводом')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('Соедините каждое слово с его переводом')).toBeVisible();
  });

  test('correct pairs turn paired, continue button appears after all matched', async ({ page }) => {
    await reachMatchRound(page);
    await pairAllWords(page);

    await expect(page.locator('[data-testid="match-continue"]')).toBeVisible({ timeout: 3000 });
  });

  test('clicking continue shows done screen', async ({ page }) => {
    await reachMatchRound(page);
    await pairAllWords(page);

    await page.locator('[data-testid="match-continue"]').click();

    await expect(page.getByText('Сессия завершена!')).toBeVisible({ timeout: 3000 });
  });

  test('wrong pair does not create a match and continue button stays hidden', async ({ page }) => {
    await reachMatchRound(page);

    // Click left-0, then find a right button that does NOT match it
    const leftBtn = page.locator('[data-testid="match-left-0"]');
    const leftText = (await leftBtn.textContent())?.trim() ?? '';
    const correctLt = RU_TO_LT[leftText] ?? '';

    await leftBtn.click();
    await page.waitForTimeout(100);

    // Try each right button until we find a wrong one
    for (let j = 0; j < WORDS.length; j++) {
      const rightBtn = page.locator(`[data-testid="match-right-${j}"]`);
      const rightText = (await rightBtn.textContent())?.trim() ?? '';
      if (rightText !== correctLt) {
        await rightBtn.click();
        await page.waitForTimeout(300);
        // After wrong pair, continue button must NOT be visible
        await expect(page.locator('[data-testid="match-continue"]')).not.toBeVisible();
        break;
      }
    }
  });
});
