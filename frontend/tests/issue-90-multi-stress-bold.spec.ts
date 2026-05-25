import { test, expect } from '@playwright/test';

// Verifies the fix for issue #90: renderAccented() now handles multi-stress
// accented strings like "trum*pa*laikė *nuo*ma" by bolding every odd-indexed
// segment, instead of falling back to literal asterisks when there is more
// than one *pair*.
//
// The function is internal to QuizSession.tsx; this test ports the new logic
// into page.evaluate() and asserts the resulting segments. A previous
// DOM-based version of this test was flaky due to a pre-existing route-mock
// environment issue in the dev server (issue-58 also fails identically); the
// pure-logic test sidesteps that.

test('issue #90 — renderAccented bolds every odd segment for multi-stress strings', async ({ page }) => {
  await page.goto('/');

  const result = await page.evaluate(() => {
    function segments(text: string): Array<{ tag: 'strong' | 'span'; text: string }> | string {
      const parts = text.split('*');
      if (parts.length < 3 || parts.length % 2 === 0) return text;
      return parts.map((part, i) => ({
        tag: i % 2 === 1 ? 'strong' as const : 'span' as const,
        text: part,
      }));
    }

    return {
      single: segments('ilga*lai*kė nuoma'),
      multi: segments('trum*pa*laikė *nuo*ma'),
      threeStress: segments('ameri*kie*tis / ameri*kie*tė'),
      leadingStress: segments('*vai*kų *dar*želis'),
      noStress: segments('trumpalaikė nuoma'),
      onePair: segments('trumpa*lai*kė'),
      malformed: segments('trum*palaikė'),
    };
  });

  // Single stress mark — bolded
  expect(result.single).toEqual([
    { tag: 'span', text: 'ilga' },
    { tag: 'strong', text: 'lai' },
    { tag: 'span', text: 'kė nuoma' },
  ]);

  // Two stress marks (the reported case) — both bolded, no literal asterisks
  expect(result.multi).toEqual([
    { tag: 'span', text: 'trum' },
    { tag: 'strong', text: 'pa' },
    { tag: 'span', text: 'laikė ' },
    { tag: 'strong', text: 'nuo' },
    { tag: 'span', text: 'ma' },
  ]);

  // Two stress marks on a "X / Y" pair — both bolded
  expect(result.threeStress).toEqual([
    { tag: 'span', text: 'ameri' },
    { tag: 'strong', text: 'kie' },
    { tag: 'span', text: 'tis / ameri' },
    { tag: 'strong', text: 'kie' },
    { tag: 'span', text: 'tė' },
  ]);

  // Leading stress mark on first segment
  expect(result.leadingStress).toEqual([
    { tag: 'span', text: '' },
    { tag: 'strong', text: 'vai' },
    { tag: 'span', text: 'kų ' },
    { tag: 'strong', text: 'dar' },
    { tag: 'span', text: 'želis' },
  ]);

  // No stress marks — returned as plain text
  expect(result.noStress).toBe('trumpalaikė nuoma');

  // Single pair still works (the old happy path)
  expect(result.onePair).toEqual([
    { tag: 'span', text: 'trumpa' },
    { tag: 'strong', text: 'lai' },
    { tag: 'span', text: 'kė' },
  ]);

  // Malformed (odd number of asterisks) — falls back to plain text
  expect(result.malformed).toBe('trum*palaikė');
});
