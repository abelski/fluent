import { test, expect } from '@playwright/test';

const SINGLE_WORD = [
  { id: 1, lithuanian: 'katė', translation_en: 'cat', translation_ru: 'кошка', hint: null, status: 'new' },
];

function makeFakeJwt(name: string): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = btoa(JSON.stringify({ email: 'test@test.com', name, exp: 9999999999 }));
  return `${header}.${payload}.fakesignature`;
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

  test('renders the grin pose on the level-complete trophy screen', async ({ page }) => {
    await page.route('**/api/lists/*/study**', async (route) => {
      await route.fulfill({ json: { words: [], distractors: [], all_known: true } });
    });

    await page.goto('/dashboard/lists/_/study');

    await expect(page.locator('[data-testid="tak-mascot"][data-pose="grin"]')).toBeVisible({ timeout: 5000 });
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
});
