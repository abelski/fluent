import { test, expect, type Page } from '@playwright/test';
import { makeFakeJwt } from './helpers/grammarBento';
import { readFileSync } from 'fs';
import { join } from 'path';

// #62h — «Время и количество» grammar program. Screenshot driver only: the lesson UI is the
// one #62f covers (grammar-adjectives.spec.ts). Fully mocked; RU/EN × 1280/375.

const SHOTS = '../temp_files/screenshots/plan_62h_grammar-time-quantity';
const NAMES = ['Laikas: Kelinta valanda? (Vardininkas)', 'Laikas: pusė, nuo … iki (Kilmininkas)',
  'Kiekis: Kilmininkas Vns.', 'Kiekis: Kilmininkas Dgs.'];

const CONFIG = {
  lessons: [] as unknown[],
  cases: Object.fromEntries(NAMES.map((n, i) => [String(31 + i), [n, 'Laikas ir kiekis']])),
};

const PROGRAMS = [{
  id: 12, title: 'Время и количество', title_en: 'Time and quantity',
  description: 'Который час по-литовски и сколько чего: trečia valanda, pusė ketvirtos, nuo devintos iki penktos, puodelis kavos, kilogramas obuolių.',
  description_en: 'Telling the time and saying how much in Lithuanian: trečia valanda, pusė ketvirtos, nuo devintos iki penktos, puodelis kavos, kilogramas obuolių.',
  difficulty: 2, lesson_filter: '["Laikas ir kiekis"]', program_type: 'cases', is_public: false,
}];

// Each topic gets its own rule card, straight from the seed data.
const SEED = JSON.parse(readFileSync(join(__dirname, '../../backend/data/grammar/programs/time_quantity.json'), 'utf-8'));
const ARTICLE_TITLES: Record<string, [string, string]> = {
  'numbers-03-time': ['Время по-литовски: часы, полчаса и расписания', 'Telling the time in Lithuanian'],
};
const RULES: Record<number, unknown> = Object.fromEntries(SEED.rules.map((r: Record<string, string>) => {
  const [ru, en] = ARTICLE_TITLES[r.article_slug] ?? [r.article_slug, r.article_slug];
  return [Number(r.case_index), { ...r, article_title_ru: ru, article_title_en: en }];
}));

const LESSONS = NAMES.flatMap((n, i) => (['basic', 'advanced', 'practice'] as const).map((level, j) => ({
  id: 166 + 6 * i + j, title: n, level, cases: [31 + i], task_count: [24, 35, 20][j],
  rules: [RULES[31 + i]], is_locked: false, best_score_pct: null,
})));

const TASKS: Record<number, unknown[]> = {
  172: [{ type: 'sentence', display: 'Dabar pusė ketvirt___.', answer: 'os', full_answer: 'ketvirtos',
    options: ['ketvirta', 'ketvirtos', 'ketvirtą', 'ketvirtoje'], translation_ru: 'Сейчас 3:30.', translation_en: "It's 3:30." }],
  173: [{ type: 'sentence', display: 'Aš kasdien dirbu nuo devint___ iki penktos.', answer: 'os', full_answer: 'devintos',
    translation_ru: 'Я каждый день работаю с 9 до 5.', translation_en: 'I work from 9 to 5 every day.' }],
  174: [{ type: 'sentence', display: 'Jau pusė ___.', answer: 'dvyliktos', full_answer: 'dvyliktos',
    translation_ru: 'Уже 11:30.', translation_en: "It's already 11:30." }],
  178: [{ type: 'sentence', display: 'Ar norėtum puodelio kav___?', answer: 'os', full_answer: 'kavos',
    options: ['kava', 'kavos', 'kavą', 'kavoje'], translation_ru: 'Хочешь чашку кофе?',
    translation_en: 'Would you like a cup of coffee?', base_lt: 'kava' }],
};

async function mock(page: Page, lang: 'ru' | 'en', width: number) {
  await page.addInitScript(([token, l]) => {
    localStorage.setItem('fluent_token', token);
    localStorage.setItem('fluent_lang', l);
    localStorage.setItem('cookie_consent', 'accepted');
  }, [makeFakeJwt(), lang] as const);
  await page.setViewportSize({ width, height: 900 });
  await page.route('**/api/**', (r) => r.fulfill({ json: [] }));
  await page.route('**/api/billing/config', (r) => r.fulfill({ json: { enabled: true } }));
  await page.route('**/api/me/quota', (r) => r.fulfill({ json: {
    is_premium: false, premium_active: false, premium_until: null, sessions_today: 0,
    daily_limit: 10, is_admin: true, is_superadmin: false } }));
  await page.route('**/api/admin/grammar/config', (r) => r.fulfill({ json: CONFIG }));
  await page.route('**/api/grammar-programs', (r) => r.fulfill({ json: PROGRAMS.map((p) => ({ ...p, enrolled: true })) }));
  await page.route('**/api/grammar/lessons', (r) => r.fulfill({ json: LESSONS }));
  await page.route(/\/api\/grammar\/lessons\/\d+\/tasks/, (r) => {
    const id = Number(new URL(r.request().url()).pathname.split('/')[4]);
    return r.fulfill({ json: TASKS[id] ?? [] });
  });
}

// Level buttons: topic i → basic/advanced/practice = 3i, 3i+1, 3i+2.
async function startLevel(page: Page, n: number) {
  await page.goto('/dashboard/grammar');
  await page.getByTestId('category-program-12').click();
  await page.getByTestId('topics-section').getByTestId('level-button').nth(n).click();
  await expect(page.getByTestId('task-counter')).toBeVisible();
}

for (const lang of ['ru', 'en'] as const) {
  for (const width of [1280, 375]) {
    const tag = `${lang}-${width}`;
    test.describe(`#62h time and quantity — ${tag}`, () => {
      test('basic time task: 4 ordinal forms', async ({ page }) => {
        await mock(page, lang, width);
        await startLevel(page, 3);
        await expect(page.getByTestId('grammar-options').getByRole('button')).toHaveCount(4);
        await page.screenshot({ path: `${SHOTS}/1-basic-time-${tag}.png`, fullPage: true });
      });

      test('basic quantity task with the «от: kava» hint', async ({ page }) => {
        await mock(page, lang, width);
        await startLevel(page, 6);
        await expect(page.getByTestId('grammar-options').getByRole('button')).toHaveCount(4);
        await expect(page.locator(`text=/${lang === 'ru' ? 'от' : 'from'}:\\s*kava/`)).toBeVisible();
        await page.screenshot({ path: `${SHOTS}/2-basic-quantity-${tag}.png`, fullPage: true });
      });

      test('advanced task with the rule card open', async ({ page }) => {
        await mock(page, lang, width);
        await startLevel(page, 4);
        await page.getByRole('button', { name: lang === 'ru' ? 'Грамматическая подсказка' : 'Grammar hint' }).click();
        await expect(page.getByText(lang === 'ru' ? 'Время: pusė, nuo … iki' : 'Time: pusė, nuo … iki').first()).toBeVisible();
        await page.screenshot({ path: `${SHOTS}/3-advanced-rule-${tag}.png`, fullPage: true });
      });

      test('practice time task: stem stripped, translation visible', async ({ page }) => {
        await mock(page, lang, width);
        await startLevel(page, 5);
        await expect(page.getByText(lang === 'ru' ? 'Уже 11:30.' : "It's already 11:30.")).toBeVisible();
        await page.screenshot({ path: `${SHOTS}/4-practice-time-${tag}.png`, fullPage: true });
      });
    });
  }
}
