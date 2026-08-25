// Plan #9 — the free-tier quota banner ("Сессий сегодня: N / limit" + "Get Premium") was
// removed app-wide. It rendered only on /dashboard/lists and /dashboard/phrases, never on
// any grammar page, and the user asked for it to go.
//
// What must NOT change: the daily limit itself is still enforced server-side and still
// gates the session-start UI on both pages (the `quota` fetch, `limitReached` and
// `eligible` all stayed). Only the banner box is gone — so this spec runs with a free-tier
// quota that has NOT hit the limit (2/10) and with one that HAS (10/10), and asserts the
// banner is absent either way while the page itself still renders normally.

import { test, expect } from '@playwright/test';

function makeFakeJwt(): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = btoa(JSON.stringify({ email: 'test@test.com', name: 'Test User', exp: 9999999999 }));
  return `${header}.${payload}.fakesignature`;
}

const STATS = {
  known: 723,
  streak: 3,
  mistakes: 0,
  due_review: 69,
  phrases_learned: 189,
  phrases_due_review: 188,
};

const QUOTA_FREE = { premium_active: false, premium_until: null, sessions_today: 2, daily_limit: 10 };
const QUOTA_LIMIT_REACHED = { premium_active: false, premium_until: null, sessions_today: 10, daily_limit: 10 };

async function mockPages(page: import('@playwright/test').Page, quota: object) {
  await page.addInitScript((token) => {
    localStorage.setItem('fluent_token', token);
  }, makeFakeJwt());
  await page.route('**/api/me/stats', (r) => r.fulfill({ json: STATS }));
  await page.route('**/api/me/quota', (r) => r.fulfill({ json: quota }));
  await page.route('**/api/admin/settings/cefr-thresholds', (r) => r.fulfill({ json: [] }));
  await page.route('**/api/me/welcome', (r) => r.fulfill({ json: { shown: true, content: null } }));
  // lists page
  await page.route('**/api/subcategory-meta', (r) => r.fulfill({ json: {} }));
  await page.route('**/api/lists', (r) => r.fulfill({ json: [] }));
  await page.route('**/api/me/programs', (r) => r.fulfill({ json: [] }));
  await page.route('**/api/me/lists-progress', (r) => r.fulfill({ json: {} }));
  await page.route('**/api/me/custom-programs', (r) => r.fulfill({ json: [] }));
  // phrases page
  await page.route('**/api/phrase-programs', (r) => r.fulfill({ json: [] }));
  await page.route('**/api/me/phrase-lists', (r) => r.fulfill({ json: [] }));
}

test.describe('Plan #9 — the quota banner no longer renders', () => {
  for (const [label, quota] of [
    ['under the daily limit', QUOTA_FREE],
    ['at the daily limit', QUOTA_LIMIT_REACHED],
  ] as const) {
    test(`words page has no quota banner (${label})`, async ({ page }) => {
      await mockPages(page, quota);
      await page.goto('/dashboard/lists');
      await expect(page.getByTestId('stats-card-words')).toBeVisible();
      await expect(page.getByTestId('quota-banner')).toHaveCount(0);
    });

    test(`phrases page has no quota banner (${label})`, async ({ page }) => {
      await mockPages(page, quota);
      await page.goto('/dashboard/phrases');
      await expect(page.getByTestId('stats-card-phrases')).toBeVisible();
      await expect(page.getByTestId('quota-banner')).toHaveCount(0);
    });
  }
});
