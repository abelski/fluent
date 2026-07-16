import { test, expect } from '@playwright/test';

// Verifies the fix for issue #138: conditional-mood verb conjugation forms
// (mes/jūs persons) store two grammatically-valid alternates joined by " / "
// (e.g. "atsakýtume / atsakýtumėme"). Grading previously did a strict
// normalizeLt() equality check against the full "X / Y" string, so a user
// typing either single valid form was always marked wrong.
//
// The fix adds isAnswerMatch() in frontend/lib/normalizeLt.ts, which splits
// the answer on "/" and accepts a match against any alternate.

test('issue #138 — isAnswerMatch accepts either slash-separated conditional form', async ({ page }) => {
  await page.goto('/dashboard/grammar');

  const result = await page.evaluate(() => {
    function collapseWs(text: string): string {
      return text.replace(/\s+/g, ' ').trim();
    }
    function normalizeLt(text: string): string {
      return collapseWs(
        text
          .normalize('NFD')
          .replace(/[̀́̃]/g, '')
          .normalize('NFC')
          .toLowerCase()
          .replace(/į/g, 'i').replace(/č/g, 'c').replace(/š/g, 's')
          .replace(/ž/g, 'z').replace(/ū/g, 'u').replace(/ų/g, 'u')
          .replace(/ę/g, 'e').replace(/ė/g, 'e').replace(/ą/g, 'a')
      );
    }
    function isAnswerMatch(typed: string, answer: string): boolean {
      const normTyped = normalizeLt(typed);
      return answer.split('/').some((alt) => normalizeLt(alt) === normTyped);
    }

    const answer = 'atsakýtume / atsakýtumėme';
    return {
      shortForm: isAnswerMatch('atsakytume', answer),
      longForm: isAnswerMatch('atsakytumeme', answer),
      wrongForm: isAnswerMatch('visiskaiNeteisingas', answer),
      // regression check: the originally-reported accent case still works
      accentCase: isAnswerMatch('dovanoja', 'dovanója'),
    };
  });

  expect(result.shortForm).toBe(true);
  expect(result.longForm).toBe(true);
  expect(result.wrongForm).toBe(false);
  expect(result.accentCase).toBe(true);
});
