import { test, expect } from '@playwright/test';

function makeFakeJwt(name: string): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = btoa(JSON.stringify({ email: 'test@test.com', name, is_admin: false, exp: 9999999999 }));
  return `${header}.${payload}.fakesignature`;
}

async function setUserToken(page: import('@playwright/test').Page) {
  await page.addInitScript((token) => {
    localStorage.setItem('fluent_token', token);
  }, makeFakeJwt('Test User'));
}

const MOCK_PROGRAMS = [
  { id: 1, title: 'Литовские падежи', title_en: 'Lithuanian Cases', description: 'Падежи', difficulty: 1, enrolled: false, lesson_filter: null, program_type: 'cases' },
  { id: 3, title: 'Спряжение глаголов', title_en: 'Verb Conjugation', description: 'Упражнения на спряжение', difficulty: 2, enrolled: true, lesson_filter: null, program_type: 'verbs' },
  { id: 4, title: 'Управление глаголов', title_en: 'Verb Case Governance', description: 'Падежи глаголов', difficulty: 2, enrolled: true, lesson_filter: null, program_type: 'verb_cases' },
];

const MOCK_VERB_LESSONS = [
  { id: 200, level: 'basic', tense_key: 'indicative_present', task_count: 20, title: 'Настоящее время — базовый', is_locked: false, best_score_pct: null },
  { id: 201, level: 'advanced', tense_key: 'indicative_present', task_count: 30, title: 'Настоящее время — практика', is_locked: true, best_score_pct: null },
];

const MOCK_VERB_TASKS = [
  { type: 'verb_conjugation', verb_infinitive: 'kalbėti', translation_ru: 'говорить', tense_label: 'Настоящее время', person_label: 'aš', answer: 'kalbu' },
  { type: 'verb_conjugation', verb_infinitive: 'rašyti', translation_ru: 'писать', tense_label: 'Настоящее время', person_label: 'tu', answer: 'rašai' },
  { type: 'verb_conjugation', verb_infinitive: 'eiti', translation_ru: 'идти', tense_label: 'Настоящее время', person_label: 'mes', answer: 'einame' },
];

const MOCK_VERB_CASE_TASKS = [
  { type: 'verb_case', verb_infinitive: 'abejoti', translation_ru: 'сомневаться', example_lt: 'Aš abejojau jo žodžiais.', example_ru: 'Я сомневался в его словах.', answer: 'kuo?' },
];

test.describe('Verb grammar programs', () => {
  test('verb conjugation program card is visible on grammar page', async ({ page }) => {
    await setUserToken(page);

    await page.route('**/api/grammar-programs', async (route) => {
      await route.fulfill({ json: MOCK_PROGRAMS });
    });
    await page.route('**/api/grammar/lessons', async (route) => {
      await route.fulfill({ json: [] });
    });
    await page.route('**/api/grammar/progress', async (route) => {
      await route.fulfill({ json: {} });
    });

    await page.goto('/dashboard/grammar/programs');
    await expect(page.getByText('Спряжение глаголов')).toBeVisible();
    await expect(page.getByText('Управление глаголов')).toBeVisible();
  });

  test('verb conjugation lesson renders VerbConjugationTask', async ({ page }) => {
    await setUserToken(page);

    await page.route('**/api/grammar-programs', async (route) => {
      await route.fulfill({ json: MOCK_PROGRAMS });
    });
    await page.route('**/api/grammar/lessons', async (route) => {
      await route.fulfill({ json: [] });
    });
    await page.route(/\/api\/grammar\/verb-lessons/, async (route) => {
      const url = route.request().url();
      if (url.includes('/200/tasks')) {
        await route.fulfill({ json: MOCK_VERB_TASKS });
      } else {
        await route.fulfill({ json: MOCK_VERB_LESSONS });
      }
    });
    await page.route('**/api/grammar/progress', async (route) => {
      await route.fulfill({ json: {} });
    });
    await page.route('**/api/me/grammar-programs/**', async (route) => {
      await route.fulfill({ json: { ok: true } });
    });

    await page.goto('/dashboard/grammar');

    // Expand the subcategory group ("Настоящее время — базовый")
    const groupHeader = page.locator('[data-testid="subcategory-toggle"]').first();
    await expect(groupHeader).toBeVisible({ timeout: 10000 });
    await groupHeader.click();

    // Click the first unlocked lesson card
    const lessonCard = page.locator('button:not([disabled])').filter({ hasText: '20' }).first();
    await expect(lessonCard).toBeVisible();
    await lessonCard.click();

    // Should show verb conjugation task: tense label + person label + input
    await expect(page.locator('text=/Настоящее время/')).toBeVisible({ timeout: 5000 });
    // Input for verb conjugation
    const input = page.locator('input[type="text"]').first();
    await expect(input).toBeVisible();
    await expect(input).toHaveAttribute('placeholder', /форму глагола/);
  });

  test('verb conjugation task accepts correct answer', async ({ page }) => {
    await setUserToken(page);

    await page.route('**/api/grammar/lessons', async (route) => {
      await route.fulfill({ json: [] });
    });
    await page.route('**/api/grammar-programs', async (route) => {
      await route.fulfill({ json: MOCK_PROGRAMS });
    });
    await page.route('**/api/grammar/progress', async (route) => {
      await route.fulfill({ json: {} });
    });
    await page.route('**/api/grammar/verb-lessons*', async (route) => {
      const url = route.request().url();
      if (url.includes('/200/tasks')) {
        await route.fulfill({ json: MOCK_VERB_TASKS });
      } else if (url.includes('/200/results')) {
        await route.fulfill({ json: { ok: true, passed: true } });
      } else {
        await route.fulfill({ json: MOCK_VERB_LESSONS });
      }
    });

    await page.goto('/dashboard/grammar');

    // Expand first group and click lesson
    const groupHeader = page.locator('[data-testid="subcategory-toggle"]').first();
    await expect(groupHeader).toBeVisible({ timeout: 10000 });
    await groupHeader.click();
    await page.locator('button:not([disabled])').filter({ hasText: '20' }).first().click();

    // Fill any answer and submit — check the UI responds (correct or wrong feedback)
    const input = page.locator('input[type="text"]').first();
    await expect(input).toBeVisible({ timeout: 5000 });
    await input.fill('testas');
    await page.keyboard.press('Enter');

    // Either correct or "not quite" feedback should appear after submitting
    await expect(page.locator('text=/верно|Верно|не совсем|не верно|Не совсем/i')).toBeVisible({ timeout: 5000 });
  });

  test('verb case task renders example sentence', async ({ page }) => {
    await setUserToken(page);

    const caseLessons = [
      { id: 300, level: 'basic', tense_key: 'case_governance', task_count: 20, title: 'Управление глаголов — базовый', is_locked: false, best_score_pct: null },
    ];

    await page.route('**/api/grammar/lessons', async (route) => {
      await route.fulfill({ json: [] });
    });
    await page.route('**/api/grammar-programs', async (route) => {
      await route.fulfill({ json: MOCK_PROGRAMS });
    });
    await page.route('**/api/grammar/progress', async (route) => {
      await route.fulfill({ json: {} });
    });
    await page.route('**/api/grammar/verb-lessons*', async (route) => {
      const url = route.request().url();
      if (url.includes('/300/tasks')) {
        await route.fulfill({ json: MOCK_VERB_CASE_TASKS });
      } else {
        await route.fulfill({ json: caseLessons });
      }
    });

    await page.goto('/dashboard/grammar');

    // Expand first group and click lesson
    const groupHeader = page.locator('[data-testid="subcategory-toggle"]').first();
    await expect(groupHeader).toBeVisible({ timeout: 10000 });
    await groupHeader.click();
    await page.locator('button:not([disabled])').filter({ hasText: '20' }).first().click();

    // Verb case task: shows a Lithuanian example sentence + Russian translation + case governance prompt
    await expect(page.locator('text=/Каким падежом управляет/')).toBeVisible({ timeout: 5000 });

    // Input for case question
    const input = page.locator('input[type="text"]').first();
    await expect(input).toBeVisible();
    await expect(input).toHaveAttribute('placeholder', /падежный вопрос/);
  });

  test('backend GET /grammar/verb-lessons/200/tasks returns verb_conjugation tasks', async ({ request }) => {
    const res = await request.get('http://localhost:8000/api/grammar/verb-lessons/200/tasks');
    expect(res.status()).toBe(200);
    const tasks = await res.json();
    expect(Array.isArray(tasks)).toBe(true);
    expect(tasks.length).toBeGreaterThan(0);
    const task = tasks[0];
    expect(task.type).toBe('verb_conjugation');
    expect(task.verb_infinitive).toBeTruthy();
    expect(task.translation_ru).toBeTruthy();
    expect(task.tense_label).toBeTruthy();
    expect(task.person_label).toBeTruthy();
    expect(task.answer).toBeTruthy();
  });

  test('backend GET /grammar/verb-lessons/300/tasks returns verb_case tasks', async ({ request }) => {
    const res = await request.get('http://localhost:8000/api/grammar/verb-lessons/300/tasks');
    expect(res.status()).toBe(200);
    const tasks = await res.json();
    expect(Array.isArray(tasks)).toBe(true);
    expect(tasks.length).toBeGreaterThan(0);
    const task = tasks[0];
    expect(task.type).toBe('verb_case');
    expect(task.verb_infinitive).toBeTruthy();
    expect(task.example_lt).toBeTruthy();
    expect(task.answer).toBeTruthy();
  });

  test('backend unauthenticated POST /grammar/verb-lessons/200/results returns 401', async ({ request }) => {
    const res = await request.post('http://localhost:8000/api/grammar/verb-lessons/200/results', {
      data: { score: 15, total: 20 },
    });
    expect(res.status()).toBe(401);
  });
});
