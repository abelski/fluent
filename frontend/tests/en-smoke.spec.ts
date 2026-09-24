import { test, expect, type Page } from '@playwright/test';

// Plan #48a — EN render smoke test. The static guard (no-hardcoded-russian.spec.ts)
// catches literal RU strings in source, but not plural/locale wiring that only shows
// up once a component actually renders with lang='en' (e.g. a `plural()` call fed the
// wrong PluralForms, or a date formatter still hard-wired to 'ru-RU'). This spec mocks
// every API and asserts `document.body.innerText` carries no Cyrillic on three screens.

const CYRILLIC_RE = /[А-Яа-яЁё]/;

function makeFakeJwt(email: string, extra: Record<string, unknown> = {}): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = btoa(JSON.stringify({ email, name: 'Test User', exp: 9999999999, ...extra }));
  return `${header}.${payload}.fakesignature`;
}

async function setEnLang(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('fluent_lang', 'en');
    localStorage.setItem('cookie_consent', 'accepted');
  });
}

async function bodyHasNoCyrillic(page: Page) {
  const text = await page.locator('body').innerText();
  expect(text).not.toMatch(CYRILLIC_RE);
}

test.describe('EN render smoke — practice result page', () => {
  const TEST = {
    id: 1, title_ru: 'Тест', title_en: 'Test', description_ru: null, description_en: null,
    lesson_text_lt: null, question_count: 1, pass_threshold: 0.7, is_premium: false,
    active_question_count: 1, is_locked: false, best_score_pct: null,
  };
  const QUESTIONS = [
    {
      id: 1, question_ru: 'Вопрос?', question_lt: 'Klausimas?',
      option_a: 'A', option_b: 'B', option_c: 'C', option_d: 'D',
      correct_option: 'a', category: null,
    },
  ];

  test.beforeEach(async ({ page }) => {
    await setEnLang(page);
    await page.addInitScript((token) => {
      localStorage.setItem('fluent_token', token);
    }, makeFakeJwt('practice@test.com'));
    await page.route('**/api/me/quota', (r) => r.fulfill({ json: {
      is_premium: false, premium_active: false, premium_until: null, sessions_today: 0,
      daily_limit: 5, is_admin: false } }));
    await page.route('**/api/practice/categories/*/tests*', (r) => r.fulfill({ json: [TEST] }));
    await page.route('**/api/practice/categories', (r) => r.fulfill({ json: [
      { id: 1, name_ru: 'Категория', name_en: 'Category', description_ru: null, source_url: null }] }));
    await page.route('**/api/practice/tests/1/exam', (r) => r.fulfill({ json: {
      test: { id: 1, title_ru: 'Тест', title_en: 'Test', pass_threshold: 0.7, lesson_text_lt: null },
      questions: QUESTIONS,
    } }));
    await page.route('**/api/practice/tests/1/results', (r) => r.fulfill({ json: { ok: true } }));
  });

  test('a failed result and its answer review carry no Cyrillic', async ({ page }) => {
    await page.goto('/dashboard/practice/_?id=1');
    await page.getByRole('button', { name: /Start practice/i }).click();
    // Answer with the wrong option (B) so the result is a fail — correct_option is 'a'.
    await page.locator('button').filter({ hasText: /^BB$/ }).click();
    await page.getByRole('button', { name: /Submit answer/i }).click();
    await page.getByRole('button', { name: /Finish/i }).click();

    await expect(page.getByText(/Exam complete/i)).toBeVisible();
    // The answer-review section is part of the same result screen.
    await expect(page.getByText('Answer review')).toBeVisible();
    await bodyHasNoCyrillic(page);
  });
});

test.describe('EN render smoke — grammar sentence runner', () => {
  const MOCK_LESSON = {
    id: 2,
    title: 'RU title (DB content, 48b)',
    level: 'advanced',
    cases: [4],
    task_count: 1,
    rules: [
      {
        question: 'Ką?',
        name_ru: 'Accusative (test fixture, EN)',
        usage: 'Direct object (test fixture, EN)',
        endings_sg: '-ą / -į',
        endings_pl: '-us / -ius',
        transform: null,
      },
    ],
    is_locked: false,
    best_score_pct: null,
  };
  const MOCK_TASK = [
    {
      type: 'sentence',
      display: 'Jonas neša krep___.',
      answer: 'šį',
      full_answer: 'krepšį',
      translation_ru: 'John carries a bag (test fixture, EN).',
      base_lt: 'krepšys',
    },
  ];

  test.beforeEach(async ({ page }) => {
    await setEnLang(page);
    await page.addInitScript((token) => {
      localStorage.setItem('fluent_token', token);
    }, makeFakeJwt('grammar@test.com'));
    await page.route('**/api/grammar-programs', (r) => r.fulfill({ json: [
      { id: 1, title: 'Enrolled program (test fixture, EN)', title_en: null, description: null, difficulty: 1, enrolled: true },
    ] }));
    await page.route('**/api/grammar/lessons', (r) => r.fulfill({ json: [MOCK_LESSON] }));
    await page.route(/\/api\/grammar\/verb-lessons/, (r) => r.fulfill({ json: [] }));
    await page.route('**/api/grammar/lessons/2/tasks', (r) => r.fulfill({ json: MOCK_TASK }));
    await page.route('**/api/grammar/lessons/2/results', (r) => r.fulfill({ json: { ok: true, passed: true } }));
    await page.route('**/api/admin/grammar/config', (r) => r.fulfill({ json: { lessons: [], cases: {} } }));
  });

  test('the rule card and base-word hint carry no Cyrillic', async ({ page }) => {
    await page.goto('/dashboard/grammar');
    await page.waitForSelector('[data-testid="subcategory-toggle"]', { timeout: 5000 });
    await page.locator('[data-testid="subcategory-toggle"]').first().click();
    await page.waitForSelector('.grid button', { timeout: 5000 });
    await page.locator('.grid button').first().click();

    await page.waitForSelector('input[type="text"]', { timeout: 5000 });
    // The rule card (question/usage/endings) and the base_lt hint are both on screen.
    await expect(page.getByText('krepšys')).toBeVisible();
    await bodyHasNoCyrillic(page);
  });
});

test.describe('EN render smoke — admin users tab', () => {
  const MOCK_USERS = [
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

  test.beforeEach(async ({ page }) => {
    await setEnLang(page);
    await page.addInitScript((token) => {
      localStorage.setItem('fluent_token', token);
    }, makeFakeJwt('admin@test.com', { is_admin: true }));
    await page.route('**/api/admin/users', (r) => r.fulfill({ json: MOCK_USERS }));
    await page.route('**/api/me/quota', (r) => r.fulfill({ json: { is_superadmin: true } }));
    await page.route('**/api/admin/reports', (r) => r.fulfill({ json: [] }));
    await page.route('**/api/admin/articles', (r) => r.fulfill({ json: [] }));
    await page.route('**/api/admin/subcategories', (r) => r.fulfill({ json: [] }));
    await page.route('**/api/admin/content/word-lists', (r) => r.fulfill({ json: [] }));
    await page.route('**/api/admin/grammar/rules', (r) => r.fulfill({ json: [] }));
    await page.route('**/api/admin/feedback', (r) => r.fulfill({ json: [] }));
  });

  test('the Users table, including premium-until and last-login dates, carries no Cyrillic', async ({ page }) => {
    await page.goto('/dashboard/admin');
    await expect(page.getByText('dave@example.com')).toBeVisible();
    // en-GB dates render with a short English month, never a Cyrillic one.
    await expect(page.getByText(/1 Dec 2026/)).toBeVisible();
    await bodyHasNoCyrillic(page);
  });
});
