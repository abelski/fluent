import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';

// Regression test for issue #149: chapter titles were stored English-only in
// `chapter_title`, so Russian users saw "Chapter 1: What is your name?" as the
// chapter header. The split into chapter_title / chapter_title_en must now be
// honoured on both the program detail page and the phrases hub.
// See plans/triage/issue-149-russian-chapter-titles-missing.md

function makeFakeJwt(name: string): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = btoa(JSON.stringify({ email: 'test@test.com', name, exp: 9999999999 }));
  return `${header}.${payload}.fakesignature`;
}

const RU_TITLE = 'Глава 1: Как вас зовут?';
const EN_TITLE = 'Chapter 1: What is your name?';

const PROGRAM = {
  id: 11,
  title: 'Sékmės! A1.1 — Фразы',
  title_en: 'Sékmės! A1.1 — Phrases',
  description: null,
  description_en: null,
  difficulty: 1,
  phrases: [
    {
      id: 210, text: 'Labas rytas!', translation: 'Доброе утро!', translation_en: 'Good morning!',
      chapter: 1, chapter_title: RU_TITLE, chapter_title_en: EN_TITLE,
      position: 0, lesson_stage: 0,
    },
    {
      id: 211, text: 'Laba diena!', translation: 'Добрый день!', translation_en: 'Good afternoon!',
      chapter: 1, chapter_title: RU_TITLE, chapter_title_en: EN_TITLE,
      position: 1, lesson_stage: 0,
    },
  ],
};

async function open(page: Page, lang: 'ru' | 'en', program: unknown = PROGRAM) {
  await page.addInitScript(([token, l]) => {
    localStorage.setItem('fluent_token', token);
    localStorage.setItem('fluent_lang', l);
  }, [makeFakeJwt('Test User'), lang] as const);
  await page.route('**/api/phrase-programs/11', (route) => route.fulfill({ json: program }));
  await page.goto('/dashboard/phrases/11');
  await expect(page.getByTestId('phrase-translation').first()).toBeVisible({ timeout: 10000 });
}

test.describe('Issue #149 — chapter titles follow the selected language', () => {
  test('Russian UI shows the Russian chapter title', async ({ page }) => {
    await open(page, 'ru');

    await expect(page.getByText(RU_TITLE)).toBeVisible();
    await expect(page.getByText(EN_TITLE)).toHaveCount(0);
  });

  test('English UI shows the English chapter title', async ({ page }) => {
    await open(page, 'en');

    await expect(page.getByText(EN_TITLE)).toBeVisible();
    await expect(page.getByText(RU_TITLE)).toHaveCount(0);
  });

  test('falls back to the Russian title when no English one exists', async ({ page }) => {
    // Mirrors the issue-#117 fallback rule: show the other language rather than
    // an empty chapter header.
    await open(page, 'en', {
      ...PROGRAM,
      phrases: PROGRAM.phrases.map((p) => ({ ...p, chapter_title_en: null })),
    });

    await expect(page.getByText(RU_TITLE)).toBeVisible();
  });

  // ── Phrases hub ────────────────────────────────────────────────────────────
  // The hub caches chapter summaries in component state, so the language must be
  // applied at render time, not baked in when the detail response is stored.

  async function openHub(page: Page, lang: 'ru' | 'en') {
    await page.addInitScript(([token, l]) => {
      localStorage.setItem('fluent_token', token);
      localStorage.setItem('fluent_lang', l);
    }, [makeFakeJwt('Test User'), lang] as const);
    await page.route('**/api/me/quota', (route) =>
      route.fulfill({ json: { is_premium: false, premium_active: false, sessions_today: 0, daily_limit: 10, is_admin: false, is_superadmin: false } }));
    await page.route('**/api/me/stats', (route) => route.fulfill({ json: {} }));
    await page.route('**/api/phrase-programs', (route) =>
      route.fulfill({
        json: [{
          id: 11,
          title: PROGRAM.title,
          title_en: PROGRAM.title_en,
          description: null,
          description_en: null,
          difficulty: 1,
          phrase_count: PROGRAM.phrases.length,
          enrolled: true,
          stage_distribution: { stage0: 2, stage1: 0, stage2: 0 },
        }],
      }));
    await page.route('**/api/phrase-programs/11', (route) => route.fulfill({ json: PROGRAM }));
    await page.goto('/dashboard/phrases');
  }

  test('hub shows the Russian chapter title in RU mode', async ({ page }) => {
    await openHub(page, 'ru');
    await expect(page.getByText(RU_TITLE)).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(EN_TITLE)).toHaveCount(0);
  });

  test('hub shows the English chapter title in EN mode', async ({ page }) => {
    await openHub(page, 'en');
    await expect(page.getByText(EN_TITLE)).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(RU_TITLE)).toHaveCount(0);
  });
});
