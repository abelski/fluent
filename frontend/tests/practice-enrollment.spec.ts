import { test, expect } from '@playwright/test';

function makeFakeJwt(name: string): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = btoa(JSON.stringify({ email: 'test@test.com', name, exp: 9999999999 }));
  return `${header}.${payload}.fakesignature`;
}

async function setFakeToken(page: import('@playwright/test').Page) {
  await page.addInitScript((token) => {
    localStorage.setItem('fluent_token', token);
  }, makeFakeJwt('Test User'));
}

const MOCK_CATEGORIES = [
  {
    id: 1,
    name_ru: 'Конституция Литвы',
    name_en: 'Lithuanian Constitution',
    description_ru: 'Подготовка к экзамену на ПМЖ',
    sort_order: 0,
    test_count: 2,
    enrolled: false,
  },
  {
    id: 2,
    name_ru: 'История Литвы',
    name_en: 'History of Lithuania',
    description_ru: null,
    sort_order: 1,
    test_count: 1,
    enrolled: false,
  },
];

const MOCK_ENROLLED_CATEGORIES = [
  {
    id: 1,
    name_ru: 'Конституция Литвы',
    name_en: 'Lithuanian Constitution',
    description_ru: 'Подготовка к экзамену на ПМЖ',
    sort_order: 0,
    test_count: 2,
  },
];

const MOCK_TESTS = [
  {
    id: 10,
    title_ru: 'Тест по конституции',
    title_en: 'Constitution test',
    description_ru: 'Описание теста',
    description_en: null,
    question_count: 20,
    pass_threshold: 0.75,
    is_premium: false,
    active_question_count: 20,
  },
];

test.describe('/dashboard/practice — enrolled-only view', () => {
  test('shows empty state when no enrolled categories', async ({ page }) => {
    await setFakeToken(page);
    await page.route('**/api/me/practice-categories', (route) =>
      route.fulfill({ json: [] })
    );

    await page.goto('/dashboard/practice');
    await expect(page.getByText('Вы ещё не выбрали ни одной программы')).toBeVisible({ timeout: 5000 });
  });

  test('empty state has link to programs browse page', async ({ page }) => {
    await setFakeToken(page);
    await page.route('**/api/me/practice-categories', (route) =>
      route.fulfill({ json: [] })
    );

    await page.goto('/dashboard/practice');
    await expect(page.getByRole('link', { name: 'Перейти к программам' })).toBeVisible({ timeout: 5000 });
  });

  test('shows enrolled category card', async ({ page }) => {
    await setFakeToken(page);
    await page.route('**/api/me/practice-categories', (route) =>
      route.fulfill({ json: MOCK_ENROLLED_CATEGORIES })
    );

    await page.goto('/dashboard/practice');
    await expect(page.getByText('Конституция Литвы')).toBeVisible({ timeout: 5000 });
  });

  test('"Смотреть все программы →" link is visible', async ({ page }) => {
    await setFakeToken(page);
    await page.route('**/api/me/practice-categories', (route) =>
      route.fulfill({ json: MOCK_ENROLLED_CATEGORIES })
    );

    await page.goto('/dashboard/practice');
    await expect(page.getByRole('link', { name: /Смотреть все программы/ })).toBeVisible({ timeout: 5000 });
  });

  test('clicking category card navigates to category detail page', async ({ page }) => {
    await setFakeToken(page);
    await page.route('**/api/me/practice-categories', (route) =>
      route.fulfill({ json: MOCK_ENROLLED_CATEGORIES })
    );
    await page.route('**/api/practice/categories', (route) =>
      route.fulfill({ json: MOCK_CATEGORIES })
    );
    await page.route('**/api/practice/categories/1/tests', (route) =>
      route.fulfill({ json: MOCK_TESTS })
    );
    await page.route('**/api/me/quota', (route) =>
      route.fulfill({ json: { premium_active: false } })
    );

    await page.goto('/dashboard/practice');
    await expect(page.getByText('Конституция Литвы')).toBeVisible({ timeout: 5000 });
    await page.getByText('Конституция Литвы').click();
    await expect(page).toHaveURL(/\/dashboard\/practice\/\d+/);
  });
});

test.describe('/dashboard/practice/programs — browse all categories', () => {
  test('shows all categories heading', async ({ page }) => {
    await setFakeToken(page);
    await page.route('**/api/practice/categories', (route) =>
      route.fulfill({ json: MOCK_CATEGORIES })
    );

    await page.goto('/dashboard/practice/programs');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Все программы', { timeout: 5000 });
  });

  test('shows category names', async ({ page }) => {
    await setFakeToken(page);
    await page.route('**/api/practice/categories', (route) =>
      route.fulfill({ json: MOCK_CATEGORIES })
    );

    await page.goto('/dashboard/practice/programs');
    await expect(page.getByText('Конституция Литвы')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('История Литвы')).toBeVisible();
  });

  test('shows enroll button for unenrolled category', async ({ page }) => {
    await setFakeToken(page);
    await page.route('**/api/practice/categories', (route) =>
      route.fulfill({ json: MOCK_CATEGORIES })
    );

    await page.goto('/dashboard/practice/programs');
    const enrollBtns = page.getByRole('button', { name: 'Записаться' });
    await expect(enrollBtns.first()).toBeVisible({ timeout: 5000 });
  });

  test('shows enrolled badge for enrolled category', async ({ page }) => {
    await setFakeToken(page);
    const categoriesWithEnrolled = [
      { ...MOCK_CATEGORIES[0], enrolled: true },
      { ...MOCK_CATEGORIES[1], enrolled: false },
    ];
    await page.route('**/api/practice/categories', (route) =>
      route.fulfill({ json: categoriesWithEnrolled })
    );

    await page.goto('/dashboard/practice/programs');
    await expect(page.getByText('Записан')).toBeVisible({ timeout: 5000 });
  });

  test('enrolling calls POST and shows enrolled badge', async ({ page }) => {
    await setFakeToken(page);
    await page.route('**/api/practice/categories', (route) =>
      route.fulfill({ json: MOCK_CATEGORIES })
    );

    let postCalled = false;
    await page.route('**/api/me/practice-categories/**', async (route) => {
      if (route.request().method() === 'POST') {
        postCalled = true;
        await route.fulfill({ json: { ok: true } });
      } else {
        await route.fulfill({ json: { ok: true } });
      }
    });

    await page.goto('/dashboard/practice/programs');
    await expect(page.getByRole('button', { name: 'Записаться' }).first()).toBeVisible({ timeout: 5000 });
    await page.getByRole('button', { name: 'Записаться' }).first().click();
    await expect(page.getByText('Записан')).toBeVisible({ timeout: 3000 });
    expect(postCalled).toBe(true);
  });

  test('back link navigates to /dashboard/practice/', async ({ page }) => {
    await setFakeToken(page);
    await page.route('**/api/practice/categories', (route) =>
      route.fulfill({ json: MOCK_CATEGORIES })
    );

    await page.goto('/dashboard/practice/programs');
    await page.getByRole('link', { name: /К категориям/ }).click();
    await expect(page).toHaveURL(/\/dashboard\/practice\//);
  });
});

test.describe('/dashboard/practice/[id] — category detail page', () => {
  test('shows tests list', async ({ page }) => {
    await setFakeToken(page);
    await page.route('**/api/practice/categories/1/tests', (route) =>
      route.fulfill({ json: MOCK_TESTS })
    );
    await page.route('**/api/practice/categories', (route) =>
      route.fulfill({ json: MOCK_CATEGORIES })
    );
    await page.route('**/api/me/quota', (route) =>
      route.fulfill({ json: { premium_active: false } })
    );

    await page.goto('/dashboard/practice/1');
    await expect(page.getByText('Тест по конституции')).toBeVisible({ timeout: 5000 });
  });

  test('shows start exam button', async ({ page }) => {
    await setFakeToken(page);
    await page.route('**/api/practice/categories/1/tests', (route) =>
      route.fulfill({ json: MOCK_TESTS })
    );
    await page.route('**/api/practice/categories', (route) =>
      route.fulfill({ json: MOCK_CATEGORIES })
    );
    await page.route('**/api/me/quota', (route) =>
      route.fulfill({ json: { premium_active: false } })
    );

    await page.goto('/dashboard/practice/1');
    await expect(page.getByRole('button', { name: /Начать/ })).toBeVisible({ timeout: 5000 });
  });
});
