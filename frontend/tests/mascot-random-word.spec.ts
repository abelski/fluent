import { test, expect, type Page } from '@playwright/test';

// #44 — TAK on /dashboard/lists says a random easy word ("labas = hello")
// from GET /api/words/random-easy instead of the fixed "Sveikas!".

const SHOTS = '../temp_files/screenshots/plan_46_phrases-mascot-random-phrase/words';

function makeFakeJwt(name: string): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = btoa(JSON.stringify({ email: 'test@test.com', name, exp: 9999999999 }));
  return `${header}.${payload}.fakesignature`;
}

const SHORT = { lithuanian: 'Labas', translation_en: 'hello', translation_ru: 'привет' };
const LONG = { lithuanian: 'Atsistatydinti atsistatydina atsistatydino', translation_en: 'to resign', translation_ru: 'подать в отставку' };

async function setup(page: Page, lang: 'ru' | 'en', word: object | null) {
  await page.addInitScript(([token, l]) => {
    localStorage.setItem('fluent_token', token as string);
    localStorage.setItem('fluent_lang', l as string);
  }, [makeFakeJwt('Test User'), lang] as const);
  await page.route('**/api/words/random-easy', (route) =>
    word ? route.fulfill({ json: word }) : route.fulfill({ status: 500, body: '' }));
  await page.route('**/api/me/quota', (route) => route.fulfill({ json: { premium_active: true, sessions_today: 0, daily_limit: null } }));
  await page.route('**/api/me/stats', (route) => route.fulfill({ json: { known: 42, streak: 0, mistakes: 0, due_review: 3 } }));
  await page.route('**/api/me/lists-progress', (route) => route.fulfill({ json: {} }));
  await page.route('**/api/subcategory-meta', (route) => route.fulfill({ json: {} }));
  await page.route('**/api/lists', (route) => route.fulfill({ json: [] }));
  await page.route('**/api/me/programs', (route) => route.fulfill({ json: [] }));
  await page.route('**/api/me/custom-programs', (route) => route.fulfill({ json: [] }));
}

test.describe('Lists-page mascot random word', () => {
  test('RU shows lithuanian = russian translation', async ({ page }) => {
    await setup(page, 'ru', SHORT);
    await page.goto('/dashboard/lists');
    await expect(page.getByTestId('mascot-greeting')).toHaveText('Labas');
    await expect(page.getByTestId('mascot-translation')).toHaveText('привет');
  });

  test('EN shows lithuanian = english translation', async ({ page }) => {
    await setup(page, 'en', SHORT);
    await page.goto('/dashboard/lists');
    await expect(page.getByTestId('mascot-greeting')).toHaveText('Labas');
    await expect(page.getByTestId('mascot-translation')).toHaveText('hello');
  });

  test('falls back to Sveikas! when the endpoint fails', async ({ page }) => {
    await setup(page, 'ru', null);
    await page.goto('/dashboard/lists');
    await expect(page.getByTestId('stats-card-words')).toBeVisible();
    await expect(page.getByTestId('mascot-greeting')).toHaveText('Sveikas!');
  });

  for (const lang of ['ru', 'en'] as const) {
    for (const [label, size] of [['desktop', { width: 1280, height: 900 }], ['mobile', { width: 375, height: 800 }]] as const) {
      for (const [wname, word] of [['short', SHORT], ['long', LONG]] as const) {
        test(`screenshot ${lang} ${label} ${wname}`, async ({ page }) => {
          await page.setViewportSize(size);
          await setup(page, lang, word);
          await page.goto('/dashboard/lists');
          await expect(page.getByTestId('mascot-greeting')).toContainText(word.lithuanian);
          await page.screenshot({ path: `${SHOTS}/${lang}-${label}-${wname}.png`, animations: 'disabled' });
        });
      }
    }
  }
});
