import { test, expect } from '@playwright/test';

function makeFakeJwt(picture = 'https://example.com/avatar.jpg'): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = btoa(JSON.stringify({ email: 'test@test.com', name: 'Test User', picture, exp: 9999999999 }));
  return `${header}.${payload}.fakesignature`;
}

const MOCK_STATS = { known: 10, learning: 5, total_studied: 15, streak: 3, mistakes: 0, grammar_lessons_passed: 2, practice_exams_completed: 1 };

const MOCK_LEADERBOARD = [
  { rank: 1, picture: 'https://example.com/avatar.jpg', score: 42 },
  { rank: 2, picture: null, score: 30 },
  { rank: 3, picture: 'https://example.com/other.jpg', score: 20 },
];

async function setupAuthPage(page: import('@playwright/test').Page, leaderboardData = MOCK_LEADERBOARD) {
  const token = makeFakeJwt();
  await page.addInitScript((t) => localStorage.setItem('fluent_token', t), token);
  await page.route('**/api/me/stats', async (route) => route.fulfill({ json: MOCK_STATS }));
  await page.route('**/api/me/quota', async (route) => route.fulfill({ json: { is_admin: false } }));
  await page.route('**/api/news**', async (route) => route.fulfill({ json: [] }));
  await page.route('**/api/leaderboard', async (route) => route.fulfill({ json: leaderboardData }));
}

test.describe('Leaderboard', () => {
  test('leaderboard is hidden from unauthenticated visitors', async ({ page }) => {
    await page.route('**/api/news**', async (route) => route.fulfill({ json: [] }));
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await expect(page.getByTestId('leaderboard')).not.toBeVisible();
  });

  test('leaderboard renders for logged-in users', async ({ page }) => {
    await setupAuthPage(page);
    await page.goto('/');
    await expect(page.getByTestId('leaderboard')).toBeVisible({ timeout: 5000 });
    const entries = page.getByTestId('leaderboard-entry');
    await expect(entries).toHaveCount(3);
  });

  test('current user entry is highlighted', async ({ page }) => {
    await setupAuthPage(page);
    await page.goto('/');
    await expect(page.getByTestId('leaderboard')).toBeVisible({ timeout: 5000 });
    // rank-1 entry matches our JWT picture → should have emerald highlight
    const firstEntry = page.getByTestId('leaderboard-entry').first();
    await expect(firstEntry).toHaveClass(/ring-emerald/);
  });

  test('null picture shows fallback without broken img', async ({ page }) => {
    await setupAuthPage(page);
    await page.goto('/');
    await expect(page.getByTestId('leaderboard')).toBeVisible({ timeout: 5000 });
    // rank-2 has null picture — no <img> should be rendered for that entry
    const secondEntry = page.getByTestId('leaderboard-entry').nth(1);
    await expect(secondEntry.locator('img')).toHaveCount(0);
  });

  test('leaderboard hidden when API returns empty array', async ({ page }) => {
    await setupAuthPage(page, []);
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await expect(page.getByTestId('leaderboard')).not.toBeVisible();
  });
});
