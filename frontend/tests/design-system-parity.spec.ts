import { test, expect, type Page } from '@playwright/test';
import { mockGrammar } from './helpers/grammarBento';
import { mockPractice } from './helpers/practiceBento';
import { mockArticles } from './helpers/articlesBento';
import { mockShellPages } from './helpers/shellPages';

/**
 * Guards the visual contract taken from `documentation/design system/prototypes/*.html`.
 *
 * These assert tokens and structure that the prototypes fix explicitly, so a
 * future refactor cannot silently drift the app back onto stock Tailwind
 * palette steps or the old 896px layout.
 */

const BRAND_GREEN = 'rgb(15, 157, 104)'; // #0f9d68 — design-system accent
const TAK_ORANGE = 'rgb(236, 48, 19)';   // #ec3013 — TAK's fixed body color, also the logo dot
const LINE = 'rgb(217, 217, 217)';       // #d9d9d9 — card/rule border

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

  test('logo dot resolves to TAK orange #ec3013, matching the icon beside it', async ({ page }) => {
    await page.goto('/dashboard/grammar');
    const dot = page.locator('header a[href="/"] span').first();
    await expect(dot).toHaveCSS('background-color', TAK_ORANGE);
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

  // All 5 top-nav dashboard pages (Слова, Фразы, Грамматика, Практика, Статьи) share this
  // shell (`PageShell.tsx`) — see "PageShell" in the component library. Phrases requires a
  // token: it shows a separate login-prompt screen instead of the `.page` shell. Practice is
  // public since #55 (guests see the onboarding preview).
  const NAV_PAGES = [
    { url: '/dashboard/lists', needsAuth: false },
    { url: '/dashboard/phrases', needsAuth: true },
    { url: '/dashboard/grammar', needsAuth: false },
    { url: '/dashboard/practice', needsAuth: false },
    { url: '/dashboard/articles', needsAuth: false },
    // #48c — the EN twin of Статьи shares the same shell.
    { url: '/en/dashboard/articles/', needsAuth: false },
  ];

  test('page content is constrained to the 1180px container', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    for (const { url, needsAuth } of NAV_PAGES) {
      if (needsAuth) await setFakeToken(page);
      await page.goto(url);
      const page1180 = page.locator('.page').first();
      await expect(page1180, url).toBeVisible();
      await expect(page1180, url).toHaveCSS('max-width', '1180px');
    }
  });

  test('language switch is a segmented pill with no slash separator', async ({ page }) => {
    await page.goto('/dashboard/grammar');
    const toggle = page.getByTestId('lang-toggle');
    await expect(toggle).toBeVisible();
    await expect(toggle).not.toContainText('/');
    // Exactly two segments, RU and EN.
    await expect(toggle.locator('span')).toHaveCount(2);
  });

  test('decorative blur blobs are gone from the top-nav dashboard pages', async ({ page }) => {
    for (const { url, needsAuth } of NAV_PAGES) {
      if (needsAuth) await setFakeToken(page);
      await page.goto(url);
      await expect(page.locator('.blur-\\[120px\\]'), url).toHaveCount(0);
    }
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
        pose: svg.dataset.pose,
        children: svg.children.length,
        hasFloat: !!svg.querySelector('g[style*="tak-float"]'),
        hasArmSwing: !!svg.querySelector('animateTransform'),
      };
    });
    // Prototype FAB: 1 body polygon + 4 eye rects, statically rendered.
    expect(shape).toEqual({ pose: 'bare', children: 5, hasFloat: false, hasArmSwing: false });
  });

  test('wordmark stays ink — only the dot carries TAK orange', async ({ page }) => {
    await page.goto('/dashboard/lists');
    const logo = page.locator('header a[href="/"]');
    // The global `a` rule must not tint the whole wordmark.
    await expect(logo).toHaveCSS('color', 'rgb(22, 24, 28)');
    await expect(logo.locator('span')).toHaveCSS('background-color', TAK_ORANGE);
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

  // #66 — compact hero on phones, same on all five top-nav pages: the title spans the card,
  // TAK sits beside the numbers (not above the title), the main button spans the card under
  // them. From 860px (BentoHero) / `sm` (ProgressStatCard) the desktop layout is unchanged.
  const HEROES: { url: string; card: string; button: string; kind: 'bento' | 'stat'; mock: (p: Page, width: number) => Promise<unknown> }[] = [
    { url: '/dashboard/lists', card: 'stats-card-words', button: '', kind: 'stat', mock: (p, width) => mockShellPages(p, { width }) },
    { url: '/dashboard/phrases', card: 'stats-card-phrases', button: '', kind: 'stat', mock: (p, width) => mockShellPages(p, { width }) },
    { url: '/dashboard/grammar', card: 'stats-card-grammar', button: 'hero-start-cases', kind: 'bento', mock: (p, width) => mockGrammar(p, { enrolled: [], width }) },
    { url: '/dashboard/practice', card: 'stats-card-practice', button: 'hero-start-practice', kind: 'bento', mock: (p, width) => mockPractice(p, { enrolled: [], width }) },
    { url: '/dashboard/articles', card: 'articles-hero', button: 'articles-read-newest', kind: 'bento', mock: (p, width) => mockArticles(p, { width }) },
  ];
  const box = async (l: import('@playwright/test').Locator) => (await l.boundingBox())!;
  const overlapY = (a: { y: number; height: number }, b: { y: number; height: number }) => a.y < b.y + b.height && b.y < a.y + a.height;

  for (const h of HEROES) {
    for (const width of [375, 1280]) {
      test(`hero layout at ${width}px: ${h.url}`, async ({ page }) => {
        await h.mock(page, width);
        await page.goto(h.url);
        const card = page.getByTestId(h.card);
        await expect(card).toBeVisible();
        const c = await box(card);
        const phone = width < 640;
        if (h.kind === 'bento') {
          const title = await box(card.getByTestId('hero-title-block'));
          const stats = await box(card.getByTestId('hero-stats'));
          const tak = await box(card.getByTestId('hero-mascot'));
          const btn = await box(page.getByTestId(h.button));
          if (phone) {
            expect(title.width, 'title spans the card').toBeGreaterThan(c.width * 0.85);
            expect(tak.y, 'TAK below the title').toBeGreaterThanOrEqual(title.y + title.height - 1);
            expect(tak.x, 'TAK right of the numbers').toBeGreaterThanOrEqual(stats.x + stats.width - 1);
            expect(overlapY(tak, stats), 'TAK beside the numbers').toBe(true);
            expect(btn.width, 'button spans the card').toBeGreaterThan(c.width * 0.85);
            expect(btn.y, 'button under the numbers').toBeGreaterThanOrEqual(stats.y + stats.height - 1);
          } else {
            expect(tak.x, 'TAK right of the text column').toBeGreaterThanOrEqual(title.x + title.width - 1);
            expect(btn.width, 'desktop button is not full width').toBeLessThan(c.width / 2);
          }
        } else {
          const tak = await box(card.getByTestId('page-mascot'));
          const count = await box(card.locator('p').first());
          const btn = await box(card.locator('a').first());
          if (phone) {
            expect(tak.x, 'TAK right of the count').toBeGreaterThanOrEqual(count.x + count.width - 1);
            expect(tak.y, 'TAK above the buttons').toBeLessThan(btn.y);
            expect(btn.width, 'button spans the card').toBeGreaterThan(c.width * 0.85);
          } else {
            expect(tak.x + tak.width, 'desktop TAK left of the count').toBeLessThanOrEqual(count.x + 1);
            expect(btn.width, 'desktop button is not full width').toBeLessThan(c.width / 2);
          }
        }
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        expect(overflow, 'horizontal overflow').toBeLessThanOrEqual(0);
      });
    }
  }

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
