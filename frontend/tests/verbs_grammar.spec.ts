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
