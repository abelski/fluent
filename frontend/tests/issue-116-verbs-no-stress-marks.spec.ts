import { test, expect } from '@playwright/test';

test('issue-116: verbs_365 page shows clean Lithuanian without raw stress marks', async ({ page }) => {
  await page.goto('/programs/verbs_365');
  await page.waitForLoadState('networkidle');

  // Expand the first stack (Essential Verbs / Основные глаголы)
  await page.locator('button').filter({ hasText: /\d+ words|\d+ слов/ }).first().click();

  // Wait for words to load
  await page.waitForSelector('td');

  // Collect all Lithuanian word cells
  const cells = await page.locator('td:first-child').allTextContents();
  expect(cells.length).toBeGreaterThan(0);

  // No cell should contain combining stress marks (U+0300–U+036F)
  const combiningMarkRegex = /[̀-ͯ]/;
  for (const text of cells) {
    expect(text).not.toMatch(combiningMarkRegex);
  }

  // No cell should contain precomposed stressed vowels used as stress notation
  const precomposedStressRegex = /[áàâéèêíìîóòôúùûýỹ]/;
  for (const text of cells) {
    expect(text).not.toMatch(precomposedStressRegex);
  }

  // Key verbs should appear clean
  expect(cells).toContain('būti');
  expect(cells).toContain('turėti');
  expect(cells).toContain('galėti');
  expect(cells).toContain('norėti');
  expect(cells).toContain('reikėti');
});
