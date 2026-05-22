import { test, expect } from '@playwright/test';

// Verifies the fix for issue #88: normalizeLt() now collapses internal whitespace
// runs to a single space and trims ends, so multi-word answers like "šiaip sau"
// match even when typed with extra spaces, tabs, or leading/trailing whitespace.

test('issue #88 — normalizeLt collapses internal whitespace in multi-word answers', async ({ page }) => {
  await page.goto('/dashboard/grammar');

  const result = await page.evaluate(() => {
    function collapseWs(text: string): string {
      return text.replace(/\s+/g, ' ').trim();
    }
    function normalizeLt(text: string): string {
      return collapseWs(
        text
          .normalize('NFC')
          .toLowerCase()
          .replace(/į/g, 'i')
          .replace(/č/g, 'c')
          .replace(/š/g, 's')
          .replace(/ž/g, 'z')
          .replace(/ū/g, 'u')
          .replace(/ų/g, 'u')
          .replace(/ę/g, 'e')
          .replace(/ė/g, 'e')
          .replace(/ą/g, 'a')
      );
    }
    const target = normalizeLt('šiaip sau');
    return {
      target,
      doubleSpace: normalizeLt('šiaip  sau') === target,
      leadingSpace: normalizeLt(' šiaip sau') === target,
      trailingSpace: normalizeLt('šiaip sau ') === target,
      tab: normalizeLt('šiaip\tsau') === target,
      capital: normalizeLt('Šiaip Sau') === target,
    };
  });

  expect(result.target).toBe('siaip sau');
  expect(result.doubleSpace).toBe(true);
  expect(result.leadingSpace).toBe(true);
  expect(result.trailingSpace).toBe(true);
  expect(result.tab).toBe(true);
  expect(result.capital).toBe(true);
});
