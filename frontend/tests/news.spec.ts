import { test, expect } from '@playwright/test';

function makeFakeJwt(name: string, isAdmin = false): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = btoa(JSON.stringify({ email: 'test@test.com', name, is_admin: isAdmin, exp: 9999999999 }));
  return `${header}.${payload}.fakesignature`;
}

const MOCK_NEWS = [
  { id: 1, title_ru: 'Новость первая', title_en: 'First news', body_ru: 'Текст первой новости.', body_en: 'First news body.', published_at: '2026-03-01T10:00:00' },
  { id: 2, title_ru: 'Новость вторая', title_en: 'Second news', body_ru: 'Текст второй новости.', body_en: 'Second news body.', published_at: '2026-03-02T10:00:00' },
  { id: 3, title_ru: 'Новость третья', title_en: 'Third news', body_ru: 'Текст третьей новости.', body_en: 'Third news body.', published_at: '2026-03-03T10:00:00' },
  { id: 4, title_ru: 'Новость четвёртая', title_en: 'Fourth news', body_ru: 'Текст четвёртой новости.', body_en: 'Fourth news body.', published_at: '2026-03-04T10:00:00' },
];

test.describe('Landing page — News section', () => {
  test('shows "Новости" heading when news exist', async ({ page }) => {
    await page.route('**/api/news**', async (route) => route.fulfill({ json: MOCK_NEWS }));
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Новости' })).toBeVisible({ timeout: 5000 });
  });

  test('shows only first 3 news cards initially', async ({ page }) => {
    await page.route('**/api/news**', async (route) => route.fulfill({ json: MOCK_NEWS }));
    await page.goto('/');
    await expect(page.getByText('Новость первая')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('Новость вторая')).toBeVisible();
    await expect(page.getByText('Новость третья')).toBeVisible();
    await expect(page.getByText('Новость четвёртая')).not.toBeVisible();
  });

  test('"Show more" button expands to show all news', async ({ page }) => {
    await page.route('**/api/news**', async (route) => route.fulfill({ json: MOCK_NEWS }));
    await page.goto('/');
    await expect(page.getByText('Новость первая')).toBeVisible({ timeout: 5000 });
    await page.getByRole('button', { name: /Показать ещё/ }).click();
    await expect(page.getByText('Новость четвёртая')).toBeVisible();
  });

  test('"Show less" hides extra news after expanding', async ({ page }) => {
    await page.route('**/api/news**', async (route) => route.fulfill({ json: MOCK_NEWS }));
    await page.goto('/');
    await expect(page.getByText('Новость первая')).toBeVisible({ timeout: 5000 });
    await page.getByRole('button', { name: /Показать ещё/ }).click();
    await page.getByRole('button', { name: 'Свернуть' }).click();
    await expect(page.getByText('Новость четвёртая')).not.toBeVisible();
  });

  test('global EN toggle switches news titles to English', async ({ page }) => {
    await page.route('**/api/news**', async (route) => route.fulfill({ json: MOCK_NEWS }));
    await page.goto('/');
    await expect(page.getByText('Новость первая')).toBeVisible({ timeout: 5000 });
    // Click the global nav RU/EN toggle
    await page.getByRole('button', { name: /RU\s*\/\s*EN/i }).click();
    await expect(page.getByText('First news', { exact: true })).toBeVisible();
    await expect(page.getByText('Новость первая', { exact: true })).not.toBeVisible();
  });

  test('section is hidden when news list is empty', async ({ page }) => {
    await page.route('**/api/news**', async (route) => route.fulfill({ json: [] }));
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Новости' })).not.toBeVisible();
  });
});

test.describe('Admin panel — News tab', () => {
  const MOCK_ADMIN_NEWS = [
    { id: 1, title_ru: 'Новость первая', title_en: 'First news', body_ru: '', body_en: '', published_at: '2026-03-01T10:00:00', published: true },
  ];

  async function setupAdminPage(page: import('@playwright/test').Page) {
    const token = makeFakeJwt('Admin', true);
    await page.addInitScript((t) => localStorage.setItem('fluent_token', t), token);
    await page.route('**/api/admin/users', async (route) => route.fulfill({ json: [] }));
    await page.route('**/api/me/quota', async (route) => route.fulfill({ json: { is_superadmin: false } }));
    await page.route('**/api/admin/reports', async (route) => route.fulfill({ json: [] }));
    await page.route('**/api/admin/articles', async (route) => route.fulfill({ json: [] }));
    await page.route('**/api/admin/subcategories', async (route) => route.fulfill({ json: [] }));
    await page.route('**/api/admin/content/word-lists', async (route) => route.fulfill({ json: [] }));
    await page.route('**/api/admin/grammar/rules', async (route) => route.fulfill({ json: [] }));
    await page.route('**/api/admin/feedback', async (route) => route.fulfill({ json: [] }));
    await page.route('**/api/admin/news', async (route) => route.fulfill({ json: MOCK_ADMIN_NEWS }));
    await page.route('**/api/news**', async (route) => route.fulfill({ json: [] }));
  }

  test('News tab is visible in Content area', async ({ page }) => {
    await setupAdminPage(page);
    await page.goto('/dashboard/admin');
    await page.getByRole('button', { name: 'Контент' }).click();
    await expect(page.getByRole('button', { name: 'Новости' })).toBeVisible();
  });

  test('clicking News tab shows news list', async ({ page }) => {
    await setupAdminPage(page);
    await page.goto('/dashboard/admin');
    await page.getByRole('button', { name: 'Контент' }).click();
    await page.getByRole('button', { name: 'Новости' }).click();
    await expect(page.getByText('Новость первая')).toBeVisible({ timeout: 5000 });
  });
});
