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
    await page.route('**/api/me/programs', (route) => route.fulfill({ json: ['test'] }));
    await page.route('**/api/subcategory-meta', (route) => route.fulfill({ json: { test: { cefr_level: null, difficulty: null, article_url: null, article_name_ru: null, article_name_en: null, name_ru: 'Test', name_en: 'Test' } } }));
    await page.route('**/api/lists', (route) =>
      route.fulfill({ json: [{ id: 1, title: 'Test List', title_en: null, description: null, description_en: null, subcategory: 'test', word_count: 5 }] })
    );
    await page.route('**/api/me/lists-progress', (route) => route.fulfill({ json: {} }));
    await page.route('**/api/lists/*/study**', (route) => route.fulfill({ json: { words: WORDS, distractors: [] } }));
    await page.route('**/api/words/*/progress', (route) => route.fulfill({ json: { ok: true } }));
  });


  // The selector is a single pill the user cycles through (1 → 2 → 3 → 1),
  // not three discrete buttons as in the original design.
  const toggle = (page: import('@playwright/test').Page) =>
    page.getByTestId('star-toggle');

  async function setLevel(page: import('@playwright/test').Page, level: 1 | 2 | 3) {
    const t = toggle(page);
    await expect(t).toBeVisible({ timeout: 5000 });
    for (let i = 0; i < 3; i++) {
      if ((await t.getAttribute('data-star-level')) === String(level)) return;
      await t.click();
    }
    throw new Error(`could not reach star level ${level}`);
  }

  test('star selector is visible on lists page', async ({ page }) => {
    await page.goto('/dashboard/lists');
    await expect(toggle(page)).toBeVisible({ timeout: 5000 });
  });

  test('default star level is 1 when no cookie set', async ({ page }) => {
    await page.addInitScript(() => {
      document.cookie = 'fluent_star_level=; max-age=0; path=/';
    });
    await page.goto('/dashboard/lists');
    const t = toggle(page);
    await expect(t).toBeVisible({ timeout: 5000 });
    await expect(t).toHaveAttribute('data-star-level', '1');
    await expect(t).toHaveText('★');
  });

  test('the knob and its track dots share the same three stops', async ({ page }) => {
    // Regression guard: the dots were laid out independently of the knob, so at
    // levels 1 and 3 the knob sat 3px inside the dot it was meant to cover.
    await page.goto('/dashboard/lists');
    const t = toggle(page);
    await expect(t).toBeVisible({ timeout: 5000 });

    for (const level of [1, 2, 3] as const) {
      await setLevel(page, level);
      // The knob slides with a 300ms transition — measure only once it settles.
      await page.waitForTimeout(450);
      const offset = await t.evaluate((btn, lvl) => {
        const box = btn.getBoundingClientRect();
        const dots = Array.from(btn.querySelectorAll(':scope > span:first-child > span'));
        const knob = btn.querySelector(':scope > span:last-child') as HTMLElement;
        const k = knob.getBoundingClientRect();
        const d = (dots[lvl - 1] as HTMLElement).getBoundingClientRect();
        return Math.abs((k.left + k.width / 2) - (d.left + d.width / 2));
      }, level);
      expect(offset, `knob must sit on dot ${level}`).toBeLessThanOrEqual(0.5);
    }
  });

  test('cycling to ★★ sets cookie fluent_star_level=2', async ({ page }) => {
    await page.goto('/dashboard/lists');
    await setLevel(page, 2);
    const cookies = await page.context().cookies();
    const starCookie = cookies.find((c) => c.name === 'fluent_star_level');
    expect(starCookie?.value).toBe('2');
  });

  test('cycling to ★★★ sets cookie fluent_star_level=3', async ({ page }) => {
    await page.goto('/dashboard/lists');
    await setLevel(page, 3);
    const cookies = await page.context().cookies();
    const starCookie = cookies.find((c) => c.name === 'fluent_star_level');
    expect(starCookie?.value).toBe('3');
  });

  test('cycling past ★★★ wraps back to ★', async ({ page }) => {
    await page.goto('/dashboard/lists');
    await setLevel(page, 3);
    await toggle(page).click();
    await expect(toggle(page)).toHaveAttribute('data-star-level', '1');
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
        json: [{ id: 1, title: 'Test List', title_en: null, description: null, description_en: null, subcategory: 'test', word_count: 5, star_counts: { '1': 3, '2': 4, '3': 5 } }],
      })
    );
    // Default star level is 1, star_counts["1"]=3 != word_count=5 → label visible
    await page.goto('/dashboard/lists');
    await expect(page.locator('text=3 ★').first()).toBeVisible({ timeout: 5000 });
  });

  test('star_counts label hidden when filtered count equals total', async ({ page }) => {
    await page.route('**/api/lists', (route) =>
      route.fulfill({
        json: [{ id: 1, title: 'Test List', title_en: null, description: null, description_en: null, subcategory: 'test', word_count: 5, star_counts: { '1': 5, '2': 5, '3': 5 } }],
      })
    );
    await page.goto('/dashboard/lists');
    // star_counts["1"]=5 == word_count=5 → no secondary label
    await expect(page.locator('text=5 ★').first()).not.toBeVisible({ timeout: 5000 });
  });

  test('star_counts label updates when star level changes', async ({ page }) => {
    await page.route('**/api/lists', (route) =>
      route.fulfill({
        json: [{ id: 1, title: 'Test List', title_en: null, description: null, description_en: null, subcategory: 'test', word_count: 5, star_counts: { '1': 2, '2': 4, '3': 5 } }],
      })
    );
    await page.goto('/dashboard/lists');
    // At ★ level: label shows "2 ★"
    await expect(page.locator('text=2 ★').first()).toBeVisible({ timeout: 5000 });
    // Switch to ★★ level
    await setLevel(page, 2);
    // At ★★ level: star_counts["2"]=4, word_count=5 → label shows "4 ★★"
    await expect(page.locator('text=4 ★★').first()).toBeVisible({ timeout: 5000 });
  });

  test('star_counts label never shown at ★★★ level', async ({ page }) => {
    await page.route('**/api/lists', (route) =>
      route.fulfill({
        json: [{ id: 1, title: 'Test List', title_en: null, description: null, description_en: null, subcategory: 'test', word_count: 5, star_counts: { '1': 2, '2': 4, '3': 5 } }],
      })
    );
    await page.goto('/dashboard/lists');
    await setLevel(page, 3);
    await expect(page.locator('text=5 ★★★').first()).not.toBeVisible({ timeout: 5000 });
  });
});
