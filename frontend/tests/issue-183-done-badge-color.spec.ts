import { test, expect, Page } from '@playwright/test';


// Issue #183 — "Done" badges are solid blue (blue-600), star-level done is light blue
// (blue-50), and the text is localised everywhere (was hardcoded "✓ Done").

const SHOTS = 'temp_files/screenshots/issue-183-done-badge-blue-color';
const BLUE_600 = 'rgb(37, 99, 235)';
const BLUE_50 = 'rgb(239, 246, 255)';

function fakeJwt(): string {
  const h = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const p = btoa(JSON.stringify({ email: 'test@test.com', name: 'Test User', exp: 9999999999 }));
  return `${h}.${p}.fakesignature`;
}

async function setup(page: Page, lang: 'ru' | 'en') {
  await page.addInitScript(([token, l]) => {
    localStorage.setItem('fluent_token', token);
    localStorage.setItem('fluent_lang', l);
    localStorage.setItem('cookie_consent', 'declined');
    document.cookie = 'fluent_star_level=1; path=/';
  }, [fakeJwt(), lang]);

  // Catch-all first (later routes win): nothing else may hit a real backend.
  await page.route('**/api/**', (r) => r.fulfill({ json: [] }));
  await page.route('**/api/me/welcome', (r) => r.fulfill({ json: { shown: true, content: {} } }));
  await page.route('**/api/me/quota', (r) =>
    r.fulfill({ json: { premium_active: true, premium_until: null, sessions_today: 0, daily_limit: null } }));
  await page.route('**/api/billing/config', (r) => r.fulfill({ json: { enabled: true } }));
  await page.route('**/api/me/stats', (r) => r.fulfill({ json: {} }));
  await page.route('**/api/phrases/random', (r) => r.fulfill({ json: {} }));
  await page.route('**/api/subcategory-meta', (r) => r.fulfill({ json: {} }));
  await page.route('**/api/me/custom-program-enrollments', (r) => r.fulfill({ json: [] }));
  await page.route('**/api/me/programs', (r) => r.fulfill({ json: ['sub'] }));

  const wl = (id: number, title: string) => ({
    id, title, title_en: title, description: null, description_en: null,
    subcategory: 'sub', difficulty: null, cefr_level: null, word_count: 5, star_counts: { '1': 5 },
  });
  await page.route('**/api/lists', (r) => r.fulfill({ json: [wl(1, 'Full'), wl(2, 'Star')] }));
  await page.route('**/api/me/lists-progress', (r) => r.fulfill({ json: {
    1: { total: 5, known: 5, learning: 0, new: 0, known_star_counts: { '1': 5 } },
    2: { total: 8, known: 5, learning: 0, new: 3, known_star_counts: { '1': 5 } },
  } }));
  await page.route('**/api/me/word-lists', (r) => r.fulfill({ json: [
    { id: 9, title: 'Mine', difficulty: 1, word_count: 4, created_at: '2026-01-01', known: 4, learning: 0, new: 0 },
  ] }));

  await page.route('**/api/phrase-programs', (r) => r.fulfill({ json: [
    { id: 5, title: 'Фразы', title_en: 'Phrases', description: null, description_en: null,
      difficulty: 1, phrase_count: 2, enrolled: true, stage_distribution: { stage0: 0, stage1: 0, stage2: 2 } },
  ] }));
  await page.route('**/api/phrase-programs/5', (r) => r.fulfill({ json: { phrases: [
    { id: 1, chapter: 1, chapter_title: 'Глава', chapter_title_en: 'Chapter', lesson_stage: 2 },
    { id: 2, chapter: 1, chapter_title: 'Глава', chapter_title_en: 'Chapter', lesson_stage: 2 },
  ] } }));
  await page.route('**/api/me/phrase-lists', (r) => r.fulfill({ json: [
    { id: 8, title: 'Mine', difficulty: 1, phrase_count: 3, created_at: '2026-01-01',
      stage_distribution: { stage0: 0, stage1: 0, stage2: 3 }, star_min: null, star_max: null },
  ] }));
}

const bg = (loc: import('@playwright/test').Locator) =>
  loc.evaluate((el) => getComputedStyle(el).backgroundColor);

for (const lang of ['ru', 'en'] as const) {
  const done = lang === 'ru' ? '✓ Готово' : '✓ Done';
  const starDone = lang === 'ru' ? '★ Готово' : '★ Done';
  for (const [w, h] of [[1280, 900], [375, 800]]) {
    test(`lists: blue done badges, ${lang}, ${w}px`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: h });
      await setup(page, lang);
      await page.goto("/dashboard/lists");
      const badges = page.getByTestId('done-badge');
      // My-list pill + full program card
      await expect(badges).toHaveCount(2, { timeout: 10000 });
      for (const b of await badges.all()) {
        await expect(b).toHaveText(done);
        expect(await bg(b)).toBe(BLUE_600);
      }
      const star = page.getByTestId('star-done-badge');
      await expect(star).toHaveText(starDone);
      expect(await bg(star)).toBe(BLUE_50);
      await page.screenshot({ path: `../${SHOTS}/lists-${lang}-${w}.png`, fullPage: true });
    });

    test(`phrases: blue done badges, ${lang}, ${w}px`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: h });
      await setup(page, lang);
      await page.goto('/dashboard/phrases');
      const badges = page.getByTestId('done-badge');
      // My phrase list pill + chapter card
      await expect(badges).toHaveCount(2, { timeout: 10000 });
      for (const b of await badges.all()) {
        await expect(b).toHaveText(done);
        expect(await bg(b)).toBe(BLUE_600);
      }
      await page.screenshot({ path: `../${SHOTS}/phrases-${lang}-${w}.png`, fullPage: true });
    });
  }
}
