import { test, expect } from '@playwright/test';

// Issue #182 — sveiko/pasveiko (list 168) shared "выздоровел" / "got better, recovered",
// so dedupe dropped one twin and the aspect contrast never showed. Prod data now
// carries aspect-distinct translations; this pins that the study card shows them.

function makeFakeJwt(): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = btoa(JSON.stringify({ email: 'test@test.com', name: 'Test User', exp: 9999999999 }));
  return `${header}.${payload}.fakesignature`;
}

const WORDS = {
  sveiko: { id: 5453, lithuanian: 'sveiko', translation_ru: 'выздоравливал/выздоравливала', translation_en: 'was recovering, was getting better', hint: null, status: 'new' },
  pasveiko: { id: 5449, lithuanian: 'pasveiko', translation_ru: 'выздоровел/выздоровела', translation_en: 'recovered (fully), got well', hint: null, status: 'new' },
};

const DISTRACTORS = [
  { id: 9001, lithuanian: 'dirbti', translation_ru: 'работать', translation_en: 'to work', hint: null, status: 'new' },
  { id: 9002, lithuanian: 'eiti', translation_ru: 'идти', translation_en: 'to go', hint: null, status: 'new' },
];

const MOCK_SETTINGS = {
  words_per_session: 10,
  new_words_ratio: 0.7,
  lesson_mode: 'thorough',
  use_question_timer: false,
  question_timer_seconds: 5,
};

for (const lang of ['ru', 'en'] as const) {
  for (const width of [1280, 375]) {
    for (const key of ['sveiko', 'pasveiko'] as const) {
      test(`${key} shows its aspect translation, ${lang}, ${width}px`, async ({ page }) => {
        const word = WORDS[key];
        await page.setViewportSize({ width, height: 900 });
        await page.addInitScript(([token, l]) => {
          localStorage.setItem('fluent_token', token);
          localStorage.setItem('fluent_lang', l);
          localStorage.setItem('cookie_consent', 'declined');
        }, [makeFakeJwt(), lang]);
        await page.route('**/api/lists/*/study**', (r) => r.fulfill({ json: { words: [word], distractors: DISTRACTORS } }));
        await page.route('**/api/me/settings', (r) => r.fulfill({ json: MOCK_SETTINGS }));
        await page.route('**/api/words/*/progress', (r) => r.fulfill({ json: { ok: true } }));

        await page.goto('/dashboard/lists/_/study');
        await page.waitForSelector(`text=${word.lithuanian}`, { timeout: 8000 });
        const expected = lang === 'ru' ? word.translation_ru : word.translation_en;
        await expect(page.getByText(expected).first()).toBeVisible();
        await page.screenshot({
          path: `../temp_files/screenshots/issue-182-sveikti-pasveikti-aspect/${key}-${lang}-${width}.png`,
          fullPage: true,
        });
      });
    }
  }
}
