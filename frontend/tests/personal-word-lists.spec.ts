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

async function mockListsPage(page: import('@playwright/test').Page, opts: {
  premium?: boolean;
  wordLists?: object[];
} = {}) {
  const { premium = false, wordLists = [] } = opts;
  await page.route('**/api/me/quota', (route) =>
    route.fulfill({ json: { is_admin: false, is_superadmin: false, is_redactor: false, user_id: 'u1', sessions_today: 0, daily_limit: premium ? null : 3, premium_active: premium, is_premium: premium, premium_until: null } })
  );
  await page.route('**/api/me/welcome', (route) => route.fulfill({ json: { shown: true, content: {} } }));
  await page.route('**/api/subcategory-meta', (route) => route.fulfill({ json: {} }));
  await page.route('**/api/me/custom-program-enrollments', (route) => route.fulfill({ json: [] }));
  await page.route('**/api/me/programs', (route) => route.fulfill({ json: [] }));
  await page.route('**/api/me/lists-progress', (route) => route.fulfill({ json: {} }));
  await page.route('**/api/lists', (route) => route.fulfill({ json: [] }));
  await page.route('**/api/me/word-lists', (route) => route.fulfill({ json: wordLists }));
}

// ── /dashboard/lists — Мои списки (personal word lists) ───────────────────────

test.describe('/dashboard/lists — personal word lists', () => {
  test('premium user sees the Мои списки section with a create button', async ({ page }) => {
    await setFakeToken(page);
    await mockListsPage(page, { premium: true });
    await page.goto('/dashboard/lists');
    const section = page.getByTestId('my-word-lists-section');
    await expect(section).toBeVisible({ timeout: 5000 });
    await expect(page.getByTestId('create-word-list-button')).toBeVisible();
  });

  test('non-premium user sees the premium upsell, not a create button', async ({ page }) => {
    await setFakeToken(page);
    await mockListsPage(page, { premium: false });
    await page.goto('/dashboard/lists');
    await expect(page.getByTestId('my-word-lists-section')).toBeVisible({ timeout: 5000 });
    await expect(page.getByTestId('create-word-list-button')).not.toBeVisible();
    await expect(page.getByText('Создавайте свои списки слов')).toBeVisible();
  });

  test('opening the create dialog shows the list-name input', async ({ page }) => {
    await setFakeToken(page);
    await mockListsPage(page, { premium: true });
    await page.goto('/dashboard/lists');
    await page.getByTestId('create-word-list-button').click();
    await expect(page.getByTestId('new-word-list-title')).toBeVisible({ timeout: 5000 });
  });

  test('an existing personal list is rendered with Edit and Study actions', async ({ page }) => {
    await setFakeToken(page);
    await mockListsPage(page, {
      premium: true,
      wordLists: [{ id: 77, title: 'Мой словарь', difficulty: 1, word_count: 5, created_at: '2026-07-01T00:00:00', known: 2, learning: 1, new: 2 }],
    });
    await page.goto('/dashboard/lists');
    await expect(page.getByTestId('my-word-list-card')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('Мой словарь')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Редактировать' })).toHaveAttribute('href', /\/dashboard\/lists\/my\/77\/edit\/?$/);
    await expect(page.getByRole('link', { name: 'Учить' })).toHaveAttribute('href', /\/dashboard\/lists\/77\/study\/?$/);
  });
});

// ── /api endpoints — auth guards (hit backend directly at :8000) ──────────────

const BACKEND = 'http://localhost:8000';

test.describe('Personal word lists API — auth guards', () => {
  test('GET /api/me/word-lists returns 401 without token', async ({ request }) => {
    const r = await request.get(`${BACKEND}/api/me/word-lists`);
    expect(r.status()).toBe(401);
  });

  test('POST /api/me/word-lists returns 401 without token', async ({ request }) => {
    const r = await request.post(`${BACKEND}/api/me/word-lists`, { data: { title: 'test', difficulty: 1 } });
    expect(r.status()).toBe(401);
  });
});
