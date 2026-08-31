import { test, expect, type Page } from '@playwright/test';

// Plan #16 — StatsBar.tsx shows a one-time congratulatory card with a Premium
// mention when a non-Premium user newly crosses a streak/known-words milestone,
// reusing the existing (previously unused) `tr.stats.motivations.*` strings.
// Deduped via localStorage so it never re-shows for the same threshold, and never
// shown at all to a Premium user. See
// plans/improvements/active/plan_16_pricing-conversion-ctas.md.

function makeFakeJwt(name: string): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = btoa(JSON.stringify({ email: 'test@test.com', name, exp: 9999999999 }));
  return `${header}.${payload}.fakesignature`;
}

async function setFakeToken(page: Page, extraLocalStorage: Record<string, string> = {}) {
  await page.addInitScript(
    ({ token, extra }) => {
      localStorage.setItem('fluent_token', token);
      for (const [k, v] of Object.entries(extra)) localStorage.setItem(k, v);
    },
    { token: makeFakeJwt('Test User'), extra: extraLocalStorage },
  );
}

async function mockListsPage(page: Page, stats: object, quota: object) {
  await page.route('**/api/me/quota', (route) => route.fulfill({ json: quota }));
  await page.route('**/api/me/stats', (route) => route.fulfill({ json: stats }));
  await page.route('**/api/me/lists-progress', (route) => route.fulfill({ json: {} }));
  await page.route('**/api/subcategory-meta', (route) => route.fulfill({ json: {} }));
  await page.route('**/api/lists', (route) => route.fulfill({ json: [] }));
  await page.route('**/api/me/programs', (route) => route.fulfill({ json: [] }));
  await page.route('**/api/me/custom-programs', (route) => route.fulfill({ json: [] }));
}

const STATS_STREAK_7 = { known: 10, streak: 7, mistakes: 0, due_review: 0 };
const QUOTA_FREE = { premium_active: false, sessions_today: 0, daily_limit: 10 };
const QUOTA_PREMIUM = { premium_active: true, sessions_today: 0, daily_limit: null };

test.describe('Milestone nudge', () => {
  test('newly crossing streak:7 shows the nudge with the streak7 motivation string', async ({ page }) => {
    await setFakeToken(page);
    await mockListsPage(page, STATS_STREAK_7, QUOTA_FREE);
    await page.goto('/dashboard/lists');

    const nudge = page.getByTestId('milestone-nudge');
    await expect(nudge).toBeVisible();
    await expect(nudge).toContainText('Неделя подряд. Так держать!');
    await expect(page.getByRole('link', { name: 'Узнать про Premium' })).toHaveAttribute('href', /\/pricing\/?$/);
  });

  test('does not re-show once the same threshold is already recorded', async ({ page }) => {
    await setFakeToken(page, { fluent_milestone_streak_shown: '7' });
    await mockListsPage(page, STATS_STREAK_7, QUOTA_FREE);
    await page.goto('/dashboard/lists');

    await expect(page.getByTestId('stats-card-words')).toBeVisible();
    await expect(page.getByTestId('milestone-nudge')).toHaveCount(0);
  });

  test('never shown to a Premium user regardless of streak/known values', async ({ page }) => {
    await setFakeToken(page);
    await mockListsPage(page, { known: 150, streak: 30, mistakes: 0, due_review: 0 }, QUOTA_PREMIUM);
    await page.goto('/dashboard/lists');

    await expect(page.getByTestId('stats-card-words')).toBeVisible();
    await expect(page.getByTestId('milestone-nudge')).toHaveCount(0);
  });

  test('dismiss button hides the nudge', async ({ page }) => {
    await setFakeToken(page);
    await mockListsPage(page, STATS_STREAK_7, QUOTA_FREE);
    await page.goto('/dashboard/lists');

    const nudge = page.getByTestId('milestone-nudge');
    await expect(nudge).toBeVisible();
    await page.getByTestId('milestone-nudge-dismiss').click();
    await expect(nudge).toHaveCount(0);
  });

  test('never shown to an admin, even when not separately marked Premium', async ({ page }) => {
    await setFakeToken(page);
    await mockListsPage(page, STATS_STREAK_7, { ...QUOTA_FREE, is_admin: true });
    await page.goto('/dashboard/lists');

    await expect(page.getByTestId('stats-card-words')).toBeVisible();
    await expect(page.getByTestId('milestone-nudge')).toHaveCount(0);
  });
});
