import { test, expect } from '@playwright/test';

// Verifies that the DB fix for issue #55 is live:
// the present active participle suffix column must show "-antis / -anti" not "-ntis / -nti".
test('issue #55 — participle suffix shows "-antis / -anti" not "-ntis / -nti"', async ({ page }) => {
  await page.goto('/');

  const result = await page.evaluate(async () => {
    const res = await fetch('http://localhost:8000/api/articles/dalyviai-rūšys-ir-linksniavimas');
    const article: { body_ru?: string; body_en?: string } = await res.json();
    const body = (article.body_ru ?? '') + (article.body_en ?? '');
    return {
      hasCorrect: body.includes('-antis / -anti'),
      // Check that the bare wrong form (without leading 'a') isn't in a suffix column
      hasBareWrong: body.includes('| -ntis / -nti |'),
    };
  });

  expect(result.hasCorrect).toBe(true);
  expect(result.hasBareWrong).toBe(false);
});
