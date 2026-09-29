import { test, expect, type Page } from '@playwright/test';
import path from 'path';
import { makeFakeJwt } from './helpers/grammarBento';
import { mockPractice, type PracticeMock } from './helpers/practiceBento';
import { ARTICLES, mockArticles } from './helpers/articlesBento';

// Plan #55 — evidence screenshots of the practice and articles bento layouts.
// Every state × RU/EN × 1280/375 (admin: 1280 only), fully mocked API. Each shot
// also asserts no horizontal overflow.

const DIR = path.join(__dirname, '..', '..', 'temp_files', 'screenshots', 'plan_55-56_bento-effort-radar', 'practice-articles');
const LANGS = ['ru', 'en'] as const;
const WIDTHS = [1280, 375];

const PARTIAL = { 101: 1, 102: 0.9, 103: 0.5, 104: 'L', 105: 'L', 106: 'L', 107: 'L', 108: 'L', 109: 'L', 110: 'L' } as const;
const ALL_CONST = { 101: 1, 102: 0.9, 103: 0.8, 104: 0.7, 105: 0.9, 106: 0.8, 107: 0.8, 108: 0.9, 109: 0.8, 110: 0.9 } as const;
const READING = { 201: 1, 202: 0.5, 203: 'L' } as const;

async function shot(page: Page, name: string, lang: string, width: number) {
  await page.waitForTimeout(300); // let transitions settle
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, 'horizontal overflow').toBeLessThanOrEqual(0);
  await page.screenshot({ path: path.join(DIR, `${name}-${lang}-${width}.png`), fullPage: true });
}

const PRACTICE: Record<string, { mock: Omit<PracticeMock, 'lang' | 'width'>; url?: string; act?: (page: Page) => Promise<void> }> = {
  'practice-none': { mock: { enrolled: [] } },
  'practice-guest': { mock: { enrolled: [], guest: true } },
  'practice-some': { mock: { enrolled: [1], scores: PARTIAL } },
  'practice-all': { mock: { enrolled: [1, 2], scores: { ...PARTIAL, ...READING } } },
  'practice-nothing-left': { mock: { enrolled: [1], scores: ALL_CONST } },
  'practice-enroll-error': {
    mock: { enrolled: [], enrollStatus: 500 },
    act: async (page) => {
      await page.getByTestId('hero-start-practice').click();
      await expect(page.getByTestId('practice-action-error')).toBeVisible();
    },
  },
  'practice-premium-wall-403': {
    mock: { enrolled: [1], scores: { ...ALL_CONST, 110: null }, premium: true, examStatus: 403 },
    url: '/dashboard/practice/1?test=110',
    act: async (page) => { await expect(page.getByTestId('practice-premium-wall')).toBeVisible(); },
  },
  'practice-direct-reading': {
    mock: { enrolled: [2] },
    url: '/dashboard/practice/2?test=201',
    act: async (page) => { await expect(page.getByText('Labas! Čia mano draugas Jonas.')).toBeVisible(); },
  },
};

for (const [state, { mock, url, act }] of Object.entries(PRACTICE)) {
  for (const lang of LANGS) {
    for (const width of WIDTHS) {
      test(`${state} ${lang} ${width}`, async ({ page }) => {
        await mockPractice(page, { ...mock, lang, width });
        await page.goto(url ?? '/dashboard/practice');
        if (act) await act(page);
        else await expect(page.getByTestId('featured-card')).toBeVisible();
        await shot(page, state, lang, width);
      });
    }
  }
}

const ARTICLE_STATES: Record<string, { articles: unknown[]; url: string }> = {
  'articles-all': { articles: ARTICLES.filter((a) => a.theme), url: '/dashboard/articles' },
  'articles-one-category': { articles: ARTICLES, url: '/dashboard/articles?category=learning_materials' },
  'articles-with-other': { articles: ARTICLES, url: '/dashboard/articles' },
};

for (const [state, { articles, url }] of Object.entries(ARTICLE_STATES)) {
  for (const lang of LANGS) {
    for (const width of WIDTHS) {
      test(`${state} ${lang} ${width}`, async ({ page }) => {
        await mockArticles(page, { lang, width, articles });
        await page.goto(url);
        await expect(page.getByTestId('articles-hero-count')).toHaveText(String(articles.length));
        await shot(page, state, lang, width);
      });
    }
  }
}

// ── Admin (1280 only) ─────────────────────────────────────────────────────────

async function adminSetup(page: Page, lang: string) {
  await page.addInitScript(([t, l]) => {
    localStorage.setItem('fluent_token', t);
    localStorage.setItem('fluent_lang', l);
    localStorage.setItem('cookie_consent', 'accepted');
  }, [makeFakeJwt(), lang] as const);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.route('**/api/**', (r) => r.fulfill({ json: [] }));
  await page.route('**/api/billing/config', (r) => r.fulfill({ json: { enabled: true } }));
  await page.route('**/api/me/quota', (r) => r.fulfill({ json: {
    is_premium: false, premium_active: false, premium_until: null, sessions_today: 0,
    daily_limit: 10, is_admin: true, is_superadmin: true } }));
}

const ADMIN_TEST = {
  id: 110, category_id: 1, title_ru: 'Baigiamasis egzaminas', title_en: 'Final Exam', description_ru: null,
  description_en: null, lesson_text_lt: null, question_count: 30, pass_threshold: 0.75, status: 'published',
  is_premium: false, section_ru: 'Итоговые тесты', section_en: 'Final tests', is_final: true,
  created_by: null, sort_order: 32, total_questions: 120, active_questions: 120,
};

for (const lang of LANGS) {
  const pick = (ru: string, en: string) => (lang === 'en' ? en : ru);

  test(`admin-test-section-final ${lang} 1280`, async ({ page }) => {
    await adminSetup(page, lang);
    await page.route('**/api/admin/practice/categories', (r) => r.fulfill({ json: [
      { id: 1, name_ru: 'Конституция', name_en: 'Constitution', description_ru: null, description_en: null,
        source_url: null, sort_order: 0, total_tests: 33, published_tests: 33 }] }));
    await page.route('**/api/admin/practice/categories/1/tests', (r) => r.fulfill({ json: [ADMIN_TEST] }));
    await page.goto('/dashboard/admin');
    await page.getByRole('button', { name: pick('Контент', 'Content'), exact: true }).click();
    await page.getByRole('button', { name: pick('Практика', 'Tests'), exact: true }).click();
    await page.getByText(pick('Конституция', 'Constitution'), { exact: true }).first().click();
    await page.getByRole('button', { name: pick('Редактировать', 'Edit'), exact: true }).first().click();
    await expect(page.getByTestId('admin-test-section-ru')).toHaveValue('Итоговые тесты');
    await expect(page.getByTestId('admin-test-section-en')).toHaveValue('Final tests');
    await expect(page.getByTestId('admin-test-is-final')).toBeChecked();
    await shot(page, 'admin-test-section-final', lang, 1280);
  });

  test(`admin-article-theme ${lang} 1280`, async ({ page }) => {
    await adminSetup(page, lang);
    await page.route('**/api/admin/articles/verb-intro', (r) => r.fulfill({ json: {
      id: 1, slug: 'verb-intro', title_ru: 'Глагол в литовском языке: введение', title_en: 'Lithuanian Verbs: Introduction',
      body_ru: 'Текст', body_en: 'Text', tags: '', category: 'learning_materials', theme: 'verbs',
      published: true, show_in_footer: false } }));
    await page.goto('/dashboard/admin/articles/verb-intro/edit');
    await expect(page.getByTestId('article-theme-select')).toHaveValue('verbs');
    await shot(page, 'admin-article-theme', lang, 1280);
  });
}
