import { test, expect } from '@playwright/test';

// Verifies that the DB fix for issue #47 is live:
// sesuo declension table must appear in the noun declension article.
test('issue #47 — sesuo declension appears in noun article', async ({ page }) => {
  await page.goto('/');

  const result = await page.evaluate(async () => {
    const res = await fetch('http://localhost:8000/api/articles/daiktavardžiai-linksniavimas');
    const article: { body_ru?: string; body_en?: string } = await res.json();
    return {
      hasSesuo: (article.body_ru ?? '').includes('sesuo') || (article.body_en ?? '').includes('sesuo'),
    };
  });

  expect(result.hasSesuo).toBe(true);
});
