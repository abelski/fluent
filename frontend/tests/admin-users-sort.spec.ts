// Autotest for admin panel column sorting: clicking a Users table header sorts by that
// column, and clicking again reverses direction. Only the Users table has this — the
// request was "order by column" on /dashboard/admin without specifying which grid, and
// Users is the one admins scan/sort most, so that's where sorting was added first.
import { test, expect } from '@playwright/test';

function makeFakeJwt(name: string, isAdmin = false): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = btoa(JSON.stringify({ email: 'admin@test.com', name, is_admin: isAdmin, exp: 9999999999 }));
  return `${header}.${payload}.fakesignature`;
}

async function setAdminToken(page: import('@playwright/test').Page) {
  await page.addInitScript((token) => {
    localStorage.setItem('fluent_token', token);
  }, makeFakeJwt('Admin User', true));
}

const MOCK_USERS = [
  {
    id: 'u-bob', email: 'bob@example.com', name: 'Bob',
    is_premium: false, premium_until: null, premium_active: false,
    subscription_status: null, stripe_customer_id: null,
    is_admin: false, is_superadmin: false, is_redactor: false,
    sessions_today: 5, daily_limit: null, last_login: '2026-09-01T00:00:00', email_consent: false,
    inactive_flag: false, inactive_since: null, deletion_warning: false, deletion_due: null,
    notice_sent_at: null,
  },
  {
    id: 'u-alice', email: 'alice@example.com', name: 'Alice',
    is_premium: true, premium_until: null, premium_active: true,
    subscription_status: null, stripe_customer_id: null,
    is_admin: false, is_superadmin: false, is_redactor: false,
    sessions_today: 1, daily_limit: null, last_login: '2026-09-10T00:00:00', email_consent: false,
    inactive_flag: false, inactive_since: null, deletion_warning: false, deletion_due: null,
    notice_sent_at: null,
  },
  {
    id: 'u-carl', email: 'carl@example.com', name: 'Carl',
    is_premium: false, premium_until: null, premium_active: false,
    subscription_status: null, stripe_customer_id: null,
    is_admin: false, is_superadmin: false, is_redactor: false,
    sessions_today: 9, daily_limit: null, last_login: null, email_consent: false,
    inactive_flag: false, inactive_since: null, deletion_warning: false, deletion_due: null,
    notice_sent_at: null,
  },
];

async function setupRoutes(page: import('@playwright/test').Page) {
  await page.route('**/api/admin/users', (route) => route.fulfill({ json: MOCK_USERS }));
  await page.route('**/api/me/quota', (route) => route.fulfill({ json: { is_superadmin: true } }));
  await page.route('**/api/admin/reports', (route) => route.fulfill({ json: [] }));
  await page.route('**/api/admin/articles', (route) => route.fulfill({ json: [] }));
  await page.route('**/api/admin/subcategories', (route) => route.fulfill({ json: [] }));
  await page.route('**/api/admin/content/word-lists', (route) => route.fulfill({ json: [] }));
  await page.route('**/api/admin/grammar/rules', (route) => route.fulfill({ json: [] }));
  await page.route('**/api/admin/feedback', (route) => route.fulfill({ json: [] }));
}

async function firstColUserName(page: import('@playwright/test').Page) {
  return page.locator('tbody tr td:first-child p.font-medium').first().innerText();
}

test.describe('Admin panel — sort Users table by column', () => {
  test('clicking "Session today" header sorts ascending, then descending on second click', async ({ page }) => {
    await setAdminToken(page);
    await setupRoutes(page);
    await page.goto('/dashboard/admin');

    const header = page.getByRole('columnheader', { name: /Сессий сегодня/i });
    await expect(header).toBeVisible({ timeout: 10000 });

    await header.click();
    await expect.poll(() => firstColUserName(page)).toBe('Alice'); // sessions_today: 1

    await header.click();
    await expect.poll(() => firstColUserName(page)).toBe('Carl'); // sessions_today: 9
  });

  test('clicking "User" header sorts alphabetically by name', async ({ page }) => {
    await setAdminToken(page);
    await setupRoutes(page);
    await page.goto('/dashboard/admin');

    const header = page.getByRole('columnheader', { name: /Пользователь/i });
    await expect(header).toBeVisible({ timeout: 10000 });

    await header.click();
    await expect.poll(() => firstColUserName(page)).toBe('Alice');
  });
});
