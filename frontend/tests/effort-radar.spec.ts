import { test, expect } from '@playwright/test';
import { EMPTY_WEEK, NO_POINTS, SHIFT, USUAL, mockHome } from './helpers/effortRadar';

// #56 — «Куда уходят усилия» under the leaderboard on the signed-in home. Fully mocked.

test.describe('Effort radar', () => {
  test('card with 3 axis links and 2 legend items', async ({ page }) => {
    await mockHome(page, USUAL);
    await page.goto('/');
    const card = page.getByTestId('effort-radar');
    await expect(card).toBeVisible();
    await expect(card).toContainText('Куда уходят усилия');
    await expect(page.getByTestId('effort-axis-words')).toHaveAttribute('href', '/dashboard/lists');
    await expect(page.getByTestId('effort-axis-phrases')).toHaveAttribute('href', '/dashboard/phrases');
    await expect(page.getByTestId('effort-axis-grammar')).toHaveAttribute('href', '/dashboard/grammar');
    await expect(page.getByTestId('effort-legend-item')).toHaveCount(2);
  });

  test('1280px: continue CTA fills the left column beside the radar, no gap under the streak card', async ({ page }) => {
    await mockHome(page, USUAL);
    await page.goto('/');
    const radar = await page.getByTestId('effort-radar').boundingBox();
    const cta = await page.getByTestId('continue-cta').boundingBox();
    expect(radar && cta).toBeTruthy();
    expect(cta!.x + cta!.width).toBeLessThanOrEqual(radar!.x);
    expect(cta!.y).toBeLessThan(radar!.y + radar!.height);
    // No dead band between the streak card and the CTA (the grid used to split the right
    // column's extra height across both rows).
    const streakCard = await page.getByTestId('continue-cta').evaluate((el) =>
      el.parentElement!.previousElementSibling!.previousElementSibling!.getBoundingClientRect().bottom);
    expect(cta!.y - streakCard).toBeLessThanOrEqual(24);
  });

  test('table shares match the points (62/28/20 → 56/25/18%)', async ({ page }) => {
    await mockHome(page, USUAL);
    await page.goto('/');
    const rows = page.getByTestId('effort-table').locator('tbody tr');
    await expect(rows.nth(0)).toContainText('56% · 62 очк.');
    await expect(rows.nth(1)).toContainText('25% · 28 очк.');
    await expect(rows.nth(2)).toContainText('18% · 20 очк.');
    await expect(rows.nth(0)).toContainText('63% · 930 очк.');
  });

  test('insight: "same" vs "shift" wording', async ({ page }) => {
    await mockHome(page, USUAL);
    await page.goto('/');
    await expect(page.getByTestId('effort-insight')).toHaveText('Как обычно: больше всего — Слова (56% очков недели).');
    await page.unrouteAll();
    await mockHome(page, SHIFT);
    await page.goto('/');
    await expect(page.getByTestId('effort-insight')).toHaveText('На этой неделе больше всего — Грамматика (70%). Обычно — Слова (81%).');
    await expect(page.getByTestId('effort-insight').locator('b')).toHaveCount(2);
  });

  test('week all zero: note, one legend item, no week column', async ({ page }) => {
    await mockHome(page, EMPTY_WEEK);
    await page.goto('/');
    await expect(page.getByTestId('effort-empty-week')).toBeVisible();
    await expect(page.getByTestId('effort-legend-item')).toHaveCount(1);
    await expect(page.getByTestId('effort-table').locator('th')).toHaveCount(2);
    await expect(page.getByTestId('effort-insight')).toContainText('За всё время больше всего — Слова');
  });

  test('all zero: card absent', async ({ page }) => {
    await mockHome(page, NO_POINTS);
    await page.goto('/');
    await expect(page.getByTestId('leaderboard')).toBeVisible();
    await page.waitForTimeout(500);
    await expect(page.getByTestId('effort-radar')).toHaveCount(0);
  });

  test('anonymous: card absent', async ({ page }) => {
    await mockHome(page, USUAL, { guest: true });
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await expect(page.getByTestId('effort-radar')).toHaveCount(0);
  });

  test('tooltip on hover and on keyboard focus shows both values', async ({ page }) => {
    await mockHome(page, USUAL);
    await page.goto('/');
    await page.getByTestId('effort-sector-phrases').hover();
    const tip = page.getByTestId('effort-tooltip');
    await expect(tip).toContainText('Фразы');
    await expect(tip).toContainText('Эта неделя: 25% · 28 очк.');
    await expect(tip).toContainText('За всё время: 21% · 310 очк.');
    await page.mouse.move(0, 0);
    await expect(tip).toHaveCount(0);
    await page.getByTestId('effort-sector-grammar').focus();
    await expect(tip).toContainText('Грамматика');
  });

  test('375px: tap shows the tooltip; card right after the leaderboard; no overflow; labels inside', async ({ page }) => {
    await mockHome(page, USUAL, { width: 375 });
    await page.goto('/');
    const card = page.getByTestId('effort-radar');
    await expect(card).toBeVisible();
    const next = await page.getByTestId('leaderboard').evaluate((el) => el.nextElementSibling?.getAttribute('data-testid'));
    expect(next).toBe('effort-radar');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    const box = (await card.boundingBox())!;
    for (const key of ['words', 'phrases', 'grammar']) {
      const b = (await page.getByTestId(`effort-axis-${key}`).boundingBox())!;
      expect(b.x).toBeGreaterThanOrEqual(box.x);
      expect(b.x + b.width).toBeLessThanOrEqual(box.x + box.width);
    }
    await page.getByTestId('effort-sector-words').tap().catch(() => page.getByTestId('effort-sector-words').click());
    await expect(page.getByTestId('effort-tooltip')).toContainText('Слова');
  });

  test('EN copy', async ({ page }) => {
    await mockHome(page, SHIFT, { lang: 'en' });
    await page.goto('/');
    await expect(page.getByTestId('effort-radar')).toContainText('Where your effort goes');
    await expect(page.getByTestId('effort-insight')).toHaveText("This week most of it went to Grammar (70%). Usually it's Words (81%).");
    await expect(page.getByTestId('effort-table')).toContainText('55 pts');
  });

  // #57 — info button beside the title → balance article, same tab.
  for (const [lang, label] of [['ru', 'Как держать баланс'], ['en', 'How to keep the balance']] as const) {
    for (const width of [1280, 375]) {
      test(`info button ${lang} ${width}: href, label, 44×44 target`, async ({ page }) => {
        await mockHome(page, USUAL, { lang, width });
        await page.goto('/');
        const info = page.getByTestId('effort-info');
        await expect(info).toBeVisible();
        await expect(info).toHaveAttribute('href', '/dashboard/articles/how-to-learn-lithuanian-order/');
        await expect(info).toHaveAttribute('aria-label', label);
        await expect(info).toHaveAttribute('title', label);
        expect(await info.getAttribute('target')).toBeNull();
        const box = (await info.boundingBox())!;
        expect(box.width).toBeGreaterThanOrEqual(44);
        expect(box.height).toBeGreaterThanOrEqual(44);
        // Sits on the title row, right of the title, inside the card.
        const title = (await page.locator('#effort-title').boundingBox())!;
        const card = (await page.getByTestId('effort-radar').boundingBox())!;
        expect(box.x).toBeGreaterThan(title.x);
        expect(box.x + box.width).toBeLessThanOrEqual(card.x + card.width);
        expect(Math.abs((box.y + box.height / 2) - (title.y + title.height / 2))).toBeLessThanOrEqual(4);
      });
    }
  }
});
