import { test, expect } from '@playwright/test';

// ── helpers ───────────────────────────────────────────────────────────────────

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

const MOCK_COMMUNITY: object[] = [
  {
    id: 42,
    title: 'Туристический литовский',
    description: 'Полезные слова для поездки',
    created_by: 'user-abc',
    author_name: 'Мария',
    share_token: 'test-share-token-abc',
    is_published: true,
    created_at: '2026-04-01T00:00:00',
    list_ids: [1, 2],
    word_count: 40,
    enrollment_count: 7,
  },
];

const MOCK_LISTS = [
  {
    id: 1, title: 'Числа 1–20', title_en: 'Numbers 1–20',
    description: null, description_en: null,
    subcategory: 'a1_basics', word_count: 20,
    star_counts: { '1': 20, '2': 20, '3': 20 },
  },
  {
    id: 2, title: 'Цвета', title_en: 'Colors',
    description: null, description_en: null,
    subcategory: 'a1_basics', word_count: 20,
    star_counts: { '1': 20, '2': 20, '3': 20 },
  },
];

async function mockCommunityAPIs(page: import('@playwright/test').Page, opts: {
  isRedactor?: boolean;
  userId?: string;
  enrollments?: object[];
} = {}) {
  const { isRedactor = false, userId = 'other-user-id', enrollments = [] } = opts;

  await page.route('**/api/me/quota', (route) =>
    route.fulfill({ json: { is_admin: false, is_superadmin: false, is_redactor: isRedactor, user_id: userId, sessions_today: 0, daily_limit: 3, premium_active: false, is_premium: false, premium_until: null } })
  );
  await page.route('**/api/me/programs', (route) => route.fulfill({ json: [] }));
  await page.route('**/api/subcategory-meta', (route) => route.fulfill({ json: {} }));
  await page.route('**/api/lists', (route) => route.fulfill({ json: MOCK_LISTS }));
  await page.route('**/api/programs/community', (route) => route.fulfill({ json: MOCK_COMMUNITY }));
  await page.route('**/api/me/custom-program-enrollments', (route) => route.fulfill({ json: enrollments }));
  await page.route('**/api/me/lists-progress', (route) => route.fulfill({ json: {} }));
}

// ── /programs community tab ───────────────────────────────────────────────────

test.describe('/programs — Community tab', () => {
  test('shows Community tab and switches to it', async ({ page }) => {
    await setFakeToken(page);
    await mockCommunityAPIs(page);
    await page.goto('/programs');

    await expect(page.getByRole('button', { name: 'Сообщество' })).toBeVisible();
    await page.getByRole('button', { name: 'Сообщество' }).click();
    await expect(page.getByText('Туристический литовский')).toBeVisible({ timeout: 5000 });
  });

  test('shows program author name', async ({ page }) => {
    await setFakeToken(page);
    await mockCommunityAPIs(page);
    await page.goto('/programs');
    await page.getByRole('button', { name: 'Сообщество' }).click();
    await expect(page.getByText('Мария')).toBeVisible({ timeout: 5000 });
  });

  test('shows enrollment count', async ({ page }) => {
    await setFakeToken(page);
    await mockCommunityAPIs(page);
    await page.goto('/programs');
    await page.getByRole('button', { name: 'Сообщество' }).click();
    await expect(page.getByText('7')).toBeVisible({ timeout: 5000 });
  });

  test('non-redactor does NOT see "Создать программу" button', async ({ page }) => {
    await setFakeToken(page);
    await mockCommunityAPIs(page, { isRedactor: false });
    await page.goto('/programs');
    await page.getByRole('button', { name: 'Сообщество' }).click();
    await page.waitForTimeout(500);
    await expect(page.getByRole('link', { name: /Создать программу/ })).not.toBeVisible();
  });

  test('redactor sees "Создать программу" button', async ({ page }) => {
    await setFakeToken(page);
    await mockCommunityAPIs(page, { isRedactor: true });
    await page.goto('/programs');
    await page.getByRole('button', { name: 'Сообщество' }).click();
    await expect(page.getByRole('link', { name: /Создать программу/ })).toBeVisible({ timeout: 5000 });
  });

  test('program author sees edit and delete buttons on own program', async ({ page }) => {
    await setFakeToken(page);
    await mockCommunityAPIs(page, { isRedactor: true, userId: 'user-abc' });
    await page.goto('/programs');
    await page.getByRole('button', { name: 'Сообщество' }).click();
    await expect(page.getByTitle('Редактировать')).toBeVisible({ timeout: 5000 });
    await expect(page.getByTitle('Удалить')).toBeVisible({ timeout: 5000 });
  });

  test('non-author does NOT see edit/delete buttons', async ({ page }) => {
    await setFakeToken(page);
    await mockCommunityAPIs(page, { isRedactor: false, userId: 'someone-else' });
    await page.goto('/programs');
    await page.getByRole('button', { name: 'Сообщество' }).click();
    await page.waitForTimeout(500);
    await expect(page.getByTitle('Редактировать')).not.toBeVisible();
    await expect(page.getByTitle('Удалить')).not.toBeVisible();
  });

  test('Enroll button is present for unenrolled program', async ({ page }) => {
    await setFakeToken(page);
    await mockCommunityAPIs(page, { enrollments: [] });
    await page.goto('/programs');
    await page.getByRole('button', { name: 'Сообщество' }).click();
    await expect(page.getByRole('button', { name: 'Добавить' })).toBeVisible({ timeout: 5000 });
  });

  test('enrolled program shows "В плане" badge and "Убрать" button', async ({ page }) => {
    await setFakeToken(page);
    await mockCommunityAPIs(page, {
      enrollments: [{ id: 42, title: 'Туристический литовский', share_token: 'test-share-token-abc', list_ids: [1, 2] }],
    });
    await page.goto('/programs');
    await page.getByRole('button', { name: 'Сообщество' }).click();
    await expect(page.getByText('В плане')).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole('button', { name: 'Убрать' })).toBeVisible({ timeout: 5000 });
  });

  test('share link copy button is visible', async ({ page }) => {
    await setFakeToken(page);
    await mockCommunityAPIs(page);
    await page.goto('/programs');
    await page.getByRole('button', { name: 'Сообщество' }).click();
    await expect(page.getByTitle('Скопировать ссылку')).toBeVisible({ timeout: 5000 });
  });

  test('tab=community URL param activates community tab directly', async ({ page }) => {
    await setFakeToken(page);
    await mockCommunityAPIs(page);
    await page.goto('/programs?tab=community');
    await expect(page.getByText('Туристический литовский')).toBeVisible({ timeout: 5000 });
  });
});

// ── /dashboard/lists — custom program sections ────────────────────────────────

test.describe('/dashboard/lists — custom program sections', () => {
  test('enrolled custom program appears as a section with "Сообщество" badge', async ({ page }) => {
    await setFakeToken(page);
    await mockCommunityAPIs(page, {
      enrollments: [{ id: 42, title: 'Туристический литовский', share_token: 'tok', list_ids: [1] }],
    });
    await page.goto('/dashboard/lists');
    await expect(page.getByText('Туристический литовский')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('Сообщество')).toBeVisible({ timeout: 5000 });
  });

  test('custom program section is auto-expanded showing word list cards', async ({ page }) => {
    await setFakeToken(page);
    await mockCommunityAPIs(page, {
      enrollments: [{ id: 42, title: 'Туристический литовский', share_token: 'tok', list_ids: [1] }],
    });
    await page.goto('/dashboard/lists');
    await expect(page.getByText('Числа 1–20')).toBeVisible({ timeout: 5000 });
  });
});

// ── /dashboard/programs/new — auth guard ──────────────────────────────────────

test.describe('/dashboard/programs/new — access control', () => {
  test('unauthenticated user is redirected to /login', async ({ page }) => {
    await page.route('**/api/**', (route) => route.fulfill({ status: 401, json: { detail: 'Unauthorized' } }));
    await page.goto('/dashboard/programs/new');
    await expect(page).toHaveURL(/\/login/, { timeout: 5000 });
  });

  test('non-redactor sees access denied message', async ({ page }) => {
    await setFakeToken(page);
    await page.route('**/api/me/quota', (route) =>
      route.fulfill({ json: { is_admin: false, is_superadmin: false, is_redactor: false, user_id: 'u1', sessions_today: 0, daily_limit: 3, premium_active: false, is_premium: false, premium_until: null } })
    );
    await page.route('**/api/lists', (route) => route.fulfill({ json: MOCK_LISTS }));
    await page.goto('/dashboard/programs/new');
    await expect(page.getByText(/Доступ только для редакторов/)).toBeVisible({ timeout: 5000 });
  });

  test('redactor sees program creation form', async ({ page }) => {
    await setFakeToken(page);
    await page.route('**/api/me/quota', (route) =>
      route.fulfill({ json: { is_admin: false, is_superadmin: false, is_redactor: true, user_id: 'u1', sessions_today: 0, daily_limit: 3, premium_active: false, is_premium: false, premium_until: null } })
    );
    await page.route('**/api/lists', (route) => route.fulfill({ json: MOCK_LISTS }));
    await page.goto('/dashboard/programs/new');
    await expect(page.getByRole('heading', { name: 'Создать программу' })).toBeVisible({ timeout: 5000 });
    await expect(page.getByPlaceholder(/Например/)).toBeVisible({ timeout: 5000 });
  });
});

// ── /api endpoints — auth/role guards (hit backend directly at :8000) ─────────

const BACKEND = 'http://localhost:8000';

test.describe('Community programs API — auth guards', () => {
  test('GET /api/programs/community returns 200 without auth', async ({ request }) => {
    const r = await request.get(`${BACKEND}/api/programs/community`);
    expect(r.status()).toBe(200);
  });

  test('GET /api/me/custom-programs returns 401 without token', async ({ request }) => {
    const r = await request.get(`${BACKEND}/api/me/custom-programs`);
    expect(r.status()).toBe(401);
  });

  test('POST /api/me/custom-programs returns 401 without token', async ({ request }) => {
    const r = await request.post(`${BACKEND}/api/me/custom-programs`, { data: { title: 'test', list_ids: [] } });
    expect(r.status()).toBe(401);
  });

  test('GET /api/me/custom-program-enrollments returns 401 without token', async ({ request }) => {
    const r = await request.get(`${BACKEND}/api/me/custom-program-enrollments`);
    expect(r.status()).toBe(401);
  });
});
