import { test, expect, type Page } from '@playwright/test';
import path from 'path';
import { mockGrammar, type GrammarMock } from './helpers/grammarBento';

// Plan #53 — evidence screenshots of the grammar hero / chips / bento layout.
// Every state × RU/EN × 1280/375, fully mocked API. Each shot also asserts no
// horizontal overflow.

const DIR = path.join(__dirname, '..', '..', 'temp_files', 'screenshots', 'plan_53_grammar-bento');

const PARTIAL = { 1: 0.92, 2: 0.88, 3: 0.81, 4: 0.85, 5: 0.62, 6: 'L', 7: null, 8: 'L', 21: 'L', 204: 'L' } as const;
const ALL_PASSED = { 1: 0.92, 2: 0.88, 3: 0.81, 4: 0.85, 5: 0.9, 6: 0.8, 7: 1, 8: 'L' } as const;

const STATES: Record<string, { mock: Omit<GrammarMock, 'lang' | 'width'>; act?: (page: Page) => Promise<void> }> = {
  'no-programs': { mock: { enrolled: [] } },
  'some-programs': { mock: { enrolled: [1], scores: PARTIAL } },
  'all-programs': { mock: { enrolled: [1, 2, 3], scores: PARTIAL } },
  'nothing-left': { mock: { enrolled: [1], scores: ALL_PASSED } },
  'enroll-error': {
    mock: { enrolled: [], enrollStatus: 500 },
    act: async (page) => {
      await page.getByTestId('hero-start-cases').click();
      await expect(page.getByTestId('grammar-action-error')).toBeVisible();
    },
  },
};

for (const [state, { mock, act }] of Object.entries(STATES)) {
  for (const lang of ['ru', 'en'] as const) {
    for (const width of [1280, 375]) {
      test(`${state} ${lang} ${width}`, async ({ page }) => {
        await mockGrammar(page, { ...mock, lang, width });
        await page.goto('/dashboard/grammar');
        await expect(page.getByTestId('featured-card')).toBeVisible();
        if (act) await act(page);
        await page.waitForTimeout(300);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        expect(overflow, 'horizontal overflow').toBeLessThanOrEqual(0);
        await page.screenshot({ path: path.join(DIR, `${state}-${lang}-${width}.png`), fullPage: true });
      });
    }
  }
}
