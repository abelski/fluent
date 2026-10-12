import { test, expect, type Page } from '@playwright/test';
import { mockPractice } from './helpers/practiceBento';
import { USUAL, mockHome } from './helpers/effortRadar';

// #62c — Dialogues: the transcript grows turn by turn with the *correct* replies, no raw `**`,
// the admin kind select, and a dialogue `reading` task in the knowledge-check runner.
// Fully mocked (local backend shares the prod DB).

const SHOTS = '../temp_files/screenshots/plan_62c_practice-dialogues';
const CAT_ID = 2; // reuse the mocked category's routes, swap in our own tests/exam

const TURN = (id: number, lt: string, opts: [string, string, string, string], correct: string) => ({
  id, question_ru: lt, question_lt: lt, option_a: opts[0], option_b: opts[1], option_c: opts[2],
  option_d: opts[3], correct_option: correct, category: null,
});
const TURNS = [
  TURN(1, '**Vaistininkė:** Laba diena. Kuo galiu jums padėti?',
    ['Viso gero!', 'Mokėsiu kortele.', 'Gal turite vaistų nuo kosulio?', 'Tris kartus per dieną.'], 'c'),
  TURN(2, '**Vaistininkė:** Taip. Ar turite alergiją vaistams?',
    ['Ne, neturiu.', 'Ne, nevairuoju.', 'Mokėsiu kortele.', 'Ačiū, viso gero!'], 'a'),
  TURN(3, '**Vaistininkė:** Šie vaistai kainuoja penkis eurus.',
    ['Ne, neturiu.', 'Mokėsiu kortele.', 'Labas rytas!', 'Tris kartus per dieną.'], 'b'),
];

type Opts = { lang?: 'ru' | 'en'; width?: number };
const shot = (page: Page, name: string, o: Opts) =>
  page.screenshot({ path: `${SHOTS}/${name}-${o.lang ?? 'ru'}-${o.width ?? 1280}.png`, fullPage: true });

const L = (o: Opts) => o.lang === 'en'
  ? { submit: 'Submit answer', next: /Next/, finish: 'Finish' }
  : { submit: 'Ответить', next: /Следующий/, finish: 'Завершить' };

async function openDialogue(page: Page, o: Opts = {}) {
  await mockPractice(page, { enrolled: [CAT_ID], width: o.width, lang: o.lang });
  await page.route(/\/api\/practice\/categories\/\d+\/tests/, (r) => r.fulfill({ json: [{
    id: 950, title_ru: 'В аптеке', title_en: 'At the pharmacy', description_ru: 'Фармацевт и покупатель',
    description_en: 'A pharmacist and a customer', lesson_text_lt: null, kind: 'dialogue',
    question_count: 3, active_question_count: 3, pass_threshold: 0.7, is_premium: false, is_final: false,
    section_ru: null, section_en: null, is_locked: false, best_score_pct: null,
  }] }));
  await page.route(/\/api\/practice\/tests\/\d+\/exam/, (r) => r.fulfill({ json: {
    test: { id: 950, title_ru: 'В аптеке', title_en: 'At the pharmacy', pass_threshold: 0.7, lesson_text_lt: null, kind: 'dialogue' },
    questions: TURNS,
  } }));
  await page.route(/\/api\/practice\/tests\/\d+\/results/, (r) => r.fulfill({ json: { ok: true } }));
  await page.goto(`/dashboard/practice/${CAT_ID}?test=950`);
  await expect(page.getByTestId('dialogue-transcript')).toBeVisible();
}

const optionRows = (page: Page) => page.locator('button').filter({ has: page.locator('span', { hasText: /^[A-D]$/ }) });
const transcript = (page: Page) => page.getByTestId('dialogue-transcript');
const noRawStars = async (page: Page) => expect(await page.locator('body').innerText()).not.toContain('**');

test('transcript grows turn by turn; a wrong pick still continues with the correct reply', async ({ page }) => {
  await openDialogue(page);
  await expect(transcript(page)).toContainText('Kuo galiu jums padėti?');
  await expect(transcript(page)).not.toContainText('Jūs');
  await noRawStars(page);

  await optionRows(page).nth(2).click(); // correct
  await page.getByRole('button', { name: 'Ответить' }).click();
  await page.getByRole('button', { name: /Следующий/ }).click();
  await expect(transcript(page)).toContainText('Gal turite vaistų nuo kosulio?');
  await expect(transcript(page)).toContainText('Ar turite alergiją vaistams?');

  await optionRows(page).nth(1).click(); // wrong: "Ne, nevairuoju."
  await page.getByRole('button', { name: 'Ответить' }).click();
  await expect(optionRows(page).nth(1)).toHaveClass(/bg-red-50/);
  await page.getByRole('button', { name: /Следующий/ }).click();
  await expect(transcript(page)).toContainText('Ne, neturiu.');
  await expect(transcript(page)).not.toContainText('nevairuoju');
  await noRawStars(page);

  await optionRows(page).nth(1).click();
  await page.getByRole('button', { name: 'Ответить' }).click();
  await page.getByRole('button', { name: 'Завершить' }).click();
  await expect(page.getByText(/Правильно 2 из 3/)).toBeVisible();
  await noRawStars(page);
});

// ── Admin kind select ─────────────────────────────────────────────────────────

function fakeAdminJwt(): string {
  const b = (o: object) => btoa(JSON.stringify(o));
  return `${b({ alg: 'HS256', typ: 'JWT' })}.${b({ email: 'test@test.com', name: 'Admin', is_admin: true, exp: 9999999999 })}.sig`;
}

async function openAdmin(page: Page, o: Opts = {}) {
  if (o.width) await page.setViewportSize({ width: o.width, height: 800 });
  await page.addInitScript(([token, lang]) => {
    localStorage.setItem('fluent_token', token);
    if (lang) localStorage.setItem('fluent_lang', lang);
  }, [fakeAdminJwt(), o.lang ?? ''] as const);
  await page.route('**/api/**', (r) => r.fulfill({ json: [] }));
  await page.route('**/api/me/quota', (r) => r.fulfill({ json: { is_superadmin: false } }));
  await page.route('**/api/admin/practice/categories', (r) => r.fulfill({ json: [
    { id: 12, name_ru: 'Диалоги', name_en: 'Dialogues', description_ru: null, description_en: null, sort_order: 12, test_count: 1 },
  ] }));
  const patches: Record<string, unknown>[] = [];
  await page.route('**/api/admin/practice/tests/950', (r) => {
    patches.push(r.request().postDataJSON());
    return r.fulfill({ json: { ok: true } });
  });
  await page.route('**/api/admin/practice/categories/12/tests', (r) => r.fulfill({ json: [{
    id: 950, category_id: 12, title_ru: 'В аптеке', title_en: 'At the pharmacy', description_ru: null,
    description_en: null, lesson_text_lt: null, question_count: 5, pass_threshold: 0.7, status: 'testing',
    is_premium: false, section_ru: null, section_en: null, is_final: false, kind: 'dialogue',
    created_by: null, sort_order: 1, total_questions: 5, active_questions: 5,
  }] }));
  await page.goto('/dashboard/admin');
  await page.getByRole('button', { name: o.lang === 'en' ? 'Content' : 'Контент' }).click();
  await page.getByRole('button', { name: o.lang === 'en' ? 'Tests' : 'Практика' }).first().click();
  await page.getByText(o.lang === 'en' ? 'Dialogues' : 'Диалоги').first().click();
  await page.getByRole('button', { name: o.lang === 'en' ? 'Edit' : /Редакт/ }).first().click();
  return patches;
}

test('admin form shows the kind and keeps it on save', async ({ page }) => {
  const patches = await openAdmin(page);
  await expect(page.getByTestId('admin-test-kind')).toHaveValue('dialogue');
  await page.getByRole('button', { name: 'Сохранить' }).click();
  await expect.poll(() => patches.length).toBe(1);
  expect(patches[0].kind).toBe('dialogue');
});

// ── Knowledge-check runner ────────────────────────────────────────────────────

const KC_TASKS = [
  { type: 'reading', passage_kind: 'dialogue', passage_lt: '', passage_title_ru: 'В аптеке', passage_title_en: 'At the pharmacy',
    question_lt: TURNS[0].question_lt, question_ru: TURNS[0].question_lt, options: [TURNS[0].option_a, TURNS[0].option_b, TURNS[0].option_c, TURNS[0].option_d],
    answer: TURNS[0].option_c, instruction_ru: 'Выберите наиболее подходящую фразу', instruction_en: 'Choose the most suitable phrase' },
  { type: 'reading', passage_kind: 'dialogue', passage_title_ru: 'В аптеке', passage_title_en: 'At the pharmacy',
    passage_lt: `${TURNS[0].question_lt}\n**Jūs:** ${TURNS[0].option_c}\n${TURNS[1].question_lt}\n**Jūs:** ${TURNS[1].option_a}`,
    question_lt: TURNS[2].question_lt, question_ru: TURNS[2].question_lt, options: [TURNS[2].option_a, TURNS[2].option_b, TURNS[2].option_c, TURNS[2].option_d],
    answer: TURNS[2].option_b, instruction_ru: 'Выберите наиболее подходящую фразу', instruction_en: 'Choose the most suitable phrase' },
];

async function openCheck(page: Page, o: Opts = {}) {
  await mockHome(page, USUAL, o);
  await page.route('**/api/me/knowledge-check', (r) =>
    r.request().method() === 'POST'
      ? r.fulfill({ json: { id: 7, tasks: KC_TASKS } })
      : r.fulfill({ json: { latest: null, is_premium: false } }));
  await page.goto('/dashboard/check/');
  await expect(page.getByTestId('reading-task')).toBeVisible();
}

test('dialogue task in the knowledge-check runner', async ({ page }) => {
  await openCheck(page);
  await expect(page.getByText('Выберите наиболее подходящую фразу')).toBeVisible();
  await expect(page.getByTestId('reading-passage')).toHaveCount(0); // turn 1: empty passage hidden
  await expect(page.getByTestId('reading-task')).toContainText('Vaistininkė');
  await noRawStars(page);
  await page.getByRole('button', { name: TURNS[0].option_c }).click();
  const passage = page.getByTestId('reading-passage');
  await expect(passage).toContainText('Диалог');
  await expect(passage).toContainText('Jūs');
  await expect(passage).toContainText('Ne, neturiu.');
  await noRawStars(page);
});

// ── Evidence screenshots: RU + EN, 1280 + 375 ─────────────────────────────────

for (const lang of ['ru', 'en'] as const) {
  for (const width of [1280, 375]) {
    const o: Opts = { lang, width };
    test(`screenshots ${lang} ${width}`, async ({ page }) => {
      const l = L(o);
      await openDialogue(page, o);
      await shot(page, '01-first-turn', o);
      await optionRows(page).nth(2).click();
      await page.getByRole('button', { name: l.submit }).click();
      await page.getByRole('button', { name: l.next }).click();
      await shot(page, '02-mid-dialogue', o);
      await optionRows(page).nth(1).click(); // wrong
      await page.getByRole('button', { name: l.submit }).click();
      await shot(page, '03-wrong-feedback', o);
      await page.getByRole('button', { name: l.next }).click();
      await expect(transcript(page)).toContainText('Ne, neturiu.');
      await expect(optionRows(page).nth(1)).not.toHaveClass(/bg-red-50/); // feedback cleared
      await page.waitForTimeout(400); // let the colour transition finish before the shot
      await shot(page, '04-transcript-after-wrong', o);
      await optionRows(page).nth(1).click();
      await page.getByRole('button', { name: l.submit }).click();
      await page.getByRole('button', { name: l.finish }).click();
      await noRawStars(page);
      await shot(page, '05-result', o);

      await page.unrouteAll({ behavior: 'ignoreErrors' });
      await openCheck(page, o);
      await page.getByRole('button', { name: TURNS[0].option_c }).click();
      await expect(page.getByTestId('reading-passage')).toBeVisible();
      await shot(page, '06-check-dialogue-task', o);

      if (width === 375) {
        const ok = await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
        expect(ok).toBe(true);
      }
    });

    test(`admin screenshot ${lang} ${width}`, async ({ page }) => {
      await openAdmin(page, o);
      await expect(page.getByTestId('admin-test-kind')).toHaveValue('dialogue');
      await shot(page, '07-admin-kind', o);
    });
  }
}
