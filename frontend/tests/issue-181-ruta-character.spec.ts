// Issue #181 — "Ona" character name ambiguity with Russian pronoun "она" (she).
// Fix: rename character Ona → Rūta. Russian form "Рута" is unambiguous (not the pronoun "она").
// The test verifies:
// 1. The hint text in the exercise shows "Рута" (not "Она"), both in RU and EN
// 2. The overview note shows character names as "Йонас и Рута" (RU) / "Jonas and Rūta" (EN)

import { test, expect } from '@playwright/test';

function makeFakeJwt(name: string): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = btoa(JSON.stringify({ email: 'test@test.com', name, exp: 9999999999 }));
  return `${header}.${payload}.fakesignature`;
}

const MOCK_LESSONS = [
  {
    id: 1,
    title: 'Урок 1 — Родительный',
    level: 'basic',
    cases: [2],
    task_count: 1,
    rules: [
      {
        question: 'Кого? Чего?',
        name_ru: 'Родительный',
        usage: 'Отсутствие, отрицание, принадлежность',
        endings_sg: '-o / -ės',
        endings_pl: '-ų / -ių',
        transform: null,
      },
    ],
    is_locked: false,
    best_score_pct: null,
  },
];

// Sentence task with Rūta instead of Ona
const MOCK_TASKS = [
  {
    type: 'sentence',
    display: 'Rūta perka spurg___.',
    answer: 'į',
    full_answer: 'spurgį',
    translation_ru: 'Рута покупает пончик.',
    translation_en: 'Rūta is buying a donut.',
    base_lt: 'spurgai',
  },
];

const MOCK_GRAMMAR_PROGRAMS_ENROLLED = [
  { id: 1, title: 'Литовские падежи', title_en: 'Lithuanian Cases', description: null, difficulty: 1, enrolled: true },
];

async function setLang(page: import('@playwright/test').Page, lang: 'en' | 'ru') {
  await page.addInitScript((l) => {
    window.localStorage.setItem('fluent_lang', l);
    window.localStorage.setItem('cookie_consent', 'accepted');
  }, lang);
}

test.describe('Issue #181 — Rūta character name (not ambiguous "Ona")', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript((token) => {
      localStorage.setItem('fluent_token', token);
    }, makeFakeJwt('Test User'));
    await page.route('**/api/grammar-programs', async (route) => {
      await route.fulfill({ json: MOCK_GRAMMAR_PROGRAMS_ENROLLED });
    });
    await page.route('**/api/grammar/lessons', async (route) => {
      await route.fulfill({ json: MOCK_LESSONS });
    });
    await page.route(/\/api\/grammar\/verb-lessons/, async (route) => {
      await route.fulfill({ json: [] });
    });
    await page.route('**/api/grammar/lessons/1/tasks', async (route) => {
      await route.fulfill({ json: MOCK_TASKS });
    });
    await page.route('**/api/grammar/lessons/1/results', async (route) => {
      await route.fulfill({ json: { ok: true, passed: true } });
    });
  });

  const SHOTS = '../temp_files/screenshots/issue-181-ruta-character';
  const CASES = [
    { lang: 'ru' as const, note: 'Йонас и Рута', hint: 'Рута покупает пончик.' },
    { lang: 'en' as const, note: 'Jonas and Rūta', hint: 'Rūta is buying a donut.' },
  ];

  for (const { lang, note, hint } of CASES) {
    test(`${lang.toUpperCase()}: overview note names Rūta and exercise hint shows "${hint}"`, async ({ page }) => {
      await setLang(page, lang);
      await page.goto('/dashboard/grammar');
      await expect(page.locator(`text=${note}`)).toBeVisible({ timeout: 5000 });
      for (const width of [1280, 375]) {
        await page.setViewportSize({ width, height: width === 375 ? 667 : 720 });
        await page.screenshot({ path: `${SHOTS}/overview-${lang}-${width}.png` });
      }

      await page.setViewportSize({ width: 1280, height: 720 });
      await page.getByTestId('level-button').first().click();
      await page.waitForSelector('input[type="text"]', { timeout: 5000 });
      await expect(page.locator(`text=${hint}`)).toBeVisible({ timeout: 3000 });
      await expect(page.locator('text=Она покупает пончик.')).not.toBeVisible();
      for (const width of [1280, 375]) {
        await page.setViewportSize({ width, height: width === 375 ? 667 : 720 });
        await page.screenshot({ path: `${SHOTS}/exercise-${lang}-${width}.png` });
      }
    });
  }
});
