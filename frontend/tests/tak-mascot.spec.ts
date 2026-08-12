import { test, expect, type Page } from '@playwright/test';

const SINGLE_WORD = [
  { id: 1, lithuanian: 'katė', translation_en: 'cat', translation_ru: 'кошка', hint: null, status: 'new' },
];

const DISTRACTORS = [
  { id: 2, lithuanian: 'šuo', translation_en: 'dog', translation_ru: 'собака', hint: null, status: 'new' },
  { id: 3, lithuanian: 'namas', translation_en: 'house', translation_ru: 'дом', hint: null, status: 'new' },
  { id: 4, lithuanian: 'medis', translation_en: 'tree', translation_ru: 'дерево', hint: null, status: 'new' },
];

function makeFakeJwt(name: string): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = btoa(JSON.stringify({ email: 'test@test.com', name, exp: 9999999999 }));
  return `${header}.${payload}.fakesignature`;
}

/** The mascot's mood is published on the wrapper as `data-mood`. */
async function readMood(page: Page): Promise<number> {
  const raw = await page.getByTestId('page-mascot').first().getAttribute('data-mood');
  return Number(raw);
}

/**
 * Walk the stage-1 flashcard via "Легко", which queues a write-only round —
 * the one deterministic next stage ("С трудом" picks stage 2 or 2r at random).
 */
async function reachTypingStage(page: Page) {
  await expect(page.getByText('Prisimeni?')).toBeVisible({ timeout: 5000 });
  await page.getByRole('button', { name: /Легко|Easy/ }).click();
  await expect(page.getByPlaceholder(/Напишите|Type the missing word/)).toBeVisible({ timeout: 5000 });
}

async function typeAnswer(page: Page, answer: string) {
  await page.getByPlaceholder(/Напишите|Type the missing word/).fill(answer);
  await page.keyboard.press('Enter');
}

test.describe('TAK mascot', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript((token) => {
      localStorage.setItem('fluent_token', token);
    }, makeFakeJwt('Test User'));
  });

  test('renders on the flashcard study screen with the "Prisimeni?" greeting', async ({ page }) => {
    await page.route('**/api/lists/*/study**', async (route) => {
      await route.fulfill({ json: { words: SINGLE_WORD, distractors: [] } });
    });

    await page.goto('/dashboard/lists/_/study');

    await expect(page.getByText('Prisimeni?')).toBeVisible({ timeout: 5000 });
    const mascots = page.getByTestId('tak-mascot');
    await expect(mascots.first()).toBeVisible();
  });

  test('renders a celebratory pose on the level-complete trophy screen', async ({ page }) => {
    await page.route('**/api/lists/*/study**', async (route) => {
      await route.fulfill({ json: { words: [], distractors: [], all_known: true } });
    });

    await page.goto('/dashboard/lists/_/study');

    // mood is forced to at least +1 on a passed screen, so the pose is one of the happy tier
    const mascot = page.locator('[data-testid="tak-mascot"]');
    await expect(mascot.first()).toBeVisible({ timeout: 5000 });
    const pose = await mascot.first().getAttribute('data-pose');
    expect(['grin', 'galaxy', 'hype']).toContain(pose);
  });

  test('renders the "Kartokime!" greeting on a word list detail page', async ({ page }) => {
    await page.route('**/api/lists/*', async (route) => {
      await route.fulfill({
        json: {
          id: 1,
          title: 'Test list',
          title_en: 'Test list',
          description: null,
          description_en: null,
          words: [
            { id: 1, lithuanian: 'katė', translation_en: 'cat', translation_ru: 'кошка', hint: null, star: 1 },
          ],
        },
      });
    });

    await page.goto('/dashboard/lists/_');

    await expect(page.getByText('Kartokime!')).toBeVisible({ timeout: 5000 });
    await expect(page.getByTestId('tak-mascot').first()).toBeVisible();
  });

  test('is rendered at the standard 128px size', async ({ page }) => {
    await page.route('**/api/lists/*/study**', async (route) => {
      await route.fulfill({ json: { words: SINGLE_WORD, distractors: [] } });
    });

    await page.goto('/dashboard/lists/_/study');
    const svg = page.getByTestId('tak-mascot').first();
    await expect(svg).toBeVisible({ timeout: 5000 });
    await expect(svg).toHaveAttribute('width', '128');
    await expect(svg).toHaveAttribute('height', '154');
  });

  test.describe('mood', () => {
    test.beforeEach(async ({ page }) => {
      await page.route('**/api/lists/*/study**', async (route) => {
        await route.fulfill({ json: { words: SINGLE_WORD, distractors: DISTRACTORS } });
      });
      await page.route('**/api/words/*/progress', async (route) => {
        await route.fulfill({ json: {} });
      });
    });

    test('starts neutral', async ({ page }) => {
      await page.goto('/dashboard/lists/_/study');
      await expect(page.getByText('Prisimeni?')).toBeVisible({ timeout: 5000 });

      expect(await readMood(page)).toBe(0);
      await expect(page.getByTestId('tak-mascot').first()).toHaveAttribute('data-pose', 'talking');
    });

    test('gets happier on a correct answer', async ({ page }) => {
      await page.goto('/dashboard/lists/_/study');
      await reachTypingStage(page);

      await typeAnswer(page, 'katė');

      await expect(page.getByTestId('page-mascot').first()).toHaveAttribute('data-mood', '1');
      await expect(page.getByTestId('tak-mascot').first()).toHaveAttribute('data-pose', 'grin');
      await expect(page.getByText('Šaunu!')).toBeVisible();
    });

    test('gets sadder on a wrong answer', async ({ page }) => {
      await page.goto('/dashboard/lists/_/study');
      await reachTypingStage(page);

      await typeAnswer(page, 'šuo');

      await expect(page.getByTestId('page-mascot').first()).toHaveAttribute('data-mood', '-1');
      await expect(page.getByTestId('tak-mascot').first()).toHaveAttribute('data-pose', 'sus');
      await expect(page.getByText('Hmm…')).toBeVisible();
    });
  });

  test.describe('exactly one mascot per screen', () => {
    const routes = [
      '/dashboard/vocabulary',
      '/dashboard/practice',
      '/dashboard/practice/programs',
      '/dashboard/grammar/programs',
      '/dashboard/settings',
      '/dashboard/articles',
    ];

    for (const route of routes) {
      test(`${route} renders one full mascot`, async ({ page }) => {
        await page.goto(route);
        // The bug-report FAB and the landing streak ring use the `bare` icon
        // treatment and are deliberately excluded from the once-per-page rule.
        const full = page.locator('[data-testid="tak-mascot"]:not([data-pose="bare"])');
        await expect(full).toHaveCount(1, { timeout: 10000 });
      });
    }

    test('/login renders one full mascot', async ({ page }) => {
      // The suite-wide token would bounce a logged-in user straight to /dashboard.
      await page.addInitScript(() => localStorage.removeItem('fluent_token'));
      await page.goto('/login');
      const full = page.locator('[data-testid="tak-mascot"]:not([data-pose="bare"])');
      await expect(full).toHaveCount(1, { timeout: 10000 });
    });

    test('admin pages render no mascot', async ({ page }) => {
      await page.goto('/dashboard/admin');
      await page.waitForLoadState('networkidle');
      const full = page.locator('[data-testid="tak-mascot"]:not([data-pose="bare"])');
      await expect(full).toHaveCount(0);
    });
  });
});
