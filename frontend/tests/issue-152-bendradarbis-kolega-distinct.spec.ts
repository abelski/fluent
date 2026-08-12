// Issue #152 — "bendradarbis и kolega переводятся одним и тем же словом «коллега»
//               — никогда не знаешь, какое из них имеет в виду программа"
//
// Both words carried translation_ru = "коллега", so a flashcard gave the learner no way
// to tell them apart, and a type-it prompt of "коллега" accepted only whichever twin
// happened to be in the same ≤10-word session queue — list 172 has 44 words with the two
// at positions 3 and 36, so they often were not, and a correct answer was marked wrong.
//
// Fixed in data (parenthetical qualifiers, the #110 convention) plus a dedup in
// buildOptions2r: duplicate word rows share a lemma but may carry different translations,
// so pickDistractors' same-translation filter does not exclude them and the reverse-MC
// screen could render two identical "kolega" buttons, one scored correct and one wrong.

import { test, expect } from '@playwright/test';

function makeFakeJwt(): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = btoa(JSON.stringify({ email: 'test@test.com', name: 'Test User', exp: 9999999999 }));
  return `${header}.${payload}.fakesignature`;
}

const MOCK_STUDY = {
  words: [
    { id: 3148, lithuanian: 'bendradarbis', translation_ru: 'коллега (по работе)', translation_en: 'co-worker', hint: 'daiktavardis', status: 'new' },
    { id: 5472, lithuanian: 'kolega', translation_ru: 'коллега (по профессии)', translation_en: 'colleague', hint: 'daiktavardis', status: 'new' },
  ],
  distractors: [
    // A duplicate row of the same lemma whose translation has diverged — 71 such lemmas
    // exist in production, and this is what could produce two identical buttons.
    { id: 5001, lithuanian: 'kolega', translation_ru: 'коллега', translation_en: 'colleague', hint: 'daiktavardis', status: 'new' },
    { id: 9001, lithuanian: 'dirbti', translation_ru: 'работать', translation_en: 'to work', hint: null, status: 'new' },
    { id: 9002, lithuanian: 'eiti', translation_ru: 'идти', translation_en: 'to go', hint: null, status: 'new' },
  ],
};

const MOCK_SETTINGS = {
  words_per_session: 10,
  new_words_ratio: 0.7,
  lesson_mode: 'thorough',
  use_question_timer: false,
  question_timer_seconds: 5,
};

test.describe('Issue #152 — bendradarbis and kolega are distinguishable', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript((token) => {
      localStorage.setItem('fluent_token', token);
    }, makeFakeJwt());

    await page.route('**/api/lists/*/study**', (r) => r.fulfill({ json: MOCK_STUDY }));
    await page.route('**/api/me/settings', (r) => r.fulfill({ json: MOCK_SETTINGS }));
    await page.route('**/api/words/*/progress', (r) => r.fulfill({ json: { ok: true } }));
  });

  test('the two words show different meanings, not a bare «коллега»', async ({ page }) => {
    await page.goto('/dashboard/lists/_/study');
    await page.waitForSelector('text=bendradarbis', { timeout: 8000 });

    // The qualifier is what the reporter asked for.
    await expect(page.getByText('коллега (по работе)').first()).toBeVisible();

    // The prompt must never leak the Lithuanian answer — the #118/#120 invariant that
    // the earlier attempt at disambiguation broke.
    await expect(page.getByText('bendradarbis', { exact: true }).first()).toBeVisible();
    const body = await page.locator('body').innerText();
    expect(body).not.toContain('коллега (bendradarbis)');
    expect(body).not.toContain('коллега (kolega)');
  });

  test('no screen ever renders two identical Lithuanian options', async ({ page }) => {
    await page.goto('/dashboard/lists/_/study');
    await page.waitForSelector('text=bendradarbis', { timeout: 8000 });

    // Walk the session, checking every multiple-choice screen as it appears.
    for (let step = 0; step < 40; step++) {
      const buttons = page.locator('button');
      const count = await buttons.count();

      const labels: string[] = [];
      for (let i = 0; i < count; i++) {
        const text = (await buttons.nth(i).innerText()).trim();
        if (text) labels.push(text);
      }

      // Any Lithuanian option rendered twice would be scored inconsistently.
      for (const lemma of ['kolega', 'bendradarbis']) {
        const hits = labels.filter((l) => l === lemma).length;
        expect(hits, `"${lemma}" rendered ${hits} times on one screen`).toBeLessThanOrEqual(1);
      }

      // Advance: click the first enabled button that is not a nav/back control.
      const next = buttons.filter({ hasNotText: /Назад|Back|Выход|Exit/ }).first();
      if (!(await next.isVisible().catch(() => false))) break;
      await next.click().catch(() => {});
      await page.waitForTimeout(120);
    }
  });
});
