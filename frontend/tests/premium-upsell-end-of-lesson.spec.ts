import { test, expect, type Page } from '@playwright/test';
import { mockStudy, type MockWord } from './helpers/studyFlow';

// Plan #16 — the QuizSession "done" screen shows a support-the-mission Premium
// upsell card to every non-Premium user finishing a study/review session, and
// never to a Premium (or not-yet-resolved) user. See
// plans/improvements/active/plan_16_pricing-conversion-ctas.md.

// A mature word opens straight on the typing card (feature #5), so one correct
// answer is enough to finish the session and reach the match round → done screen.
const WORD: MockWord = {
  id: 1, lithuanian: 'namas', accented: null,
  translation_ru: 'дом', translation_en: 'house', hint: null,
  status: 'known', mature: true,
};

async function completeSession(page: Page) {
  await page.goto('/dashboard/lists/_/study');

  const input = page.locator('input[type="text"]');
  await input.waitFor({ timeout: 10000 });
  await input.fill(WORD.lithuanian);
  await input.press('Enter');

  // Match round — a single pair, since the session has exactly one word.
  const matchLeft = page.getByTestId('match-left-0');
  await matchLeft.waitFor({ timeout: 10000 });
  await matchLeft.click();
  await page.getByTestId('match-right-0').click();
  await page.getByTestId('match-continue').click();
}

test.describe('End-of-lesson Premium upsell card', () => {
  test('shown to a non-Premium user, links to /pricing', async ({ page }) => {
    await mockStudy(page, [WORD]);
    await page.route('**/api/me/quota', (route) =>
      route.fulfill({ json: { premium_active: false, sessions_today: 1, daily_limit: 10 } }));

    await completeSession(page);

    const card = page.getByTestId('premium-upsell-card');
    await expect(card).toBeVisible({ timeout: 10000 });
    const cta = page.getByTestId('premium-upsell-cta');
    await expect(cta).toHaveAttribute('href', /\/pricing\/?$/);

    await cta.click();
    await expect(page).toHaveURL(/\/pricing/);
  });

  test('not shown to a Premium user', async ({ page }) => {
    await mockStudy(page, [WORD]);
    await page.route('**/api/me/quota', (route) =>
      route.fulfill({ json: { premium_active: true, sessions_today: 1, daily_limit: null } }));

    await completeSession(page);

    // Sanity check we actually reached the done screen before asserting absence.
    await expect(page.getByTestId('result-verdict')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('premium-upsell-card')).toHaveCount(0);
  });

  test('not shown to an admin, even when not separately marked Premium', async ({ page }) => {
    await mockStudy(page, [WORD]);
    await page.route('**/api/me/quota', (route) =>
      route.fulfill({ json: { premium_active: false, sessions_today: 1, daily_limit: 10, is_admin: true } }));

    await completeSession(page);

    await expect(page.getByTestId('result-verdict')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('premium-upsell-card')).toHaveCount(0);
  });
});
