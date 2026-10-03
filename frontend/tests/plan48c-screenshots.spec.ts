import { test, expect, type Page } from '@playwright/test';
import path from 'path';
import { mockArticles } from './helpers/articlesBento';

// Plan #48c — evidence screenshots: the EN article twins and their RU twins (unchanged),
// stored language RU/EN × 1280/375. /en/ pages render English whatever is stored.
// The index list is mocked; the article is the prerendered `verb-intro`.

const DIR = path.join(__dirname, '..', '..', 'temp_files', 'screenshots', 'plan_48c_en-seo');
const PAGES = {
  'en-index': '/en/dashboard/articles/',
  'en-article': '/en/dashboard/articles/verb-intro/',
  'ru-index': '/dashboard/articles/',
  'ru-article': '/dashboard/articles/verb-intro/',
};

async function shot(page: Page, name: string) {
  await page.waitForTimeout(300); // let transitions settle
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, 'horizontal overflow').toBeLessThanOrEqual(0);
  await page.screenshot({ path: path.join(DIR, `${name}.png`), fullPage: true });
}

for (const [name, url] of Object.entries(PAGES)) {
  for (const lang of ['ru', 'en'] as const) {
    for (const width of [1280, 375]) {
      test(`${name} — stored ${lang} — ${width}`, async ({ page }) => {
        await mockArticles(page, { lang, width });
        await page.goto(url);
        const english = name.startsWith('en') || lang === 'en';
        await expect(page.locator('h1').first()).toBeVisible();
        await expect(page.getByTestId('lang-toggle').locator('span', { hasText: english ? 'EN' : 'RU' }))
          .toHaveClass(/bg-white/);
        await shot(page, `${name}-stored-${lang}-${width}`);
      });
    }
  }
}
