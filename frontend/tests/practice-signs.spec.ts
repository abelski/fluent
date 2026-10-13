import { test, expect, type Page } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { mockPractice, CATEGORIES } from './helpers/practiceBento';
import { USUAL, mockHome } from './helpers/effortRadar';

// #62e — Signs and notices: a photo (+ credit) above the question, none when unset, no reading
// view, admin image fields set/clear, a sign `reading` task in the knowledge-check runner.
// Fully mocked (the local backend shares the prod DB); images are the real files in public/img/signs.

const SHOTS = '../temp_files/screenshots/plan_62e_practice-signs-notices';
const CAT_ID = 14;
const DATA = JSON.parse(fs.readFileSync(path.join(__dirname, '../../backend/data/practice/signs.json'), 'utf-8'));
const SRC = DATA.tests[0];
type SrcQ = { question_lt: string; options: string[]; correct_option: string; image_url: string; image_credit?: string };
const QS = SRC.questions.map((q: SrcQ, i: number) => ({
  id: 9100 + i, question_ru: q.question_lt, question_lt: q.question_lt,
  option_a: q.options[0], option_b: q.options[1], option_c: q.options[2] ?? '', option_d: q.options[3] ?? '',
  correct_option: q.correct_option, category: null, image_url: q.image_url, image_credit: q.image_credit ?? null,
}));
// A CC0 photo first (no credit line) for the credit/no-credit check.
const CC0 = DATA.tests[0].questions.findIndex((q: SrcQ) => !q.image_credit);

type Opts = { lang?: 'ru' | 'en'; width?: number };
const shot = (page: Page, name: string, o: Opts) =>
  page.screenshot({ path: `${SHOTS}/${name}-${o.lang ?? 'ru'}-${o.width ?? 1280}.png`, fullPage: o.width !== 375 });

const SIGNS_CAT = {
  id: CAT_ID, name_ru: DATA.category.name_ru, name_en: DATA.category.name_en, sort_order: 14, source_url: null,
  description_ru: DATA.category.description_ru, description_en: DATA.category.description_en,
};

async function mockSigns(page: Page, questions: unknown[], o: Opts = {}) {
  await mockPractice(page, { enrolled: [CAT_ID], width: o.width, lang: o.lang });
  await page.route('**/api/practice/categories', (r) => r.fulfill({ json: [...CATEGORIES, SIGNS_CAT].map((c) => ({
    ...c, test_count: c.id === CAT_ID ? 5 : 3, enrolled: c.id === CAT_ID })) }));
  await page.route(/\/api\/practice\/categories\/\d+\/tests/, (r) => r.fulfill({ json: DATA.tests.map((t: { title_ru: string; title_en: string; questions: unknown[] }, i: number) => ({
    id: 970 + i, title_ru: t.title_ru, title_en: t.title_en, description_ru: null, description_en: null,
    lesson_text_lt: null, kind: 'choice', question_count: t.questions.length, active_question_count: t.questions.length,
    pass_threshold: 0.7, is_premium: false, is_final: false, section_ru: null, section_en: null,
    is_locked: false, best_score_pct: null,
  })) }));
  await page.route(/\/api\/practice\/tests\/\d+\/exam/, (r) => r.fulfill({ json: {
    test: { id: 970, title_ru: SRC.title_ru, title_en: SRC.title_en, pass_threshold: 0.7, lesson_text_lt: null, kind: 'choice' },
    questions,
  } }));
  await page.route(/\/api\/practice\/tests\/\d+\/results/, (r) => r.fulfill({ json: { ok: true } }));
}

async function openTest(page: Page, questions: unknown[], o: Opts = {}) {
  await mockSigns(page, questions, o);
  await page.goto(`/dashboard/practice/${CAT_ID}?test=970`);
  await expect(page.getByTestId('question-image').or(page.getByText(QS[0].question_lt)).first()).toBeVisible();
}

const noHScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);

test('photo above the question with alt text; credit line only for credited photos; no reading view', async ({ page }) => {
  const credited = QS.find((q: { image_credit: string | null }) => q.image_credit)!;
  await openTest(page, [credited]);
  const img = page.getByTestId('question-image').locator('img');
  await expect(img).toHaveAttribute('src', credited.image_url);
  await expect(img).toHaveAttribute('alt', credited.question_lt);
  await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)).toBe(true);
  await expect(page.getByTestId('question-image-credit')).toHaveText(`Фото: ${credited.image_credit}`);
  const imgBox = (await img.boundingBox())!;
  const qBox = (await page.getByText(credited.question_lt, { exact: true }).boundingBox())!;
  expect(imgBox.y + imgBox.height).toBeLessThanOrEqual(qBox.y);
  await expect(page.getByTestId('reading-passage')).toHaveCount(0);
});

test('CC0 photo: image, no credit line', async ({ page }) => {
  test.skip(CC0 < 0, 'first test has no CC0 photo');
  await openTest(page, [QS[CC0]]);
  await expect(page.getByTestId('question-image')).toBeVisible();
  await expect(page.getByTestId('question-image-credit')).toHaveCount(0);
});

test('question without image_url renders no <img> and no credit', async ({ page }) => {
  await openTest(page, [{ ...QS[0], image_url: null, image_credit: null }]);
  await expect(page.getByText(QS[0].question_lt, { exact: true })).toBeVisible();
  await expect(page.getByTestId('question-image')).toHaveCount(0);
  await expect(page.getByTestId('question-image-credit')).toHaveCount(0);
});

test('375px: no horizontal overflow, the photo fits the card', async ({ page }) => {
  await openTest(page, [QS[0]], { width: 375 });
  expect(await noHScroll(page)).toBe(true);
  const box = (await page.getByTestId('question-image').locator('img').boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(375);
  expect(box.height).toBeLessThanOrEqual(321);
});

// ── Admin image fields ────────────────────────────────────────────────────────

function fakeAdminJwt(): string {
  const b = (o: object) => btoa(JSON.stringify(o));
  return `${b({ alg: 'HS256', typ: 'JWT' })}.${b({ email: 'test@test.com', name: 'Admin', is_admin: true, exp: 9999999999 })}.sig`;
}

async function openAdminQuestions(page: Page, o: Opts = {}) {
  await page.addInitScript(([token, lang]) => { localStorage.setItem('fluent_token', token); localStorage.setItem('fluent_lang', lang); }, [fakeAdminJwt(), o.lang ?? 'ru'] as const);
  await page.setViewportSize({ width: o.width ?? 1280, height: 900 });
  const patches: Record<string, unknown>[] = [];
  await page.route('**/api/**', (r) => r.fulfill({ json: [] }));
  await page.route('**/api/me/quota', (r) => r.fulfill({ json: { is_superadmin: false } }));
  await page.route('**/api/admin/practice/categories', (r) => r.fulfill({ json: [
    { ...SIGNS_CAT, test_count: 5 },
  ] }));
  await page.route(`**/api/admin/practice/categories/${CAT_ID}/tests`, (r) => r.fulfill({ json: [{
    id: 970, category_id: CAT_ID, title_ru: SRC.title_ru, title_en: SRC.title_en, description_ru: null,
    description_en: null, lesson_text_lt: null, question_count: 6, pass_threshold: 0.7, status: 'testing',
    is_premium: false, section_ru: null, section_en: null, is_final: false, kind: 'choice',
    created_by: null, sort_order: 1, total_questions: 6, active_questions: 6,
  }] }));
  await page.route('**/api/admin/practice/tests/970/questions', (r) => r.fulfill({ json: QS.map((q: object, i: number) => ({ ...q, is_active: true, sort_order: i })) }));
  await page.route('**/api/admin/practice/questions/*', (r) => { patches.push(r.request().postDataJSON()); return r.fulfill({ json: { ok: true } }); });
  await page.goto('/dashboard/admin');
  await page.getByRole('button', { name: o.lang === 'en' ? 'Content' : 'Контент' }).click();
  await page.getByRole('button', { name: o.lang === 'en' ? 'Tests' : 'Практика' }).first().click();
  await page.getByText(o.lang === 'en' ? DATA.category.name_ru : DATA.category.name_ru).first().click();
  await page.getByText(SRC.title_ru).first().click();
  await page.getByRole('button', { name: o.lang === 'en' ? 'Edit' : 'Редактировать' }).first().click();
  return patches;
}

test('admin fields show, set and clear the image and the credit', async ({ page }) => {
  const patches = await openAdminQuestions(page);
  await expect(page.getByTestId('admin-q-image-url')).toHaveValue(QS[0].image_url);
  await expect(page.getByTestId('admin-q-image-credit')).toHaveValue(QS[0].image_credit ?? '');
  await page.getByTestId('admin-q-image-url').fill('');
  await page.getByTestId('admin-q-image-credit').fill('');
  await page.getByRole('button', { name: 'Сохранить' }).first().click();
  await expect.poll(() => patches.length).toBe(1);
  expect(patches[0]).toMatchObject({ image_url: '', image_credit: '' });
});

// ── Knowledge-check runner ────────────────────────────────────────────────────

const KC_TASKS = [QS[0], QS[1]].map((q) => ({
  type: 'reading', passage_lt: '', passage_title_ru: SRC.title_ru, passage_title_en: SRC.title_en,
  question_lt: q.question_lt, question_ru: q.question_ru,
  options: [q.option_a, q.option_b, q.option_c, q.option_d].filter(Boolean),
  answer: q[`option_${q.correct_option}` as 'option_a'], image_url: q.image_url, image_credit: q.image_credit,
  instruction_ru: 'Посмотри на фото и ответь на вопрос', instruction_en: 'Look at the photo and answer the question',
}));

async function openCheck(page: Page, o: Opts = {}) {
  await mockHome(page, USUAL, o);
  await page.route('**/api/me/knowledge-check', (r) =>
    r.request().method() === 'POST'
      ? r.fulfill({ json: { id: 7, tasks: KC_TASKS } })
      : r.fulfill({ json: { latest: null, is_premium: false } }));
  await page.goto('/dashboard/check/');
  await expect(page.getByTestId('reading-task')).toBeVisible();
}

test('sign task in the knowledge-check runner shows the photo', async ({ page }) => {
  await openCheck(page);
  await expect(page.getByText('Посмотри на фото и ответь на вопрос')).toBeVisible();
  await expect(page.getByTestId('reading-image').locator('img')).toHaveAttribute('src', KC_TASKS[0].image_url);
  await expect(page.getByTestId('reading-passage')).toHaveCount(0);
});

// ── Evidence screenshots: RU + EN, 1280 + 375 ─────────────────────────────────

for (const lang of ['ru', 'en'] as const) {
  for (const width of [1280, 375]) {
    const o: Opts = { lang, width };
    test(`screenshots ${lang} ${width}`, async ({ page }) => {
      await mockSigns(page, QS, o);
      await page.goto('/dashboard/practice');
      await expect(page.getByText(lang === 'en' ? DATA.category.name_en : DATA.category.name_ru).first()).toBeVisible();
      await shot(page, '01-category-in-list', o);
      await page.unrouteAll({ behavior: 'ignoreErrors' });

      await openTest(page, [QS[CC0 >= 0 ? CC0 : 0]], o);
      await page.waitForFunction(() => Array.from(document.images).every((i) => i.complete));
      await shot(page, '02-question-photo', o);
      await page.unrouteAll({ behavior: 'ignoreErrors' });

      const credited = QS.find((q: { image_credit: string | null }) => q.image_credit)!;
      await openTest(page, [credited], o);
      await page.waitForFunction(() => Array.from(document.images).every((i) => i.complete));
      await shot(page, '03-credited-photo', o);
      await page.getByText(credited[`option_${credited.correct_option}`], { exact: true }).click();
      await page.getByRole('button', { name: lang === 'en' ? 'Submit answer' : 'Ответить' }).click();
      await shot(page, '04-answered', o);
      if (width === 375) expect(await noHScroll(page)).toBe(true);
      await page.unrouteAll({ behavior: 'ignoreErrors' });

      await openAdminQuestions(page, o);
      await shot(page, '05-admin-image-fields', o);
      await page.unrouteAll({ behavior: 'ignoreErrors' });

      await openCheck(page, o);
      await page.waitForFunction(() => Array.from(document.images).every((i) => i.complete));
      await shot(page, '06-check-sign-task', o);
    });
  }
}
