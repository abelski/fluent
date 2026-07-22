import { test, expect } from '@playwright/test';

// Regression guard for the /dashboard/lists request waterfall.
//
// /api/me/lists-progress used to be chained inside the .then() of
// Promise.all([/api/lists, /api/me/programs]), so it did not start until both
// had returned — serialising the two slowest calls on the page. It takes no
// input from either response (it derives everything from the user's own
// enrollments server-side), so the chaining was incidental.
//
// This test pins the parallelism: it delays /api/lists and asserts that
// lists-progress still starts immediately rather than waiting on it.

function makeFakeJwt(name: string): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = btoa(JSON.stringify({ email: 'test@test.com', name, exp: 9999999999 }));
  return `${header}.${payload}.fakesignature`;
}

const LISTS_DELAY_MS = 800;

test('/api/me/lists-progress is not blocked behind /api/lists', async ({ page }) => {
  await page.addInitScript((token) => {
    localStorage.setItem('fluent_token', token);
  }, makeFakeJwt('Test User'));

  let t0 = 0;
  let listsStart = -1;
  let progressStart = -1;

  await page.route('**/api/me/quota', (route) =>
    route.fulfill({ json: { is_admin: false, is_superadmin: false, is_redactor: false, user_id: 'u1', sessions_today: 0, daily_limit: 3, premium_active: false, is_premium: false, premium_until: null } })
  );
  await page.route('**/api/me/welcome', (route) => route.fulfill({ json: { shown: true, content: {} } }));
  await page.route('**/api/subcategory-meta', (route) => route.fulfill({ json: {} }));
  await page.route('**/api/me/custom-program-enrollments', (route) => route.fulfill({ json: [] }));
  await page.route('**/api/me/programs', (route) => route.fulfill({ json: [] }));
  await page.route('**/api/me/word-lists', (route) => route.fulfill({ json: [] }));

  // Record when each of the two calls of interest is issued.
  await page.route('**/api/me/lists-progress', async (route) => {
    if (progressStart < 0) progressStart = Date.now() - t0;
    await route.fulfill({ json: {} });
  });

  // /api/lists is deliberately slow, and returns a non-empty catalogue so the
  // old `if (allLists.length === 0) return;` guard would not short-circuit —
  // this isolates the timing property rather than the guard.
  await page.route('**/api/lists', async (route) => {
    if (listsStart < 0) listsStart = Date.now() - t0;
    await new Promise((r) => setTimeout(r, LISTS_DELAY_MS));
    await route.fulfill({
      json: [{
        id: 1, title: 'Test list', title_en: null, description: null,
        description_en: null, subcategory: 'test_sub', difficulty: 'easy',
        cefr_level: 'A1', word_count: 3,
      }],
    });
  });

  t0 = Date.now();
  // Hit the app directly (trailing slash) rather than via the backend's
  // static-file redirect, which drops the path.
  await page.goto('http://localhost:3000/dashboard/lists/');

  await expect.poll(() => progressStart, { timeout: 10000 }).toBeGreaterThanOrEqual(0);
  expect(listsStart).toBeGreaterThanOrEqual(0);

  // The two requests start together. If lists-progress were still chained it
  // would start only after LISTS_DELAY_MS.
  expect(progressStart).toBeLessThan(LISTS_DELAY_MS / 2);
  expect(Math.abs(progressStart - listsStart)).toBeLessThan(LISTS_DELAY_MS / 2);
});
