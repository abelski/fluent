import fs from 'fs';
import path from 'path';
import { test, expect, type Page } from '@playwright/test';
import { mockStudy, type MockWord } from './helpers/studyFlow';

// Plan #38 (local prototype, not deployed) — the speaker button in a word study
// session and the autoplay checkbox in Settings → Vocabulary. See documentation/audio.md.

const SCREENSHOT_DIR = path.resolve(__dirname, '../../temp_files/screenshots/plan_38_word-audio-prototype');

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
