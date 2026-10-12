import { test, expect, type Page } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { mockPractice } from './helpers/practiceBento';
import { USUAL, mockHome } from './helpers/effortRadar';

// #62d — Gap text: tap-to-place word bank, Check grading + results POST, no reading screen /
// text block, sticky bank at 375px, admin kind option, a gap `reading` task in the
// knowledge-check runner. Fully mocked (local backend shares the prod DB).

const SHOTS = '../temp_files/screenshots/plan_62d_practice-gap-text';
const CAT_ID = 2;
const DATA = JSON.parse(fs.readFileSync(path.join(__dirname, '../../backend/data/practice/gap_text.json'), 'utf-8'));
const SRC = DATA.tests[0];
const QS = SRC.questions.map((q: { question_lt: string; option_a: string; option_b: string }, i: number) => ({
  id: 9000 + i, question_ru: q.question_lt, question_lt: q.question_lt, option_a: q.option_a, option_b: q.option_b,
  option_c: '', option_d: '', correct_option: 'a', category: null,
}));
const N = QS.length;
const ANS: string[] = QS.map((q: { option_a: string }) => q.option_a);
const DIS: string[] = QS.map((q: { option_b: string }) => q.option_b);

type Opts = { lang?: 'ru' | 'en'; width?: number };
const shot = (page: Page, name: string, o: Opts) =>
  page.screenshot({ path: `${SHOTS}/${name}-${o.lang ?? 'ru'}-${o.width ?? 1280}.png`, fullPage: o.width !== 375 });

async function openGap(page: Page, o: Opts = {}) {
  await mockPractice(page, { enrolled: [CAT_ID], width: o.width, lang: o.lang });
  await page.route(/\/api\/practice\/categories\/\d+\/tests/, (r) => r.fulfill({ json: [{
    id: 960, title_ru: SRC.title_ru, title_en: SRC.title_en, description_ru: null, description_en: null,
    lesson_text_lt: SRC.lesson_text_lt, kind: 'gap_text', question_count: N, active_question_count: N,
    pass_threshold: 0.7, is_premium: false, is_final: false, section_ru: null, section_en: null,
    is_locked: false, best_score_pct: null,
  }] }));
  await page.route(/\/api\/practice\/tests\/\d+\/exam/, (r) => r.fulfill({ json: {
    test: { id: 960, title_ru: SRC.title_ru, title_en: SRC.title_en, pass_threshold: 0.7, lesson_text_lt: SRC.lesson_text_lt, kind: 'gap_text' },
    questions: QS,
  } }));
  const posted: { score: number; total: number }[] = [];
  await page.route(/\/api\/practice\/tests\/\d+\/results/, (r) => {
    posted.push(r.request().postDataJSON());
    return r.fulfill({ json: { ok: true } });
  });
  await page.goto(`/dashboard/practice/${CAT_ID}?test=960`);
  await expect(page.getByTestId('gap-text')).toBeVisible();
  return posted;
}

const chip = (page: Page, w: string) => page.getByTestId('gap-chip').filter({ hasText: new RegExp(`^${w}$`) });
const gap = (page: Page, n: number) => page.getByTestId(`gap-${n}`);
const fill = async (page: Page, words: string[]) => { for (const w of words) await chip(page, w).click(); };
const twoWrong = () => ANS.map((a, i) => (i === 1 || i === 4 ? DIS[i] : a));

test('fill, take back, check: marks, score and the results POST', async ({ page }) => {
  const posted = await openGap(page);
  await expect(page.getByText('{1}')).toHaveCount(0);
  await expect(page.getByTestId('question-text-block')).toHaveCount(0);
  await expect(gap(page, 1)).toHaveAttribute('aria-pressed', 'true');
  await expect(gap(page, 1)).toHaveAttribute('aria-label', 'Пропуск 1, пустой');
  await expect(page.getByTestId('gap-chip')).toHaveCount(2 * N);

  await fill(page, ANS.slice(0, 3));
  await expect(gap(page, 2)).toHaveText(ANS[1]);
  await expect(gap(page, 2)).toHaveAttribute('aria-label', `Пропуск 2: ${ANS[1]}`);
  await expect(chip(page, ANS[1])).toBeDisabled();
  await expect(gap(page, 4)).toHaveAttribute('aria-pressed', 'true');

  await gap(page, 2).click(); // take back
  await expect(chip(page, ANS[1])).toBeEnabled();
  await expect(gap(page, 2)).toHaveText('2');
  await expect(gap(page, 2)).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('gap-check')).toBeDisabled();

  await chip(page, DIS[1]).click(); // gap 2 wrong
  await fill(page, twoWrong().slice(3));
  await expect(page.getByTestId('gap-check')).toBeEnabled();
  await page.getByTestId('gap-check').click();

  await expect(page.locator('[data-result="wrong"]')).toHaveCount(2);
  await expect(page.locator('[data-result="correct"]')).toHaveCount(N - 2);
  await expect(gap(page, 5)).toContainText(ANS[4]); // wrong gap shows the right word
  await expect(page.getByTestId('gap-result')).toContainText(`Правильно ${N - 2} из ${N}`);
  await expect.poll(() => posted.length).toBe(1);
  expect(posted[0]).toEqual({ score: N - 2, total: N });
});

test('keyboard: chips and gaps are buttons', async ({ page }) => {
  await openGap(page);
  await chip(page, ANS[0]).focus();
  await page.keyboard.press('Enter');
  await expect(gap(page, 1)).toHaveText(ANS[0]);
  await gap(page, 1).focus();
  await page.keyboard.press('Enter');
  await expect(gap(page, 1)).toHaveText('1');
});

test('375px: no horizontal scroll; the sticky bank never covers Check or the last line', async ({ page }) => {
  await openGap(page, { width: 375 });
  await gap(page, N).click();
  await expect(gap(page, N)).toHaveAttribute('aria-pressed', 'true');
  const noHScroll = await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
  expect(noHScroll).toBe(true);
  await expect(page.getByTestId('gap-check')).toBeInViewport();
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  const body = (await page.getByTestId('gap-text-body').boundingBox())!;
  const bank = (await page.getByTestId('gap-bank').boundingBox())!;
  expect(body.y + body.height).toBeLessThanOrEqual(bank.y + 1);
  await expect(page.getByTestId('gap-check')).toBeInViewport();
});

// ── Admin kind select ─────────────────────────────────────────────────────────

function fakeAdminJwt(): string {
  const b = (o: object) => btoa(JSON.stringify(o));
  return `${b({ alg: 'HS256', typ: 'JWT' })}.${b({ email: 'test@test.com', name: 'Admin', is_admin: true, exp: 9999999999 })}.sig`;
}

test('admin kind select offers «Текст с пропусками»', async ({ page }) => {
  await page.addInitScript((token) => localStorage.setItem('fluent_token', token), fakeAdminJwt());
  await page.route('**/api/**', (r) => r.fulfill({ json: [] }));
  await page.route('**/api/me/quota', (r) => r.fulfill({ json: { is_superadmin: false } }));
  await page.route('**/api/admin/practice/categories', (r) => r.fulfill({ json: [
    { id: 13, name_ru: 'Текст с пропусками', name_en: 'Gap text', description_ru: null, description_en: null, sort_order: 13, test_count: 1 },
  ] }));
  await page.route('**/api/admin/practice/categories/13/tests', (r) => r.fulfill({ json: [{
    id: 960, category_id: 13, title_ru: SRC.title_ru, title_en: SRC.title_en, description_ru: null,
    description_en: null, lesson_text_lt: SRC.lesson_text_lt, question_count: N, pass_threshold: 0.7, status: 'testing',
    is_premium: false, section_ru: null, section_en: null, is_final: false, kind: 'gap_text',
    created_by: null, sort_order: 1, total_questions: N, active_questions: N,
  }] }));
  await page.goto('/dashboard/admin');
  await page.getByRole('button', { name: 'Контент' }).click();
  await page.getByRole('button', { name: 'Практика' }).first().click();
  await page.getByText('Текст с пропусками').first().click();
  await page.getByRole('button', { name: /Редакт/ }).first().click();
  await expect(page.getByTestId('admin-test-kind')).toHaveValue('gap_text');
  await expect(page.getByTestId('admin-test-kind').locator('option[value="gap_text"]')).toHaveText('Текст с пропусками');
});

// ── Knowledge-check runner ────────────────────────────────────────────────────

function kcTask(g: number, other: number) {
  const passage = SRC.lesson_text_lt.replace(/\{(\d+)\}/g, (_: string, d: string) =>
    Number(d) === g ? '___' : Number(d) === other ? '(…)' : ANS[Number(d) - 1]);
  const sentence = passage.split(/(?<=[.!?])\s+/).find((s: string) => s.includes('___'));
  return { type: 'reading', passage_kind: null, passage_lt: passage, passage_title_ru: SRC.title_ru, passage_title_en: SRC.title_en,
    question_lt: sentence, question_ru: sentence, options: [DIS[g - 1], ANS[g - 1], DIS[0], DIS[2]].filter((x, i, a) => a.indexOf(x) === i),
    answer: ANS[g - 1], instruction_ru: 'Выберите слово для пропуска', instruction_en: 'Choose the word for the gap' };
}
const KC_TASKS = [kcTask(4, 7), kcTask(7, 4)];

async function openCheck(page: Page, o: Opts = {}) {
  await mockHome(page, USUAL, o);
  await page.route('**/api/me/knowledge-check', (r) =>
    r.request().method() === 'POST'
      ? r.fulfill({ json: { id: 7, tasks: KC_TASKS } })
      : r.fulfill({ json: { latest: null, is_premium: false } }));
  await page.goto('/dashboard/check/');
  await expect(page.getByTestId('reading-task')).toBeVisible();
}

test('gap task in the knowledge-check runner', async ({ page }) => {
  await openCheck(page);
  await expect(page.getByText('Выберите слово для пропуска')).toBeVisible();
  await expect(page.getByTestId('reading-passage')).toContainText('___');
  await expect(page.getByTestId('reading-passage')).toContainText('(…)');
  await expect(page.getByRole('button', { name: ANS[3] })).toBeVisible();
});

// ── Evidence screenshots: RU + EN, 1280 + 375 ─────────────────────────────────

for (const lang of ['ru', 'en'] as const) {
  for (const width of [1280, 375]) {
    const o: Opts = { lang, width };
    test(`screenshots ${lang} ${width}`, async ({ page }) => {
      await openGap(page, o);
      await shot(page, '01-empty-start', o);
      await fill(page, twoWrong().slice(0, 5));
      await shot(page, '02-half-filled', o);
      await fill(page, twoWrong().slice(5));
      await gap(page, N).click(); // take the last word back …
      await chip(page, ANS[N - 1]).click(); // … and place it again
      await shot(page, '03-all-filled', o);
      await gap(page, N).click();
      await gap(page, N).scrollIntoViewIfNeeded();
      await shot(page, '05-bank-with-low-gap-active', o);
      await chip(page, ANS[N - 1]).click();
      await page.getByTestId('gap-check').click();
      await expect(page.getByTestId('gap-result')).toBeVisible();
      await page.evaluate(() => window.scrollTo(0, 0));
      await shot(page, '04-after-check', o);
      if (width === 375) {
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
      }
      await page.unrouteAll({ behavior: 'ignoreErrors' });
      await openCheck(page, o);
      await shot(page, '06-check-gap-task', o);
    });
  }
}
