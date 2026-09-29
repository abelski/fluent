import { test, expect } from '@playwright/test';

// Public SEO pages must be reachable without a token (Google crawls them with
// no auth). Private dashboard pages must still redirect logged-out users to
// the landing page. See PUBLIC_PREFIXES in app/dashboard/layout.tsx.

const PUBLIC_PAGES = [
  '/dashboard/articles',
  '/dashboard/grammar',
  '/dashboard/lists',
  '/dashboard/phrases',
  '/dashboard/practice', // #55 — guests preview practice
];

const PRIVATE_PAGES = ['/dashboard', '/dashboard/review'];

test.describe('Public SEO pages (logged out)', () => {
  for (const path of PUBLIC_PAGES) {
    test(`${path} stays on page without a token`, async ({ page }) => {
      await page.goto(path);
      // Give the auth check effect time to (wrongly) fire a redirect
      await page.waitForTimeout(1500);
      await expect(page).toHaveURL(new RegExp(path.replace(/\//g, '\\/')));
    });
  }

  test('/dashboard/articles shows article links without a token', async ({ page }) => {
    await page.goto('/dashboard/articles');
    const links = page.locator('a[href^="/dashboard/articles/"]');
    await expect(links.first()).toBeVisible({ timeout: 10000 });
    expect(await links.count()).toBeGreaterThan(3);
  });

  test('/dashboard/articles static HTML contains article links (no JS needed)', async ({ request }) => {
    const res = await request.get('/dashboard/articles/');
    expect(res.ok()).toBeTruthy();
    const html = await res.text();
    expect(html).toContain('href="/dashboard/articles/');
    // #55: the bento layout is pre-rendered from the build-time list (the Suspense
    // fallback), so real article links — not just the nav link — are in the HTML.
    const slugs = new Set(Array.from(html.matchAll(/href="\/dashboard\/articles\/([^"/]+)\/?"/g), (m) => m[1]));
    expect(slugs.size).toBeGreaterThan(3);
  });
});

test.describe('Private dashboard pages (logged out)', () => {
  for (const path of PRIVATE_PAGES) {
    test(`${path} redirects away without a token`, async ({ page }) => {
      await page.goto(path);
      // Landing page or /login are both acceptable targets for logged-out users
      await expect(page).toHaveURL(/localhost:8000\/(login\/?)?$/, { timeout: 5000 });
    });
  }
});
