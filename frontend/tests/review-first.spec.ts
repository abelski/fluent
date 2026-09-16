import { test, expect } from '@playwright/test';

// #31 — the review-first screen, and the reminder strip that follows if the user pushes on.
// The backend decides when the offer applies (backend/tests/test_review_first.py); this
// covers the two buttons, what each one actually requests, and that the offer costs nothing.

function makeFakeJwt(email: string, name: string): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = btoa(JSON.stringify({ email, name, exp: 9999999999 }));
  return `${header}.${payload}.fakesignature`;
}

const LT = ['namas', 'šuo', 'katė', 'duona', 'vanduo', 'miestas', 'knyga', 'langas', 'durys', 'stalas'];
const RU = ['дом', 'собака', 'кошка', 'хлеб', 'вода', 'город', 'книга', 'окно', 'дверь', 'стол'];
const EN = ['house', 'dog', 'cat', 'bread', 'water', 'city', 'book', 'window', 'door', 'table'];
const WORDS = Array.from({ length: 10 }, (_, i) => ({
  id: 9000 + i, lithuanian: LT[i], accented: null, translation_ru: RU[i], translation_en: EN[i],
  hint: null, status: i < 8 ? 'known' : 'new', mature: false,
  part_of_speech: null, verb_present_3p: null, verb_past_3p: null,
}));

type Setup = { due: number; size?: number; lang?: 'ru' | 'en' };

/** Returns the list of study URLs the page actually requested, so a test can assert both
 *  that a session was fetched and which mode it asked for. */
async function setup(page: import('@playwright/test').Page, { due, size = 10, lang = 'ru' }: Setup) {
  const studyCalls: string[] = [];
  await page.addInitScript(([token, l]) => {
    localStorage.setItem('fluent_token', token);
    localStorage.setItem('fluent_lang', l);
    // Arrive as a returning user. The cookie banner is `fixed` at the bottom and, on a
    // 375px phone in English, sits over the second button — but a real person dismisses it
    // once on their first visit, so testing around it would be testing a state nobody stays in.
    localStorage.setItem('cookie_consent', 'accepted');
  }, [makeFakeJwt('test@test.com', 'Test User'), lang] as const);
  await page.route('**/api/lists/*/progress', (route) => route.fulfill({
    json: { total: 40, known: due, learning: 0, new: 10, due, session_size: size },
  }));
  await page.route('**/api/lists/*/study*', (route) => {
    studyCalls.push(route.request().url());
    return route.fulfill({
      json: {
        words: WORDS, distractors: [], more_new_at_higher_level: false,
        new_words_at_higher_level: 0, review_first: due > size ? { due } : null,
      },
    });
  });
  await page.goto('/dashboard/lists/_/study?id=90');
  return studyCalls;
}

test('offers the choice before spending a session', async ({ page }) => {
  const calls = await setup(page, { due: 47 });
  await expect(page.getByTestId('review-first-title')).toBeVisible();
  await expect(page.getByTestId('review-first-accept')).toContainText('Повторить 47 слов');
  await expect(page.getByTestId('review-first-skip')).toBeVisible();
  // The whole point of reading /progress first: no session was fetched, so the offer is free.
  expect(calls).toHaveLength(0);
});

test('«Повторить» asks for a review-only session and shows no strip', async ({ page }) => {
  const calls = await setup(page, { due: 47 });
  await page.getByTestId('review-first-accept').click();
  await expect(page.getByTestId('review-first-title')).toHaveCount(0);
  expect(calls).toHaveLength(1);
  expect(calls[0]).toContain('mode=review');
  await expect(page.getByTestId('review-first-banner')).toHaveCount(0);
});

test('«Учить новое» asks for the ordinary mix and keeps the reminder strip', async ({ page }) => {
  const calls = await setup(page, { due: 47 });
  await page.getByTestId('review-first-skip').click();
  expect(calls).toHaveLength(1);
  expect(calls[0]).not.toContain('mode=');  // no silent clamp behind the button
  const banner = page.getByTestId('review-first-banner');
  await expect(banner).toBeVisible();
  await expect(banner).toContainText('47');
  await expect(banner.getByRole('link', { name: /Почему это важно/ }))
    .toHaveAttribute('href', /^\/dashboard\/articles\/why-review-beats-new-words\/?$/);
});

test('goes straight to the session when the backlog fits', async ({ page }) => {
  const calls = await setup(page, { due: 3 });
  await expect(page.getByTestId('review-first-title')).toHaveCount(0);
  await expect(page.getByTestId('review-first-banner')).toHaveCount(0);
  expect(calls).toHaveLength(1);
});

for (const [due, expected] of [[21, 'Повторить 21 слово'], [22, 'Повторить 22 слова'], [47, 'Повторить 47 слов']] as const) {
  test(`declines the button label for ${due}`, async ({ page }) => {
    await setup(page, { due });
    await expect(page.getByTestId('review-first-accept')).toContainText(expected);
  });
}

test('reads correctly in English', async ({ page }) => {
  await setup(page, { due: 47, lang: 'en' });
  await expect(page.getByTestId('review-first-title')).toContainText('Today is better spent reviewing');
  await expect(page.getByTestId('review-first-accept')).toContainText('Review 47 words');
  await expect(page.getByTestId('review-first-skip')).toContainText('Learn new words anyway');
});

test('English uses the singular for one word', async ({ page }) => {
  await setup(page, { due: 1, size: 0, lang: 'en' });
  await expect(page.getByTestId('review-first-accept')).toContainText('Review 1 word');
});

for (const lang of ['ru', 'en'] as const) {
  test(`fits a 375px phone in ${lang}`, async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 760 });
    await setup(page, { due: 47, lang });
    await expect(page.getByTestId('review-first-accept')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);

    await page.getByTestId('review-first-skip').click();
    const banner = page.getByTestId('review-first-banner');
    await expect(banner).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
    const box = (await banner.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(375);
  });
}
