import { test, expect } from '@playwright/test';

// Plan #16 — a small *conditional* daily-limit notice on /dashboard/lists and
// /dashboard/phrases, reusing each page's existing `quota` state (no new fetch).
// Deliberately not an always-on banner (that was `QuotaBanner`, removed in #9) —
// it must render nothing at 2+ sessions remaining, `limitNear` at exactly 1, and
// `limitReached` at 0. See plans/improvements/active/plan_16_pricing-conversion-ctas.md.

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

async function mockListsPage(page: import('@playwright/test').Page, quota: object) {
  await page.route('**/api/me/quota', (route) => route.fulfill({ json: quota }));
  await page.route('**/api/me/lists-progress', (route) => route.fulfill({ json: {} }));
  await page.route('**/api/subcategory-meta', (route) => route.fulfill({ json: {} }));
  await page.route('**/api/lists', (route) => route.fulfill({ json: [] }));
  await page.route('**/api/me/programs', (route) => route.fulfill({ json: [] }));
  await page.route('**/api/me/custom-programs', (route) => route.fulfill({ json: [] }));
}

async function mockPhrasesPage(page: import('@playwright/test').Page, quota: object) {
  await page.route('**/api/me/quota', (route) => route.fulfill({ json: quota }));
  await page.route('**/api/phrase-programs', (route) => route.fulfill({ json: [] }));
}

test.describe('Daily-limit banner — /dashboard/lists', () => {
  test('absent with 2+ sessions remaining', async ({ page }) => {
    await setFakeToken(page);
    await mockListsPage(page, { premium_active: false, sessions_today: 5, daily_limit: 10 });
    await page.goto('/dashboard/lists');
    await expect(page.getByTestId('daily-limit-banner')).toHaveCount(0);
  });

  test('shows the "last free session" notice with exactly 1 remaining', async ({ page }) => {
    await setFakeToken(page);
    await mockListsPage(page, { premium_active: false, sessions_today: 9, daily_limit: 10 });
    await page.goto('/dashboard/lists');
    const banner = page.getByTestId('daily-limit-banner');
    await expect(banner).toBeVisible();
    await expect(banner).toContainText('последняя бесплатная сессия');
  });

  // #25 — at 0 remaining this is an offer card, not a text link: it must carry the
  // price and a real button to /pricing. 28 users hit the old wall and never once
  // reached checkout.
  test('shows the Premium offer card at 0 remaining', async ({ page }) => {
    await setFakeToken(page);
    await mockListsPage(page, { premium_active: false, sessions_today: 5, daily_limit: 5 });
    await page.goto('/dashboard/lists');
    const banner = page.getByTestId('daily-limit-banner');
    await expect(banner).toBeVisible();
    await expect(banner).toContainText('Бесплатные сессии на сегодня закончились');
    await expect(banner).toContainText('Неограниченные учебные сессии');
    const cta = page.getByTestId('daily-limit-banner-cta');
    await expect(cta).toBeVisible();
    // #32 moved the price off the button label — the button names the action, the line
    // under it carries the terms. The price must still be on the card before the click:
    // #25 measured 28 users hitting a priceless wall and none of them reaching Checkout.
    await expect(cta).toContainText('Оформить Premium');
    await expect(cta).not.toContainText('4,50');
    await expect(page.getByTestId('daily-limit-banner-price')).toContainText('4,50 €');
    // trailingSlash: true — the exported href carries the slash.
    await expect(cta).toHaveAttribute('href', '/pricing/');
  });

  test('absent for a Premium user even at 0 remaining', async ({ page }) => {
    await setFakeToken(page);
    await mockListsPage(page, { premium_active: true, sessions_today: 10, daily_limit: 10 });
    await page.goto('/dashboard/lists');
    await expect(page.getByTestId('daily-limit-banner')).toHaveCount(0);
  });
});

test.describe('Daily-limit banner — /dashboard/phrases', () => {
  test('shows the "last free session" notice with exactly 1 remaining', async ({ page }) => {
    await setFakeToken(page);
    await mockPhrasesPage(page, { premium_active: false, sessions_today: 9, daily_limit: 10 });
    await page.goto('/dashboard/phrases');
    const banner = page.getByTestId('daily-limit-banner');
    await expect(banner).toBeVisible();
    await expect(banner).toContainText('последняя бесплатная сессия');
  });

  test('shows the Premium offer card at 0 remaining', async ({ page }) => {
    await setFakeToken(page);
    await mockPhrasesPage(page, { premium_active: false, sessions_today: 5, daily_limit: 5 });
    await page.goto('/dashboard/phrases');
    const banner = page.getByTestId('daily-limit-banner');
    await expect(banner).toBeVisible();
    await expect(banner).toContainText('Бесплатные сессии на сегодня закончились');
    await expect(page.getByTestId('daily-limit-banner-cta')).toHaveAttribute('href', '/pricing/');
  });
});
