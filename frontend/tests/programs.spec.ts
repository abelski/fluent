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

const MOCK_LISTS = [
  {
    id: 1,
    title: 'Числа 1–20',
    title_en: 'Numbers 1–20',
    description: null,
    description_en: null,
    subcategory: 'a1_basics',
    word_count: 20,
    star_counts: { '1': 20, '2': 20, '3': 20 },
  },
];

const MOCK_META = {
  a1_basics: {
    cefr_level: 'A1',
    difficulty: 'easy',
    name_ru: 'Базовый A1',
    name_en: 'Basic A1',
    article_url: 'https://example.com/article',
    article_name_ru: 'Читать статью',
    article_name_en: 'Read article',
    enrollment_count: 5,
  },
};

const MOCK_LIST_DETAIL = {
  id: 1,
  title: 'Числа 1–20',
  words: [
    { id: 1, lithuanian: 'vienas', translation_ru: 'один', translation_en: 'one', hint: null },
  ],
};

test.describe('Programs catalog page (/programs)', () => {
  test('shows programs heading and program card', async ({ page }) => {
    await setFakeToken(page);
    await page.route('**/api/lists', (route) => route.fulfill({ json: MOCK_LISTS }));
    await page.route('**/api/subcategory-meta', (route) => route.fulfill({ json: MOCK_META }));
    await page.route('**/api/me/programs', (route) => route.fulfill({ json: [] }));

    await page.goto('/programs');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByText('Базовый A1')).toBeVisible();
  });

  test('shows article link on program card', async ({ page }) => {
    await setFakeToken(page);
    await page.route('**/api/lists', (route) => route.fulfill({ json: MOCK_LISTS }));
    await page.route('**/api/subcategory-meta', (route) => route.fulfill({ json: MOCK_META }));
    await page.route('**/api/me/programs', (route) => route.fulfill({ json: [] }));

    await page.goto('/programs');
    await expect(page.getByText('Читать статью')).toBeVisible();
  });

  test('shows enrollment count badge', async ({ page }) => {
    await setFakeToken(page);
    await page.route('**/api/lists', (route) => route.fulfill({ json: MOCK_LISTS }));
    await page.route('**/api/subcategory-meta', (route) => route.fulfill({ json: MOCK_META }));
    await page.route('**/api/me/programs', (route) => route.fulfill({ json: [] }));

    await page.goto('/programs');
    await expect(page.getByText(/5/)).toBeVisible();
  });

  test('shows Add button for unenrolled program', async ({ page }) => {
    await setFakeToken(page);
    await page.route('**/api/lists', (route) => route.fulfill({ json: MOCK_LISTS }));
    await page.route('**/api/subcategory-meta', (route) => route.fulfill({ json: MOCK_META }));
    await page.route('**/api/me/programs', (route) => route.fulfill({ json: [] }));

    await page.goto('/programs');
    await expect(page.getByRole('button', { name: 'Добавить' })).toBeVisible();
  });

  test('shows Enrolled badge for enrolled program', async ({ page }) => {
    await setFakeToken(page);
    await page.route('**/api/lists', (route) => route.fulfill({ json: MOCK_LISTS }));
    await page.route('**/api/subcategory-meta', (route) => route.fulfill({ json: MOCK_META }));
    await page.route('**/api/me/programs', (route) => route.fulfill({ json: ['a1_basics'] }));

    await page.goto('/programs');
    await expect(page.getByText('Изучается')).toBeVisible();
  });

  test('enrolling a program calls POST /api/me/programs with subcategory key', async ({ page }) => {
    await setFakeToken(page);
    await page.route('**/api/lists', (route) => route.fulfill({ json: MOCK_LISTS }));
    await page.route('**/api/subcategory-meta', (route) => route.fulfill({ json: MOCK_META }));

    let postBody: unknown = null;
    await page.route('**/api/me/programs', async (route) => {
      if (route.request().method() === 'POST') {
        postBody = route.request().postDataJSON();
        await route.fulfill({ json: { ok: true }, status: 201 });
      } else {
        await route.fulfill({ json: [] });
      }
    });

    await page.goto('/programs');
    await page.getByRole('button', { name: 'Добавить' }).click();
    await expect(page.getByText('Изучается')).toBeVisible({ timeout: 3000 });
    expect((postBody as { subcategory: string }).subcategory).toBe('a1_basics');
  });

  test('"Подробнее" link navigates to detail page', async ({ page }) => {
    await setFakeToken(page);
    await page.route('**/api/lists', (route) => route.fulfill({ json: MOCK_LISTS }));
    await page.route('**/api/subcategory-meta', (route) => route.fulfill({ json: MOCK_META }));
    await page.route('**/api/me/programs', (route) => route.fulfill({ json: [] }));

    await page.goto('/programs');
    await page.getByText('Подробнее').click();
    await expect(page).toHaveURL(/\/programs\//);
  });

  test('Programs link NOT in top navigation', async ({ page }) => {
    await setFakeToken(page);
    await page.route('**/api/lists', (route) => route.fulfill({ json: MOCK_LISTS }));
    await page.route('**/api/subcategory-meta', (route) => route.fulfill({ json: MOCK_META }));
    await page.route('**/api/me/programs', (route) => route.fulfill({ json: [] }));

    await page.goto('/programs');
    const nav = page.locator('header nav');
    await expect(nav.getByRole('link', { name: 'Программы' })).not.toBeVisible();
  });
});

test.describe('Programs detail page (/programs/[key])', () => {
  test('shows program name and stacks', async ({ page }) => {
    await setFakeToken(page);
    await page.route(/\/api\/lists\/\d+$/, (route) => route.fulfill({ json: MOCK_LIST_DETAIL }));
    await page.route('**/api/lists', (route) => route.fulfill({ json: MOCK_LISTS }));
    await page.route('**/api/subcategory-meta', (route) => route.fulfill({ json: MOCK_META }));
    await page.route('**/api/me/programs', (route) => route.fulfill({ json: [] }));

    await page.goto('/programs/a1_basics');
    await expect(page.getByText('Базовый A1')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('Числа 1–20')).toBeVisible();
  });

  test('expanding a stack shows words', async ({ page }) => {
    await setFakeToken(page);
    await page.route(/\/api\/lists\/\d+$/, (route) => route.fulfill({ json: MOCK_LIST_DETAIL }));
    await page.route('**/api/lists', (route) => route.fulfill({ json: MOCK_LISTS }));
    await page.route('**/api/subcategory-meta', (route) => route.fulfill({ json: MOCK_META }));
    await page.route('**/api/me/programs', (route) => route.fulfill({ json: [] }));

    await page.goto('/programs/a1_basics');
    await expect(page.locator('button', { hasText: 'Числа 1–20' })).toBeVisible({ timeout: 5000 });
    await page.locator('button', { hasText: 'Числа 1–20' }).click();
    await expect(page.getByText('vienas')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('один')).toBeVisible();
  });

  test('shows article link on detail page', async ({ page }) => {
    await setFakeToken(page);
    await page.route('**/api/lists', (route) => route.fulfill({ json: MOCK_LISTS }));
    await page.route('**/api/subcategory-meta', (route) => route.fulfill({ json: MOCK_META }));
    await page.route('**/api/me/programs', (route) => route.fulfill({ json: [] }));

    await page.goto('/programs/a1_basics');
    await expect(page.getByText('Читать статью')).toBeVisible({ timeout: 5000 });
  });
});

const MOCK_SEKMES_LISTS = [
  {
    id: 101,
    title: 'Koks jūsų vardas?',
    title_en: 'What is your name?',
    description: null,
    description_en: null,
    subcategory: 'sekmes',
    word_count: 15,
    star_counts: { '1': 10, '2': 3, '3': 2 },
  },
  {
    id: 102,
    title: 'Čia mano draugas',
    title_en: 'This is my friend',
    description: null,
    description_en: null,
    subcategory: 'sekmes',
    word_count: 21,
    star_counts: { '1': 15, '2': 4, '3': 2 },
  },
];

const MOCK_SEKMES_META = {
  sekmes: {
    cefr_level: 'A1',
    difficulty: null,
    name_ru: 'Сэкмес!',
    name_en: 'Sekmės!',
    article_url: 'https://www.vu.lt/leidyba/knygos/sekmes',
    article_name_ru: 'Учебник Sekmės!',
    article_name_en: 'Sekmės! textbook',
    enrollment_count: 0,
  },
};

test.describe('Sekmės! program (/programs/sekmes)', () => {
  test('sekmes program card is visible on /programs', async ({ page }) => {
    await setFakeToken(page);
    await page.route('**/api/lists', (route) => route.fulfill({ json: MOCK_SEKMES_LISTS }));
    await page.route('**/api/subcategory-meta', (route) => route.fulfill({ json: MOCK_SEKMES_META }));
    await page.route('**/api/me/programs', (route) => route.fulfill({ json: [] }));

    await page.goto('/programs');
    await expect(page.getByText('Sekmės!')).toBeVisible({ timeout: 5000 });
  });

  test('sekmes detail page shows chapter stacks', async ({ page }) => {
    await setFakeToken(page);
    await page.route('**/api/lists', (route) => route.fulfill({ json: MOCK_SEKMES_LISTS }));
    await page.route('**/api/subcategory-meta', (route) => route.fulfill({ json: MOCK_SEKMES_META }));
    await page.route('**/api/me/programs', (route) => route.fulfill({ json: [] }));
    await page.route(/\/api\/lists\/\d+$/, (route) => route.fulfill({ json: {
      id: 101,
      title: 'Koks jūsų vardas?',
      words: [{ id: 1, lithuanian: 'Lietuva', translation_ru: 'Литва', translation_en: 'Lithuania', hint: null }],
    }}));

    await page.goto('/programs/sekmes');
    await expect(page.getByText('Sekmės!')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('Koks jūsų vardas?')).toBeVisible();
    await expect(page.getByText('Čia mano draugas')).toBeVisible();
  });

  test('sekmes detail page shows textbook external link', async ({ page }) => {
    await setFakeToken(page);
    await page.route('**/api/lists', (route) => route.fulfill({ json: MOCK_SEKMES_LISTS }));
    await page.route('**/api/subcategory-meta', (route) => route.fulfill({ json: MOCK_SEKMES_META }));
    await page.route('**/api/me/programs', (route) => route.fulfill({ json: [] }));

    await page.goto('/programs/sekmes');
    await expect(page.getByText('Учебник Sekmės!')).toBeVisible({ timeout: 5000 });
  });
});

test.describe('/dashboard/lists empty state', () => {
  test('shows empty state CTA when no enrolled programs', async ({ page }) => {
    await setFakeToken(page);
    await page.route('**/api/lists', (route) => route.fulfill({ json: MOCK_LISTS }));
    await page.route('**/api/subcategory-meta', (route) => route.fulfill({ json: MOCK_META }));
    await page.route('**/api/me/programs', (route) => route.fulfill({ json: [] }));
    await page.route('**/api/me/quota', (route) => route.fulfill({ json: {
      is_premium: false, premium_active: false, premium_until: null,
      sessions_today: 0, daily_limit: 10, is_admin: false, is_superadmin: false,
    }}));

    await page.goto('/dashboard/lists');
    await expect(page.getByText('У вас нет активных программ.')).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole('link', { name: 'Смотреть все программы' })).toBeVisible();
  });

  test('empty state CTA links to /programs', async ({ page }) => {
    await setFakeToken(page);
    await page.route('**/api/lists', (route) => route.fulfill({ json: MOCK_LISTS }));
    await page.route('**/api/subcategory-meta', (route) => route.fulfill({ json: MOCK_META }));
    await page.route('**/api/me/programs', (route) => route.fulfill({ json: [] }));
    await page.route('**/api/me/quota', (route) => route.fulfill({ json: {
      is_premium: false, premium_active: false, premium_until: null,
      sessions_today: 0, daily_limit: 10, is_admin: false, is_superadmin: false,
    }}));
    await page.route('**/api/me/lists-progress', (route) => route.fulfill({ json: {} }));

    await page.goto('/dashboard/lists');
    await page.getByRole('link', { name: 'Смотреть все программы' }).click();
    await expect(page).toHaveURL(/\/programs/);
  });

  test('enrolled program is visible in lists', async ({ page }) => {
    await setFakeToken(page);
    await page.route('**/api/lists', (route) => route.fulfill({ json: MOCK_LISTS }));
    await page.route('**/api/subcategory-meta', (route) => route.fulfill({ json: MOCK_META }));
    await page.route('**/api/me/programs', (route) => route.fulfill({ json: ['a1_basics'] }));
    await page.route('**/api/me/quota', (route) => route.fulfill({ json: {
      is_premium: false, premium_active: false, premium_until: null,
      sessions_today: 0, daily_limit: 10, is_admin: false, is_superadmin: false,
    }}));
    await page.route('**/api/me/lists-progress', (route) => route.fulfill({ json: {} }));

    await page.goto('/dashboard/lists');
    await expect(page.getByText('Базовый A1')).toBeVisible({ timeout: 5000 });
  });
});
