import fs from 'fs';
import path from 'path';
import { test, expect, type Page } from '@playwright/test';
import { mockStudy, type MockWord } from './helpers/studyFlow';

// Plan #38 (prototype) → #39 (production) — the speaker button in a word study session, on the
// list pages and the autoplay checkbox in Settings → Vocabulary; for free users the locked
// speaker + "Listen with Premium" pill → /pricing, and the pricing perk. See documentation/audio.md.

const SCREENSHOT_DIR = path.resolve(__dirname, '../../temp_files/screenshots/plan_39_word-audio-production');

// Copy the free-user surfaces must show, per language (lib/i18n ru.ts / en.ts).
const LISTEN_PREMIUM = { ru: 'Послушать в Premium', en: 'Listen with Premium' } as const;
const LOCKED_LABEL = { ru: 'Произношение — в Premium', en: 'Pronunciation is part of Premium' } as const;
const PERK = { ru: 'Произношение каждого слова', en: 'Pronunciation of every word' } as const;
// trailingSlash: true — exported hrefs carry the slash.
const PRICING_HREF = '/pricing/';

const WORD: MockWord = { id: 1, lithuanian: 'šeštadienis', accented: null, translation_ru: 'суббота', translation_en: 'Saturday', hint: null, status: 'new', mature: false };
const WORD2: MockWord = { id: 2, lithuanian: 'pirmadienis', accented: null, translation_ru: 'понедельник', translation_en: 'Monday', hint: null, status: 'new', mature: false };
const WORD3: MockWord = { id: 3, lithuanian: 'sekmadienis', accented: null, translation_ru: 'воскресенье', translation_en: 'Sunday', hint: null, status: 'new', mature: false };
const DISTRACTORS: MockWord[] = [
  WORD2,
  WORD3,
  { id: 4, lithuanian: 'penktadienis', accented: null, translation_ru: 'пятница', translation_en: 'Friday', hint: null },
];

const TINY_MP3 = Buffer.from('fake-mp3-bytes');

function jwt(email = 'test@test.com', name = 'Test User'): string {
  return `${Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64')}.${Buffer.from(JSON.stringify({ email, name, exp: 9999999999 })).toString('base64')}.sig`;
}

async function mockQuota(page: Page, premium: boolean, admin = false) {
  await page.route('**/api/me/quota', (r) => r.fulfill({ json: {
    is_premium: premium, premium_active: premium, premium_until: null,
    sessions_today: 0, daily_limit: 5, is_admin: admin, is_superadmin: false,
  } }));
}

/** Everything /dashboard/settings needs besides the quota fetch above. */
async function mockSettingsRoutes(page: Page) {
  await page.route('**/api/me/settings', (r) => r.fulfill({ json: {
    words_per_session: 10, new_words_ratio: 0.7, lesson_mode: 'thorough',
    use_question_timer: false, question_timer_seconds: 5,
  } }));
  await page.route('**/api/me/phrases-settings', (r) => r.fulfill({ json: { phrases_per_session: 10, new_phrases_ratio: 0.3 } }));
  await page.route('**/api/me/continue-settings', (r) => r.fulfill({ json: {
    continue_words_count: 3, continue_grammar_count: 3, continue_phrases_count: 3, continue_include_new: true,
  } }));
}

/** Records every `<audio>`/`<video>` `.play()` call so autoplay can be asserted without
 * relying on real media decoding (which a fake mp3 body would fail anyway). */
async function stubAudioPlay(page: Page) {
  await page.addInitScript(() => {
    (window as unknown as { __playCalls: number }).__playCalls = 0;
    HTMLMediaElement.prototype.play = function play() {
      (window as unknown as { __playCalls: number }).__playCalls += 1;
      return Promise.resolve();
    };
  });
}

async function playCallCount(page: Page): Promise<number> {
  return page.evaluate(() => (window as unknown as { __playCalls: number }).__playCalls ?? 0);
}

async function boot(page: Page, opts: { lang?: 'ru' | 'en'; width?: number; premium?: boolean; autoplay?: boolean } = {}) {
  const { lang = 'ru', width = 1280, premium = true, autoplay } = opts;
  await page.setViewportSize({ width, height: width < 500 ? 812 : 900 });
  await stubAudioPlay(page);
  await page.addInitScript(([t, l, ap]) => {
    localStorage.setItem('fluent_token', t as string);
    localStorage.setItem('fluent_lang', l as string);
    localStorage.setItem('cookie_consent', 'accepted');
    // addInitScript serializes args, so an `undefined` slot arrives as null — test for a string.
    if (typeof ap === 'string') localStorage.setItem('fluent_audio_autoplay', ap);
  }, [jwt(), lang, autoplay === undefined ? undefined : String(autoplay)] as const);
  await mockQuota(page, premium);
}

const HARD = { ru: 'С трудом', en: 'Hard' } as const;
const EASY = { ru: 'Легко', en: 'Easy' } as const;
const WHAT_MEANS = { ru: 'Что это означает?', en: 'What does it mean?' } as const;

/** Reload until stage 2's coin flip lands on "what does it mean?" (the direction the
 * button/autoplay applies to) rather than "pick the Lithuanian word". */
async function gotoStage2WhatMeans(page: Page, lang: 'ru' | 'en') {
  for (let attempt = 0; attempt < 20; attempt++) {
    await page.goto('/dashboard/lists/_/study');
    await page.getByText(WORD.lithuanian, { exact: true }).first().waitFor({ timeout: 15000 });
    await page.getByRole('button', { name: HARD[lang], exact: true }).click();
    const seen = await page.getByText(WHAT_MEANS[lang]).waitFor({ timeout: 3000 }).then(() => true, () => false);
    if (seen) return;
  }
  throw new Error('never landed on the "what does it mean" direction after 20 reloads');
}

test.describe('SpeakButton — word study session', () => {
  test('premium: button is visible on stage 1 and a click fetches the clip', async ({ page }) => {
    const requestedTexts: string[] = [];
    const pending: (() => void)[] = [];
    await boot(page, { premium: true, autoplay: false });
    await mockStudy(page, [WORD], { distractors: DISTRACTORS });
    await page.route('**/api/audio*', async (route) => {
      requestedTexts.push(new URL(route.request().url()).searchParams.get('text') ?? '');
      await new Promise<void>((resolve) => pending.push(resolve));
      await route.fulfill({ body: TINY_MP3, contentType: 'audio/mpeg' });
    });
    await page.goto('/dashboard/lists/_/study');

    // The lesson's one word is prefetched on load — that request is still in flight.
    await expect.poll(() => requestedTexts.length).toBe(1);

    const btn = page.getByTestId('speak-btn').first();
    await expect(btn).toBeVisible();
    await btn.click();

    // The click joins the prefetch's in-flight request instead of sending a second one
    // (one request per word), and plays as soon as that request lands.
    const playsBefore = await playCallCount(page);
    await page.waitForTimeout(300);
    expect(requestedTexts).toEqual([WORD.lithuanian]);
    pending.forEach((resolve) => resolve());
    await expect.poll(() => playCallCount(page)).toBeGreaterThan(playsBefore);
  });

  test('prefetch requests every lesson word, one at a time', async ({ page }) => {
    const requested: string[] = [];
    const resolvers: (() => void)[] = [];
    await boot(page, { premium: true, autoplay: false });
    await mockStudy(page, [WORD, WORD2, WORD3]);
    await page.route('**/api/audio*', async (route) => {
      requested.push(new URL(route.request().url()).searchParams.get('text') ?? '');
      await new Promise<void>((resolve) => resolvers.push(resolve));
      await route.fulfill({ body: TINY_MP3, contentType: 'audio/mpeg' });
    });
    await page.goto('/dashboard/lists/_/study');

    await expect.poll(() => requested.length).toBe(1);
    expect(requested).toEqual([WORD.lithuanian]);
    resolvers[0]();

    await expect.poll(() => requested.length).toBe(2);
    expect(requested).toEqual([WORD.lithuanian, WORD2.lithuanian]);
    resolvers[1]();

    await expect.poll(() => requested.length).toBe(3);
    expect(requested).toEqual([WORD.lithuanian, WORD2.lithuanian, WORD3.lithuanian]);
    resolvers[2]();
  });

  test('free user: no button and no /api/audio request', async ({ page }) => {
    let audioRequests = 0;
    await boot(page, { premium: false });
    await mockStudy(page, [WORD], { distractors: DISTRACTORS });
    await page.route('**/api/audio*', async (route) => { audioRequests += 1; await route.abort(); });
    await page.goto('/dashboard/lists/_/study');

    await expect(page.getByText(WORD.lithuanian, { exact: true }).first()).toBeVisible();
    await expect(page.getByTestId('speak-btn')).toHaveCount(0);
    await expect(page.getByTestId('autoplay-toggle')).toHaveCount(0);
    // Give a wrongly-firing prefetch/autoplay a moment to show up before asserting zero.
    await page.waitForTimeout(400);
    expect(audioRequests).toBe(0);
  });

  for (const lang of ['ru', 'en'] as const) {
    test(`free user (${lang}): locked speaker + pill on stage 1, locked speaker on stage 2, all → /pricing in a new tab`, async ({ page }) => {
      let audioRequests = 0;
      await boot(page, { lang, premium: false });
      await mockStudy(page, [WORD], { distractors: DISTRACTORS });
      await page.route('**/api/audio*', async (route) => { audioRequests += 1; await route.abort(); });
      await page.goto('/dashboard/lists/_/study');

      const locked = page.getByTestId('speak-btn-locked');
      await expect(locked).toBeVisible();
      await expect(locked).toHaveAttribute('href', PRICING_HREF);
      await expect(locked).toHaveAttribute('aria-label', LOCKED_LABEL[lang]);
      // A lesson must survive the click (A2-10): new tab, not a navigation away.
      await expect(locked).toHaveAttribute('target', '_blank');
      await expect(locked).toHaveAttribute('rel', 'noopener');
      const pill = page.getByTestId('audio-premium-pill');
      await expect(pill).toBeVisible();
      await expect(pill).toHaveText(LISTEN_PREMIUM[lang]);
      await expect(pill).toHaveAttribute('href', PRICING_HREF);
      await expect(pill).toHaveAttribute('target', '_blank');
      await expect(page.getByTestId('speak-btn')).toHaveCount(0);
      await expect(page.getByTestId('autoplay-toggle')).toHaveCount(0);

      await gotoStage2WhatMeans(page, lang);
      await expect(page.getByTestId('speak-btn-locked')).toBeVisible();
      await expect(page.getByTestId('speak-btn-locked')).toHaveAttribute('target', '_blank');
      await expect(page.getByTestId('audio-premium-pill')).toHaveCount(0); // stage 1 only
      await expect(page.getByTestId('speak-btn')).toHaveCount(0);
      await page.waitForTimeout(400);
      expect(audioRequests).toBe(0);
    });
  }

  test('a failed quota fetch shows no audio control at all (never the lock to a paying user)', async ({ page }) => {
    await boot(page, { premium: true });
    await page.route('**/api/me/quota', (r) => r.fulfill({ status: 500, body: 'boom' }));
    await mockStudy(page, [WORD], { distractors: DISTRACTORS });
    await page.goto('/dashboard/lists/_/study');

    await expect(page.getByText(WORD.lithuanian, { exact: true }).first()).toBeVisible();
    await page.waitForTimeout(400);
    await expect(page.getByTestId('speak-btn')).toHaveCount(0);
    await expect(page.getByTestId('speak-btn-locked')).toHaveCount(0);
    await expect(page.getByTestId('audio-premium-pill')).toHaveCount(0);
  });

  test('autoplay on: stage 1 plays the clip without a click', async ({ page }) => {
    await boot(page, { premium: true, autoplay: true });
    await mockStudy(page, [WORD], { distractors: DISTRACTORS });
    await page.route('**/api/audio*', (r) => r.fulfill({ body: TINY_MP3, contentType: 'audio/mpeg' }));
    await page.goto('/dashboard/lists/_/study');

    await expect(page.getByTestId('speak-btn')).toBeVisible();
    await expect.poll(() => playCallCount(page)).toBeGreaterThan(0);
  });

  test('autoplay defaults to on: with nothing stored, the first card plays by itself', async ({ page }) => {
    await boot(page, { premium: true });
    await mockStudy(page, [WORD], { distractors: DISTRACTORS });
    await page.route('**/api/audio*', (r) => r.fulfill({ body: TINY_MP3, contentType: 'audio/mpeg' }));
    await page.goto('/dashboard/lists/_/study');

    await expect(page.getByTestId('autoplay-toggle')).toHaveAttribute('aria-checked', 'true');
    await expect.poll(() => playCallCount(page)).toBeGreaterThan(0);
  });

  test('in-card toggle: turning autoplay off persists and stops playback on the next load', async ({ page }) => {
    await boot(page, { premium: true });
    await mockStudy(page, [WORD], { distractors: DISTRACTORS });
    await page.route('**/api/audio*', (r) => r.fulfill({ body: TINY_MP3, contentType: 'audio/mpeg' }));
    await page.goto('/dashboard/lists/_/study');

    const toggle = page.getByTestId('autoplay-toggle');
    await expect(toggle).toHaveAttribute('aria-checked', 'true');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-checked', 'false');
    expect(await page.evaluate(() => localStorage.getItem('fluent_audio_autoplay'))).toBe('false');

    await page.reload();
    await expect(page.getByTestId('autoplay-toggle')).toHaveAttribute('aria-checked', 'false');
    const before = await playCallCount(page);
    await page.waitForTimeout(400);
    expect(await playCallCount(page)).toBe(before);

    // Turning it back on replays the card that is on screen.
    await page.getByTestId('autoplay-toggle').click();
    await expect.poll(() => playCallCount(page)).toBeGreaterThan(before);
  });

  test('autoplay off: no playback until the button is clicked', async ({ page }) => {
    await boot(page, { premium: true, autoplay: false });
    await mockStudy(page, [WORD], { distractors: DISTRACTORS });
    await page.route('**/api/audio*', (r) => r.fulfill({ body: TINY_MP3, contentType: 'audio/mpeg' }));
    await page.goto('/dashboard/lists/_/study');

    const btn = page.getByTestId('speak-btn');
    await expect(btn).toBeVisible();
    await page.waitForTimeout(400); // give a wrongly-firing autoplay a chance to show up
    expect(await playCallCount(page)).toBe(0);

    await btn.click();
    await expect.poll(() => playCallCount(page)).toBeGreaterThan(0);
  });

  test('autoplay on + typed stage: no playback until the answer is submitted', async ({ page }) => {
    await boot(page, { premium: true, autoplay: true });
    await mockStudy(page, [WORD], { distractors: DISTRACTORS });
    await page.route('**/api/audio*', (r) => r.fulfill({ body: TINY_MP3, contentType: 'audio/mpeg' }));
    await page.goto('/dashboard/lists/_/study');

    // "Easy" at stage 1 (which itself autoplays) goes straight to the typing stage —
    // the stage that asks the user to *produce* Lithuanian, so autoplay must wait.
    await page.getByRole('button', { name: EASY.ru, exact: true }).click();
    const input = page.locator('input[type="text"]');
    await input.waitFor({ timeout: 7000 });

    const before = await playCallCount(page);
    await page.waitForTimeout(400);
    expect(await playCallCount(page)).toBe(before);

    await input.fill(WORD.lithuanian);
    await input.press('Enter');
    await expect.poll(() => playCallCount(page)).toBeGreaterThan(before);
  });

  test('typed stage: the toggle turns autoplay off mid-lesson, and turning it on never plays the hidden answer', async ({ page }) => {
    await boot(page, { premium: true, autoplay: true });
    await mockStudy(page, [WORD], { distractors: DISTRACTORS });
    await page.route('**/api/audio*', (r) => r.fulfill({ body: TINY_MP3, contentType: 'audio/mpeg' }));
    await page.goto('/dashboard/lists/_/study');
    await page.getByRole('button', { name: EASY.ru, exact: true }).click();
    const input = page.locator('input[type="text"]');
    await input.waitFor({ timeout: 7000 });

    const toggle = page.getByTestId('autoplay-toggle');
    await expect(toggle).toHaveCount(1);
    await expect(toggle).toHaveAttribute('aria-checked', 'true');
    const before = await playCallCount(page);

    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-checked', 'false');
    expect(await page.evaluate(() => localStorage.getItem('fluent_audio_autoplay'))).toBe('false');
    // Back on while the answer is still hidden: must not play it.
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-checked', 'true');
    await page.waitForTimeout(400);
    expect(await playCallCount(page)).toBe(before);

    // Off again, then answer: autoplay stays silent.
    await toggle.click();
    await input.fill(WORD.lithuanian);
    await input.press('Enter');
    await page.waitForTimeout(400);
    expect(await playCallCount(page)).toBe(before);
  });

  test('free user on the typed stage: no autoplay toggle', async ({ page }) => {
    await boot(page, { premium: false });
    await mockStudy(page, [WORD], { distractors: DISTRACTORS });
    await page.goto('/dashboard/lists/_/study');
    await page.getByRole('button', { name: EASY.ru, exact: true }).click();
    await page.locator('input[type="text"]').waitFor({ timeout: 7000 });
    await expect(page.getByTestId('autoplay-toggle')).toHaveCount(0);
  });
});

test.describe('Settings — autoplay checkbox', () => {
  test('premium: checkbox is enabled, on by default, no Premium tag, and turning it off persists', async ({ page }) => {
    await boot(page, { premium: true });
    await mockSettingsRoutes(page);
    await page.goto('/dashboard/settings');

    const checkbox = page.getByTestId('audio-autoplay-checkbox');
    await expect(checkbox).toBeVisible();
    await expect(checkbox).toBeEnabled();
    await expect(checkbox).toBeChecked();
    await expect(page.getByTestId('audio-autoplay-premium-tag')).toHaveCount(0);

    await checkbox.uncheck();
    await expect(checkbox).not.toBeChecked();

    await page.reload();
    await expect(page.getByTestId('audio-autoplay-checkbox')).not.toBeChecked();
  });

  test('free: checkbox is disabled with a Premium tag', async ({ page }) => {
    await boot(page, { premium: false });
    await mockSettingsRoutes(page);
    await page.goto('/dashboard/settings');

    const checkbox = page.getByTestId('audio-autoplay-checkbox');
    await expect(checkbox).toBeVisible();
    await expect(checkbox).toBeDisabled();
    await expect(page.getByTestId('audio-autoplay-premium-tag')).toBeVisible();
  });

  for (const lang of ['ru', 'en'] as const) {
    test(`free (${lang}): the Premium tag links to /pricing`, async ({ page }) => {
      await boot(page, { lang, premium: false });
      await mockSettingsRoutes(page);
      await page.goto('/dashboard/settings');
      const tag = page.getByTestId('audio-autoplay-premium-tag');
      await expect(tag).toBeVisible();
      await expect(tag).toHaveAttribute('href', PRICING_HREF);
      await expect(tag).toHaveText('Premium');
    });
  }
});

// ── RU/EN × 1280/375 evidence screenshots (CLAUDE.md: user-facing changes ship with these) ──

test.describe('Screenshots — RU/EN × 1280/375, no horizontal scroll at 375', () => {
  test.beforeAll(() => {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  });

  for (const lang of ['ru', 'en'] as const) {
    for (const width of [1280, 375] as const) {
      test(`stage 1 + stage 2 button, ${lang} @ ${width}px`, async ({ page }) => {
        await boot(page, { lang, width, premium: true, autoplay: false });
        await mockStudy(page, [WORD], { distractors: DISTRACTORS });
        await page.route('**/api/audio*', (r) => r.fulfill({ body: TINY_MP3, contentType: 'audio/mpeg' }));

        await page.goto('/dashboard/lists/_/study');
        await expect(page.getByText(WORD.lithuanian, { exact: true }).first()).toBeVisible();
        await expect(page.getByTestId('speak-btn')).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, `card-premium-${lang}-${width}.png`) });

        await page.getByTestId('autoplay-toggle').click();
        await expect(page.getByTestId('autoplay-toggle')).toHaveAttribute('aria-checked', 'true');
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, `card-autoplay-on-${lang}-${width}.png`) });
        // Back off so stage 2 below is shot in the same state as before.
        await page.getByTestId('autoplay-toggle').click();

        await gotoStage2WhatMeans(page, lang);
        // The options render a beat after the prompt — wait so the shot shows the whole stage.
        await expect(page.getByRole('button', { name: lang === 'ru' ? WORD.translation_ru : WORD.translation_en })).toBeVisible();
        await expect(page.getByTestId('speak-btn')).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, `select-premium-${lang}-${width}.png`) });
      });

      test(`typed stage: autoplay toggle beside the mascot, ${lang} @ ${width}px`, async ({ page }) => {
        await boot(page, { lang, width, premium: true, autoplay: true });
        await mockStudy(page, [WORD], { distractors: DISTRACTORS });
        await page.route('**/api/audio*', (r) => r.fulfill({ body: TINY_MP3, contentType: 'audio/mpeg' }));
        await page.goto('/dashboard/lists/_/study');
        await page.getByRole('button', { name: EASY[lang], exact: true }).click();
        await page.locator('input[type="text"]').waitFor({ timeout: 7000 });
        await expect(page.getByTestId('autoplay-toggle')).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, `typed-toggle-${lang}-${width}.png`) });
      });

      // The longest header there is ("Повторение выученных · Пишу"): nothing may squeeze it.
      test(`review typing card: toggle with the longest header label, ${lang} @ ${width}px`, async ({ page }) => {
        await boot(page, { lang, width, premium: true, autoplay: true });
        await mockStudy(page, [{ ...WORD, status: 'known', mature: true }], { review: true });
        await page.route('**/api/audio*', (r) => r.fulfill({ body: TINY_MP3, contentType: 'audio/mpeg' }));
        await page.goto('/dashboard/review');
        await page.locator('input[type="text"]').waitFor({ timeout: 7000 });
        await expect(page.getByTestId('autoplay-toggle')).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, `review-typed-toggle-${lang}-${width}.png`) });
      });

      test(`settings autoplay checkbox, ${lang} @ ${width}px`, async ({ page }) => {
        await boot(page, { lang, width, premium: true });
        await mockSettingsRoutes(page);
        await page.goto('/dashboard/settings');
        await expect(page.getByTestId('audio-autoplay-checkbox')).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, `settings-autoplay-premium-${lang}-${width}.png`), fullPage: true });
      });

      test(`settings autoplay checkbox (free, locked), ${lang} @ ${width}px`, async ({ page }) => {
        await boot(page, { lang, width, premium: false });
        await mockSettingsRoutes(page);
        await page.goto('/dashboard/settings');
        await expect(page.getByTestId('audio-autoplay-checkbox')).toBeVisible();
        await expect(page.getByTestId('audio-autoplay-premium-tag')).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, `settings-autoplay-locked-${lang}-${width}.png`), fullPage: true });
      });
    }
  }
});

// ── Word-list page (/dashboard/lists/[id]) — click-only listen buttons ──

const LIST = {
  id: 1, title: 'Дни недели', title_en: 'Days of the week', description: null, description_en: null,
  words: [WORD, WORD2, WORD3].map((w) => ({ ...w, star: 1 })),
};

async function gotoList(page: Page) {
  await page.route('**/api/lists/*', (r) => r.fulfill({ json: LIST }));
  await page.goto('/dashboard/lists/_?id=1');
  await expect(page.getByText(WORD.lithuanian, { exact: true })).toBeVisible();
}

test.describe('Word-list page — listen buttons', () => {
  test('premium: one button per word, nothing fetched until a click', async ({ page }) => {
    const requested: string[] = [];
    await boot(page, { premium: true });
    await page.route('**/api/audio*', (r) => {
      requested.push(new URL(r.request().url()).searchParams.get('text') ?? '');
      return r.fulfill({ body: TINY_MP3, contentType: 'audio/mpeg' });
    });
    await gotoList(page);

    await expect(page.getByTestId('speak-btn')).toHaveCount(LIST.words.length);
    await page.waitForTimeout(400);
    expect(requested).toEqual([]);

    await page.getByTestId('speak-btn').nth(1).click();
    await expect.poll(() => requested).toEqual([WORD2.lithuanian]);
  });

  test('free: no listen buttons and no /api/audio request', async ({ page }) => {
    let audioRequests = 0;
    await boot(page, { premium: false });
    await page.route('**/api/audio*', (r) => { audioRequests += 1; return r.abort(); });
    await gotoList(page);

    await expect(page.getByTestId('speak-btn')).toHaveCount(0);
    await page.waitForTimeout(400);
    expect(audioRequests).toBe(0);
  });

  for (const lang of ['ru', 'en'] as const) {
    test(`free (${lang}): a locked button per word → /pricing, same tab, no pill`, async ({ page }) => {
      let audioRequests = 0;
      await boot(page, { lang, premium: false });
      await page.route('**/api/audio*', (r) => { audioRequests += 1; return r.abort(); });
      await gotoList(page);

      const locked = page.getByTestId('speak-btn-locked');
      await expect(locked).toHaveCount(LIST.words.length);
      await expect(locked.first()).toBeVisible();
      await expect(locked.first()).toHaveAttribute('href', PRICING_HREF);
      await expect(locked.first()).toHaveAttribute('aria-label', LOCKED_LABEL[lang]);
      await expect(locked.first()).not.toHaveAttribute('target', /.*/); // normal navigation (A2-10)
      await expect(page.getByTestId('audio-premium-pill')).toHaveCount(0);
      await expect(page.getByTestId('speak-btn')).toHaveCount(0);
      await page.waitForTimeout(400);
      expect(audioRequests).toBe(0);
    });
  }

  test('a failed quota fetch shows no audio control', async ({ page }) => {
    await boot(page, { premium: true });
    await page.route('**/api/me/quota', (r) => r.fulfill({ status: 500, body: 'boom' }));
    await gotoList(page);
    await page.waitForTimeout(400);
    await expect(page.getByTestId('speak-btn')).toHaveCount(0);
    await expect(page.getByTestId('speak-btn-locked')).toHaveCount(0);
  });

  for (const lang of ['ru', 'en'] as const) {
    for (const width of [1280, 375] as const) {
      test(`screenshot: list with listen buttons, ${lang} @ ${width}px`, async ({ page }) => {
        await boot(page, { lang, width, premium: true });
        await gotoList(page);
        await expect(page.getByTestId('speak-btn').first()).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
        fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, `list-premium-${lang}-${width}.png`) });
      });
    }
  }
});

// ── Vocabulary page (/dashboard/vocabulary, incl. the "due for review" filter) ──

const KNOWN = [WORD, WORD2, WORD3].map((w, i) => ({
  id: w.id, lithuanian: w.lithuanian, translation_ru: w.translation_ru, translation_en: w.translation_en,
  hint: null, last_seen: '2026-09-01T10:00:00', next_review: i === 0 ? '2026-09-01' : '2026-12-01',
  list_title: 'Дни недели', list_title_en: 'Days of the week', list_id: 1,
}));

async function gotoVocabulary(page: Page) {
  await page.route('**/api/me/known-words', (r) => r.fulfill({ json: KNOWN }));
  await page.goto('/dashboard/vocabulary');
  await expect(page.getByText(WORD.lithuanian, { exact: true })).toBeVisible();
}

test.describe('Vocabulary page — listen buttons', () => {
  test('premium: one button per word, nothing fetched until a click', async ({ page }) => {
    const requested: string[] = [];
    await boot(page, { premium: true });
    await page.route('**/api/audio*', (r) => {
      requested.push(new URL(r.request().url()).searchParams.get('text') ?? '');
      return r.fulfill({ body: TINY_MP3, contentType: 'audio/mpeg' });
    });
    await gotoVocabulary(page);

    await expect(page.getByTestId('speak-btn')).toHaveCount(KNOWN.length);
    await page.waitForTimeout(400);
    expect(requested).toEqual([]);

    await page.getByRole('row').filter({ hasText: WORD3.lithuanian }).getByTestId('speak-btn').click();
    await expect.poll(() => requested).toEqual([WORD3.lithuanian]);
  });

  test('free: no listen buttons', async ({ page }) => {
    await boot(page, { premium: false });
    await gotoVocabulary(page);
    await expect(page.getByTestId('speak-btn')).toHaveCount(0);
  });

  for (const lang of ['ru', 'en'] as const) {
    test(`free (${lang}): a locked button per word → /pricing, same tab, no pill`, async ({ page }) => {
      let audioRequests = 0;
      await boot(page, { lang, premium: false });
      await page.route('**/api/audio*', (r) => { audioRequests += 1; return r.abort(); });
      await gotoVocabulary(page);

      const locked = page.getByTestId('speak-btn-locked');
      await expect(locked).toHaveCount(KNOWN.length);
      await expect(locked.first()).toBeVisible();
      await expect(locked.first()).toHaveAttribute('href', PRICING_HREF);
      await expect(locked.first()).toHaveAttribute('aria-label', LOCKED_LABEL[lang]);
      await expect(locked.first()).not.toHaveAttribute('target', /.*/);
      await expect(page.getByTestId('audio-premium-pill')).toHaveCount(0);
      await expect(page.getByTestId('speak-btn')).toHaveCount(0);
      await page.waitForTimeout(400);
      expect(audioRequests).toBe(0);
    });
  }

  test('a failed quota fetch shows no audio control', async ({ page }) => {
    await boot(page, { premium: true });
    await page.route('**/api/me/quota', (r) => r.fulfill({ status: 500, body: 'boom' }));
    await gotoVocabulary(page);
    await page.waitForTimeout(400);
    await expect(page.getByTestId('speak-btn')).toHaveCount(0);
    await expect(page.getByTestId('speak-btn-locked')).toHaveCount(0);
  });

  for (const lang of ['ru', 'en'] as const) {
    for (const width of [1280, 375] as const) {
      test(`screenshot: vocabulary with listen buttons, ${lang} @ ${width}px`, async ({ page }) => {
        await boot(page, { lang, width, premium: true });
        await gotoVocabulary(page);
        await expect(page.getByTestId('speak-btn').first()).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
        fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, `vocabulary-premium-${lang}-${width}.png`), fullPage: true });
      });
    }
  }
});

// ── Free-user evidence (#39): locked card + pill, stage 2, list, vocabulary, pricing ──
// RU/EN × 1280/375. At 375 the pill and the locked buttons must be visible with no horizontal
// scroll. /api/billing/config is mocked to production's `enabled: true` (locally it is false
// without a Stripe key), so the pricing shot shows the state users actually see.

async function noHorizontalScroll(page: Page, width: number) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
}

test.describe('Free-user screenshots — RU/EN × 1280/375', () => {
  test.beforeAll(() => {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  });

  for (const lang of ['ru', 'en'] as const) {
    for (const width of [1280, 375] as const) {
      test(`lesson card + stage 2 (free), ${lang} @ ${width}px`, async ({ page }) => {
        await boot(page, { lang, width, premium: false });
        await mockStudy(page, [WORD], { distractors: DISTRACTORS });
        await page.goto('/dashboard/lists/_/study');
        await expect(page.getByTestId('speak-btn-locked')).toBeVisible();
        await expect(page.getByTestId('audio-premium-pill')).toBeVisible();
        await expect(page.getByTestId('audio-premium-pill')).toHaveText(LISTEN_PREMIUM[lang]);
        await noHorizontalScroll(page, width);
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, `free-card-${lang}-${width}.png`) });

        await gotoStage2WhatMeans(page, lang);
        await expect(page.getByRole('button', { name: lang === 'ru' ? WORD.translation_ru : WORD.translation_en })).toBeVisible();
        await expect(page.getByTestId('speak-btn-locked')).toBeVisible();
        await noHorizontalScroll(page, width);
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, `free-select-${lang}-${width}.png`) });
      });

      test(`list page (free), ${lang} @ ${width}px`, async ({ page }) => {
        await boot(page, { lang, width, premium: false });
        await gotoList(page);
        await expect(page.getByTestId('speak-btn-locked').first()).toBeVisible();
        await noHorizontalScroll(page, width);
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, `free-list-${lang}-${width}.png`) });
      });

      test(`vocabulary page (free), ${lang} @ ${width}px`, async ({ page }) => {
        await boot(page, { lang, width, premium: false });
        await gotoVocabulary(page);
        await expect(page.getByTestId('speak-btn-locked').first()).toBeVisible();
        await noHorizontalScroll(page, width);
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, `free-vocabulary-${lang}-${width}.png`), fullPage: true });
      });

      test(`pricing lists the pronunciation perk, ${lang} @ ${width}px`, async ({ page }) => {
        await boot(page, { lang, width, premium: false });
        await page.route('**/api/billing/config', (r) => r.fulfill({ json: { enabled: true } }));
        await page.goto('/pricing');
        const perk = page.getByText(PERK[lang], { exact: true });
        await expect(perk).toBeVisible();
        await noHorizontalScroll(page, width);
        await perk.scrollIntoViewIfNeeded();
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, `pricing-${lang}-${width}.png`), fullPage: true });
      });
    }
  }
});
