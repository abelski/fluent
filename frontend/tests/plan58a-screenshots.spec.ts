import { test, expect, type Page } from '@playwright/test';
import fs from 'fs';
import path from 'path';

// Plan #58a — evidence screenshots for the new content, built from the source files in
// temp_files/articles/ (git-ignored, so this spec only runs where they exist): both articles
// RU + /en/, the greetings phrase program, and /programs/sekmes/ with list 237 renamed to 19 words.
// RU + EN × 1280 / 375. Every API is mocked; nothing touches the DB.

const ROOT = path.join(__dirname, '..', '..');
const SRC = path.join(ROOT, 'temp_files', 'articles');
const DIR = path.join(ROOT, 'temp_files', 'screenshots', 'plan_58a_seo-content-new-pages');
const PROGRAM_ID = 999;

function parseArticle(file: string) {
  const content = fs.readFileSync(path.join(SRC, file), 'utf-8');
  const m = content.match(/^---\n([\s\S]*?)\n---\n/)!;
  const get = (k: string) => (m[1].match(new RegExp(`^${k}:\\s*(.+)$`, 'm'))?.[1] ?? '').trim();
  const [ru, en = ''] = content.slice(m[0].length).split('---EN---');
  return {
    slug: get('slug'), title_ru: get('title_ru'), title_en: get('title_en'),
    body_ru: ru.trim(), body_en: en.trim(), tags: get('tags').split(','),
    category: get('category'), theme: null,
    created_at: '2026-10-03T10:00:00', updated_at: '2026-10-03T10:00:00',
  };
}

const ARTICLES = ['lithuanian-greetings.md', 'days-and-months.md'].map(parseArticle);
const PROGRAM = JSON.parse(fs.readFileSync(path.join(SRC, 'greetings-program.json'), 'utf-8'))[0];

const MONTHS = ['sausis', 'vasaris', 'kovas', 'balandis', 'gegužė', 'birželis', 'liepa', 'rugpjūtis',
  'rugsėjis', 'spalis', 'lapkritis', 'gruodis'];
const MONTHS_RU = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь',
  'октябрь', 'ноябрь', 'декабрь'];
const MONTHS_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September',
  'October', 'November', 'December'];
const DAYS = ['pirmadienis', 'antradienis', 'trečiadienis', 'ketvirtadienis', 'penktadienis', 'šeštadienis', 'sekmadienis'];
const DAYS_RU = ['понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота', 'воскресенье'];
const DAYS_EN = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const LIST_237_WORDS = [
  ...MONTHS.map((lt, i) => ({ lithuanian: lt, translation_ru: MONTHS_RU[i], translation_en: MONTHS_EN[i] })),
  ...DAYS.map((lt, i) => ({ lithuanian: lt, translation_ru: DAYS_RU[i], translation_en: DAYS_EN[i] })),
].map((w, i) => ({ id: 5000 + i, accented: null, hint: null, ...w }));

const SEKMES_LISTS = [
  { id: 236, title: 'Šeima', title_en: 'Family', subcategory: 'sekmes', word_count: 20 },
  { id: 237, title: 'Mėnesiai ir savaitės dienos', title_en: 'Months and days of the week', subcategory: 'sekmes', word_count: 19 },
  { id: 238, title: 'Maistas', title_en: 'Food', subcategory: 'sekmes', word_count: 25 },
];

async function mock(page: Page, lang: 'ru' | 'en', width: number) {
  await page.addInitScript((l) => {
    localStorage.setItem('fluent_lang', l);
    localStorage.setItem('cookie_consent', 'accepted');
  }, lang);
  await page.setViewportSize({ width, height: 900 });
  await page.route('**/api/**', (r) => r.fulfill({ json: [] }));
  await page.route('**/api/billing/config', (r) => r.fulfill({ json: { enabled: true } }));
  await page.route('**/api/subcategory-meta', (r) => r.fulfill({
    json: { sekmes: { name_ru: 'Sėkmės! A1.1', name_en: 'Sėkmės! A1.1', cefr_level: 'A1', difficulty: 'easy',
      article_url: null, article_name_ru: null, article_name_en: null, enrollment_count: 21 } },
  }));
  await page.route('**/api/articles', (r) => r.fulfill({ json: ARTICLES }));
  for (const a of ARTICLES) await page.route(`**/api/articles/${a.slug}`, (r) => r.fulfill({ json: a }));
  await page.route(`**/api/phrase-programs/${PROGRAM_ID}`, (r) => r.fulfill({
    json: { id: PROGRAM_ID, ...PROGRAM,
      phrases: PROGRAM.phrases.map((p: object, i: number) => ({ id: i + 1, lesson_stage: 0, ...p })) },
  }));
  await page.route('**/api/lists', (r) => r.fulfill({ json: SEKMES_LISTS }));
  await page.route('**/api/lists/237', (r) => r.fulfill({ json: { ...SEKMES_LISTS[1], words: LIST_237_WORDS } }));
}

async function shot(page: Page, name: string) {
  await page.waitForTimeout(400);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, 'horizontal overflow').toBeLessThanOrEqual(0);
  await page.screenshot({ path: path.join(DIR, `${name}.png`), fullPage: true });
}

for (const lang of ['ru', 'en'] as const) {
  for (const width of [1280, 375]) {
    for (const a of ARTICLES) {
      test(`article ${a.slug} — ${lang} — ${width}`, async ({ page }) => {
        await mock(page, lang, width);
        await page.goto(`${lang === 'en' ? '/en' : ''}/dashboard/articles/${a.slug}/`);
        await expect(page.locator('h1').first()).toContainText(lang === 'en' ? a.title_en : a.title_ru);
        await shot(page, `article-${a.slug}-${lang}-${width}`);
      });
    }

    test(`phrase program — ${lang} — ${width}`, async ({ page }) => {
      await mock(page, lang, width);
      await page.goto(`/dashboard/phrases/${PROGRAM_ID}/`);
      await expect(page.getByText(lang === 'en' ? 'Chapter 3: Thank you, sorry and cheers' : 'Глава 3: Спасибо, извините и тост')).toBeVisible();
      await expect(page.getByText('Į sveikatą!')).toBeVisible();
      await shot(page, `phrase-program-${lang}-${width}`);
    });

    test(`programs/sekmes list 237 — ${lang} — ${width}`, async ({ page }) => {
      await mock(page, lang, width);
      await page.goto('/programs/sekmes/');
      const title = lang === 'en' ? 'Months and days of the week' : 'Mėnesiai ir savaitės dienos';
      await page.getByText(title).first().click();
      await expect(page.getByText('sekmadienis')).toBeVisible();
      await shot(page, `programs-sekmes-${lang}-${width}`);
    });
  }
}
