// Issue #179 — "член / DAIKTAVARDIS / Правильно: narys — откуда такое слово и надо ли оно"
//
// words 5877 `narys` and 5878 `nariai` (public list 182 "Rinkimai ir demokratija") carried a bare
// translation_ru "член" / "члены". With no context the learner can't tell what is meant.
//
// Fixed in data (bracketed qualifier, the #110 / #152 / #174 pattern): the rows now read
// "член (партии, парламента)" / "члены (партии, парламента)".

import { test, expect } from '@playwright/test';

function makeFakeJwt(): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = btoa(JSON.stringify({ email: 'test@test.com', name: 'Test User', exp: 9999999999 }));
  return `${header}.${payload}.fakesignature`;
}

const MOCK_STUDY = {
  words: [
    { id: 5877, lithuanian: 'narys', translation_ru: 'член (партии, парламента)', translation_en: 'member (of a party, parliament)', hint: 'daiktavardis', status: 'new' },
    { id: 5878, lithuanian: 'nariai', translation_ru: 'члены (партии, парламента)', translation_en: 'members (of a party, parliament)', hint: 'daiktavardis', status: 'new' },
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

test.describe('Issue #179 — narys / nariai carry a qualifier', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript((token) => {
      localStorage.setItem('fluent_token', token);
    }, makeFakeJwt());

    await page.route('**/api/lists/*/study**', (r) => r.fulfill({ json: MOCK_STUDY }));
    await page.route('**/api/me/settings', (r) => r.fulfill({ json: MOCK_SETTINGS }));
    await page.route('**/api/words/*/progress', (r) => r.fulfill({ json: { ok: true } }));
  });

  test('the qualified translation renders and bare «член» never appears alone', async ({ page }) => {
    await page.goto('/dashboard/lists/_/study');
    await page.waitForSelector('text=/narys|nariai/', { timeout: 8000 });

    const seen = new Set<string>();
    for (let step = 0; step < 20; step++) {
      const body = await page.locator('body').innerText();
      if (body.includes('член (партии, парламента)')) seen.add('narys');
      if (body.includes('члены (партии, парламента)')) seen.add('nariai');
      // «член» / «члены» must always be followed by the bracketed qualifier.
      expect(body.replace(/члены? \(партии, парламента\)/g, '')).not.toContain('член');

      // Scope to <main> — header buttons come first in DOM order and never advance the quiz.
      const next = page.locator('main button').filter({ hasNotText: /Назад|Back|Выход|Exit/ }).first();
      if (!(await next.isVisible().catch(() => false))) break;
      await next.click().catch(() => {});
      await page.waitForTimeout(120);
    }

    expect(seen.has('narys')).toBe(true);
    expect(seen.has('nariai')).toBe(true);
  });
});
