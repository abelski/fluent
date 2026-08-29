// Autotest for #11's admin-panel addition: the Users table shows a Stripe subscription
// status badge (active / past_due / canceled) next to the Premium badge, linking out to
// the customer in the Stripe dashboard when a stripe_customer_id exists. Added because the
// backend already returned `subscription_status` from #11's original implementation, but
// nothing in the admin frontend ever rendered it — this closes that gap.
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
    id: 'u-active', email: 'subscriber@example.com', name: 'Active Subscriber',
    is_premium: true, premium_until: '2026-09-29T00:00:00', premium_active: true,
    subscription_status: 'active', stripe_customer_id: 'cus_active123',
    is_admin: false, is_superadmin: false, is_redactor: false,
    sessions_today: 0, daily_limit: null, last_login: null, email_consent: false,
    inactive_flag: false, inactive_since: null, deletion_warning: false, deletion_due: null,
    notice_sent_at: null,
  },
  {
    id: 'u-pastdue', email: 'pastdue@example.com', name: 'Past Due User',
    is_premium: true, premium_until: '2026-09-01T00:00:00', premium_active: true,
    subscription_status: 'past_due', stripe_customer_id: 'cus_pastdue456',
    is_admin: false, is_superadmin: false, is_redactor: false,
    sessions_today: 0, daily_limit: null, last_login: null, email_consent: false,
    inactive_flag: false, inactive_since: null, deletion_warning: false, deletion_due: null,
    notice_sent_at: null,
  },
  {
    id: 'u-gifted', email: 'gifted@example.com', name: 'Admin-Granted Premium',
    is_premium: true, premium_until: null, premium_active: true,
    subscription_status: null, stripe_customer_id: null,
    is_admin: false, is_superadmin: false, is_redactor: false,
    sessions_today: 0, daily_limit: null, last_login: null, email_consent: false,
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

test.describe('Admin panel — Stripe subscription status (#11)', () => {
  test('an active subscriber shows an "active" badge linking to the Stripe customer', async ({ page }) => {
    await setAdminToken(page);
    await setupRoutes(page);
    await page.goto('/dashboard/admin');

    const row = page.locator('tr', { hasText: 'subscriber@example.com' });
    const link = row.getByRole('link', { name: 'активна' });
    await expect(link).toBeVisible({ timeout: 10000 });
    await expect(link).toHaveAttribute('href', 'https://dashboard.stripe.com/customers/cus_active123');
    await expect(link).toHaveAttribute('target', '_blank');
  });

  test('a past-due subscriber shows a "past due" badge', async ({ page }) => {
    await setAdminToken(page);
    await setupRoutes(page);
    await page.goto('/dashboard/admin');

    const row = page.locator('tr', { hasText: 'pastdue@example.com' });
    await expect(row.getByRole('link', { name: 'просрочена оплата' })).toBeVisible({ timeout: 10000 });
  });

  test('an admin-granted Premium user (no Stripe subscription) shows no status badge', async ({ page }) => {
    await setAdminToken(page);
    await setupRoutes(page);
    await page.goto('/dashboard/admin');

    const row = page.locator('tr', { hasText: 'gifted@example.com' });
    await expect(row.getByText('Premium', { exact: true })).toBeVisible({ timeout: 10000 });
    await expect(row.getByRole('link', { name: 'активна' })).toHaveCount(0);
    await expect(row.getByRole('link', { name: 'просрочена оплата' })).toHaveCount(0);
    await expect(row.getByRole('link', { name: 'отменена' })).toHaveCount(0);
  });
});
