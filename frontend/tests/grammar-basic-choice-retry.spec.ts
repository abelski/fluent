// Plan #60 — grammar Basic: pick the form from 4 options; a wrong task comes back
// once at the end of the run (any level), score = first attempts only.
// API fully mocked; options are generated server-side, so the mock carries them.

import { test, expect, type Page } from '@playwright/test';

function makeFakeJwt(name: string): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = btoa(JSON.stringify({ email: 'test@test.com', name, exp: 9999999999 }));
  return `${header}.${payload}.fakesignature`;
}

const RULE = {
  question: 'Кого? Что?', name_ru: 'Галининкас', usage: 'Прямой объект',
  endings_sg: '-ą / -į', endings_pl: '-us / -as', transform: null,
};

function lessons(level: string) {
  return [{ id: 1, title: 'Урок 1', level, cases: [4], task_count: 3, rules: [RULE], is_locked: false, best_score_pct: null }];
}

const BASIC_TASKS = [
  {
    type: 'sentence', display: 'Laima mato ___.', answer: 'brolį', full_answer: 'brolį',
    translation_ru: 'Лайма видит брата.', translation_en: 'Laima sees her brother.', base_lt: 'brolis',
    options: ['brolio', 'brolį', 'broliui', 'brolis'],
  },
  {
    type: 'sentence', display: 'Skaitau ___.', answer: 'knygą', full_answer: 'knygą',
    translation_ru: 'Читаю книгу.', translation_en: 'I read a book.', base_lt: 'knyga',
    options: ['knygą', 'knyga', 'knygos', 'knygai'],
  },
  {
    type: 'sentence', display: 'Sūnui ___ metų. (10)', answer: 'dešimt', full_answer: 'dešimt',
    translation_ru: 'Сыну десять лет.', translation_en: 'The son is ten.',
  },
];

const ADVANCED_TASKS = [
  { type: 'sentence', display: 'Laima mato brol___.', answer: 'į', full_answer: 'brolį', translation_ru: 'Лайма видит брата.' },
  { type: 'sentence', display: 'Skaitau knyg___.', answer: 'ą', full_answer: 'knygą', translation_ru: 'Читаю книгу.' },
];

async function setup(page: Page, opts: { level?: string; tasks?: unknown[]; lang?: string } = {}) {
  const calls = { tasks: 0, results: [] as { score: number; total: number }[] };
  await page.addInitScript(([token, lang]) => {
    localStorage.setItem('fluent_token', token);
    localStorage.setItem('fluent_lang', lang);
  }, [makeFakeJwt('Test User'), opts.lang ?? 'ru']);
  await page.route('**/api/grammar-programs', (r) =>
    r.fulfill({ json: [{ id: 1, title: 'Литовские падежи', title_en: null, description: null, difficulty: 1, enrolled: true }] }));
  await page.route('**/api/grammar/lessons', (r) => r.fulfill({ json: lessons(opts.level ?? 'basic') }));
  await page.route(/\/api\/grammar\/verb-lessons/, (r) => r.fulfill({ json: [] }));
  await page.route('**/api/grammar/lessons/1/tasks', (r) => {
    calls.tasks += 1;
    return r.fulfill({ json: opts.tasks ?? BASIC_TASKS });
  });
  await page.route('**/api/grammar/lessons/1/results', (r) => {
    calls.results.push(r.request().postDataJSON());
    return r.fulfill({ json: { ok: true, passed: false } });
  });
  await page.goto('/dashboard/grammar');
  await page.getByTestId('level-button').first().click();
  return calls;
}

const options = (page: Page) => page.getByTestId('grammar-options').getByRole('button');
const counter = (page: Page) => page.getByTestId('task-counter');

async function optionTexts(page: Page): Promise<string[]> {
  return (await options(page).allInnerTexts()).map((t) => t.replace(/^\d\s*/, '').trim()).sort();
}

async function pick(page: Page, word: string) {
  await options(page).filter({ hasText: new RegExp(`^\\s*\\d?\\s*${word}$`) }).click();
}

test.describe('#60 grammar basic choice + retry', () => {
  test('(a) basic shows 4 options, no input; correct tap auto-advances; key 1 picks', async ({ page }) => {
    await setup(page);
    await expect(options(page)).toHaveCount(4);
    await expect(page.locator('input[type="text"]')).toHaveCount(0);
    await expect(counter(page)).toHaveText('1 / 3');

    await pick(page, 'brolį');
    await expect(page.getByTestId('choice-blank')).toHaveText('brolį');
    await expect(page.getByTestId('dismiss-wrong')).toHaveCount(0);
    await expect(counter(page)).toHaveText('2 / 3', { timeout: 3000 });

    await page.keyboard.press('1'); // first option of task 2 is "knygą" (correct)
    await expect(page.getByTestId('choice-blank')).toHaveText('knygą');
    await expect(counter(page)).toHaveText('3 / 3', { timeout: 3000 });
  });

  test('(b)(c)(d)(e) wrong task returns once at the end, score = first attempts', async ({ page }) => {
    const calls = await setup(page);

    await pick(page, 'brolio'); // wrong
    await expect(page.getByTestId('dismiss-wrong')).toBeVisible();
    await expect(page.getByText('Правильно:')).toBeVisible();
    await expect(options(page).filter({ hasText: 'brolio' })).toHaveClass(/bg-red-100/);
    await expect(options(page).filter({ hasText: 'brolį' })).toHaveClass(/bg-emerald-100/);
    await expect(counter(page)).toHaveText('1 / 4');
    await expect(page.getByTestId('retry-chip')).toHaveCount(0);
    await page.getByTestId('dismiss-wrong').click();

    await pick(page, 'knygą'); // correct
    await expect(counter(page)).toHaveText('3 / 4', { timeout: 3000 });

    // (e) task without options inside a basic run → typing
    await expect(page.locator('input[type="text"]')).toBeVisible();
    await expect(options(page)).toHaveCount(0);
    await page.locator('input[type="text"]').fill('dešimt');
    await page.locator('input[type="text"]').press('Enter');

    // the retry
    await expect(counter(page)).toHaveText('4 / 4', { timeout: 3000 });
    await expect(page.getByTestId('retry-chip')).toHaveText('Повтор');
    expect(await optionTexts(page)).toEqual([...BASIC_TASKS[0].options!].sort());
    await pick(page, 'brolis'); // wrong again → not appended again
    await expect(counter(page)).toHaveText('4 / 4');
    await page.getByTestId('dismiss-wrong').click();

    await expect.poll(() => calls.results.length).toBe(1);
    expect(calls.results[0]).toEqual({ score: 2, total: 3 });
    expect(calls.tasks).toBe(1);
  });

  test('(d) a correct retry does not add to the score', async ({ page }) => {
    const calls = await setup(page);
    await pick(page, 'brolis');
    await page.getByTestId('dismiss-wrong').click();
    await pick(page, 'knygą');
    await page.locator('input[type="text"]').fill('dešimt');
    await page.locator('input[type="text"]').press('Enter');
    await expect(page.getByTestId('retry-chip')).toBeVisible({ timeout: 3000 });
    await pick(page, 'brolį');
    await expect.poll(() => calls.results.length).toBe(1);
    expect(calls.results[0]).toEqual({ score: 2, total: 3 });
  });

  test('(f) advanced: typed wrong answer also retries', async ({ page }) => {
    await setup(page, { level: 'advanced', tasks: ADVANCED_TASKS });
    await expect(options(page)).toHaveCount(0);
    await page.locator('input[type="text"]').fill('as');
    await page.locator('input[type="text"]').press('Enter');
    await expect(counter(page)).toHaveText('1 / 3');
    await page.getByTestId('dismiss-wrong').click();
    await page.locator('input[type="text"]').fill('ą');
    await page.locator('input[type="text"]').press('Enter');
    await expect(counter(page)).toHaveText('3 / 3', { timeout: 3000 });
    await expect(page.getByTestId('retry-chip')).toBeVisible();
    await expect(page.getByText('Laima mato')).toBeVisible();
  });

  test('(g) EN locale shows "Retry"', async ({ page }) => {
    await setup(page, { lang: 'en' });
    await pick(page, 'brolio');
    await expect(page.getByText('Correct answer:')).toBeVisible();
    await page.getByTestId('dismiss-wrong').click();
    await pick(page, 'knygą');
    await page.locator('input[type="text"]').fill('dešimt', { timeout: 3000 });
    await page.locator('input[type="text"]').press('Enter');
    await expect(page.getByTestId('retry-chip')).toHaveText('Retry', { timeout: 3000 });
  });

  test('(h) 375px: options ≥44px tall, no horizontal scroll', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await setup(page);
    await expect(options(page)).toHaveCount(4);
    for (const box of await Promise.all((await options(page).all()).map((b) => b.boundingBox()))) {
      expect(box!.height).toBeGreaterThanOrEqual(44);
    }
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
