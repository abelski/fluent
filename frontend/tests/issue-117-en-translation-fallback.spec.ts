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

// The list-detail half of #117 is split in two:
//
//  1. a mocked test that actually exercises the `translation_en || translation_ru`
//     fallback branch. It has to be mocked: every row in the live `word` table has
//     both translations populated now, so live data cannot reach the fallback and a
//     live-only assertion would pass vacuously.
//  2. a live-data smoke test that the real list still renders no empty cells in EN.
//
// Both preset `fluent_lang` via addInitScript rather than clicking the RU/EN toggle:
// the toggle calls window.location.reload() (components/Header.tsx), so clicking it
// and then waiting a fixed 300ms races the reload and reads a blank, still-loading
// page. Presetting the language is how the rest of the suite does it
// (see list-title-localization.spec.ts).

const LIST_ID = 294;

const LIST_DETAIL_WITH_MISSING_EN = {
  id: LIST_ID,
  title: 'Основные глаголы',
  title_en: 'Essential Verbs',
  description: null,
  description_en: null,
  words: [
    // translation_en missing -> EN mode must fall back to the Russian text
    { id: 1, lithuanian: 'būti', accented: null, translation_en: '', translation_ru: 'быть', hint: null, star: 1 },
    // both present -> EN mode must prefer the English text
    { id: 2, lithuanian: 'eiti', accented: null, translation_en: 'to go', translation_ru: 'идти', hint: null, star: 1 },
  ],
};

test('issue-117: list detail page falls back to RU translation when EN is missing', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('fluent_lang', 'en'));
  await page.route(`**/api/lists/${LIST_ID}`, (route) => route.fulfill({ json: LIST_DETAIL_WITH_MISSING_EN }));

  await page.goto(`/dashboard/lists/${LIST_ID}`);

  const cells = page.locator('.text-gray-500.text-sm');
  await expect(cells).toHaveCount(LIST_DETAIL_WITH_MISSING_EN.words.length);
  // The word with no English translation still shows its Russian one...
  await expect(cells.nth(0)).toHaveText('быть');
  // ...while a word that has one is not downgraded to Russian.
  await expect(cells.nth(1)).toHaveText('to go');
});

test('issue-117: list detail page shows no empty translations in EN (live data)', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('fluent_lang', 'en'));
  await page.goto(`/dashboard/lists/${LIST_ID}`);
  await page.waitForLoadState('networkidle');

  const translations = await page.locator('.text-gray-500.text-sm').allTextContents();
  expect(translations.length).toBeGreaterThan(0);
  const empty = translations.filter((t) => t.trim() === '');
  expect(empty).toHaveLength(0);
});
