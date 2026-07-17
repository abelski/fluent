import { test, expect } from '@playwright/test';

test('issue-117: programs page falls back to RU translation when EN is missing', async ({ page }) => {
  // Switch to EN mode
  await page.goto('/programs/verbs_365');
  await page.waitForLoadState('networkidle');
  await page.locator('button:has-text("EN")').click();
  await page.waitForTimeout(300);

  // Expand Essential Verbs stack
  await page.locator('button').filter({ hasText: /\d+ words|\d+ слов/ }).first().click();
  await page.waitForSelector('td');

  // All translation cells should be non-empty (fallback to RU)
  const translationCells = await page.locator('tbody td:nth-child(2)').allTextContents();
  expect(translationCells.length).toBeGreaterThan(0);
  const emptyCells = translationCells.filter((t) => t.trim() === '');
  expect(emptyCells).toHaveLength(0);
});

test('issue-117: list detail page falls back to RU translation when EN is missing', async ({ page }) => {
  await page.goto('/dashboard/lists/294');
  await page.waitForLoadState('networkidle');

  // Switch to EN
  await page.locator('button:has-text("EN")').click();
  await page.waitForTimeout(300);

  // Translation spans should be non-empty
  const translations = await page.locator('.text-gray-500.text-sm').allTextContents();
  expect(translations.length).toBeGreaterThan(0);
  const empty = translations.filter((t) => t.trim() === '');
  expect(empty).toHaveLength(0);
});
