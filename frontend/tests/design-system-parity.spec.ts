import { test, expect } from '@playwright/test';

/**
 * Guards the visual contract taken from `design system/prototypes/*.html`.
 *
 * These assert tokens and structure that the prototypes fix explicitly, so a
 * future refactor cannot silently drift the app back onto stock Tailwind
 * palette steps or the old 896px layout.
 */

const BRAND_GREEN = 'rgb(15, 157, 104)'; // #0f9d68 — design-system accent
const LINE = 'rgb(236, 236, 236)';       // #ececec — card/rule border

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

test.describe('Design-system parity', () => {
  test('body carries the page-wash gradient, not a flat fill', async ({ page }) => {
    await page.goto('/dashboard/grammar');
    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundImage);
    expect(bg).toContain('linear-gradient');
    // The three stops from the prototype's <helmet> block.
    expect(bg).toContain('rgb(238, 244, 241)'); // #eef4f1
    expect(bg).toContain('rgb(247, 248, 248)'); // #f7f8f8
  });

  test('brand green resolves to #0f9d68, not stock emerald-600', async ({ page }) => {
    await page.goto('/dashboard/grammar');
    const dot = page.locator('header a[href="/"] span').first();
    await expect(dot).toHaveCSS('color', BRAND_GREEN);
  });

  test('navbar is full-bleed and free of sticky/blur chrome', async ({ page }) => {
    await page.goto('/dashboard/grammar');
    const header = page.locator('header').first();
    await expect(header).toHaveCSS('position', 'relative');
    await expect(header).toHaveCSS('border-bottom-color', LINE);

    // The inner row must span the viewport rather than being capped at 896px.
    const width = await header.locator(':scope > div').first().evaluate((el) => el.getBoundingClientRect().width);
    const viewport = page.viewportSize()!.width;
    expect(width).toBeGreaterThan(viewport - 2);
  });

  test('page content is constrained to the 1180px container', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/dashboard/grammar');
    const page1180 = page.locator('.page').first();
    await expect(page1180).toBeVisible();
    await expect(page1180).toHaveCSS('max-width', '1180px');
  });

  test('language switch is a segmented pill with no slash separator', async ({ page }) => {
    await page.goto('/dashboard/grammar');
    const toggle = page.getByTestId('lang-toggle');
    await expect(toggle).toBeVisible();
    await expect(toggle).not.toContainText('/');
    // Exactly two segments, RU and EN.
    await expect(toggle.locator('span')).toHaveCount(2);
  });

  test('decorative blur blobs are gone from the grammar page', async ({ page }) => {
    await page.goto('/dashboard/grammar');
    await expect(page.locator('.blur-\\[120px\\]')).toHaveCount(0);
  });

  test('bug-report FAB mascot is the bare badge: body + eyes, no limbs, no float', async ({ page }) => {
    await setFakeToken(page);
    await page.goto('/dashboard/lists');
    const fab = page.getByTestId('mistake-button');
    await expect(fab).toBeVisible();

    const shape = await fab.evaluate((btn) => {
      const svg = Array.from(btn.querySelectorAll('svg'))
        .find((s) => s.getBoundingClientRect().width > 0) as SVGElement | undefined;
      if (!svg) return null;
      return {
        pose: (svg as HTMLElement).dataset.pose,
        children: svg.children.length,
        hasFloat: !!svg.querySelector('g[style*="tak-float"]'),
        hasArmSwing: !!svg.querySelector('animateTransform'),
      };
    });
    // Prototype FAB: 1 body polygon + 4 eye rects, statically rendered.
    expect(shape).toEqual({ pose: 'bare', children: 5, hasFloat: false, hasArmSwing: false });
  });

  test('wordmark stays ink — only the dot is green', async ({ page }) => {
    await page.goto('/dashboard/lists');
    const logo = page.locator('header a[href="/"]');
    // The global `a` rule must not tint the whole wordmark.
    await expect(logo).toHaveCSS('color', 'rgb(22, 24, 28)');
    await expect(logo.locator('span')).toHaveCSS('color', BRAND_GREEN);
  });

  test('the global link rule does not green any other bare link', async ({ page }) => {
    await setFakeToken(page);
    for (const url of ['/', '/dashboard/lists', '/dashboard/grammar', '/dashboard/phrases']) {
      await page.goto(url);
      const green = await page.evaluate((brand) =>
        Array.from(document.querySelectorAll('a'))
          .filter((a) => getComputedStyle(a).color === brand && (a.textContent || '').trim())
          .map((a) => (a.textContent || '').trim().slice(0, 40)), BRAND_GREEN);
      expect(green, `unexpected green links on ${url}`).toEqual([]);
    }
  });

  test('bug-report FAB renders exactly one mascot and hides its label on mobile', async ({ page }) => {
    await setFakeToken(page);
    await page.goto('/dashboard/lists');
    const fab = page.getByTestId('mistake-button');
    const visibleMascots = () => fab.evaluate((btn) =>
      Array.from(btn.querySelectorAll('svg')).filter((s) => s.getBoundingClientRect().width > 0).length);

    await expect(fab).toBeVisible();
    expect(await visibleMascots(), 'desktop').toBe(1);
    await expect(fab.locator('span')).toBeVisible();

    await page.setViewportSize({ width: 390, height: 780 });
    await page.waitForTimeout(200);
    expect(await visibleMascots(), 'mobile').toBe(1);
    await expect(fab.locator('span')).toBeHidden();
  });

  test('mobile keeps the hamburger menu and it opens the nav', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 780 });
    await page.goto('/dashboard/lists');
    const burger = page.locator('header button[aria-label]').last();
    await expect(burger).toBeVisible();
    await burger.click();
    // The dropdown adds a second copy of the five nav links.
    await expect(page.locator('header a[href^="/dashboard"]')).toHaveCount(10);
  });

  test('study-card secondary labels are readable, not near-white', async ({ page }) => {
    await page.goto('/dashboard/grammar');
    // #d1d5db (gray-300) was reported unreadable; nothing should use it for text.
    const tooLight = await page.evaluate(() =>
      Array.from(document.querySelectorAll('*'))
        .filter((el) => getComputedStyle(el).color === 'rgb(209, 213, 219)').length
    );
    expect(tooLight).toBe(0);
  });
});
