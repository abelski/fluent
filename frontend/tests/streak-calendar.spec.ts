import { test, expect } from '@playwright/test';

function makeFakeJwt(): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = btoa(JSON.stringify({ email: 'test@test.com', name: 'Test User', picture: null, exp: 9999999999 }));
  return `${header}.${payload}.fakesignature`;
}

const MOCK_STATS = { known: 10, learning: 5, total_studied: 15, streak: 7, mistakes: 0, grammar_lessons_passed: 2, practice_exams_completed: 1 };

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function setupAuthPage(page: import('@playwright/test').Page, calendarDates: string[] = []) {
  const token = makeFakeJwt();
  await page.addInitScript((t) => localStorage.setItem('fluent_token', t), token);
  await page.route('**/api/me/stats', async (route) => route.fulfill({ json: MOCK_STATS }));
  await page.route('**/api/me/quota', async (route) => route.fulfill({ json: { is_admin: false } }));
  await page.route('**/api/news**', async (route) => route.fulfill({ json: [] }));
  await page.route('**/api/leaderboard**', async (route) => route.fulfill({ json: [] }));
  await page.route('**/api/me/activity-calendar', async (route) => route.fulfill({ json: { dates: calendarDates } }));
}

test.describe('Streak calendar', () => {
  test('calendar renders for logged-in users', async ({ page }) => {
    await setupAuthPage(page, [todayIso()]);
    await page.goto('/');
    const calendar = page.locator('.streak-calendar');
    await expect(calendar).toBeVisible({ timeout: 5000 });
  });

  test('calendar shows 28 day cells', async ({ page }) => {
    await setupAuthPage(page, []);
    await page.goto('/');
    const calendar = page.locator('.streak-calendar');
    await expect(calendar).toBeVisible({ timeout: 5000 });
    // All days of the current month
    const daysInMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
    const cells = calendar.locator('[title]');
    await expect(cells).toHaveCount(daysInMonth);
  });

  test('active day gets orange background', async ({ page }) => {
    const today = todayIso();
    await setupAuthPage(page, [today]);
    await page.goto('/');
    const calendar = page.locator('.streak-calendar');
    await expect(calendar).toBeVisible({ timeout: 5000 });
    const todayCell = calendar.locator(`[title="${today}"]`);
    await expect(todayCell).toHaveClass(/ring-emerald-500/);
  });

  test('today dot indicator is visible', async ({ page }) => {
    await setupAuthPage(page, [todayIso()]);
    await page.goto('/');
    await expect(page.locator('.streak-calendar')).toBeVisible({ timeout: 5000 });
    // Today's dot: bg-orange-500 dot below the circle
    const dot = page.locator('.streak-calendar .bg-orange-500');
    await expect(dot).toBeVisible();
  });

  test('calendar not shown for unauthenticated visitors', async ({ page }) => {
    await page.route('**/api/news**', async (route) => route.fulfill({ json: [] }));
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('.streak-calendar')).not.toBeVisible();
  });
});
