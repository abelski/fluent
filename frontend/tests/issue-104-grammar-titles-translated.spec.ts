import { test, expect } from '@playwright/test';

function makeFakeJwt(name: string): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = btoa(JSON.stringify({ email: 'test@test.com', name, exp: 9999999999 }));
  return `${header}.${payload}.fakesignature`;
}

const MOCK_CONFIG = {
  lessons: [],
  cases: {},
};

const MOCK_PROGRAM = {
  id: 1,
  title: 'Литовские падежи',
  title_en: 'Lithuanian Cases',
  description: 'Все грамматические падежи литовского языка.',
  difficulty: 1,
  lesson_filter: '[]',
  enrolled: true,
};

function setupMocks(page: import('@playwright/test').Page) {
  page.route('**/api/admin/grammar/config', route => route.fulfill({ json: MOCK_CONFIG }));
  page.route('**/api/grammar-programs', route => route.fulfill({ json: [MOCK_PROGRAM] }));
  page.route('**/api/grammar/lessons', route => route.fulfill({ json: [] }));
}

test.describe('Grammar program titles i18n (issue #104)', () => {
  test('English UI shows English program title', async ({ page }) => {
    await page.addInitScript((token) => {
      localStorage.setItem('fluent_token', token);
      localStorage.setItem('fluent_lang', 'en');
      localStorage.setItem('cookie_consent', 'accepted');
    }, makeFakeJwt('Test User'));
    setupMocks(page);

    await page.goto('/dashboard/grammar');

    await expect(page.getByText('Lithuanian Cases')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('Литовские падежи')).toHaveCount(0);
  });

  test('Russian UI still shows Russian program title', async ({ page }) => {
    await page.addInitScript((token) => {
      localStorage.setItem('fluent_token', token);
      localStorage.setItem('fluent_lang', 'ru');
      localStorage.setItem('cookie_consent', 'accepted');
    }, makeFakeJwt('Test User'));
    setupMocks(page);

    await page.goto('/dashboard/grammar');

    await expect(page.getByText('Литовские падежи')).toBeVisible({ timeout: 5000 });
  });
});
