import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';

// Regression test for issue #148: the site was in English but /dashboard/phrases/11
// showed only Russian translations. Two causes — program 11 had translation_en = NULL
// on all 181 rows, and the program detail page never imported useT at all, so even
// programs that *did* have English rendered Russian.
// See plans/triage/issue-148-phrases-english-translations-missing.md

function makeFakeJwt(name: string): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = btoa(JSON.stringify({ email: 'test@test.com', name, exp: 9999999999 }));
  return `${header}.${payload}.fakesignature`;
}

const CYRILLIC = /[Ѐ-ӿ]/;

const PROGRAM = {
  id: 11,
  title: 'Sékmės! A1.1 — Фразы',
  title_en: 'Sékmės! A1.1 — Phrases',
  description: 'Фразы из учебника литовского языка Sékmės! A1.1, главы 1–9.',
  description_en: 'Phrases from the Lithuanian textbook Sékmės! A1.1, chapters 1–9.',
  difficulty: 1,
  phrases: [
    {
      id: 210, text: 'Labas rytas!', translation: 'Доброе утро!', translation_en: 'Good morning!',
      chapter: 1, chapter_title: 'Chapter 1: What is your name?', position: 0, lesson_stage: 0,
    },
    {
      id: 211, text: 'Laba diena!', translation: 'Добрый день!', translation_en: 'Good afternoon!',
      chapter: 1, chapter_title: 'Chapter 1: What is your name?', position: 1, lesson_stage: 1,
    },
    {
      id: 212, text: 'Ačiū!', translation: 'Спасибо!', translation_en: 'Thank you!',
      chapter: 1, chapter_title: 'Chapter 1: What is your name?', position: 2, lesson_stage: 2,
    },
  ],
};

async function open(page: Page, lang: 'ru' | 'en') {
  await page.addInitScript(([token, l]) => {
    localStorage.setItem('fluent_token', token);
    localStorage.setItem('fluent_lang', l);
  }, [makeFakeJwt('Test User'), lang] as const);
  await page.route('**/api/phrase-programs/11', (route) => route.fulfill({ json: PROGRAM }));
  await page.goto('/dashboard/phrases/11');
  await expect(page.getByTestId('phrase-translation').first()).toBeVisible({ timeout: 10000 });
}

test.describe('Issue #148 — phrases page respects the selected language', () => {
  test('English UI shows English translations, not Russian', async ({ page }) => {
    await open(page, 'en');

    const cells = page.getByTestId('phrase-translation');
    await expect(cells).toHaveCount(PROGRAM.phrases.length);

    const texts = await cells.allInnerTexts();
    expect(texts).toEqual(['Good morning!', 'Good afternoon!', 'Thank you!']);
    for (const t of texts) {
      expect(t, `"${t}" should not contain Cyrillic in EN mode`).not.toMatch(CYRILLIC);
    }
  });

  test('English UI translates the page chrome and program title', async ({ page }) => {
    await open(page, 'en');

    await expect(page.getByRole('heading', { name: PROGRAM.title_en })).toBeVisible();
    await expect(page.getByText(PROGRAM.description_en)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Learn all' })).toBeVisible();
    await expect(page.getByText('Phrase', { exact: true })).toBeVisible();
    await expect(page.getByText('Translation', { exact: true })).toBeVisible();
    await expect(page.getByText('Level', { exact: true })).toBeVisible();

    // Stage labels come from i18n now, not a hardcoded Russian map
    await expect(page.getByText('New', { exact: true })).toBeVisible();
    await expect(page.getByText('In progress', { exact: true })).toBeVisible();
    await expect(page.getByText('Learned', { exact: true })).toBeVisible();

    // No Russian chrome should survive anywhere in the main content
    const main = (await page.locator('main').innerText())
      .replace(PROGRAM.title, '')
      .replace(PROGRAM.description, '');
    expect(main).not.toMatch(CYRILLIC);
  });

  test('Russian UI still shows Russian', async ({ page }) => {
    await open(page, 'ru');

    const texts = await page.getByTestId('phrase-translation').allInnerTexts();
    expect(texts).toEqual(['Доброе утро!', 'Добрый день!', 'Спасибо!']);
    await expect(page.getByRole('heading', { name: PROGRAM.title })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Учить всё' })).toBeVisible();
  });

  test('falls back to Russian when a phrase has no English yet', async ({ page }) => {
    // The fallback introduced by issue #117 must survive — a blank cell is worse
    // than showing the other language.
    await page.addInitScript((token) => {
      localStorage.setItem('fluent_token', token);
      localStorage.setItem('fluent_lang', 'en');
    }, makeFakeJwt('Test User'));
    await page.route('**/api/phrase-programs/11', (route) =>
      route.fulfill({
        json: {
          ...PROGRAM,
          phrases: [{ ...PROGRAM.phrases[0], translation_en: null }],
        },
      }),
    );

    await page.goto('/dashboard/phrases/11');
    await expect(page.getByTestId('phrase-translation')).toHaveText('Доброе утро!');
  });
});
