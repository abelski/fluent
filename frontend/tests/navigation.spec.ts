import { test, expect } from '@playwright/test';

// Fake but structurally valid JWT for UI tests (frontend only base64-decodes payload).
function makeFakeJwt(name: string): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = btoa(JSON.stringify({ email: 'test@test.com', name, exp: 9999999999 }));
  return `${header}.${payload}.fakesignature`;
}

async function setFakeToken(page: import('@playwright/test').Page) {
  await page.addInitScript((token) => {
    localStorage.setItem('fluent_token', token);
  }, makeFakeJwt('Test User'));
}

test.describe('Navigation', () => {
  test('landing page loads and shows branding', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('text=fluent').first()).toBeVisible();
  });

  test('nav shows Словари, Грамматика, Практика', async ({ page }) => {
    await setFakeToken(page);
    await page.goto('/dashboard/lists');
    await expect(page.getByRole('link', { name: 'Словари' })).toBeVisible();
    await expect(page.getByRole('link', { name: /Грамматика/ })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Практика' })).toBeVisible();
  });

  test('Словари link is active on /dashboard/lists', async ({ page }) => {
    await setFakeToken(page);
    await page.goto('/dashboard/lists');
    const link = page.getByRole('link', { name: 'Словари' });
    await expect(link).toHaveClass(/bg-white\/10/);
  });

  test('Грамматика link navigates to grammar page', async ({ page }) => {
    await setFakeToken(page);
    await page.goto('/dashboard/lists');
    await page.getByRole('link', { name: /Грамматика/ }).click();
    await expect(page).toHaveURL(/\/dashboard\/grammar/);
    await expect(page.getByRole('link', { name: /Грамматика/ })).toHaveClass(/bg-white\/10/);
  });

  test('Грамматика nav link shows тестирование badge', async ({ page }) => {
    await setFakeToken(page);
    await page.goto('/dashboard/lists');
    await expect(page.locator('text=тестирование')).toBeVisible();
  });

  test('Практика link navigates to practice page', async ({ page }) => {
    await setFakeToken(page);
    await page.goto('/dashboard/lists');
    await page.getByRole('link', { name: 'Практика' }).click();
    await expect(page).toHaveURL(/\/dashboard\/practice/);
    await expect(page.getByRole('link', { name: 'Практика' })).toHaveClass(/bg-white\/10/);
  });
});

test.describe('Grammar page', () => {
  test('shows beta disclaimer banner', async ({ page }) => {
    await page.goto('/dashboard/grammar');
    await expect(page.getByText(/находится в стадии тестирования/)).toBeVisible();
  });
});

test.describe('Grammar page — categories', () => {
  test('shows Падежи category expanded by default', async ({ page }) => {
    await page.goto('/dashboard/grammar');
    const toggle = page.locator('[data-testid="category-toggle-padezhi"]');
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  });

  test('Падежи category can be collapsed and re-expanded', async ({ page }) => {
    await page.goto('/dashboard/grammar');
    const toggle = page.locator('[data-testid="category-toggle-padezhi"]');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  });

  test('shows Времена category with Скоро badge', async ({ page }) => {
    await page.goto('/dashboard/grammar');
    await expect(page.locator('[data-testid="category-vremena"]')).toBeVisible();
    await expect(page.locator('[data-testid="category-vremena"]').getByText('Скоро')).toBeVisible();
  });

  test('Времена category is disabled and not expandable', async ({ page }) => {
    await page.goto('/dashboard/grammar');
    const toggle = page.locator('[data-testid="category-toggle-vremena"]');
    await expect(toggle).toBeDisabled();
    await expect(page.locator('[data-testid="category-vremena"] .grid')).not.toBeVisible();
  });
});

test.describe('Grammar page — lesson levels', () => {
  // Helper: click the first lesson card of the given level label
  async function startFirstLessonOfLevel(page: import('@playwright/test').Page, levelLabel: string) {
    await page.goto('/dashboard/grammar');
    // Wait for lessons to load
    await page.waitForSelector('.grid button', { timeout: 5000 });
    const card = page.locator('.grid button').filter({ hasText: levelLabel }).first();
    await card.click();
    // Wait for exercise screen: "← К урокам" back button is unique to exercise view
    await expect(page.getByText('← К урокам')).toBeVisible({ timeout: 8000 });
  }

  test('basic lesson shows always-visible grammar rule card', async ({ page }) => {
    await startFirstLessonOfLevel(page, 'Базовый');
    // Rule card is always visible for basic level (not collapsible)
    await expect(page.getByText('Грамматическое правило')).toBeVisible();
  });

  test('advanced lesson shows collapsible grammar hint', async ({ page }) => {
    await startFirstLessonOfLevel(page, 'Продвинутый');
    // Advanced shows collapsible hint button
    await expect(page.getByText('Грамматическая подсказка')).toBeVisible();
  });

  test('advanced lesson collapsible hint can be toggled', async ({ page }) => {
    await startFirstLessonOfLevel(page, 'Продвинутый');
    const hint = page.getByText('Грамматическая подсказка');
    // Initially collapsed — rule content not visible
    await expect(page.getByText('Использование')).not.toBeVisible();
    await hint.click();
    // After click — rule details visible
    await expect(page.locator('text=/Винительный|Родительный|Дательный|Местный|Творительный/')).toBeVisible();
  });

  test('advanced lesson shows base form → sentence puzzle format', async ({ page }) => {
    await startFirstLessonOfLevel(page, 'Продвинутый');
    // Puzzle card: "Составьте форму" label visible
    await expect(page.getByText('Составьте форму')).toBeVisible();
    // Arrow → between base form and sentence
    await expect(page.locator('text=→')).toBeVisible();
  });

  test('practice lesson shows no grammar hint', async ({ page }) => {
    await startFirstLessonOfLevel(page, 'Повторение');
    // No hint button at all
    await expect(page.getByText('Грамматическая подсказка')).not.toBeVisible();
    await expect(page.getByText('Грамматическое правило')).not.toBeVisible();
  });

  test('practice lesson shows puzzle format', async ({ page }) => {
    await startFirstLessonOfLevel(page, 'Повторение');
    // Still shows puzzle format (base form → sentence)
    await expect(page.getByText('Составьте форму')).toBeVisible();
  });
});

test.describe('Practice page', () => {
  test('shows coming soon text', async ({ page }) => {
    await page.goto('/dashboard/practice');
    await expect(page.getByRole('heading', { name: 'Практика' })).toBeVisible();
    await expect(page.getByText('Скоро здесь появятся упражнения')).toBeVisible();
  });
});

test.describe('Dashboard redirect', () => {
  test('/dashboard with token redirects to /dashboard/lists', async ({ page }) => {
    await setFakeToken(page);
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/dashboard\/lists/);
  });
});
