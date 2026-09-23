import fs from 'fs';
import path from 'path';
import { test, expect, type Page } from '@playwright/test';

// Plan #43 — phrase audio: the speaker button on the phrase list page and the PhraseSession
// intro card, the locked speaker + upsell pill for free users, and the autoplay toggle on a
// drill stage. Mirrors frontend/tests/audio-button.spec.ts (word audio). See documentation/audio.md.

const SCREENSHOT_DIR = path.resolve(__dirname, '../../temp_files/screenshots/plan_43_phrase-audio');

const LISTEN_PREMIUM = { ru: 'Послушать в Premium', en: 'Listen with Premium' } as const;
const LOCKED_LABEL = { ru: 'Произношение — в Premium', en: 'Pronunciation is part of Premium' } as const;
const PRICING_HREF = '/pricing/';

const TINY_MP3 = Buffer.from('fake-mp3-bytes');

function jwt(email = 'test@test.com', name = 'Test User'): string {
  return `${Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64')}.${Buffer.from(JSON.stringify({ email, name, exp: 9999999999 })).toString('base64')}.sig`;
}

async function mockQuota(page: Page, premium: boolean) {
  await page.route('**/api/me/quota', (r) => r.fulfill({ json: {
    is_premium: premium, premium_active: premium, premium_until: null,
    sessions_today: 0, daily_limit: 5, is_admin: false, is_superadmin: false,
  } }));
}

async function boot(page: Page, opts: { lang?: 'ru' | 'en'; width?: number; premium?: boolean } = {}) {
  const { lang = 'ru', width = 1280, premium = true } = opts;
  await page.setViewportSize({ width, height: width < 500 ? 812 : 900 });
  await page.addInitScript(([t, l]) => {
    localStorage.setItem('fluent_token', t as string);
    localStorage.setItem('fluent_lang', l as string);
    localStorage.setItem('cookie_consent', 'accepted');
    localStorage.setItem('fluent_audio_autoplay', 'false');
  }, [jwt(), lang] as const);
  await mockQuota(page, premium);
  await page.route('**/api/audio*', (r) => r.fulfill({ body: TINY_MP3, contentType: 'audio/mpeg' }));
}

// ── Phrase list page (/dashboard/phrases/[id]) ───────────────────────────────

const PROGRAM = {
  id: 11,
  title: 'Sékmės! A1.1 — Фразы',
  title_en: 'Sékmės! A1.1 — Phrases',
  description: null,
  description_en: null,
  difficulty: 1,
  phrases: [
    { id: 210, text: 'Labas rytas!', translation: 'Доброе утро!', translation_en: 'Good morning!', chapter: null, chapter_title: null, chapter_title_en: null, position: 0, lesson_stage: 0 },
  ],
};

async function gotoProgram(page: Page) {
  await page.route('**/api/phrase-programs/11', (r) => r.fulfill({ json: PROGRAM }));
  await page.goto('/dashboard/phrases/11');
  await expect(page.getByText('Labas rytas!', { exact: true })).toBeVisible();
}

test.describe('Phrase list page — listen buttons', () => {
  test('premium: speaker button per phrase, nothing fetched until a click', async ({ page }) => {
    const requested: string[] = [];
    await boot(page, { premium: true });
    await page.unroute('**/api/audio*');
    await page.route('**/api/audio*', (r) => {
      requested.push(new URL(r.request().url()).searchParams.get('text') ?? '');
      return r.fulfill({ body: TINY_MP3, contentType: 'audio/mpeg' });
    });
    await gotoProgram(page);

    await expect(page.getByTestId('speak-btn')).toHaveCount(1);
    await page.waitForTimeout(300);
    expect(requested).toEqual([]);

    await page.getByTestId('speak-btn').click();
    await expect.poll(() => requested).toEqual(['Labas rytas!']);
  });

  for (const lang of ['ru', 'en'] as const) {
    test(`free (${lang}): locked speaker → /pricing, no /api/audio request`, async ({ page }) => {
      let audioRequests = 0;
      await boot(page, { lang, premium: false });
      await page.unroute('**/api/audio*');
      await page.route('**/api/audio*', (r) => { audioRequests += 1; return r.abort(); });
      await gotoProgram(page);

      const locked = page.getByTestId('speak-btn-locked');
      await expect(locked).toBeVisible();
      await expect(locked).toHaveAttribute('href', PRICING_HREF);
      await expect(locked).toHaveAttribute('aria-label', LOCKED_LABEL[lang]);
      await expect(page.getByTestId('speak-btn')).toHaveCount(0);
      await page.waitForTimeout(300);
      expect(audioRequests).toBe(0);
    });
  }
});

// ── PhraseSession (/dashboard/phrases/[id]/study) ────────────────────────────

const STUDY_SESSION = {
  phrases: [
    {
      id: 210,
      text: 'Labas rytas!',
      translation: 'Доброе утро!',
      translation_en: 'Good morning!',
      lesson_stage: 0,
      blank_word: 'rytas',
      mcq_distractors: ['Labas', 'vakaras', 'naktis'],
      next_review: null,
    },
    {
      id: 211,
      text: 'Laba diena!',
      translation: 'Добрый день!',
      translation_en: 'Good afternoon!',
      lesson_stage: 1,
      blank_word: 'diena',
      mcq_distractors: ['Labas', 'vakaras', 'naktis'],
      next_review: null,
    },
  ],
};

async function gotoStudy(page: Page) {
  await page.route('**/api/phrase-programs/11/study', (r) => r.fulfill({ json: STUDY_SESSION }));
  await page.route('**/api/phrases/*/progress', (r) => r.fulfill({ json: { lesson_stage: 1, next_review: null, interval: 1 } }));
  await page.goto('/dashboard/phrases/11/study');
  await expect(page.getByTestId('phrase-session-stage0')).toBeVisible({ timeout: 10000 });
}

test.describe('PhraseSession — intro card + MCQ stage', () => {
  test('premium: speaker button + autoplay toggle on the intro card', async ({ page }) => {
    await boot(page, { premium: true });
    await gotoStudy(page);

    await expect(page.getByTestId('speak-btn')).toBeVisible();
    await expect(page.getByTestId('autoplay-toggle')).toBeVisible();
    await expect(page.getByTestId('audio-premium-pill')).toHaveCount(0); // premium: no upsell
  });

  for (const lang of ['ru', 'en'] as const) {
    test(`free (${lang}): locked speaker + upsell pill on the intro card`, async ({ page }) => {
      await boot(page, { lang, premium: false });
      await gotoStudy(page);

      await expect(page.getByTestId('speak-btn-locked')).toBeVisible();
      const pill = page.getByTestId('audio-premium-pill');
      await expect(pill).toBeVisible();
      await expect(pill).toHaveText(LISTEN_PREMIUM[lang]);
      await expect(pill).toHaveAttribute('href', PRICING_HREF);
      await expect(page.getByTestId('speak-btn')).toHaveCount(0);
      await expect(page.getByTestId('autoplay-toggle')).toHaveCount(0); // free: no autoplay control
    });
  }

  test('premium: autoplay toggle also present on the MCQ drill stage', async ({ page }) => {
    await boot(page, { premium: true });
    await gotoStudy(page);

    await page.getByTestId('got-it-btn').click();
    await expect(page.getByTestId('phrase-session-stage1-mcq')).toBeVisible({ timeout: 5000 });
    await expect(page.getByTestId('autoplay-toggle')).toBeVisible();
  });
});

// ── RU/EN × 1280/375 evidence screenshots ────────────────────────────────────

test.describe('Screenshots — RU/EN × 1280/375, no horizontal scroll at 375', () => {
  test.beforeAll(() => {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  });

  for (const lang of ['ru', 'en'] as const) {
    for (const width of [1280, 375] as const) {
      test(`phrase list (premium), ${lang} @ ${width}px`, async ({ page }) => {
        await boot(page, { lang, width, premium: true });
        await gotoProgram(page);
        await expect(page.getByTestId('speak-btn')).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, `list-premium-${lang}-${width}.png`), animations: 'disabled' });
      });

      test(`phrase list (free), ${lang} @ ${width}px`, async ({ page }) => {
        await boot(page, { lang, width, premium: false });
        await gotoProgram(page);
        await expect(page.getByTestId('speak-btn-locked')).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, `list-free-${lang}-${width}.png`), animations: 'disabled' });
      });

      test(`session intro card (premium), ${lang} @ ${width}px`, async ({ page }) => {
        await boot(page, { lang, width, premium: true });
        await gotoStudy(page);
        await expect(page.getByTestId('speak-btn')).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, `session-premium-${lang}-${width}.png`), animations: 'disabled' });
      });

      test(`session intro card (free), ${lang} @ ${width}px`, async ({ page }) => {
        await boot(page, { lang, width, premium: false });
        await gotoStudy(page);
        await expect(page.getByTestId('speak-btn-locked')).toBeVisible();
        await expect(page.getByTestId('audio-premium-pill')).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, `session-free-${lang}-${width}.png`), animations: 'disabled' });
      });
    }
  }
});
