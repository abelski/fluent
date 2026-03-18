import { test, expect } from '@playwright/test';

function makeFakeJwt(name: string, isAdmin = false): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = btoa(JSON.stringify({ email: 'test@test.com', name, is_admin: isAdmin, exp: 9999999999 }));
  return `${header}.${payload}.fakesignature`;
}

async function setAdminToken(page: import('@playwright/test').Page) {
  await page.addInitScript((token) => {
    localStorage.setItem('fluent_token', token);
  }, makeFakeJwt('Admin User', true));
}

const MOCK_SENTENCES = [
  {
    id: 1,
    case_index: 1,
    display: 'Čia yra nam___.',
    answer_ending: 'as',
    full_word: 'namas',
    russian: 'Здесь есть дом.',
    archived: false,
  },
  {
    id: 2,
    case_index: 1,
    display: 'Tai yra knyg___.',
    answer_ending: 'a',
    full_word: 'knyga',
    russian: 'Это книга.',
    archived: false,
  },
  {
    id: 3,
    case_index: 2,
    display: 'Nėra nam___.',
    answer_ending: 'o',
    full_word: 'namo',
    russian: 'Нет дома.',
    archived: false,
  },
];

const MOCK_RULES = [
  {
    id: 1,
    case_index: 1,
    name_ru: 'Именительный (Vardininkas)',
    question: 'Кто? Что?',
    usage: 'Подлежащее в предложении',
    endings_sg: '-as, -is, -us, -a, -ė',
    endings_pl: '-ai, -iai, -ūs, -os, -ės',
    transform: 'Базовая форма',
  },
];

function setupMocks(page: import('@playwright/test').Page) {
  page.route('**/api/admin/grammar/sentences**', async (route) => {
    await route.fulfill({ json: MOCK_SENTENCES });
  });
  page.route('**/api/admin/grammar/rules', async (route) => {
    await route.fulfill({ json: MOCK_RULES });
  });
  page.route('**/api/admin/users', async (route) => {
    await route.fulfill({ json: [] });
  });
  page.route('**/api/me/quota', async (route) => {
    await route.fulfill({ json: { is_superadmin: false } });
  });
  page.route('**/api/admin/reports', async (route) => {
    await route.fulfill({ json: [] });
  });
  page.route('**/api/admin/articles', async (route) => {
    await route.fulfill({ json: [] });
  });
  page.route('**/api/admin/subcategories', async (route) => {
    await route.fulfill({ json: [] });
  });
  page.route('**/api/admin/content/word-lists', async (route) => {
    await route.fulfill({ json: [] });
  });
}

test.describe('Admin Grammar page — navigation', () => {
  test('shows Грамматика button in content sub-tabs on admin page', async ({ page }) => {
    await setAdminToken(page);
    setupMocks(page);
    await page.goto('/dashboard/admin');
    await page.getByRole('button', { name: 'Контент' }).click();
    await expect(page.getByRole('button', { name: 'Грамматика' })).toBeVisible();
  });

  test('Грамматика button navigates to grammar admin page', async ({ page }) => {
    await setAdminToken(page);
    setupMocks(page);
    await page.goto('/dashboard/admin');
    await page.getByRole('button', { name: 'Контент' }).click();
    await page.getByRole('button', { name: 'Грамматика' }).click();
    await expect(page).toHaveURL(/\/dashboard\/admin\/grammar/);
  });
});

test.describe('Admin Grammar page — content', () => {
  test('shows page title', async ({ page }) => {
    await setAdminToken(page);
    setupMocks(page);
    await page.goto('/dashboard/admin/grammar');
    await expect(page.getByRole('heading', { name: 'Грамматика' })).toBeVisible({ timeout: 5000 });
  });

  test('shows 14 case tabs', async ({ page }) => {
    await setAdminToken(page);
    setupMocks(page);
    await page.goto('/dashboard/admin/grammar');
    // First case tab should be visible
    await expect(page.getByRole('button', { name: /^1\. Vardininkas/ })).toBeVisible({ timeout: 5000 });
    // Last case tab should be visible
    await expect(page.getByRole('button', { name: /^14\. Šauksmininkas/ })).toBeVisible();
  });

  test('shows sentences for the selected case (case 1 by default)', async ({ page }) => {
    await setAdminToken(page);
    setupMocks(page);
    await page.goto('/dashboard/admin/grammar');
    await expect(page.getByText('Čia yra nam[as].')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('namas')).toBeVisible();
    await expect(page.getByText('Здесь есть дом.')).toBeVisible();
  });

  test('switching to case 2 shows sentences for that case', async ({ page }) => {
    await setAdminToken(page);
    setupMocks(page);
    await page.goto('/dashboard/admin/grammar');
    await page.getByRole('button', { name: /^2\. Kilmininkas/ }).click();
    await expect(page.getByText('Nėra nam[o].')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('Нет дома.')).toBeVisible();
  });

  test('shows add sentence button', async ({ page }) => {
    await setAdminToken(page);
    setupMocks(page);
    await page.goto('/dashboard/admin/grammar');
    await expect(page.getByRole('button', { name: '+ Добавить предложение' })).toBeVisible({ timeout: 5000 });
  });

  test('clicking add sentence opens form', async ({ page }) => {
    await setAdminToken(page);
    setupMocks(page);
    await page.goto('/dashboard/admin/grammar');
    await page.getByRole('button', { name: '+ Добавить предложение' }).click();
    await expect(page.getByText('Новое предложение')).toBeVisible();
    await expect(page.getByPlaceholder('Laima mato brol___.')).toBeVisible();
  });

  test('add sentence form shows validation error if display has no ___', async ({ page }) => {
    await setAdminToken(page);
    setupMocks(page);
    await page.goto('/dashboard/admin/grammar');
    await page.getByRole('button', { name: '+ Добавить предложение' }).click();
    await page.getByPlaceholder('Laima mato brol___.').fill('No blank here.');
    await page.getByPlaceholder('į', { exact: true }).fill('as');
    await page.getByPlaceholder('brolį', { exact: true }).fill('namas');
    await page.getByPlaceholder('Лайма видит брата.').fill('Тест.');
    await page.getByRole('button', { name: 'Сохранить' }).click();
    await expect(page.getByText(/должно содержать ___/)).toBeVisible();
  });

  test('shows case rule section for current case', async ({ page }) => {
    await setAdminToken(page);
    setupMocks(page);
    await page.goto('/dashboard/admin/grammar');
    await expect(page.getByText(/Правило: Именительный/)).toBeVisible({ timeout: 5000 });
  });

  test('clicking rule section expands it', async ({ page }) => {
    await setAdminToken(page);
    setupMocks(page);
    await page.goto('/dashboard/admin/grammar');
    await page.getByText(/Правило: Именительный/).click();
    await expect(page.getByText('Подлежащее в предложении')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('-as, -is, -us, -a, -ė')).toBeVisible();
  });

  test('shows back link to admin panel', async ({ page }) => {
    await setAdminToken(page);
    setupMocks(page);
    await page.goto('/dashboard/admin/grammar');
    await expect(page.getByRole('link', { name: '← Админ' })).toBeVisible({ timeout: 5000 });
  });
});
