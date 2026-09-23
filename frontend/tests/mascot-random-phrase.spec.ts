import { test, expect, type Page } from '@playwright/test';

// #46 — TAK on /dashboard/phrases says a random phrase ("Labas rytas! = Good morning!")
// from GET /api/phrases/random instead of the fixed "Sveikas!".

const SHOTS = '../temp_files/screenshots/plan_46_phrases-mascot-random-phrase';

function makeFakeJwt(name: string): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = btoa(JSON.stringify({ email: 'test@test.com', name, exp: 9999999999 }));
  return `${header}.${payload}.fakesignature`;
}

const SHORT = { text: 'Labas rytas!', translation: 'Доброе утро!', translation_en: 'Good morning!' };
const LONG = {
  text: 'Mėgstu klausyti muzikos, plaukioti baseine, žaisti šachmatais.',
  translation: 'Люблю слушать музыку, плавать в бассейне, играть в шахматы.',
  translation_en: 'I like listening to music, swimming, playing chess.',
};

async function setup(page: Page, lang: 'ru' | 'en', phrase: object | null) {
  await page.addInitScript(([token, l]) => {
    localStorage.setItem('fluent_token', token as string);
    localStorage.setItem('fluent_lang', l as string);
  }, [makeFakeJwt('Test User'), lang] as const);
  await page.route('**/api/phrases/random', (route) =>
    phrase ? route.fulfill({ json: phrase }) : route.fulfill({ status: 500, body: '' }));
  await page.route('**/api/me/quota', (route) => route.fulfill({ json: { premium_active: true, sessions_today: 0, daily_limit: null } }));
  await page.route('**/api/me/stats', (route) => route.fulfill({ json: { known: 42, streak: 0, mistakes: 0, due_review: 3, phrases_learned: 12, phrases_due_review: 2 } }));
  await page.route('**/api/phrase-programs', (route) => route.fulfill({ json: [] }));
  await page.route('**/api/me/phrase-lists', (route) => route.fulfill({ json: [] }));
}

test.describe('Phrases-page mascot random phrase', () => {
  test('RU shows phrase = russian translation', async ({ page }) => {
    await setup(page, 'ru', SHORT);
    await page.goto('/dashboard/phrases');
    await expect(page.getByTestId('mascot-greeting')).toHaveText('Labas rytas! = Доброе утро!');
  });

  test('EN shows phrase = english translation', async ({ page }) => {
    await setup(page, 'en', SHORT);
    await page.goto('/dashboard/phrases');
    await expect(page.getByTestId('mascot-greeting')).toHaveText('Labas rytas! = Good morning!');
  });

  test('falls back to Sveikas! when the endpoint fails', async ({ page }) => {
    await setup(page, 'ru', null);
    await page.goto('/dashboard/phrases');
    await expect(page.getByTestId('stats-card-phrases')).toBeVisible();
    await expect(page.getByTestId('mascot-greeting')).toHaveText('Sveikas!');
  });

  for (const lang of ['ru', 'en'] as const) {
    for (const [label, size] of [['desktop', { width: 1280, height: 900 }], ['mobile', { width: 375, height: 800 }]] as const) {
      for (const [pname, phrase] of [['short', SHORT], ['long', LONG]] as const) {
        test(`screenshot ${lang} ${label} ${pname}`, async ({ page }) => {
          await page.setViewportSize(size);
          await setup(page, lang, phrase);
          await page.goto('/dashboard/phrases');
          await expect(page.getByTestId('mascot-greeting')).toContainText(phrase.text);
          await page.screenshot({ path: `${SHOTS}/${lang}-${label}-${pname}.png`, animations: 'disabled' });
        });
      }
    }
  }
});
