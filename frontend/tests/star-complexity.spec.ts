import { test, expect } from '@playwright/test';

function makeFakeJwt(name: string): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = btoa(JSON.stringify({ email: 'test@test.com', name, exp: 9999999999 }));
  return `${header}.${payload}.fakesignature`;
}

const WORDS = [
  { id: 1, lithuanian: 'katė', translation_en: 'cat', translation_ru: 'кошка', hint: null, star: 1, status: 'new' },
  { id: 2, lithuanian: 'šuo', translation_en: 'dog', translation_ru: 'собака', hint: null, star: 1, status: 'new' },
  { id: 3, lithuanian: 'namas', translation_en: 'house', translation_ru: 'дом', hint: null, star: 1, status: 'new' },
  { id: 4, lithuanian: 'vanduo', translation_en: 'water', translation_ru: 'вода', hint: null, star: 1, status: 'new' },
  { id: 5, lithuanian: 'duona', translation_en: 'bread', translation_ru: 'хлеб', hint: null, star: 1, status: 'new' },
];

test.describe('Star complexity selector', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript((token) => {
      localStorage.setItem('fluent_token', token);
    }, makeFakeJwt('Test User'));

    await page.route('**/api/me/quota', (route) =>
      route.fulfill({ json: { is_premium: false, premium_active: false, sessions_today: 0, daily_limit: 10, is_admin: false, is_superadmin: false } })
    );
    await page.route('**/api/subcategory-meta', (route) => route.fulfill({ json: {} }));
    await page.route('**/api/lists', (route) =>
      route.fulfill({ json: [{ id: 1, title: 'Test List', title_en: null, description: null, description_en: null, subcategory: null, word_count: 5 }] })
    );
    await page.route('**/api/me/lists-progress', (route) => route.fulfill({ json: {} }));
    await page.route('**/api/lists/*/study**', (route) => route.fulfill({ json: { words: WORDS, distractors: [] } }));
    await page.route('**/api/words/*/progress', (route) => route.fulfill({ json: { ok: true } }));
  });

  test('star selector is visible on lists page', async ({ page }) => {
    await page.goto('/dashboard/lists');
    await expect(page.locator('button:has-text("★")').first()).toBeVisible({ timeout: 5000 });
  });

  test('default star level is 1 (★ button active) when no cookie set', async ({ page }) => {
    await page.addInitScript(() => {
      document.cookie = 'fluent_star_level=; max-age=0; path=/';
    });
    await page.goto('/dashboard/lists');
    // The ★ button should have the active (dark) style
    const starOneBtn = page.locator('button').filter({ hasText: /^★$/ });
    await expect(starOneBtn).toBeVisible({ timeout: 5000 });
    await expect(starOneBtn).toHaveClass(/bg-gray-900/);
  });

  test('clicking ★★ sets cookie fluent_star_level=2', async ({ page }) => {
    await page.goto('/dashboard/lists');
    const starTwoBtn = page.locator('button').filter({ hasText: /^★★$/ });
    await starTwoBtn.click();
    const cookies = await page.context().cookies();
    const starCookie = cookies.find((c) => c.name === 'fluent_star_level');
    expect(starCookie?.value).toBe('2');
  });

  test('clicking ★★★ sets cookie fluent_star_level=3', async ({ page }) => {
    await page.goto('/dashboard/lists');
    const starThreeBtn = page.locator('button').filter({ hasText: /^★★★$/ });
    await starThreeBtn.click();
    const cookies = await page.context().cookies();
    const starCookie = cookies.find((c) => c.name === 'fluent_star_level');
    expect(starCookie?.value).toBe('3');
  });

  test('study page passes star_level=2 to API when cookie is 2', async ({ page }) => {
    await page.addInitScript(() => {
      document.cookie = 'fluent_star_level=2; path=/';
    });

    let studyUrl = '';
    await page.route('**/api/lists/*/study**', (route) => {
      studyUrl = route.request().url();
      route.fulfill({ json: { words: WORDS, distractors: [] } });
    });

    await page.goto('/dashboard/lists/_/study');
    await page.waitForLoadState('networkidle');
    expect(studyUrl).toContain('star_level=2');
  });

  test('beta banner is visible on lists page', async ({ page }) => {
    await page.goto('/dashboard/lists');
    await expect(page.locator('text=бета').or(page.locator('text=beta')).first()).toBeVisible({ timeout: 5000 });
  });

  test('complexity hint text is visible on lists page', async ({ page }) => {
    await page.goto('/dashboard/lists');
    // hint line for star 1
    await expect(page.locator('text=★ —').first()).toBeVisible({ timeout: 5000 });
  });

  test('empty state shown when API returns 0 words', async ({ page }) => {
    await page.route('**/api/lists/*/study**', (route) => route.fulfill({ json: { words: [], distractors: [] } }));
    await page.goto('/dashboard/lists/_/study');
    await expect(page.locator('text=★').first()).toBeVisible({ timeout: 5000 });
    // back-to-lists button should appear
    await expect(page.locator('button').filter({ hasText: /главную|назад|back/i }).first()).toBeVisible({ timeout: 5000 });
  });

  test('star_counts label shown when filtered count differs from total', async ({ page }) => {
    await page.route('**/api/lists', (route) =>
      route.fulfill({
        json: [{ id: 1, title: 'Test List', title_en: null, description: null, description_en: null, subcategory: null, word_count: 5, star_counts: { '1': 3, '2': 4, '3': 5 } }],
      })
    );
    // Default star level is 1, star_counts["1"]=3 != word_count=5 → label visible
    await page.goto('/dashboard/lists');
    await expect(page.locator('text=3 ★').first()).toBeVisible({ timeout: 5000 });
  });

  test('star_counts label hidden when filtered count equals total', async ({ page }) => {
    await page.route('**/api/lists', (route) =>
      route.fulfill({
        json: [{ id: 1, title: 'Test List', title_en: null, description: null, description_en: null, subcategory: null, word_count: 5, star_counts: { '1': 5, '2': 5, '3': 5 } }],
      })
    );
    await page.goto('/dashboard/lists');
    // star_counts["1"]=5 == word_count=5 → no secondary label
    await expect(page.locator('text=5 ★').first()).not.toBeVisible({ timeout: 5000 });
  });

  test('star_counts label updates when star level changes', async ({ page }) => {
    await page.route('**/api/lists', (route) =>
      route.fulfill({
        json: [{ id: 1, title: 'Test List', title_en: null, description: null, description_en: null, subcategory: null, word_count: 5, star_counts: { '1': 2, '2': 4, '3': 5 } }],
      })
    );
    await page.goto('/dashboard/lists');
    // At ★ level: label shows "2 ★"
    await expect(page.locator('text=2 ★').first()).toBeVisible({ timeout: 5000 });
    // Switch to ★★ level
    await page.locator('button').filter({ hasText: /^★★$/ }).click();
    // At ★★ level: star_counts["2"]=4, word_count=5 → label shows "4 ★★"
    await expect(page.locator('text=4 ★★').first()).toBeVisible({ timeout: 5000 });
  });

  test('star_counts label never shown at ★★★ level', async ({ page }) => {
    await page.route('**/api/lists', (route) =>
      route.fulfill({
        json: [{ id: 1, title: 'Test List', title_en: null, description: null, description_en: null, subcategory: null, word_count: 5, star_counts: { '1': 2, '2': 4, '3': 5 } }],
      })
    );
    await page.goto('/dashboard/lists');
    await page.locator('button').filter({ hasText: /^★★★$/ }).click();
    await expect(page.locator('text=5 ★★★').first()).not.toBeVisible({ timeout: 5000 });
  });
});
