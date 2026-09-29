import { test, expect, type Page } from '@playwright/test';
import path from 'path';
import { EMPTY_WEEK, NO_POINTS, SHIFT, USUAL, mockHome } from './helpers/effortRadar';

// Plan #56 — evidence screenshots of the effort radar on the signed-in home. Fully mocked.
// `shift` and `empty-week` × RU/EN × 1280/375, plus `usual` and `no-points` at RU 1280.

const DIR = path.join(__dirname, '..', '..', 'temp_files', 'screenshots', 'plan_55-56_bento-effort-radar', 'effort-radar');

async function shot(page: Page, name: string) {
  await page.waitForTimeout(300);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, 'horizontal overflow').toBeLessThanOrEqual(0);
  await page.screenshot({ path: path.join(DIR, `${name}.png`), fullPage: true });
}

const CASES: [string, unknown, 'ru' | 'en', number][] = [];
for (const [state, effort] of [['shift', SHIFT], ['empty-week', EMPTY_WEEK]] as const) {
  for (const lang of ['ru', 'en'] as const) for (const width of [1280, 375]) CASES.push([state, effort, lang, width]);
}
CASES.push(['usual', USUAL, 'ru', 1280], ['no-points', NO_POINTS, 'ru', 1280]);

for (const [state, effort, lang, width] of CASES) {
  test(`${state} ${lang} ${width}`, async ({ page }) => {
    await mockHome(page, effort, { lang, width });
    await page.goto('/');
    await expect(page.getByTestId('leaderboard')).toBeVisible();
    if (state === 'no-points') {
      await page.waitForTimeout(500);
      await expect(page.getByTestId('effort-radar')).toHaveCount(0);
    } else {
      await expect(page.getByTestId('effort-radar')).toBeVisible();
      if (state === 'shift') await page.getByTestId('effort-sector-grammar').hover();
    }
    await shot(page, `${state}-${lang}-${width}`);
  });
}
