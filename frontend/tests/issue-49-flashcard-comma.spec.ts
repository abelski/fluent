import { test, expect } from '@playwright/test';

// Verifies that the DB fix for issue #49 is live:
// all "Флешкарты для тех кто" program names now include the comma: "тех, кто".
// Fetches the real subcategory-meta API from the browser context to verify.
test('issue #49 — flashcard program names have comma after "тех"', async ({ page }) => {
  await page.goto('/programs');

  const result = await page.evaluate(async () => {
    const res = await fetch('http://localhost:8000/api/subcategory-meta');
    const data: Record<string, { name_ru?: string }> = await res.json();
    const names = Object.values(data)
      .map((v) => v.name_ru ?? '')
      .filter((n) => n.includes('тех'));
    return {
      hasWithoutComma: names.some((n) => n.includes('тех кто')),
      hasWithComma: names.some((n) => n.includes('тех, кто')),
      names,
    };
  });

  expect(result.hasWithoutComma).toBe(false);
  expect(result.hasWithComma).toBe(true);
});
