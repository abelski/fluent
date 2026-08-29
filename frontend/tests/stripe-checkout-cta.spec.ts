import { test, expect } from '@playwright/test';

/**
 * #11 — Stripe subscription CTA on /pricing.
 *
 * The page resolves to exactly one of four CTA states, driven by GET /api/billing/config
 * and GET /api/me/quota. Both are stubbed here, so these run without Stripe keys.
 */

function makeFakeJwt(): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = btoa(JSON.stringify({ email: 'test@test.com', name: 'Test User', exp: 9999999999 }));
  return `${header}.${payload}.fakesignature`;
}

async function login(page: import('@playwright/test').Page) {
  await page.addInitScript((token) => localStorage.setItem('fluent_token', token), makeFakeJwt());
}

async function stubBilling(page: import('@playwright/test').Page, enabled: boolean) {
  await page.route('**/api/billing/config', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ enabled }) }));
}

async function stubQuota(page: import('@playwright/test').Page, quota: Record<string, unknown>) {
  await page.route('**/api/me/quota', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(quota) }));
}

const FREE = { premium_active: false, premium_until: null, subscription_status: null, has_billing_account: false };
const SUBSCRIBED = {
  premium_active: true,
  premium_until: '2099-01-31T00:00:00',
  subscription_status: 'active',
  has_billing_account: true,
};

test.describe('Stripe checkout CTA', () => {
  test('billing disabled falls back to the pre-#11 contact CTA', async ({ page }) => {
    await stubBilling(page, false);
    await page.goto('/pricing/');
    await expect(page.getByTestId('premium-cta-contact')).toBeVisible();
    await expect(page.getByTestId('premium-cta-upgrade')).toHaveCount(0);
    // The beta banner still truthfully says payments are not accepted.
    await expect(page.getByTestId('pricing-banner')).toContainText(/beta|бета/i);
  });

  test('logged-out user is sent to sign in, not to checkout', async ({ page }) => {
    await stubBilling(page, true);
    await page.goto('/pricing/');
    await expect(page.getByTestId('premium-cta-login')).toBeVisible();
    await expect(page.getByTestId('premium-cta-upgrade')).toHaveCount(0);
  });

  test('no mailto: link remains once billing is enabled', async ({ page }) => {
    await login(page);
    await stubBilling(page, true);
    await stubQuota(page, FREE);
    await page.goto('/pricing/');
    await expect(page.getByTestId('premium-cta-upgrade')).toBeVisible();
    await expect(page.locator('a[href^="mailto:"]')).toHaveCount(0);
  });

  test('free user gets the upgrade CTA and it POSTs to checkout-session', async ({ page, baseURL }) => {
    await login(page);
    await stubBilling(page, true);
    await stubQuota(page, FREE);
    await page.route('**/api/billing/checkout-session', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ url: `${baseURL}/pricing/?checkout=cancelled` }),
      }));

    await page.goto('/pricing/');
    const request = page.waitForRequest((r) =>
      r.url().includes('/api/billing/checkout-session') && r.method() === 'POST');
    await page.getByTestId('premium-cta-upgrade').click();
    await request;
    // The browser follows the hosted URL Stripe would have returned.
    await expect(page).toHaveURL(/checkout=cancelled/);
  });

  test('subscriber gets the manage CTA wired to the Customer Portal', async ({ page }) => {
    await login(page);
    await stubBilling(page, true);
    await stubQuota(page, SUBSCRIBED);
    await page.goto('/pricing/');

    await expect(page.getByTestId('premium-cta-manage')).toBeVisible();
    await expect(page.getByTestId('premium-cta-upgrade')).toHaveCount(0);
    await expect(page.getByTestId('premium-note')).toContainText('2099');
  });

  test('past_due subscriber is told their payment failed', async ({ page }) => {
    await login(page);
    await stubBilling(page, true);
    await stubQuota(page, { ...SUBSCRIBED, subscription_status: 'past_due' });
    await page.goto('/pricing/');
    await expect(page.getByTestId('premium-note')).toContainText(/card|карт/i);
  });

  test('cancelled return says nothing was charged', async ({ page }) => {
    await login(page);
    await stubBilling(page, true);
    await stubQuota(page, FREE);
    await page.goto('/pricing/?checkout=cancelled');
    await expect(page.getByTestId('checkout-cancelled')).toBeVisible();
    // Neutral and dismissible — it is not an error, and it must not sit there forever.
    await page.getByTestId('checkout-cancelled-dismiss').click();
    await expect(page.getByTestId('checkout-cancelled')).toHaveCount(0);
    // Backing out of checkout leaves the CTA usable, not stale.
    await expect(page.getByTestId('premium-cta-upgrade')).toBeVisible();
  });

  test('successful return waits for the webhook, then confirms activation', async ({ page }) => {
    await login(page);
    await stubBilling(page, true);

    // The webhook "lands" only when the test says so. Do NOT switch on an nth-call counter:
    // Header (rendered by the root layout on every page) also GETs /api/me/quota, so a shared
    // counter hands the pricing poll the already-subscribed response on its very first call and
    // the "activating" state is skipped entirely.
    let webhookLanded = false;
    await page.route('**/api/me/quota', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(webhookLanded ? SUBSCRIBED : FREE),
      }));

    await page.goto('/pricing/?checkout=success');
    // Shows "activating", never a bare success over a still-free account.
    await expect(page.getByTestId('checkout-activating')).toBeVisible();
    await expect(page.getByTestId('checkout-activated')).toHaveCount(0);

    webhookLanded = true;
    await expect(page.getByTestId('checkout-activated')).toBeVisible({ timeout: 15000 });
  });

  test('a webhook that never lands ends on "may take a minute", not a stuck spinner', async ({ page }) => {
    await login(page);
    await stubBilling(page, true);
    await stubQuota(page, FREE); // webhook never arrives

    await page.goto('/pricing/?checkout=success');
    await expect(page.getByTestId('checkout-activating')).toBeVisible();
    // ~5 polls, 2s apart, then the page stops waiting and says so.
    await expect(page.getByTestId('checkout-activating-slow')).toBeVisible({ timeout: 20000 });
    await expect(page.getByTestId('checkout-activated')).toHaveCount(0);
  });
});
