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

const MOCK_CONFIG = {
  lessons: [
    [1, 'basic',    [4], 24, 'Galininkas Vns.'],
    [2, 'advanced', [4], 35, 'Galininkas Vns.'],
    [3, 'practice', [4], 20, 'Galininkas Vns.'],
    [4, 'basic',    [6], 24, 'Vietininkas Vns.'],
    [10, 'basic',   [2], 24, 'Kilmininkas Vns.'],
    [70, 'basic',   [15], 24, 'Skaičiai: Vardininkas'],
    [71, 'advanced',[15], 35, 'Skaičiai: Vardininkas'],
  ],
  cases: {
    '2':  ['Kilmininkas',            'Vienaskaita'],
    '4':  ['Galininkas',             'Vienaskaita'],
    '6':  ['Vietininkas',            'Vienaskaita'],
    '8':  ['Vardininkas',            'Daugiskaita'],
    '14': ['Šauksmininkas',          'Daugiskaita'],
    '15': ['Kiekiniai: Vardininkas', 'Skaičiai'],
  },
};

const MOCK_SENTENCES = [
  {
    id: 1, case_index: 4,
    display: 'Laima mato brol___.', answer_ending: 'į', full_word: 'brolį',
    russian: 'Лайма видит брата.', archived: false,
    use_in_basic: true, use_in_advanced: true, use_in_practice: true,
  },
  {
    id: 2, case_index: 4,
    display: 'Ji skaito knyg___.', answer_ending: 'ą', full_word: 'knygą',
    russian: 'Она читает книгу.', archived: false,
    use_in_basic: true, use_in_advanced: false, use_in_practice: true,
  },
  {
    id: 3, case_index: 2,
    display: 'Nėra nam___.', answer_ending: 'o', full_word: 'namo',
    russian: 'Нет дома.', archived: false,
    use_in_basic: true, use_in_advanced: true, use_in_practice: true,
  },
];

const MOCK_RULES = [
  {
    id: 4, case_index: 4,
    name_ru: 'Винительный (Galininkas)', question: 'Кого? Что?',
    usage: 'Прямое дополнение', endings_sg: '-ą, -į, -ų', endings_pl: '-us, -ius, -as, -es',
    transform: 'Ед.: м. -as/-is/-us → -ą/-į/-ų', status: 'published', article_slug: null,
  },
  {
    id: 8, case_index: 8,
    name_ru: 'Именительный мн.ч.', question: 'Кто? Что?',
    usage: '', endings_sg: '', endings_pl: '-ai, -iai, -ūs, -os, -ės',
    transform: '', status: 'draft', article_slug: null,
  },
];

const MOCK_PROGRAMS = [
  {
    id: 1,
    title: 'Литовские падежи',
    title_en: 'Lithuanian Cases',
    description: 'Все грамматические падежи.',
    difficulty: 1,
    is_public: true,
    lesson_filter: '["Vienaskaita","Daugiskaita"]',
  },
  {
    id: 2,
    title: 'Числительные',
    title_en: 'Numbers',
    description: null,
    difficulty: 1,
    is_public: true,
    lesson_filter: '["Skaičiai"]',
  },
];

function setupMocks(page: import('@playwright/test').Page) {
  page.route('**/api/admin/grammar/config', async (route) => {
    await route.fulfill({ json: MOCK_CONFIG });
  });
  page.route('**/api/admin/grammar/sentences**', async (route) => {
    await route.fulfill({ json: MOCK_SENTENCES });
  });
  page.route('**/api/admin/grammar/rules', async (route) => {
    await route.fulfill({ json: MOCK_RULES });
  });
  page.route('**/api/admin/grammar/programs', async (route) => {
    await route.fulfill({ json: MOCK_PROGRAMS });
  });
  page.route('**/api/admin/users', async (route) => { await route.fulfill({ json: [] }); });
  page.route('**/api/me/quota', async (route) => { await route.fulfill({ json: { is_superadmin: false } }); });
  page.route('**/api/admin/reports', async (route) => { await route.fulfill({ json: [] }); });
  page.route('**/api/admin/articles', async (route) => { await route.fulfill({ json: [] }); });
  page.route('**/api/admin/subcategories', async (route) => { await route.fulfill({ json: [] }); });
  page.route('**/api/admin/content/word-lists', async (route) => { await route.fulfill({ json: [] }); });
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

test.describe('Admin Grammar page — program view', () => {
  test('shows page title', async ({ page }) => {
    await setAdminToken(page);
    setupMocks(page);
    await page.goto('/dashboard/admin/grammar');
    await expect(page.getByRole('heading', { name: 'Грамматика' })).toBeVisible({ timeout: 5000 });
  });

  test('shows program list with program names', async ({ page }) => {
    await setAdminToken(page);
    setupMocks(page);
    await page.goto('/dashboard/admin/grammar');
    await expect(page.getByText('Литовские падежи')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('Числительные').first()).toBeVisible();
  });

  test('shows case rows within expanded program', async ({ page }) => {
    await setAdminToken(page);
    setupMocks(page);
    await page.goto('/dashboard/admin/grammar');
    await page.getByTestId('program-lessons-toggle-1').click();
    await expect(page.getByText('Galininkas')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('Kilmininkas')).toBeVisible();
  });

  test('shows lesson count badges on case rows', async ({ page }) => {
    await setAdminToken(page);
    setupMocks(page);
    await page.goto('/dashboard/admin/grammar');
    await page.getByTestId('program-lessons-toggle-1').click();
    // Galininkas has basic(24)/advanced(35)/practice(20) lessons — badges show task counts
    await expect(page.getByText('24').first()).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('35').first()).toBeVisible();
  });

  test('shows status selector for cases with rules', async ({ page }) => {
    await setAdminToken(page);
    setupMocks(page);
    await page.goto('/dashboard/admin/grammar');
    await page.getByTestId('program-lessons-toggle-1').click();
    // Galininkas is published, so there should be a status selector
    const selects = page.locator('select');
    await expect(selects.first()).toBeVisible({ timeout: 5000 });
  });

  test('collapsing a program hides case rows', async ({ page }) => {
    await setAdminToken(page);
    setupMocks(page);
    await page.goto('/dashboard/admin/grammar');
    await page.getByTestId('program-lessons-toggle-1').click();
    await expect(page.getByText('Galininkas')).toBeVisible({ timeout: 5000 });
    await page.getByTestId('program-lessons-toggle-1').click();
    await expect(page.getByText('Galininkas')).not.toBeVisible();
  });

  test('shows sentence count per case', async ({ page }) => {
    await setAdminToken(page);
    setupMocks(page);
    await page.goto('/dashboard/admin/grammar');
    await page.getByTestId('program-lessons-toggle-1').click();
    // Galininkas has 2 active sentences → "2 пр."
    await expect(page.getByText('2 пр.')).toBeVisible({ timeout: 5000 });
  });

  test('shows нет уроков for cases without lessons', async ({ page }) => {
    await setAdminToken(page);
    setupMocks(page);
    await page.goto('/dashboard/admin/grammar');
    await page.getByTestId('program-lessons-toggle-1').click();
    // Šauksmininkas (case 14) has no lessons in mock config
    await expect(page.getByText('нет уроков').first()).toBeVisible({ timeout: 5000 });
  });

  test('expanding a case shows sentences inline', async ({ page }) => {
    await setAdminToken(page);
    setupMocks(page);
    await page.goto('/dashboard/admin/grammar');
    await page.getByTestId('program-lessons-toggle-1').click();
    await page.getByText('Galininkas').click();
    await expect(page.getByText('Laima mato brol[į].')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('Лайма видит брата.')).toBeVisible();
  });

  test('expanding a case shows add sentence button', async ({ page }) => {
    await setAdminToken(page);
    setupMocks(page);
    await page.goto('/dashboard/admin/grammar');
    await page.getByTestId('program-lessons-toggle-1').click();
    await page.getByText('Galininkas').click();
    await expect(page.getByText('+ Добавить предложение')).toBeVisible({ timeout: 5000 });
  });

  test('clicking add sentence opens modal', async ({ page }) => {
    await setAdminToken(page);
    setupMocks(page);
    await page.goto('/dashboard/admin/grammar');
    await page.getByTestId('program-lessons-toggle-1').click();
    await page.getByText('Galininkas').click();
    await page.getByText('+ Добавить предложение').click();
    await expect(page.getByText('Новое предложение')).toBeVisible();
    await expect(page.getByPlaceholder('Laima mato brol___.')).toBeVisible();
  });

  test('add sentence modal validates missing ___', async ({ page }) => {
    await setAdminToken(page);
    setupMocks(page);
    await page.goto('/dashboard/admin/grammar');
    await page.getByTestId('program-lessons-toggle-1').click();
    await page.getByText('Galininkas').click();
    await page.getByText('+ Добавить предложение').click();
    await page.getByPlaceholder('Laima mato brol___.').fill('No blank here.');
    await page.getByPlaceholder('į', { exact: true }).fill('as');
    await page.getByPlaceholder('brolį', { exact: true }).fill('namas');
    await page.getByPlaceholder('Лайма видит брата.').fill('Тест.');
    await page.getByRole('button', { name: 'Сохранить' }).click();
    await expect(page.getByText(/должно содержать ___/)).toBeVisible();
  });

  test('clicking modal backdrop closes it', async ({ page }) => {
    await setAdminToken(page);
    setupMocks(page);
    await page.goto('/dashboard/admin/grammar');
    await page.getByTestId('program-lessons-toggle-1').click();
    await page.getByText('Galininkas').click();
    await page.getByText('+ Добавить предложение').click();
    await expect(page.getByText('Новое предложение')).toBeVisible();
    await page.mouse.click(10, 10);
    await expect(page.getByText('Новое предложение')).not.toBeVisible();
  });

  test('shows back link to admin panel', async ({ page }) => {
    await setAdminToken(page);
    setupMocks(page);
    await page.goto('/dashboard/admin/grammar');
    await expect(page.getByRole('link', { name: '← Админ' })).toBeVisible({ timeout: 5000 });
  });

  test('Числительные program shows number cases when expanded', async ({ page }) => {
    await setAdminToken(page);
    setupMocks(page);
    await page.goto('/dashboard/admin/grammar');
    await page.getByTestId('program-lessons-toggle-2').click();
    await expect(page.getByText('Kiekiniai: Vardininkas')).toBeVisible({ timeout: 5000 });
  });

  test('programs section shows program row with expand toggle', async ({ page }) => {
    await setAdminToken(page);
    setupMocks(page);
    await page.goto('/dashboard/admin/grammar');
    const toggle = page.getByTestId('program-lessons-toggle-1');
    await toggle.waitFor({ state: 'attached', timeout: 5000 });
    await expect(toggle).toBeVisible();
  });

  test('clicking program toggle expands cases panel with case rows', async ({ page }) => {
    await setAdminToken(page);
    setupMocks(page);
    await page.goto('/dashboard/admin/grammar');
    const toggle = page.getByTestId('program-lessons-toggle-1');
    await toggle.waitFor({ state: 'attached', timeout: 5000 });
    await toggle.click();
    const panel = page.getByTestId('program-lessons-panel-1');
    await expect(panel).toBeVisible();
    // Vienaskaita group includes case 4 (Galininkas) — should appear in panel
    await expect(panel.getByText('Galininkas')).toBeVisible();
  });
});
