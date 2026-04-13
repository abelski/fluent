import { test, expect } from '@playwright/test';

function makeFakeJwt(email: string, name: string): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = btoa(JSON.stringify({ email, name, exp: 9999999999 }));
  return `${header}.${payload}.fakesignature`;
}

async function setToken(page: import('@playwright/test').Page) {
  await page.addInitScript((token) => {
    localStorage.setItem('fluent_token', token);
  }, makeFakeJwt('test@test.com', 'Test User'));
}

const SAMPLE_WORDS = [
  { id: 1, lithuanian: 'labas', translation_ru: 'привет', translation_en: 'hello', hint: null, status: 'known' },
  { id: 2, lithuanian: 'ačiū', translation_ru: 'спасибо', translation_en: 'thank you', hint: null, status: 'known' },
];

test.describe('Review empty state alternatives (mode=known)', () => {
  test.beforeEach(async ({ page }) => {
    // Main review endpoint returns empty (nothing due today)
    await page.route('**/api/review/known', async (route) => {
      await route.fulfill({ json: [] });
    });
  });

  test('shows "Нечего повторять" with two alternative buttons', async ({ page }) => {
    await setToken(page);
    await page.goto('/dashboard/review?mode=known');

    await expect(page.getByText('Нечего повторять')).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole('button', { name: /следующие по расписанию/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Случайные слова/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /На главную|Вернуться к словарям/i })).toBeVisible();
  });

  test('"upcoming" button fetches /api/review/known/upcoming and starts quiz', async ({ page }) => {
    await page.route('**/api/review/known/upcoming', async (route) => {
      await route.fulfill({ json: SAMPLE_WORDS });
    });

    await setToken(page);
    await page.goto('/dashboard/review?mode=known');
    await expect(page.getByText('Нечего повторять')).toBeVisible({ timeout: 5000 });

    await page.getByRole('button', { name: /следующие по расписанию/i }).click();

    // Quiz session should now be visible (word text appears)
    await expect(page.getByText('labas').or(page.getByText('ačiū'))).toBeVisible({ timeout: 5000 });
  });

  test('"random" button fetches /api/review/known/random and starts quiz', async ({ page }) => {
    await page.route('**/api/review/known/random', async (route) => {
      await route.fulfill({ json: SAMPLE_WORDS });
    });

    await setToken(page);
    await page.goto('/dashboard/review?mode=known');
    await expect(page.getByText('Нечего повторять')).toBeVisible({ timeout: 5000 });

    await page.getByRole('button', { name: /Случайные слова/i }).click();

    await expect(page.getByText('labas').or(page.getByText('ačiū'))).toBeVisible({ timeout: 5000 });
  });

  test('"upcoming" button shows "Слов не найдено" when endpoint returns empty', async ({ page }) => {
    await page.route('**/api/review/known/upcoming', async (route) => {
      await route.fulfill({ json: [] });
    });

    await setToken(page);
    await page.goto('/dashboard/review?mode=known');
    await expect(page.getByText('Нечего повторять')).toBeVisible({ timeout: 5000 });

    await page.getByRole('button', { name: /следующие по расписанию/i }).click();

    await expect(page.getByText('Слов не найдено')).toBeVisible({ timeout: 5000 });
  });

  test('mode=mistakes empty state does NOT show alternative buttons', async ({ page }) => {
    await page.route('**/api/review/mistakes', async (route) => {
      await route.fulfill({ json: [] });
    });

    await setToken(page);
    await page.goto('/dashboard/review?mode=mistakes');

    await expect(page.getByText('Нечего повторять')).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole('button', { name: /следующие по расписанию/i })).not.toBeVisible();
    await expect(page.getByRole('button', { name: /Случайные слова/i })).not.toBeVisible();
  });
});
