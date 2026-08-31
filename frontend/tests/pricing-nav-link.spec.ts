import { test, expect } from '@playwright/test';

// Plan #16 — Header.tsx's navLinks gained a 6th "Pricing" pill (RU: "Тарифы"),
// joining the same physical pill strip as the other 5 nav tabs but not their
// PageShell/NAV_PAGES family. See
// plans/improvements/active/plan_16_pricing-conversion-ctas.md.

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

test.describe('Pricing nav pill', () => {
  test('visible in the header on an arbitrary dashboard page and links to /pricing', async ({ page }) => {
    await setFakeToken(page);
    await page.route('**/api/me/quota', (route) =>
      route.fulfill({ json: { premium_active: false, sessions_today: 0, daily_limit: 10 } }));
    await page.goto('/dashboard/grammar');

    const pill = page.locator('header nav').getByRole('link', { name: 'Тарифы' });
    await expect(pill).toBeVisible();
    await expect(pill).toHaveAttribute('href', /\/pricing\/?$/);

    await pill.click();
    await expect(page).toHaveURL(/\/pricing/);
  });

  test('is active-highlighted when already on /pricing', async ({ page }) => {
    await page.goto('/pricing');

    const pill = page.locator('header nav').getByRole('link', { name: 'Тарифы' });
    await expect(pill).toBeVisible();
    // Active pills carry `bg-white font-semibold text-ink`; inactive ones don't.
    await expect(pill).toHaveClass(/font-semibold/);
    await expect(pill).toHaveClass(/bg-white/);
  });

  test('is not active-highlighted on another dashboard page', async ({ page }) => {
    await setFakeToken(page);
    await page.route('**/api/me/quota', (route) =>
      route.fulfill({ json: { premium_active: false, sessions_today: 0, daily_limit: 10 } }));
    await page.goto('/dashboard/grammar');

    const pill = page.locator('header nav').getByRole('link', { name: 'Тарифы' });
    await expect(pill).toBeVisible();
    await expect(pill).not.toHaveClass(/font-semibold/);
  });
});
