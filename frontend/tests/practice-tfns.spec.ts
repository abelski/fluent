import { test, expect, type Page } from '@playwright/test';
import { mockPractice } from './helpers/practiceBento';

// #62b — True / False / Not stated: 3-option statements and the collapsible text
// block during questions. Fully mocked (local backend shares the prod DB).

const CAT_ID = 2; // reuse the mocked "Чтение" category's routes, swap in our own tests/exam
const SHORT = 'Aš gyvenu Kaune. Mano kaimynai labai malonūs. Petras kiekvieną rytą vedžioja šunį parke.';
const LONG = Array.from({ length: 60 }, (_, i) => `${i + 1} straipsnis. Lietuvos valstybė yra nepriklausoma ir demokratinė respublika.`).join('\n\n');

const TFNS_Q = (id: number, lt: string, correct: string) => ({
  id, question_ru: lt, question_lt: lt, option_a: 'Tiesa', option_b: 'Netiesa', option_c: 'Nepasakyta',
  option_d: '', correct_option: correct, category: null,
});
const TFNS = [TFNS_Q(1, 'Petras turi šunį.', 'a'), TFNS_Q(2, 'Aš gyvenu Vilniuje.', 'b'), TFNS_Q(3, 'Šuo yra didelis.', 'c')];
const READING_Q = [{ id: 9, question_ru: 'Petras turi šunį.', question_lt: 'Petras turi šunį.', option_a: 'Teisingas',
  option_b: 'Neteisingas', option_c: '', option_d: '', correct_option: 'a', category: null }];

const listTest = (id: number, title_ru: string, title_en: string, text: string) => ({
  id, title_ru, title_en, description_ru: null, description_en: null, lesson_text_lt: text,
  question_count: 6, active_question_count: 6, pass_threshold: 0.7, is_premium: false, is_final: false,
  section_ru: null, section_en: null, is_locked: false, best_score_pct: null,
});

async function open(page: Page, opts: { text?: string; questions?: unknown[]; width?: number; lang?: 'ru' | 'en' } = {}) {
  await mockPractice(page, { enrolled: [CAT_ID], width: opts.width, lang: opts.lang });
  const text = opts.text ?? SHORT;
  await page.route(/\/api\/practice\/categories\/\d+\/tests/, (r) =>
    r.fulfill({ json: [listTest(901, 'Мои соседи', 'My neighbours', text)] }));
  await page.route(/\/api\/practice\/tests\/\d+\/exam/, (r) => r.fulfill({ json: {
    test: { id: 901, title_ru: 'Мои соседи', title_en: 'My neighbours', pass_threshold: 0.7, lesson_text_lt: text },
    questions: opts.questions ?? TFNS,
  } }));
  await page.route(/\/api\/practice\/tests\/\d+\/results/, (r) => r.fulfill({ json: { ok: true } }));
  await page.goto(`/dashboard/practice/${CAT_ID}?test=901`);
  await page.getByRole('button', { name: opts.lang === 'en' ? /Go to the test/ : /Перейти к тесту/ }).click();
}

const optionRows = (page: Page) => page.locator('button').filter({ has: page.locator('span', { hasText: /^[A-D]$/ }) });

test('3 options render; text block closed by default and opens on click', async ({ page }) => {
  await open(page);
  await expect(page.getByText('Petras turi šunį.').first()).toBeVisible();
  await expect(optionRows(page)).toHaveCount(3);
  await expect(optionRows(page).nth(2)).toContainText('Nepasakyta');
  const block = page.getByTestId('question-text-block');
  await expect(block).toBeVisible();
  await expect(block).not.toHaveAttribute('open', '');
  await expect(block).toContainText('показать текст');
  await expect(page.getByTestId('question-text-body')).toBeHidden();
  await block.locator('summary').click();
  await expect(block).toHaveAttribute('open', '');
  await expect(page.getByTestId('question-text-body')).toContainText('vedžioja šunį');
  await expect(block.getByText('· показать текст')).toBeHidden(); // hint hidden when open
});

test('long text scrolls inside its cap', async ({ page }) => {
  await open(page, { text: LONG });
  await page.getByTestId('question-text-block').locator('summary').click();
  const body = page.getByTestId('question-text-body');
  const { scrollH, clientH, vh } = await body.evaluate((el) => ({
    scrollH: el.scrollHeight, clientH: el.clientHeight, vh: window.innerHeight }));
  expect(scrollH).toBeGreaterThan(clientH);
  expect(clientH).toBeLessThanOrEqual(Math.ceil(vh * 0.4) + 1);
});

test('correct and wrong feedback, then result screen', async ({ page }) => {
  await open(page);
  await optionRows(page).nth(0).click(); // a — correct
  await page.getByRole('button', { name: 'Ответить' }).click();
  await expect(optionRows(page).nth(0)).toHaveClass(/bg-emerald-50/);
  await page.getByRole('button', { name: /Следующий/ }).click();
  await optionRows(page).nth(2).click(); // c — wrong, correct is b
  await page.getByRole('button', { name: 'Ответить' }).click();
  await expect(optionRows(page).nth(2)).toHaveClass(/bg-red-50/);
  await expect(optionRows(page).nth(1)).toHaveClass(/bg-emerald-50/);
  await page.getByRole('button', { name: /Следующий/ }).click();
  await optionRows(page).nth(2).click();
  await page.getByRole('button', { name: 'Ответить' }).click();
  await page.getByRole('button', { name: 'Завершить' }).click();
  await expect(page.getByText(/Правильно 2 из 3/)).toBeVisible();
});

test('no horizontal overflow at 375px (EN)', async ({ page }) => {
  await open(page, { width: 375, lang: 'en', text: LONG });
  await page.getByTestId('question-text-block').locator('summary').click();
  await expect(page.getByTestId('question-text-block')).toContainText('Text');
  const ok = await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
  expect(ok).toBe(true);
});

test('2-option Reading test also shows the text block', async ({ page }) => {
  await open(page, { questions: READING_Q });
  await expect(optionRows(page)).toHaveCount(2);
  await expect(page.getByTestId('question-text-block')).toBeVisible();
});
