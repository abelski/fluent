import { test, expect } from '@playwright/test';

// Verifies that the DB fix for issue #46 is live:
// moteris genitive singular must be "moters" not "moteries".
test('issue #46 — moteris genitive form shows "moters" not "moteries"', async ({ page }) => {
  await page.goto('/');

  const result = await page.evaluate(async () => {
    const res = await fetch('http://localhost:8000/api/articles/daiktavardžiai-linksniavimas');
    const article: { body_ru?: string; body_en?: string } = await res.json();
    return {
      hasWrong: (article.body_ru ?? '').includes('moteries') || (article.body_en ?? '').includes('moteries'),
      hasCorrect: (article.body_ru ?? '').includes('moter-**s**') || (article.body_en ?? '').includes('moter-**s**'),
    };
  });

  expect(result.hasWrong).toBe(false);
  expect(result.hasCorrect).toBe(true);
});
