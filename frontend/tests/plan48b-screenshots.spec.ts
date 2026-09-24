import { test, expect, type Page } from '@playwright/test';
import path from 'path';

// Plan #48b — evidence screenshots for DB-content EN twins. RU + EN, 1280px + 375px.
// Every API is mocked with EN-complete fixtures, so a shot never depends on live data.
// Each test also asserts the EN (or RU) text is actually on screen, not just captured.

const DIR = path.join(__dirname, '..', '..', 'temp_files', 'screenshots', 'plan_48b_en-db-content');
const WIDTHS = { desktop: 1280, mobile: 375 } as const;
const LANGS = ['ru', 'en'] as const;
type Lang = (typeof LANGS)[number];

function makeFakeJwt(email: string, extra: Record<string, unknown> = {}): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = btoa(JSON.stringify({ email, name: 'Test User', exp: 9999999999, ...extra }));
  return `${header}.${payload}.fakesignature`;
}

async function setup(page: Page, lang: Lang, width: number, token: string) {
  await page.addInitScript(([t, l]) => {
    localStorage.setItem('fluent_token', t);
    localStorage.setItem('fluent_lang', l);
    localStorage.setItem('cookie_consent', 'accepted');
  }, [token, lang] as const);
  await page.setViewportSize({ width, height: 900 });
  // Fallback for any endpoint a page touches that a test doesn't care about. Registered
  // first, so every specific route below (registered later) wins.
  await page.route('**/api/**', (r) => r.fulfill({ json: [] }));
  await page.route('**/api/billing/config', (r) => r.fulfill({ json: { enabled: true } }));
  await page.route('**/api/me/quota', (r) => r.fulfill({ json: {
    is_premium: false, premium_active: false, premium_until: null, sessions_today: 0,
    daily_limit: 10, is_admin: true, is_superadmin: true } }));
}

async function shot(page: Page, name: string, lang: string, width: number) {
  await page.waitForTimeout(300); // let Tailwind transitions settle
  await page.screenshot({ path: path.join(DIR, `${name}-${lang}-${width}.png`), fullPage: true });
}

const pick = (lang: Lang, ru: string, en: string) => (lang === 'en' ? en : ru);

// ── Grammar runner: rule card with endings, sentence task, verb task ──────────

const RULE = {
  question: 'Кого? Что?', name_ru: 'Винительный (Galininkas)',
  usage: 'Прямое дополнение — объект действия (вижу, покупаю, люблю кого/что).',
  endings_sg: '-ą, -ią, -į, -ę, -ų, -ių, -enį, -erį', endings_pl: '-us, -ius, -as, -ias, -es, -is',
  transform: '-as→-ą (namas→namą), -is/-ys→-į (maišelis→maišelį); III ж.р. -is→-į (pilis→pilį).',
  question_en: 'whom? what? (direct object)', name_en: 'Accusative (Galininkas)',
  usage_en: 'Direct object: the person or thing the action is done to (I see, buy, love whom/what).',
  endings_sg_en: '-ą, -ią, -į, -ę, -ų, -ių, -enį, -erį', endings_pl_en: '-us, -ius, -as, -ias, -es, -is',
  transform_en: '-as→-ą (namas→namą), -is/-ys→-į (maišelis→maišelį); III f. -is→-į (pilis→pilį).',
};
const LESSON = {
  id: 2, title: 'Урок 2 — Винительный', level: 'basic', cases: [4], task_count: 1,
  rules: [RULE], is_locked: false, best_score_pct: null,
};
const SENTENCE_TASK = {
  type: 'sentence', display: 'Laima mato brol___.', answer: 'į', full_answer: 'brolį',
  translation_ru: 'Лайма видит брата.', translation_en: 'Laima sees her brother.', base_lt: 'brolis',
};
const VERB_TASK = {
  type: 'verb_conjugation', verb_infinitive: 'dìrbti', translation_ru: 'работать', translation_en: 'to work',
  tense_label: 'Настоящее время', tense_label_en: 'Present tense', person_label: 'aš', answer: 'dirbu',
};

async function openGrammarLesson(page: Page, task: object) {
  await page.route('**/api/grammar-programs', (r) => r.fulfill({ json: [
    { id: 1, title: 'Литовские падежи', title_en: 'Lithuanian Cases', description: null, description_en: null,
      difficulty: 1, enrolled: true, lesson_filter: null, program_type: 'cases' }] }));
  await page.route('**/api/grammar/lessons', (r) => r.fulfill({ json: [LESSON] }));
  await page.route('**/api/grammar/lessons/2/tasks', (r) => r.fulfill({ json: [task] }));
  await page.route('**/api/grammar/lessons/2/results', (r) => r.fulfill({ json: { ok: true, passed: true } }));
  await page.route('**/api/admin/grammar/config', (r) => r.fulfill({ json: { lessons: [], cases: {} } }));
  await page.goto('/dashboard/grammar');
  await page.locator('[data-testid="subcategory-toggle"]').first().click();
  await page.locator('.grid button').first().click();
  await page.waitForSelector('input[type="text"]', { timeout: 5000 });
}

// ── Practice: category description + test description ────────────────────────

const CATEGORY = {
  id: 1, name_ru: 'Конституция', name_en: 'Constitution', description_ru: 'Подготовка к гражданству и ПМЖ',
  description_en: 'Preparation for citizenship and permanent residency', source_url: null, sort_order: 0,
  test_count: 1, tests_passed: 0, tests_total: 1, enrolled: true,
};
const PRACTICE_TEST = {
  id: 21, title_ru: '1 pamoka: Valstybiniai pagrindai (1–6 str.)', title_en: 'Lesson 1: Art. 1–6',
  description_ru: 'Perskaitykite 1–6 straipsnius ir atsakykite į klausimus.',
  description_en: 'Read Articles 1–6 and answer the questions.', lesson_text_lt: null, question_count: 10,
  pass_threshold: 0.6, is_premium: false, active_question_count: 10, is_locked: false, best_score_pct: null,
};

// ── Sekmes program list ──────────────────────────────────────────────────────

const SEKMES_LISTS = [
  { id: 187, title: 'Koks jūsų vardas?', title_en: "What's your name?", subcategory: 'sekmes', word_count: 24 },
  { id: 188, title: 'Čia mano draugas', title_en: 'This is my friend', subcategory: 'sekmes', word_count: 31 },
  { id: 206, title: 'Ką mėgsti veikti laisvalaikiu?', title_en: 'What do you like doing in your free time?', subcategory: 'sekmes', word_count: 27 },
];

// ── Admin fixtures ───────────────────────────────────────────────────────────

const ADMIN_TOKEN = makeFakeJwt('admin@test.com', { is_admin: true });
const ADMIN_PROGRAM = {
  id: 1, title: 'Литовские падежи', title_en: 'Lithuanian Cases',
  description: 'Все грамматические падежи литовского языка: единственное и множественное число.',
  description_en: 'All the grammatical cases of Lithuanian, in the singular and the plural.',
  difficulty: 1, is_public: true, lesson_filter: null,
};
const ADMIN_SENTENCE = {
  id: 40, case_index: 4, display: 'Laima mato brol___.', answer_ending: 'į', full_word: 'brolį',
  russian: 'Лайма видит брата.', english: 'Laima sees her brother.', archived: false,
  use_in_basic: true, use_in_advanced: true, use_in_practice: true,
};
const ADMIN_RULE = { id: 2, case_index: 4, status: 'published', article_slug: null, ...RULE };

async function mockAdminGrammar(page: Page) {
  await page.route('**/api/admin/grammar/config', (r) => r.fulfill({ json: {
    lessons: [[1, 'basic', [4], 10, 'Урок 1']], cases: { '4': ['Винительный', 'Vienaskaita'] } } }));
  await page.route('**/api/admin/grammar/sentences**', (r) => r.fulfill({ json: [ADMIN_SENTENCE] }));
  await page.route('**/api/admin/grammar/rules', (r) => r.fulfill({ json: [ADMIN_RULE] }));
  await page.route('**/api/admin/grammar/programs', (r) => r.fulfill({ json: [ADMIN_PROGRAM] }));
}

for (const lang of LANGS) {
  for (const [wname, width] of Object.entries(WIDTHS)) {
    test(`grammar rule card + sentence task — ${lang} ${wname}`, async ({ page }) => {
      await setup(page, lang, width, makeFakeJwt('grammar@test.com'));
      await openGrammarLesson(page, SENTENCE_TASK);
      await expect(page.getByText(pick(lang, RULE.question, RULE.question_en), { exact: true })).toBeVisible();
      await expect(page.getByText(pick(lang, RULE.usage, RULE.usage_en))).toBeVisible();
      await expect(page.getByText(pick(lang, SENTENCE_TASK.translation_ru, SENTENCE_TASK.translation_en))).toBeVisible();
      await shot(page, 'grammar-rule-sentence', lang, width);
    });

    test(`grammar verb task — ${lang} ${wname}`, async ({ page }) => {
      await setup(page, lang, width, makeFakeJwt('grammar-verb@test.com'));
      await openGrammarLesson(page, VERB_TASK);
      await expect(page.getByText(pick(lang, VERB_TASK.translation_ru, VERB_TASK.translation_en), { exact: true })).toBeVisible();
      await shot(page, 'grammar-verb', lang, width);
    });

    test(`grammar programs — ${lang} ${wname}`, async ({ page }) => {
      await setup(page, lang, width, makeFakeJwt('grammar-programs@test.com'));
      await page.route('**/api/grammar-programs', (r) => r.fulfill({ json: [{ ...ADMIN_PROGRAM, enrolled: false, program_type: 'cases' }] }));
      await page.goto('/dashboard/grammar/programs');
      await expect(page.getByText(pick(lang, ADMIN_PROGRAM.description, ADMIN_PROGRAM.description_en))).toBeVisible();
      await shot(page, 'grammar-programs', lang, width);
    });

    test(`practice category description — ${lang} ${wname}`, async ({ page }) => {
      await setup(page, lang, width, makeFakeJwt('practice@test.com'));
      await page.route('**/api/me/practice-categories', (r) => r.fulfill({ json: [CATEGORY] }));
      await page.goto('/dashboard/practice');
      await expect(page.getByText(pick(lang, CATEGORY.description_ru, CATEGORY.description_en))).toBeVisible();
      await shot(page, 'practice-category', lang, width);
    });

    test(`practice test description — ${lang} ${wname}`, async ({ page }) => {
      await setup(page, lang, width, makeFakeJwt('practice-tests@test.com'));
      await page.route('**/api/practice/categories', (r) => r.fulfill({ json: [CATEGORY] }));
      await page.route('**/api/practice/categories/*/tests*', (r) => r.fulfill({ json: [PRACTICE_TEST] }));
      await page.goto('/dashboard/practice/1');
      await expect(page.getByText(pick(lang, PRACTICE_TEST.description_ru, PRACTICE_TEST.description_en))).toBeVisible();
      await expect(page.getByText(pick(lang, CATEGORY.description_ru, CATEGORY.description_en))).toBeVisible();
      await shot(page, 'practice-tests', lang, width);
    });

    test(`sekmes program list — ${lang} ${wname}`, async ({ page }) => {
      await setup(page, lang, width, makeFakeJwt('sekmes@test.com'));
      await page.route('**/api/subcategory-meta', (r) => r.fulfill({ json: { sekmes: {
        cefr_level: 'A1', difficulty: 'easy', name_ru: 'Sėkmės!', name_en: 'Sėkmės!', article_url: null,
        article_name_ru: null, article_name_en: null } } }));
      await page.route('**/api/lists', (r) => r.fulfill({ json: SEKMES_LISTS }));
      await page.goto('/programs/sekmes');
      await expect(page.getByText(pick(lang, SEKMES_LISTS[1].title, SEKMES_LISTS[1].title_en), { exact: true })).toBeVisible();
      await shot(page, 'sekmes-lists', lang, width);
    });

    test(`admin category edit — ${lang} ${wname}`, async ({ page }) => {
      await setup(page, lang, width, ADMIN_TOKEN);
      await page.route('**/api/admin/practice/categories', (r) => r.fulfill({ json: [
        { ...CATEGORY, total_tests: 33, published_tests: 33 }] }));
      await page.goto('/dashboard/admin');
      await page.getByRole('button', { name: pick(lang, 'Контент', 'Content'), exact: true }).click();
      await page.getByRole('button', { name: pick(lang, 'Практика', 'Tests'), exact: true }).click();
      await page.getByRole('button', { name: pick(lang, 'Редактировать', 'Edit'), exact: true }).first().click();
      await expect(page.getByText(pick(lang, 'Описание (EN)', 'Description (EN)'), { exact: true })).toBeVisible();
      await expect(page.locator(`input[value="${CATEGORY.description_en}"]`)).toBeVisible();
      await shot(page, 'admin-category-edit', lang, width);
    });

    test(`admin grammar program + sentence edit — ${lang} ${wname}`, async ({ page }) => {
      await setup(page, lang, width, ADMIN_TOKEN);
      await mockAdminGrammar(page);
      await page.goto('/dashboard/admin/grammar');
      await page.getByText(ADMIN_PROGRAM.title, { exact: true }).click();
      await page.getByRole('button', { name: /^Винительный/ }).click(); // the name span truncates to 0px at 375
      // The rule summary shows question_en in EN mode
      await expect(page.getByText(pick(lang, RULE.question, RULE.question_en)).first()).toBeVisible();
      await shot(page, 'admin-grammar-case', lang, width);

      await page.getByRole('button', { name: '✎' }).last().click({ force: true }); // sentence ✎ (hover-revealed)
      await expect(page.locator(`input[value="${ADMIN_SENTENCE.english}"]`)).toBeVisible();
      await shot(page, 'admin-sentence-edit', lang, width);
      await page.getByRole('button', { name: pick(lang, 'Отмена', 'Cancel'), exact: true }).click();

      await page.getByRole('button', { name: '✎' }).first().click({ force: true }); // program ✎
      await expect(page.getByText(pick(lang, 'Описание (EN)', 'Description (EN)'), { exact: true })).toBeVisible();
      await expect(page.locator('textarea').nth(1)).toHaveValue(ADMIN_PROGRAM.description_en);
      await shot(page, 'admin-program-edit', lang, width);
    });
  }
}
