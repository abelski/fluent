import { test, expect, type Page } from '@playwright/test';
import { USUAL, mockHome } from './helpers/effortRadar';

// #62a — "Work on mistakes" widget + /dashboard/check. Every API call is mocked.
// Saves evidence screenshots for each state, RU + EN, 1280 + 375.

const SHOTS = '../temp_files/screenshots/plan_62a_knowledge-check-gap-widget';

const topic = (key: string, ru: string, en: string, correct: number) => ({
  topic: key, title_ru: ru, title_en: en, correct, total: 2, weak: correct / 2 <= 0.75,
});
const TOPICS = [
  topic('g:52', 'Galininkas Dgs.', 'Galininkas Dgs.', 0),
  topic('v:202', 'Прошедшее однократное', 'Past simple (single action)', 1),
  topic('g:10', 'Kilmininkas Vns.', 'Kilmininkas Vns.', 1),
  topic('p:2', 'Чтение', 'Reading', 1),
  topic('g:4', 'Vietininkas Vns.', 'Vietininkas Vns.', 2),
  topic('g:28', 'Įnagininkas Vns.', 'Įnagininkas Vns.', 2),
  topic('g:76', 'Skaičiai: Galininkas (turiu)', 'Skaičiai: Galininkas (turiu)', 2),
  topic('v:206', 'Будущее время', 'Future tense', 2),
];
const RESULT = { id: 7, created_at: '2026-10-08T10:00:00', correct: 11, total: 16, topics: TOPICS };
const NO_GAPS = { ...RESULT, correct: 16, topics: TOPICS.map((t) => ({ ...t, correct: 2, weak: false })) };
const RECS = [
  { kind: 'grammar', id: 1, title_ru: 'Литовские падежи', title_en: 'Lithuanian Cases', enrolled: false,
    reasons: [{ title_ru: 'Galininkas Dgs.', title_en: 'Galininkas Dgs.' }, { title_ru: 'Kilmininkas Vns.', title_en: 'Kilmininkas Vns.' }] },
  { kind: 'grammar', id: 3, title_ru: 'Глаголы', title_en: 'Verbs', enrolled: true,
    reasons: [{ title_ru: 'Прошедшее однократное', title_en: 'Past simple (single action)' }] },
  { kind: 'practice', id: 2, title_ru: 'Чтение', title_en: 'Reading', enrolled: false,
    reasons: [{ title_ru: 'Чтение', title_en: 'Reading' }] },
];

const PASSAGE = '*Lina ir Tomas apie Maiklą:*\n\n— Tomai, ar Maiklas yra tavo draugas?\n— Taip, Lina, Maiklas yra mano draugas.\n— Ar jis kalba lietuviškai?\n— Ne, Maiklas nekalba lietuviškai.\n— Kaip jūs, tu ir Maiklas, kalbate? Angliškai?\n— Taip. O tu, Lina, kalbi angliškai?\n— Taip, aš kalbu angliškai ir ispaniškai. Ar Maiklas supranta ispaniškai?\n— Taip, jis labai gerai kalba ispaniškai.\n— O tu, Tomai?\n— Aš nekalbu ispaniškai.';
const TASKS = [
  { type: 'sentence', display: 'Aš neturiu ___.', answer: 'brolio', full_answer: 'brolio',
    translation_ru: 'У меня нет брата.', translation_en: "I don't have a brother.", options: ['brolis', 'brolio', 'broliui', 'brolį'] },
  { type: 'reading', passage_lt: PASSAGE, passage_title_ru: '«Это мой друг»', passage_title_en: 'This is my friend',
    question_lt: 'Maiklas kalba lietuviškai.', question_ru: 'Maiklas kalba lietuviškai.', options: ['Teisingas', 'Neteisingas'], answer: 'Neteisingas' },
  { type: 'reading', passage_lt: '', question_lt: '**Lina:** Tomai, ar Maiklas yra tavo draugas?\n\nTomas kalba ispaniškai.',
    question_ru: '', options: ['Teisingas', 'Neteisingas'], answer: 'Neteisingas' },
];

type Opts = { lang?: 'ru' | 'en'; width?: number };

async function home(page: Page, state: unknown, opts: Opts = {}) {
  await mockHome(page, USUAL, opts);
  const enrolled: string[] = [];
  await page.route('**/api/me/knowledge-check', (r) => r.fulfill({ json: state }));
  await page.route('**/api/me/grammar-programs/*', (r) => { enrolled.push(r.request().url()); return r.fulfill({ json: { ok: true } }); });
  await page.route('**/api/me/practice-categories/*', (r) => { enrolled.push(r.request().url()); return r.fulfill({ json: { ok: true } }); });
  await page.goto('/');
  await expect(page.getByTestId('gap-widget')).toBeVisible();
  return enrolled;
}

async function checkPage(page: Page, start: { status?: number; json: unknown }, opts: Opts = {}) {
  await mockHome(page, USUAL, opts);
  const submitted: unknown[] = [];
  await page.route('**/api/me/knowledge-check', (r) =>
    r.request().method() === 'POST'
      ? r.fulfill({ status: start.status ?? 200, json: start.json })
      : r.fulfill({ json: { latest: null, is_premium: false } }));
  await page.route('**/api/me/knowledge-check/*/answers', (r) => {
    submitted.push(r.request().postDataJSON());
    return r.fulfill({ json: RESULT });
  });
  await page.goto('/dashboard/check/');
  return submitted;
}

const shot = (page: Page, name: string, o: Opts) =>
  page.screenshot({ path: `${SHOTS}/${name}-${o.lang ?? 'ru'}-${o.width ?? 1280}.png`, fullPage: true });

const widgetShot = (page: Page, name: string, o: Opts) =>
  o.width === 375 ? shot(page, name, o)
    : page.getByTestId('gap-widget').screenshot({ path: `${SHOTS}/${name}-${o.lang ?? 'ru'}-${o.width ?? 1280}.png` });

test.describe('GapWidget', () => {
  test('no check, free: CTA to /dashboard/check, sits between leaderboard and radar', async ({ page }) => {
    await home(page, { latest: null, is_premium: false });
    const w = page.getByTestId('gap-widget');
    await expect(w).toContainText('Работа над ошибками');
    await expect(page.getByTestId('gap-start')).toHaveAttribute('href', /^\/dashboard\/check\/?$/);
    const lb = (await page.getByTestId('leaderboard').boundingBox())!;
    const wb = (await w.boundingBox())!;
    const rb = (await page.getByTestId('effort-radar').boundingBox())!;
    expect(lb.y).toBeLessThan(wb.y);
    expect(wb.y).toBeLessThan(rb.y);
  });

  test('no check, Premium: the same CTA, no tabs', async ({ page }) => {
    await home(page, { latest: null, is_premium: true, recommendations: [] });
    await expect(page.getByTestId('gap-start')).toBeVisible();
    await expect(page.getByTestId('gap-tab-gaps')).toHaveCount(0);
  });

  test('free after the check: weak chips + upsell', async ({ page }) => {
    await home(page, { latest: RESULT, is_premium: false });
    await expect(page.getByTestId('gap-meta')).toHaveText('Проверка 8 октября · 11 из 16');
    await expect(page.getByTestId('gap-chips').locator('span')).toHaveCount(4);
    await expect(page.getByTestId('gap-upsell').locator('a')).toHaveAttribute('href', /^\/pricing\/?$/);
    await expect(page.getByTestId('gap-start')).toHaveCount(0);
    await expect(page.getByTestId('gap-again')).toHaveCount(0);
  });

  test('free, no gaps: grey box', async ({ page }) => {
    await home(page, { latest: NO_GAPS, is_premium: false });
    await expect(page.getByTestId('gap-none')).toBeVisible();
    await expect(page.getByTestId('gap-chips')).toHaveCount(0);
  });

  test('Premium: tabs switch, enroll turns the row into Enrolled', async ({ page }) => {
    const enrolled = await home(page, { latest: RESULT, is_premium: true, recommendations: RECS });
    await expect(page.getByTestId('gap-go')).toHaveAttribute('href', /^\/dashboard\/check\/?\?gaps=1$/);
    await expect(page.getByTestId('gap-again')).toHaveAttribute('href', /^\/dashboard\/check\/?$/);
    await page.getByTestId('gap-tab-recs').click();
    await expect(page.getByTestId('gap-recs').locator('li')).toHaveCount(3);
    await expect(page.getByTestId('gap-enrolled')).toHaveCount(1);
    await page.getByTestId('gap-enroll').first().click();
    await expect(page.getByTestId('gap-enrolled')).toHaveCount(2);
    expect(enrolled[0]).toContain('/api/me/grammar-programs/1');
  });

  test('Premium, no gaps: Start disabled', async ({ page }) => {
    await home(page, { latest: NO_GAPS, is_premium: true, recommendations: [] });
    await expect(page.getByTestId('gap-none')).toBeVisible();
    await expect(page.getByTestId('gap-go')).toBeDisabled();
  });
});

test.describe('Check page', () => {
  test('runs to the result screen and submits the picked options', async ({ page }) => {
    const submitted = await checkPage(page, { json: { id: 7, tasks: TASKS } });
    await page.getByRole('button', { name: 'brolio' }).click();
    // reading with a passage
    await expect(page.getByTestId('reading-passage')).toBeVisible();
    await expect(page.getByTestId('reading-passage')).toContainText('Maiklas yra mano draugas');
    // whole passage visible, no inner scroll box hiding the answer lines
    await expect(page.getByTestId('reading-passage').getByText('Aš nekalbu ispaniškai.')).toBeVisible();
    const box = await page.getByTestId('reading-passage').boundingBox();
    const last = await page.getByTestId('reading-passage').getByText('Aš nekalbu ispaniškai.').boundingBox();
    expect(last!.y + last!.height).toBeLessThanOrEqual(box!.y + box!.height);
    await page.getByRole('button', { name: 'Neteisingas' }).click();
    // reading without a passage
    await expect(page.getByTestId('reading-task')).toContainText('Tomas kalba ispaniškai');
    await expect(page.getByTestId('reading-passage')).toHaveCount(0);
    await page.getByRole('button', { name: 'Teisingas', exact: true }).click();
    await page.getByTestId('dismiss-wrong').click();
    // the retry of the wrong task, never sent to the server
    await page.getByRole('button', { name: 'Neteisingas' }).click();
    await expect(page.getByTestId('check-result')).toBeVisible();
    expect(submitted).toEqual([{ responses: ['brolio', 'Neteisingas', 'Teisingas'] }]);
    await expect(page.getByTestId('result-row')).toHaveCount(8);
    await expect(page.getByTestId('check-result')).toContainText('11 из 16 правильно');
  });

  test('403 on start shows the Premium upsell', async ({ page }) => {
    await checkPage(page, { status: 403, json: { detail: { code: 'premium_required' } } });
    await expect(page.getByTestId('check-premium')).toBeVisible();
    await expect(page.getByTestId('check-premium').locator('a[href^="/pricing"]')).toBeVisible();
  });
});

// ── Evidence screenshots: 11 states × RU/EN × 1280/375 ──────────────────────
for (const lang of ['ru', 'en'] as const) {
  for (const width of [1280, 375]) {
    const o = { lang, width };
    test(`screenshots ${lang} ${width}`, async ({ page }) => {
      test.setTimeout(120_000);
      const widget = async (name: string, state: unknown, tab?: 'recs') => {
        await page.unrouteAll({ behavior: 'ignoreErrors' });
        await home(page, state, o);
        if (tab) await page.getByTestId('gap-tab-recs').click();
        await widgetShot(page, name, o);
      };
      await widget('01-widget-nocheck-free', { latest: null, is_premium: false });
      await widget('02-widget-nocheck-premium', { latest: null, is_premium: true, recommendations: [] });
      await widget('03-widget-free-after', { latest: RESULT, is_premium: false });
      await widget('04-widget-free-nogaps', { latest: NO_GAPS, is_premium: false });
      await widget('05-widget-premium-gaps', { latest: RESULT, is_premium: true, recommendations: RECS });
      await widget('06-widget-premium-nogaps', { latest: NO_GAPS, is_premium: true, recommendations: [] });
      await widget('07-widget-premium-recs', { latest: RESULT, is_premium: true, recommendations: RECS }, 'recs');

      await page.unrouteAll({ behavior: 'ignoreErrors' });
      await checkPage(page, { json: { id: 7, tasks: [TASKS[1], TASKS[2]] } }, o);
      await expect(page.getByTestId('reading-passage')).toBeVisible();
      await shot(page, '08-check-reading', o);
      await page.getByRole('button', { name: 'Neteisingas' }).click();
      await expect(page.getByTestId('reading-passage')).toHaveCount(0);
      await page.getByRole('button', { name: 'Neteisingas' }).click();
      await expect(page.getByTestId('check-result')).toBeVisible();
      await shot(page, '09-check-result', o);

      await page.unrouteAll({ behavior: 'ignoreErrors' });
      await checkPage(page, { status: 403, json: { detail: { code: 'premium_required' } } }, o);
      await expect(page.getByTestId('check-premium')).toBeVisible();
      await shot(page, '10-check-403', o);

      await page.unrouteAll({ behavior: 'ignoreErrors' });
      await mockHome(page, USUAL, o);
      await page.goto('/pricing/');
      await expect(page.getByText(lang === 'en' ? 'Work on mistakes: lessons' : 'Работа над ошибками: уроки')).toBeVisible();
      await shot(page, '11-pricing', o);
    });
  }
}

// ── #63: server-built instruction line above the task card ─────────────────
const SHOTS_63 = '../temp_files/screenshots/plan_63_check-task-instructions';
const INSTR_TASKS = [
  { name: '01-noun', task: { ...TASKS[0],
    instruction_ru: 'Выбери правильную форму: родительный падеж, ед. ч.', instruction_en: 'Pick the right form: genitive, singular' } },
  { name: '02-numeral', task: { type: 'sentence', display: 'Sūnus į mokyklą važiuoja ___ troleibusu.', answer: 'vienuoliktu',
    full_answer: 'vienuoliktu', translation_ru: 'Сын едет в школу на одиннадцатом троллейбусе.', translation_en: 'The son takes trolleybus 11 to school.',
    options: ['vienuoliktos', 'vienuolikta', 'vienuoliktu', 'vienuoliktais'],
    instruction_ru: 'Выбери правильную форму числительного: творительный падеж', instruction_en: 'Pick the right form of the numeral: instrumental' } },
  { name: '03-verb', task: { type: 'verb_conjugation', verb_infinitive: 'gyventi', translation_ru: 'жить', translation_en: 'to live',
    tense_label: 'Прошедшее однократное', tense_label_en: 'Past simple (single action)', person_label: 'mes', answer: 'gyvenome',
    options: ['gyvename', 'gyvenome', 'gyvensime', 'gyvendavome'],
    instruction_ru: 'Выбери форму глагола: Прошедшее однократное', instruction_en: 'Pick the verb form: Past simple (single action)' } },
  { name: '04-reading', task: { ...TASKS[1],
    instruction_ru: 'Прочитай текст и выбери: верно или неверно', instruction_en: 'Read the text and choose: true or false' } },
];

test('#63 instruction line: shown in the UI language, absent when missing', async ({ page }) => {
  await checkPage(page, { json: { id: 7, tasks: [INSTR_TASKS[0].task, TASKS[2]] } }, { lang: 'en' });
  await expect(page.getByTestId('task-instruction')).toHaveText('Pick the right form: genitive, singular');
  await page.getByRole('button', { name: 'brolio' }).click();
  await expect(page.getByTestId('reading-task')).toBeVisible();
  await expect(page.getByTestId('task-instruction')).toHaveCount(0);
});

for (const lang of ['ru', 'en'] as const) {
  for (const width of [1280, 375]) {
    test(`#63 instruction screenshots ${lang} ${width}`, async ({ page }) => {
      for (const { name, task } of INSTR_TASKS) {
        await page.unrouteAll({ behavior: 'ignoreErrors' });
        await checkPage(page, { json: { id: 7, tasks: [task] } }, { lang, width });
        await expect(page.getByTestId('task-instruction')).toHaveText(lang === 'en' ? task.instruction_en : task.instruction_ru);
        await page.screenshot({ path: `${SHOTS_63}/${name}-${lang}-${width}.png`, fullPage: true });
      }
    });
  }
}
