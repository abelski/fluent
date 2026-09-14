// Issue #174 — "Susitvarkyti_ / Правильно: teirautis / Не справлятся, а спрашивать, узнавать"
//
// word 7363 `teirautis` (and verb 309, copied into it by the seed scripts) carried
// translation_ru = "справляться, узнавать". "Справляться" reads as "cope", so the reporter
// typed "susitvarkyti" (not in the DB at all) and was marked wrong.
//
// Fixed in data (bracketed qualifier, the #110 / #152 pattern): both rows now read
// "осведомляться, справляться (о ком-то)". Do not reuse the reporter's wording "спрашивать,
// узнавать" — `klausti` (id 7340, "спрашивать") is in the same list 295, and a near-identical
// prompt would cause the reverse complaint.

import { test, expect } from '@playwright/test';

function makeFakeJwt(): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = btoa(JSON.stringify({ email: 'test@test.com', name: 'Test User', exp: 9999999999 }));
  return `${header}.${payload}.fakesignature`;
}

const MOCK_STUDY = {
  words: [
    { id: 7363, lithuanian: 'teirautis', translation_ru: 'осведомляться, справляться (о ком-то)', translation_en: 'to inquire', hint: 'глагол', status: 'new' },
    { id: 7340, lithuanian: 'klausti', translation_ru: 'спрашивать', translation_en: 'to ask', hint: 'глагол', status: 'new' },
  ],
  distractors: [
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

test.describe('Issue #174 — teirautis and klausti are distinguishable', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript((token) => {
      localStorage.setItem('fluent_token', token);
    }, makeFakeJwt());

    await page.route('**/api/lists/*/study**', (r) => r.fulfill({ json: MOCK_STUDY }));
    await page.route('**/api/me/settings', (r) => r.fulfill({ json: MOCK_SETTINGS }));
    await page.route('**/api/words/*/progress', (r) => r.fulfill({ json: { ok: true } }));
  });

  test('teirautis shows the new qualified translation, not the old "справляться, узнавать"', async ({ page }) => {
    await page.goto('/dashboard/lists/_/study');
    await page.waitForSelector('text=teirautis', { timeout: 8000 });

    await expect(page.getByText('осведомляться, справляться (о ком-то)').first()).toBeVisible();

    const body = await page.locator('body').innerText();
    expect(body).not.toContain('справляться, узнавать');
  });

  test('teirautis and klausti prompts are distinct', async ({ page }) => {
    await page.goto('/dashboard/lists/_/study');
    await page.waitForSelector('text=teirautis', { timeout: 8000 });

    // Walk the session collecting which of the two translations appears — they must
    // never coincide, which is exactly what caused the original mix-up.
    const seen = new Set<string>();
    for (let step = 0; step < 20; step++) {
      const body = await page.locator('body').innerText();
      if (body.includes('осведомляться, справляться (о ком-то)')) seen.add('teirautis');
      if (body.includes('спрашивать')) seen.add('klausti');

      // Scope to <main> — the header (inbox/language/user menu) also renders buttons that
      // are always first in DOM order and would never advance the quiz.
      const next = page.locator('main button').filter({ hasNotText: /Назад|Back|Выход|Exit/ }).first();
      if (!(await next.isVisible().catch(() => false))) break;
      await next.click().catch(() => {});
      await page.waitForTimeout(120);
    }

    expect(seen.has('teirautis')).toBe(true);
    expect(seen.has('klausti')).toBe(true);
  });
});
