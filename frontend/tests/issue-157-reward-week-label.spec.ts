import { test, expect } from '@playwright/test';

// Issue #157 — the weekly reward job used to count the *in-progress* week
// instead of the last completed one. This spec guards the admin Rewards tab
// copy: it must always name the *previous* week (the week that was actually
// rewarded), never "this week".

function makeFakeJwt(email = 'admin@test.com', name = 'Admin User'): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = btoa(JSON.stringify({ email, name, picture: null, exp: 9999999999 }));
  return `${header}.${payload}.fakesignature`;
}

async function setAdminToken(page: import('@playwright/test').Page) {
  await page.addInitScript((token) => {
    localStorage.setItem('fluent_token', token);
  }, makeFakeJwt());
}

// week_start/week_end mirror what `previous_week_bounds` returns for a Monday
// 10:00 UTC run — the last *fully completed* week, e.g. Aug 10 (Mon) .. Aug 17 (Mon).
const MOCK_TOP5 = {
  users: [
    { rank: 1, id: 'u1', email: 'a@example.com', name: 'Leader A', picture: null, is_premium: false, premium_until: null, lang: 'ru', score: 42 },
    { rank: 2, id: 'u2', email: 'b@example.com', name: 'Leader B', picture: null, is_premium: false, premium_until: null, lang: 'ru', score: 30 },
    { rank: 3, id: 'u3', email: 'c@example.com', name: 'Leader C', picture: null, is_premium: false, premium_until: null, lang: 'ru', score: 20 },
  ],
  week_start: '2026-08-10T00:00:00',
  week_end: '2026-08-17T00:00:00',
};

function setupMocks(page: import('@playwright/test').Page) {
  page.route('**/api/admin/users', async (route) => { await route.fulfill({ json: [] }); });
  page.route('**/api/me/quota', async (route) => { await route.fulfill({ json: { is_superadmin: true, is_admin: true } }); });
  page.route('**/api/admin/reports', async (route) => { await route.fulfill({ json: [] }); });
  page.route('**/api/admin/articles', async (route) => { await route.fulfill({ json: [] }); });
  page.route('**/api/admin/subcategories', async (route) => { await route.fulfill({ json: [] }); });
  page.route('**/api/admin/content/word-lists', async (route) => { await route.fulfill({ json: [] }); });
  page.route('**/api/admin/grammar/rules', async (route) => { await route.fulfill({ json: [] }); });
  page.route('**/api/admin/feedback', async (route) => { await route.fulfill({ json: [] }); });
  page.route('**/api/admin/messages', async (route) => { await route.fulfill({ json: [] }); });
  page.route('**/api/admin/message-templates', async (route) => {
    await route.fulfill({ json: { ru: { subject: 's', body: 'b' }, en: { subject: 's', body: 'b' } } });
  });
  page.route('**/api/admin/leaderboard-top5', async (route) => { await route.fulfill({ json: MOCK_TOP5 }); });
}

test.describe('Admin Rewards tab — reward week label (issue #157)', () => {
  test('Rewards tab heading names the previous (completed) week, not the current one', async ({ page }) => {
    await setAdminToken(page);
    setupMocks(page);
    await page.goto('/dashboard/admin');

    await page.getByRole('button', { name: 'Письма' }).click();
    await page.getByRole('button', { name: '🏆 Награды' }).click();

    // Heading must say "прошлой недели" (previous week) with the actual
    // Aug 10–16 date range that was rewarded — never "этой недели" (this week).
    await expect(page.getByText(/Рейтинг прошлой недели.*10\s*авг.*16\s*авг.*топ-3/s)).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('Рейтинг этой недели')).toHaveCount(0);
  });
});
