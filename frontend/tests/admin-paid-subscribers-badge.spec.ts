// Autotest for the paid-subscription counter on the Users tab: a second badge next to the
// total-users badge counts users with an active Stripe subscription (subscription_status
// === 'active'), not everyone with premium — admin-granted premium is not revenue.
import { test, expect } from '@playwright/test';

function makeFakeJwt(name: string, isAdmin = false): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = btoa(JSON.stringify({ email: 'admin@test.com', name, is_admin: isAdmin, exp: 9999999999 }));
  return `${header}.${payload}.fakesignature`;
}

function user(over: Record<string, unknown>) {
  return {
    id: 'u', email: 'u@example.com', name: 'U',
    is_premium: false, premium_until: null, premium_active: false,
    subscription_status: null, stripe_customer_id: null,
    is_admin: false, is_superadmin: false, is_redactor: false,
    sessions_today: 0, daily_limit: null, last_login: null, email_consent: false,
    inactive_flag: false, inactive_since: null, deletion_warning: false, deletion_due: null,
    notice_sent_at: null, ...over,
  };
}

// 4 users: 2 paying, 1 premium granted by an admin (no subscription), 1 free.
const MOCK_USERS = [
  user({ id: 'u-pay1', name: 'Paying One', email: 'pay1@example.com', is_premium: true, premium_active: true, subscription_status: 'active', stripe_customer_id: 'cus_1' }),
  user({ id: 'u-pay2', name: 'Paying Two', email: 'pay2@example.com', is_premium: true, premium_active: true, subscription_status: 'active', stripe_customer_id: 'cus_2' }),
  user({ id: 'u-gift', name: 'Granted Premium', email: 'gift@example.com', is_premium: true, premium_active: true }),
  user({ id: 'u-free', name: 'Free User', email: 'free@example.com' }),
];

async function setup(page: import('@playwright/test').Page, lang: 'ru' | 'en') {
  await page.addInitScript(([token, l]) => {
    localStorage.setItem('fluent_token', token as string);
    localStorage.setItem('fluent_lang', l as string);
  }, [makeFakeJwt('Admin User', true), lang] as const);
  await page.route('**/api/admin/users', (route) => route.fulfill({ json: MOCK_USERS }));
  await page.route('**/api/me/quota', (route) => route.fulfill({ json: { is_superadmin: true } }));
  await page.route('**/api/admin/reports', (route) => route.fulfill({ json: [] }));
  await page.route('**/api/admin/articles', (route) => route.fulfill({ json: [] }));
  await page.route('**/api/admin/subcategories', (route) => route.fulfill({ json: [] }));
  await page.route('**/api/admin/content/word-lists', (route) => route.fulfill({ json: [] }));
  await page.route('**/api/admin/grammar/rules', (route) => route.fulfill({ json: [] }));
  await page.route('**/api/admin/feedback', (route) => route.fulfill({ json: [] }));
  await page.route('**/api/billing/config', (route) => route.fulfill({ json: { enabled: true } }));
}

test.describe('Admin panel — paid subscribers badge', () => {
  test('counts only active Stripe subscriptions, next to the total-users count', async ({ page }) => {
    await setup(page, 'ru');
    await page.goto('/dashboard/admin');

    // The tab keeps the head count only; the paying count rides on the "Платные" filter chip.
    await expect(page.getByRole('button', { name: /Пользователи/ })).toContainText('4');
    // 2, not 3 — the admin-granted premium user has no subscription.
    await expect(page.getByRole('button', { name: /Платные/ })).toContainText('2');
  });

  test('the "Paid" filter shows only active subscribers', async ({ page }) => {
    await setup(page, 'ru');
    await page.goto('/dashboard/admin');
    await expect(page.locator('tbody tr')).toHaveCount(4);

    await page.getByRole('button', { name: /Платные/ }).click();
    await expect(page.locator('tbody tr')).toHaveCount(2);
    await expect(page.locator('tbody')).toContainText('Paying One');
    await expect(page.locator('tbody')).toContainText('Paying Two');
    await expect(page.locator('tbody')).not.toContainText('Granted Premium');
    await expect(page.locator('tbody')).not.toContainText('Free User');
  });

  for (const lang of ['ru', 'en'] as const) {
    for (const [label, size] of [['desktop', { width: 1280, height: 900 }], ['mobile', { width: 375, height: 800 }]] as const) {
      test(`screenshot ${lang} ${label}`, async ({ page }) => {
        await page.setViewportSize(size);
        await setup(page, lang);
        await page.goto('/dashboard/admin');
        await expect(page.getByRole('button', { name: lang === 'ru' ? /Платные/ : /Paid/ })).toContainText('2');
        await page.screenshot({ path: `../temp_files/screenshots/plan_42_admin-paid-subscribers-badge/${lang}-${label}.png`, fullPage: false, animations: 'disabled' });

        await page.getByRole('button', { name: lang === 'ru' ? /Платные/ : /Paid/ }).click();
        await expect(page.locator('tbody tr')).toHaveCount(2);
        await page.screenshot({ path: `../temp_files/screenshots/plan_42_admin-paid-subscribers-badge/${lang}-${label}-filtered.png`, fullPage: false, animations: 'disabled' });
      });
    }
  }
});
