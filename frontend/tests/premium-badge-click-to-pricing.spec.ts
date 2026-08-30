import { test, expect } from '@playwright/test';

// Plan #13 — the header's own-status Premium pill and the locked practice-test
// Premium badge both navigate to /pricing on click/keyboard activation. See
// plans/improvements/active/plan_13_premium-badge-click-to-pricing.md.

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

// Shared across both header tests and re-served after the client-side navigation to
// /pricing (PricingClient also reads /api/me/quota and /api/billing/config on mount).
const QUOTA_PREMIUM = {
  is_premium: true,
  premium_active: true,
  premium_until: '2026-12-01T00:00:00',
  sessions_today: 0,
  daily_limit: null,
  is_admin: false,
  subscription_status: 'active',
  has_billing_account: true,
};

const QUOTA_FREE = {
  is_premium: false,
  premium_active: false,
  premium_until: null,
  sessions_today: 0,
  daily_limit: 10,
  is_admin: false,
  subscription_status: null,
  has_billing_account: false,
};

async function mockBillingConfig(page: import('@playwright/test').Page) {
  await page.route('**/api/billing/config', (route) => route.fulfill({ json: { enabled: false } }));
}

async function mockListsPage(page: import('@playwright/test').Page, quota: object) {
  await page.route('**/api/me/quota', (route) => route.fulfill({ json: quota }));
  await page.route('**/api/me/lists-progress', (route) => route.fulfill({ json: {} }));
  await page.route('**/api/subcategory-meta', (route) => route.fulfill({ json: {} }));
  await page.route('**/api/lists', (route) => route.fulfill({ json: [] }));
  await page.route('**/api/me/programs', (route) => route.fulfill({ json: [] }));
  await page.route('**/api/me/custom-programs', (route) => route.fulfill({ json: [] }));
  await mockBillingConfig(page);
}

test.describe('Header Premium badge → /pricing', () => {
  test('click navigates to /pricing and does not open the account dropdown', async ({ page }) => {
    await setFakeToken(page);
    await mockListsPage(page, QUOTA_PREMIUM);
    await page.goto('/dashboard/lists');

    const badge = page.getByTestId('premium-badge');
    await expect(badge).toBeVisible();
    await badge.click();

    await expect(page).toHaveURL(/\/pricing/);
    // If the click had also bubbled to the avatar button's own onClick, the account
    // dropdown (rendered by the same, still-mounted root-layout Header) would be open.
    await expect(page.getByRole('button', { name: 'Выйти' })).not.toBeVisible();
  });

  test('keyboard activation (Enter) navigates to /pricing', async ({ page }) => {
    await setFakeToken(page);
    await mockListsPage(page, QUOTA_PREMIUM);
    await page.goto('/dashboard/lists');

    const badge = page.getByTestId('premium-badge');
    await expect(badge).toBeVisible();
    await badge.focus();
    await badge.press('Enter');

    await expect(page).toHaveURL(/\/pricing/);
  });
});

test.describe('Practice page Premium badge → /pricing', () => {
  const CATEGORY_ID = 3;

  const MOCK_LOCKED_PREMIUM_TEST = {
    id: 20,
    title_ru: 'Премиум тест',
    title_en: null,
    description_ru: null,
    description_en: null,
    lesson_text_lt: null,
    question_count: 5,
    pass_threshold: 0.75,
    is_premium: true,
    active_question_count: 5,
    is_locked: true,
    best_score_pct: null,
  };

  test('click navigates to /pricing', async ({ page }) => {
    await setFakeToken(page);
    await page.route(`**/api/practice/categories/${CATEGORY_ID}/tests`, (route) =>
      route.fulfill({ json: [MOCK_LOCKED_PREMIUM_TEST] })
    );
    await page.route('**/api/practice/categories', (route) =>
      route.fulfill({ json: [{ id: CATEGORY_ID, name_ru: 'Тестовая категория', name_en: null, description_ru: null, source_url: null }] })
    );
    await page.route('**/api/me/quota', (route) => route.fulfill({ json: QUOTA_FREE }));
    await mockBillingConfig(page);

    await page.goto(`/dashboard/practice/${CATEGORY_ID}`);

    const badge = page.getByTestId('practice-premium-badge');
    await expect(badge).toBeVisible();
    await badge.click();

    await expect(page).toHaveURL(/\/pricing/);
  });
});
