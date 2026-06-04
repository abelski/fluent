import { test, expect } from '@playwright/test';

/**
 * Issue #115 — verbs_365 program should use thematic grouping (not alphabetical batches)
 */

function makeFakeJwt(name: string): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = btoa(JSON.stringify({ email: 'test@test.com', name, exp: 9999999999 }));
  return `${header}.${payload}.fakesignature`;
}

const MOCK_META = {
  verbs_365: {
    cefr_level: 'A1-C1',
    difficulty: 'medium',
    name_ru: '365 глаголов',
    name_en: '365 Verbs',
    article_url: null,
    article_name_ru: null,
    article_name_en: null,
    enrollment_count: 0,
  },
};

const THEMATIC_LISTS = [
  { id: 1001, title: 'Основные глаголы',          title_en: 'Essential Verbs',         subcategory: 'verbs_365', word_count: 40, sort_order: 0, star_counts: {'1':40} },
  { id: 1002, title: 'Общение',                   title_en: 'Communication',            subcategory: 'verbs_365', word_count: 36, sort_order: 1, star_counts: {'1':36} },
  { id: 1003, title: 'Движение',                  title_en: 'Motion',                   subcategory: 'verbs_365', word_count: 28, sort_order: 2, star_counts: {'1':28} },
  { id: 1004, title: 'Повседневная жизнь',        title_en: 'Daily Life',               subcategory: 'verbs_365', word_count: 44, sort_order: 3, star_counts: {'1':44} },
  { id: 1005, title: 'Чувства',                   title_en: 'Emotions',                 subcategory: 'verbs_365', word_count: 22, sort_order: 4, star_counts: {'1':22} },
  { id: 1006, title: 'Мышление и восприятие',     title_en: 'Thinking & Perception',    subcategory: 'verbs_365', word_count: 20, sort_order: 5, star_counts: {'1':20} },
  { id: 1007, title: 'Социальное взаимодействие', title_en: 'Social Interaction',       subcategory: 'verbs_365', word_count: 36, sort_order: 6, star_counts: {'1':36} },
  { id: 1008, title: 'Дом и быт',                 title_en: 'Home & Daily Chores',      subcategory: 'verbs_365', word_count: 24, sort_order: 7, star_counts: {'1':24} },
  { id: 1009, title: 'Работа и учёба',            title_en: 'Work & Study',             subcategory: 'verbs_365', word_count: 21, sort_order: 8, star_counts: {'1':21} },
  { id: 1010, title: 'Разное',                    title_en: 'Other',                    subcategory: 'verbs_365', word_count: 87, sort_order: 9, star_counts: {'1':87} },
];

test('verbs_365 program shows thematic groups, not alphabetical batches', async ({ page }) => {
  await page.addInitScript((token) => {
    localStorage.setItem('fluent_token', token);
  }, makeFakeJwt('Test User'));

  await page.route('**/api/subcategory-meta', (route) =>
    route.fulfill({ json: MOCK_META })
  );
  await page.route('**/api/lists*', (route) =>
    route.fulfill({ json: THEMATIC_LISTS })
  );
  await page.route('**/api/user/enrollment**', (route) =>
    route.fulfill({ json: [] })
  );

  await page.goto('/programs/verbs_365');
  await page.waitForLoadState('networkidle');

  // Thematic titles should be present
  await expect(page.getByText('Основные глаголы')).toBeVisible();
  await expect(page.getByText('Общение')).toBeVisible();
  await expect(page.getByText('Движение')).toBeVisible();
  await expect(page.getByText('Повседневная жизнь')).toBeVisible();
  await expect(page.getByText('Чувства')).toBeVisible();

  // Old alphabetical titles should NOT appear
  await expect(page.getByText('Глаголы 1–10')).not.toBeVisible();
  await expect(page.getByText('Глаголы 11–20')).not.toBeVisible();
});

test('verbs_365 thematic groups appear in correct order', async ({ page }) => {
  await page.addInitScript((token) => {
    localStorage.setItem('fluent_token', token);
  }, makeFakeJwt('Test User'));

  await page.route('**/api/subcategory-meta', (route) =>
    route.fulfill({ json: MOCK_META })
  );
  await page.route('**/api/lists*', (route) =>
    route.fulfill({ json: THEMATIC_LISTS })
  );
  await page.route('**/api/user/enrollment**', (route) =>
    route.fulfill({ json: [] })
  );

  await page.goto('/programs/verbs_365');
  await page.waitForLoadState('networkidle');

  const themes = ['Основные глаголы', 'Общение', 'Движение', 'Повседневная жизнь',
                   'Чувства', 'Мышление и восприятие', 'Социальное взаимодействие',
                   'Дом и быт', 'Работа и учёба', 'Разное'];
  for (const theme of themes) {
    await expect(page.getByText(theme)).toBeVisible();
  }
  // None of the old alphabetical titles should appear
  await expect(page.getByText('Глаголы 1–10')).not.toBeVisible();
});
