import { test, type Page } from '@playwright/test';
import path from 'path';

// Plan #48a — evidence screenshots. RU + EN, 1280px + 375px, for every screen this
// plan touched. All APIs are mocked so a shot never depends on live data.

const DIR = path.join(__dirname, '..', '..', 'temp_files', 'screenshots', 'plan_48a_en-ui-strings');
const WIDTHS = { desktop: 1280, mobile: 375 } as const;
const LANGS = ['ru', 'en'] as const;

function makeFakeJwt(email: string, extra: Record<string, unknown> = {}): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = btoa(JSON.stringify({ email, name: 'Test User', exp: 9999999999, ...extra }));
  return `${header}.${payload}.fakesignature`;
}

async function setup(page: Page, lang: 'ru' | 'en', width: number, token: string) {
  await page.addInitScript(([t, l]) => {
    localStorage.setItem('fluent_token', t);
    localStorage.setItem('fluent_lang', l);
    localStorage.setItem('cookie_consent', 'accepted');
  }, [token, lang] as const);
  await page.setViewportSize({ width, height: 900 });
  await page.route('**/api/billing/config', (r) => r.fulfill({ json: { enabled: true } }));
}

async function shot(page: Page, name: string, lang: string, width: number) {
  await page.waitForTimeout(300); // let Tailwind transitions settle
  await page.screenshot({ path: path.join(DIR, `${name}-${lang}-${width}.png`), fullPage: true });
}

// ── Practice: intro, question, answered, result (pass/fail), empty category ──

const PRACTICE_TEST = {
  id: 1, title_ru: 'Бесплатный тест', title_en: 'Free test', description_ru: null, description_en: null,
  lesson_text_lt: null, question_count: 1, pass_threshold: 0.7, is_premium: false,
  active_question_count: 1, is_locked: false, best_score_pct: null,
};
const PRACTICE_QUESTIONS = [
  {
    id: 1, question_ru: 'Вопрос?', question_lt: 'Klausimas?',
    option_a: 'Variantas A', option_b: 'Variantas B', option_c: 'Variantas C', option_d: 'Variantas D',
    correct_option: 'a', category: null,
  },
];

async function mockPractice(page: Page, opts: { empty?: boolean } = {}) {
  await page.route('**/api/me/quota', (r) => r.fulfill({ json: {
    is_premium: false, premium_active: false, premium_until: null, sessions_today: 0,
    daily_limit: 5, is_admin: false } }));
  await page.route('**/api/practice/categories/*/tests*', (r) => r.fulfill({ json: opts.empty ? [] : [PRACTICE_TEST] }));
  await page.route('**/api/practice/categories', (r) => r.fulfill({ json: [
    { id: 1, name_ru: 'Конституция', name_en: 'Constitution', description_ru: null, source_url: null }] }));
  await page.route('**/api/practice/tests/1/exam', (r) => r.fulfill({ json: {
    test: { id: 1, title_ru: 'Бесплатный тест', title_en: 'Free test', pass_threshold: 0.7, lesson_text_lt: null },
    questions: PRACTICE_QUESTIONS,
  } }));
  await page.route('**/api/practice/tests/1/results', (r) => r.fulfill({ json: { ok: true } }));
}

for (const lang of LANGS) {
  for (const [wname, width] of Object.entries(WIDTHS)) {
    test(`practice intro — ${lang} ${wname}`, async ({ page }) => {
      await setup(page, lang, width, makeFakeJwt('practice@test.com'));
      await mockPractice(page);
      await page.goto('/dashboard/practice/_?id=1');
      await page.waitForSelector('text=Free test, text=Бесплатный тест', { timeout: 5000 }).catch(() => {});
      await shot(page, 'practice-intro', lang, width);
    });

    test(`practice empty category — ${lang} ${wname}`, async ({ page }) => {
      await setup(page, lang, width, makeFakeJwt('practice-empty@test.com'));
      await mockPractice(page, { empty: true });
      await page.goto('/dashboard/practice/_?id=1');
      await page.waitForTimeout(300);
      await shot(page, 'practice-empty', lang, width);
    });

    test(`practice question + answered + result — ${lang} ${wname}`, async ({ page }) => {
      await setup(page, lang, width, makeFakeJwt('practice-flow@test.com'));
      await mockPractice(page);
      await page.goto('/dashboard/practice/_?id=1');
      await page.getByRole('button', { name: /Start|Начать/i }).click();
      await shot(page, 'practice-question', lang, width);

      // Correct answer (A) → passed result.
      await page.locator('button').filter({ hasText: /^AVariantas A$|^AA$/ }).first().click();
      await shot(page, 'practice-answered', lang, width);
      await page.getByRole('button', { name: /Submit answer|Ответить/i }).click();
      await page.getByRole('button', { name: /Finish|Завершить/i }).click();
      await shot(page, 'practice-result-passed', lang, width);
    });

    test(`practice result failed — ${lang} ${wname}`, async ({ page }) => {
      await setup(page, lang, width, makeFakeJwt('practice-fail@test.com'));
      await mockPractice(page);
      await page.goto('/dashboard/practice/_?id=1');
      await page.getByRole('button', { name: /Start|Начать/i }).click();
      await page.locator('button').filter({ hasText: /^BVariantas B$|^BB$/ }).first().click();
      await page.getByRole('button', { name: /Submit answer|Ответить/i }).click();
      await page.getByRole('button', { name: /Finish|Завершить/i }).click();
      await shot(page, 'practice-result-failed', lang, width);
    });
  }
}

// ── /dashboard/programs/new ──────────────────────────────────────────────────

async function mockProgramsNew(page: Page) {
  await page.route('**/api/me/quota', (r) => r.fulfill({ json: { is_redactor: true } }));
}

for (const lang of LANGS) {
  for (const [wname, width] of Object.entries(WIDTHS)) {
    test(`programs/new — ${lang} ${wname}`, async ({ page }) => {
      await setup(page, lang, width, makeFakeJwt('editor@test.com'));
      await mockProgramsNew(page);
      await page.goto('/dashboard/programs/new');
      await page.waitForSelector('input[type=text], input[placeholder]', { timeout: 5000 }).catch(() => {});
      await shot(page, 'programs-new', lang, width);
    });
  }
}

// ── /dashboard/lists ──────────────────────────────────────────────────────────

const LISTS_WORDS = [
  { id: 1, lithuanian: 'katė', translation_en: 'cat', translation_ru: 'кошка', hint: null, star: 1, status: 'new' },
];

async function mockLists(page: Page) {
  await page.route('**/api/me/quota', (r) => r.fulfill({ json: {
    is_premium: false, premium_active: false, sessions_today: 0, daily_limit: 10, is_admin: false, is_superadmin: false } }));
  await page.route('**/api/me/programs', (r) => r.fulfill({ json: ['test'] }));
  await page.route('**/api/subcategory-meta', (r) => r.fulfill({ json: { test: {
    cefr_level: null, difficulty: null, article_url: null, article_name_ru: null, article_name_en: null,
    name_ru: 'Тест', name_en: 'Test' } } }));
  await page.route('**/api/lists', (r) => r.fulfill({ json: [
    { id: 1, title: 'Тестовый список', title_en: 'Test list', description: null, description_en: null, subcategory: 'test', word_count: 1 }] }));
  await page.route('**/api/me/lists-progress', (r) => r.fulfill({ json: {} }));
  await page.route('**/api/lists/*/study**', (r) => r.fulfill({ json: { words: LISTS_WORDS, distractors: [] } }));
  await page.route('**/api/me/custom-program-enrollments', (r) => r.fulfill({ json: [] }));
}

for (const lang of LANGS) {
  for (const [wname, width] of Object.entries(WIDTHS)) {
    test(`dashboard/lists — ${lang} ${wname}`, async ({ page }) => {
      await setup(page, lang, width, makeFakeJwt('lists@test.com'));
      await mockLists(page);
      await page.goto('/dashboard/lists');
      await page.waitForSelector('[data-testid="star-toggle"]', { timeout: 5000 }).catch(() => {});
      await shot(page, 'dashboard-lists', lang, width);
    });
  }
}

// ── Grammar runner ─────────────────────────────────────────────────────────────

const GRAMMAR_LESSON = {
  id: 2, title: 'Урок 2 — Винительный', level: 'advanced', cases: [4], task_count: 1,
  rules: [{
    question: 'Ką?', name_ru: 'Винительный', usage: 'Прямое дополнение',
    endings_sg: '-ą / -į', endings_pl: '-us / -ius', transform: null,
  }],
  is_locked: false, best_score_pct: null,
};
const GRAMMAR_TASK = [{
  type: 'sentence', display: 'Jonas neša krep___.', answer: 'šį', full_answer: 'krepšį',
  translation_ru: 'Йонас несёт сумку.', base_lt: 'krepšys',
}];

async function mockGrammar(page: Page) {
  await page.route('**/api/grammar-programs', (r) => r.fulfill({ json: [
    { id: 1, title: 'Литовские падежи', title_en: null, description: null, difficulty: 1, enrolled: true }] }));
  await page.route('**/api/grammar/lessons', (r) => r.fulfill({ json: [GRAMMAR_LESSON] }));
  await page.route(/\/api\/grammar\/verb-lessons/, (r) => r.fulfill({ json: [] }));
  await page.route('**/api/grammar/lessons/2/tasks', (r) => r.fulfill({ json: GRAMMAR_TASK }));
  await page.route('**/api/grammar/lessons/2/results', (r) => r.fulfill({ json: { ok: true, passed: true } }));
  await page.route('**/api/admin/grammar/config', (r) => r.fulfill({ json: { lessons: [], cases: {} } }));
}

for (const lang of LANGS) {
  for (const [wname, width] of Object.entries(WIDTHS)) {
    test(`grammar runner — ${lang} ${wname}`, async ({ page }) => {
      await setup(page, lang, width, makeFakeJwt('grammar@test.com'));
      await mockGrammar(page);
      await page.goto('/dashboard/grammar');
      await page.waitForSelector('[data-testid="subcategory-toggle"]', { timeout: 5000 });
      await page.locator('[data-testid="subcategory-toggle"]').first().click();
      await page.waitForSelector('.grid button', { timeout: 5000 });
      await page.locator('.grid button').first().click();
      await page.waitForSelector('input[type="text"]', { timeout: 5000 });
      await shot(page, 'grammar-runner', lang, width);
    });
  }
}

// ── Admin users tab ──────────────────────────────────────────────────────────

const ADMIN_USERS = [
  {
    id: 'u-dave', email: 'dave@example.com', name: 'Dave',
    is_premium: true, premium_until: '2026-12-01T00:00:00', premium_active: true,
    subscription_status: null, stripe_customer_id: null,
    is_admin: false, is_superadmin: false, is_redactor: false,
    sessions_today: 3, daily_limit: null, last_login: '2026-09-10T14:32:00', email_consent: false,
    inactive_flag: false, inactive_since: null, deletion_warning: false, deletion_due: null,
    notice_sent_at: null,
  },
];

async function mockAdmin(page: Page) {
  await page.route('**/api/admin/users', (r) => r.fulfill({ json: ADMIN_USERS }));
  await page.route('**/api/me/quota', (r) => r.fulfill({ json: { is_superadmin: true } }));
  await page.route('**/api/admin/reports', (r) => r.fulfill({ json: [] }));
  await page.route('**/api/admin/articles', (r) => r.fulfill({ json: [] }));
  await page.route('**/api/admin/subcategories', (r) => r.fulfill({ json: [] }));
  await page.route('**/api/admin/content/word-lists', (r) => r.fulfill({ json: [] }));
  await page.route('**/api/admin/grammar/rules', (r) => r.fulfill({ json: [] }));
  await page.route('**/api/admin/feedback', (r) => r.fulfill({ json: [] }));
}

for (const lang of LANGS) {
  for (const [wname, width] of Object.entries(WIDTHS)) {
    test(`admin users tab — ${lang} ${wname}`, async ({ page }) => {
      await setup(page, lang, width, makeFakeJwt('admin@test.com', { is_admin: true }));
      await mockAdmin(page);
      await page.goto('/dashboard/admin');
      await page.waitForSelector('text=dave@example.com', { timeout: 5000 });
      await shot(page, 'admin-users', lang, width);
    });
  }
}
