import { test, expect } from '@playwright/test';

// #32 — a free user opening a Premium practice test gets the offer *in place*, instead of
// being pushed to /dashboard/premium. That page said "this test" about a test no longer on
// screen, its "back" link went to the category list rather than the test, and it sold via
// `mailto:` while Stripe checkout was already live. It is deleted.

function jwt(email: string, name: string) {
  return `${btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))}.${btoa(JSON.stringify({ email, name, exp: 9999999999 }))}.sig`;
}

const TESTS = [
  { id: 1, title_ru: 'Бесплатный тест', title_en: 'Free test', description_ru: null, description_en: null,
    lesson_text_lt: null, question_count: 10, pass_threshold: 0.7, is_premium: false,
    active_question_count: 10, is_locked: false, best_score: null, best_total: null },
  { id: 2, title_ru: 'Премиум тест', title_en: 'Premium test', description_ru: null, description_en: null,
    lesson_text_lt: null, question_count: 10, pass_threshold: 0.7, is_premium: true,
    active_question_count: 10, is_locked: false, best_score: null, best_total: null },
];

/** The Premium row's button is labelled "Только для Premium" / "Premium only", not the title. */
const openPremium = (page: import('@playwright/test').Page, lang: 'ru' | 'en') =>
  page.getByRole('button', { name: lang === 'ru' ? 'Только для Premium' : 'Premium only' }).click();

async function boot(page: import('@playwright/test').Page, lang: 'ru' | 'en' = 'ru', w = 1280) {
  await page.setViewportSize({ width: w, height: 900 });
  await page.addInitScript(([t, l]) => {
    localStorage.setItem('fluent_token', t);
    localStorage.setItem('fluent_lang', l);
    localStorage.setItem('cookie_consent', 'accepted');
  }, [jwt('test@test.com', 'Test User'), lang] as const);
  await page.route('**/api/me/quota', (r) => r.fulfill({ json: {
    is_premium: false, premium_active: false, premium_until: null, sessions_today: 0,
    daily_limit: 5, is_admin: false } }));
  // The tests endpoint returns a bare array; the heading comes from a second call.
  await page.route('**/api/practice/categories/*/tests*', (r) => r.fulfill({ json: TESTS }));
  await page.route('**/api/practice/categories', (r) => r.fulfill({ json: [
    { id: 1, name_ru: 'Конституция', name_en: 'Constitution', description_ru: null, source_url: null }] }));
  await page.goto('/dashboard/practice/_?id=1');
}

test('offers Premium in place and never leaves the page', async ({ page }) => {
  await boot(page);
  const url = page.url();
  await openPremium(page, 'ru');
  const wall = page.getByTestId('practice-premium-wall');
  await expect(wall).toBeVisible();
  await expect(wall).toContainText('Этот тест входит в Premium');
  // The test list is still there — the user did not lose what they were looking at.
  await expect(page.getByText('Бесплатный тест')).toBeVisible();
  expect(page.url()).toBe(url);
});

test('shows the price under the button, not on it', async ({ page }) => {
  await boot(page);
  await openPremium(page, 'ru');
  const cta = page.getByTestId('practice-premium-wall-cta');
  await expect(cta).toContainText('Оформить Premium');
  await expect(cta).not.toContainText('4,50');
  await expect(page.getByTestId('practice-premium-wall-price')).toContainText('4,50 €');
  await expect(cta).toHaveAttribute('href', '/pricing/');
});

test('reads correctly in English', async ({ page }) => {
  await boot(page, 'en');
  await openPremium(page, 'en');
  await expect(page.getByTestId('practice-premium-wall')).toContainText('This test is part of Premium');
  await expect(page.getByTestId('practice-premium-wall-price')).toContainText('€4.50');
});

for (const lang of ['ru', 'en'] as const) {
  test(`fits a 375px phone in ${lang}`, async ({ page }) => {
    await boot(page, lang, 375);
    await openPremium(page, lang);
    const wall = page.getByTestId('practice-premium-wall');
    await expect(wall).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
    const box = (await wall.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(375);
  });
}

test('the deleted paywall page is gone', async ({ page }) => {
  await boot(page);
  const res = await page.goto('/dashboard/premium');
  expect(res?.status()).toBe(404);
});
