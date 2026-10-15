import { test, expect, type Page } from '@playwright/test';
import path from 'path';
import { daysAgo, mockGrammar, type GrammarMock } from './helpers/grammarBento';
import { mockPractice, type PracticeMock } from './helpers/practiceBento';
import { mockArticles } from './helpers/articlesBento';
import { LONG_GREETING, mockShellPages } from './helpers/shellPages';

// #66 — the Грамматика / Практика overview + program page states, each checked and shot in
// RU + EN at 1280 and 375 px: new user, in progress (free), Premium, finished + «Пора
// повторить», a locked row tapped, the weakest-test retake. Plus the compact hero on the other
// top-nav pages (Слова with a long greeting, Фразы purple, Статьи). Fully mocked API, incl.
// /api/billing/config. Every shot asserts no sideways scroll; at 375 the page's main button
// must be on the first phone screen (375×667).
// Shots: temp_files/screenshots/plan_66_grammar-practice-overview/<state>-<lang>-<width>.png

const DIR = path.join(__dirname, '..', '..', 'temp_files', 'screenshots', 'plan_66_grammar-practice-overview');
const LANGS = ['ru', 'en'] as const;
const WIDTHS = [1280, 375];
type Lang = (typeof LANGS)[number];

const L = 'L' as const;
const LOCK_REST = Object.fromEntries([5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17].map((id) => [id, L]));
const G_FREE = { 1: 0.9, 2: 0.8, 3: 0.9, 4: 0.5, ...LOCK_REST };
const G_PREMIUM = { 1: 0.9, 2: 0.8, 3: 0.9 }; // nothing locked
const G_P3_DONE = { 20: 0.9, 21: 0.8 };

const P_PARTIAL = { 101: 1, 102: 0.9, 103: 0.5, 104: L, 105: L, 106: L, 107: L, 108: L, 109: L, 110: L };
const P_NEW = { 103: L, 104: L, 105: L, 106: L, 107: L, 108: L, 109: L, 110: L };
const P_ALL_CONST = { 101: 1, 102: 0.9, 103: 0.8, 104: 0.7, 105: 0.9, 106: 0.8, 107: 0.8, 108: 0.9, 109: 0.8, 110: 0.9 };
const P_ALL_READING = { 201: 1, 202: 1, 203: 0.9 };
const P_READING_PART = { 201: 0.5, 202: L, 203: L };

const T = {
  ru: { continue: 'Продолжить', premium: 'Premium', retake: 'Повторить · 6 вопросов' },
  en: { continue: 'Continue', premium: 'Premium', retake: 'Review · 6 questions' },
};

interface Ctx { lang: Lang; width: number; phone: boolean }
interface State {
  mock: (page: Page, lang: Lang, width: number) => Promise<unknown>;
  url: string;
  check: (page: Page, ctx: Ctx) => Promise<void>;
  mainButton?: string; // testid that must be on the first phone screen
}

const grammar = (m: Omit<GrammarMock, 'lang' | 'width'>) => (page: Page, lang: Lang, width: number) => mockGrammar(page, { ...m, lang, width });
const practice = (m: Omit<PracticeMock, 'lang' | 'width'>) => (page: Page, lang: Lang, width: number) => mockPractice(page, { ...m, lang, width });

const onlyOneContinue = async (page: Page, { lang }: Ctx) => {
  const name = T[lang].continue;
  await expect(page.getByRole('button', { name, exact: true }).or(page.getByRole('link', { name, exact: true }))).toHaveCount(1);
};

const STATES: Record<string, State> = {
  // ── Грамматика ─────────────────────────────────────────────────────────────
  'grammar-new': {
    mock: grammar({ enrolled: [] }), url: '/dashboard/grammar', mainButton: 'hero-start-cases',
    check: async (page) => {
      // One start button, a catalogue, nothing else to decide.
      await expect(page.getByTestId('stats-card-grammar').getByRole('button')).toHaveCount(1);
      await expect(page.getByTestId('catalog-card-1')).toBeVisible();
      await expect(page.getByTestId('in-progress-section')).toHaveCount(0);
      await expect(page.getByTestId('completed-section')).toHaveCount(0);
    },
  },
  'grammar-added': {
    mock: grammar({ enrolled: [] }), url: '/dashboard/grammar', mainButton: 'program-continue',
    check: async (page) => {
      await page.getByTestId('catalog-card-1-add').click();
      await expect(page.getByTestId('added-banner')).toBeVisible();
      await expect(page.getByTestId('program-header')).toBeVisible();
    },
  },
  'grammar-in-progress': {
    mock: grammar({ enrolled: [1, 2], scores: G_FREE, lastResult: { 1: daysAgo(1) } }), url: '/dashboard/grammar', mainButton: 'hero-continue',
    check: async (page, ctx) => {
      await expect(page.getByTestId('program-card-1')).toBeVisible();
      await expect(page.getByTestId('program-card-2')).toBeVisible();
      await expect(page.getByTestId('hero-next')).toContainText('Kilmininkas Vns.');
      await onlyOneContinue(page, ctx);
    },
  },
  'grammar-program-free': {
    mock: grammar({ enrolled: [1, 2], scores: G_FREE }), url: '/dashboard/grammar?program=1', mainButton: 'program-continue',
    check: async (page, ctx) => {
      await expect(page.getByTestId('premium-link')).toBeVisible();
      await expect(page.getByTestId('fold-locked')).toBeVisible();
      await expect(page.getByTestId('lock-reason')).toHaveCount(2); // the level + the first locked topic
      await expect(page.getByTestId('passed-card')).not.toHaveAttribute('open', '');
      await onlyOneContinue(page, ctx);
    },
  },
  'grammar-program-locked-tap': {
    mock: grammar({ enrolled: [1], scores: G_FREE }), url: '/dashboard/grammar?program=1',
    check: async (page) => {
      const row = page.getByTestId('remaining-card').getByTestId('topic-row').nth(2);
      await expect(row.getByTestId('lock-reason')).toHaveCount(0);
      await row.click();
      await expect(row.getByTestId('lock-reason')).toBeVisible();
      await row.scrollIntoViewIfNeeded();
    },
  },
  'grammar-program-premium': {
    mock: grammar({ enrolled: [1], scores: G_PREMIUM, premium: true }), url: '/dashboard/grammar?program=1', mainButton: 'program-continue',
    check: async (page, { phone }) => {
      await expect(page.getByTestId('lesson-locked')).toHaveCount(0);
      await expect(page.getByTestId('premium-link')).toHaveCount(0);
      // The open-topic fold starts open on desktop, folded on a phone.
      const fold = page.getByTestId('fold-open');
      if (phone) await expect(fold).not.toHaveAttribute('open', '');
      else await expect(fold).toHaveAttribute('open', '');
    },
  },
  'grammar-finished-due': {
    mock: grammar({ enrolled: [1, 3], scores: { ...G_FREE, ...G_P3_DONE }, lastResult: { 1: daysAgo(1), 3: daysAgo(10) } }),
    url: '/dashboard/grammar', mainButton: 'hero-continue',
    check: async (page) => {
      await page.getByTestId('completed-section').locator('summary').click();
      const row = page.getByTestId('completed-row-3');
      await expect(row.getByTestId('due-tag')).toBeVisible();
      await expect(row.getByTestId('completed-review')).toBeVisible();
      await expect(page.getByTestId('program-card-3')).toHaveCount(0); // a row, not a card
    },
  },
  'grammar-program-finished': {
    mock: grammar({ enrolled: [3], scores: G_P3_DONE, lastResult: { 3: daysAgo(10) } }), url: '/dashboard/grammar?program=3', mainButton: 'program-review',
    check: async (page) => {
      await expect(page.getByTestId('program-next').getByTestId('due-tag')).toBeVisible();
      await expect(page.getByTestId('passed-card')).toHaveAttribute('open', '');
      await expect(page.getByTestId('remaining-card')).toHaveCount(0);
    },
  },
  'grammar-all-done': {
    mock: grammar({ enrolled: [3], scores: G_P3_DONE, lastResult: { 3: daysAgo(10) } }), url: '/dashboard/grammar', mainButton: 'hero-review',
    check: async (page) => {
      await expect(page.getByTestId('hero-continue')).toHaveCount(0);
      await expect(page.getByTestId('completed-row-3')).toBeHidden(); // folded by default
      await page.getByTestId('completed-section').locator('summary').click();
      await expect(page.getByTestId('completed-row-3')).toBeVisible();
    },
  },

  // ── Практика ───────────────────────────────────────────────────────────────
  'practice-new': {
    mock: practice({ enrolled: [] }), url: '/dashboard/practice', mainButton: 'hero-start-practice',
    check: async (page) => {
      await expect(page.getByTestId('hero-start-a2')).toBeVisible();
      await expect(page.getByTestId('catalogue-group-cit')).toBeVisible();
      await expect(page.getByTestId('catalogue-group-a2')).toBeVisible();
      await expect(page.getByTestId('in-progress-section')).toHaveCount(0);
    },
  },
  'practice-added': {
    mock: practice({ enrolled: [], scores: P_NEW }), url: '/dashboard/practice', mainButton: 'program-continue',
    check: async (page) => {
      await page.getByTestId('hero-start-practice').click();
      await expect(page.getByTestId('added-banner')).toBeVisible();
      // A new enrolment starts with the sample test.
      await expect(page.getByTestId('test-row').first()).toHaveAttribute('data-state', 'next');
    },
  },
  'practice-in-progress': {
    mock: practice({ enrolled: [1, 2], scores: { ...P_PARTIAL, ...P_READING_PART }, lastResult: { 1: daysAgo(1), 2: daysAgo(3) } }),
    url: '/dashboard/practice', mainButton: 'hero-continue',
    check: async (page, ctx) => {
      await expect(page.getByTestId('program-card-1')).toBeVisible();
      await expect(page.getByTestId('program-card-2')).toBeVisible();
      await onlyOneContinue(page, ctx);
    },
  },
  'practice-program-free': {
    mock: practice({ enrolled: [1, 2], scores: { ...P_PARTIAL, ...P_READING_PART } }), url: '/dashboard/practice?program=1', mainButton: 'program-continue',
    check: async (page, { lang }) => {
      await expect(page.getByTestId('practice-block')).toHaveCount(3);
      const exam = page.getByTestId('remaining-card').getByTestId('test-row').last(); // the pinned exam
      await expect(exam).toContainText(T[lang].premium); // free user
    },
  },
  'practice-program-locked-tap': {
    mock: practice({ enrolled: [2], scores: P_READING_PART }), url: '/dashboard/practice?program=2', mainButton: 'program-continue',
    check: async (page) => {
      const row = page.getByTestId('remaining-card').getByTestId('test-row').nth(2);
      await expect(row.getByTestId('lock-reason')).toHaveCount(0);
      await row.click();
      await expect(row.getByTestId('lock-reason')).toBeVisible();
    },
  },
  'practice-program-premium': {
    mock: practice({ enrolled: [1], scores: P_PARTIAL, premium: true }), url: '/dashboard/practice?program=1', mainButton: 'program-continue',
    check: async (page, { lang }) => {
      const exam = page.getByTestId('remaining-card').getByTestId('test-row').last(); // the pinned exam
      await expect(exam).toContainText(lang === 'ru' ? 'Итоговый экзамен' : 'Final Exam');
      await expect(exam).not.toContainText(T[lang].premium);
    },
  },
  'practice-finished-due': {
    mock: practice({ enrolled: [1, 2], scores: { ...P_PARTIAL, ...P_ALL_READING }, lastResult: { 1: daysAgo(1), 2: daysAgo(9) } }),
    url: '/dashboard/practice', mainButton: 'hero-continue',
    check: async (page, { lang }) => {
      await page.getByTestId('completed-section').locator('summary').click();
      const row = page.getByTestId('completed-row-2');
      await expect(row.getByTestId('due-tag')).toBeVisible();
      await expect(row.getByTestId('completed-review')).toHaveText(T[lang].retake);
      await expect(page.getByTestId('program-card-2')).toHaveCount(0);
    },
  },
  'practice-weakest-retake': {
    mock: practice({ enrolled: [1, 2], scores: { ...P_PARTIAL, ...P_ALL_READING }, lastResult: { 1: daysAgo(1), 2: daysAgo(9) } }),
    url: '/dashboard/practice',
    check: async (page) => {
      await page.getByTestId('completed-section').locator('summary').click();
      await page.getByTestId('completed-row-2').getByTestId('completed-review').click();
      await expect(page).toHaveURL(/\/dashboard\/practice\/2\/?\?test=203$/); // the weakest passed test
      await expect(page.getByText('Kokia yra Lietuvos sostinė?').first()).toBeVisible(); // its exam opened
    },
  },
  'practice-program-finished': {
    mock: practice({ enrolled: [2], scores: P_ALL_READING, lastResult: { 2: daysAgo(9) } }), url: '/dashboard/practice?program=2', mainButton: 'program-review',
    check: async (page) => {
      await expect(page.getByTestId('passed-card')).toHaveAttribute('open', '');
      await expect(page.getByTestId('remaining-card')).toHaveCount(0);
    },
  },
  'practice-all-done': {
    mock: practice({ enrolled: [1, 2], scores: { ...P_ALL_CONST, ...P_ALL_READING }, premium: true, lastResult: { 1: daysAgo(2), 2: daysAgo(12) } }),
    url: '/dashboard/practice', mainButton: 'hero-review',
    check: async (page) => {
      await expect(page.getByTestId('hero-continue')).toHaveCount(0);
      await expect(page.getByTestId('completed-section').locator('[data-testid^="completed-row-"]')).toHaveCount(2);
    },
  },

  // ── The other top-nav pages: the same compact hero ─────────────────────────
  'shell-lists-long-greeting': {
    mock: (page, lang, width) => mockShellPages(page, { lang, width, longGreeting: true }), url: '/dashboard/lists',
    check: async (page) => {
      await expect(page.getByTestId('mascot-greeting')).toHaveText(LONG_GREETING.lithuanian);
      const card = (await page.getByTestId('stats-card-words').boundingBox())!;
      // The inline text box, so a word overflowing its bubble counts too.
      for (const id of ['mascot-greeting', 'mascot-translation']) {
        const t = (await page.getByTestId(id).boundingBox())!;
        expect(t.x + t.width, `${id} stays inside the card`).toBeLessThanOrEqual(card.x + card.width);
      }
    },
  },
  'shell-phrases': {
    mock: (page, lang, width) => mockShellPages(page, { lang, width }), url: '/dashboard/phrases',
    check: async (page) => {
      const card = page.getByTestId('stats-card-phrases');
      await expect(card).toBeVisible();
      await expect(card.locator('a').first()).toHaveCSS('background-color', 'rgb(147, 51, 234)'); // phrases purple #9333ea
    },
  },
  'shell-articles': {
    mock: (page, lang, width) => mockArticles(page, { lang, width }), url: '/dashboard/articles', mainButton: 'articles-read-newest',
    check: async (page) => { await expect(page.getByTestId('articles-hero')).toBeVisible(); },
  },
};

async function shot(page: Page, name: string, lang: string, width: number) {
  await page.waitForTimeout(300); // let transitions settle
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, 'horizontal overflow').toBeLessThanOrEqual(0);
  await page.screenshot({ path: path.join(DIR, `${name}-${lang}-${width}.png`), fullPage: true });
}

for (const [name, s] of Object.entries(STATES)) {
  for (const lang of LANGS) {
    for (const width of WIDTHS) {
      test(`${name} ${lang} ${width}`, async ({ page }) => {
        await s.mock(page, lang, width);
        const phone = width < 860;
        if (phone) await page.setViewportSize({ width, height: 667 });
        await page.goto(s.url);
        await s.check(page, { lang, width, phone });
        if (phone && s.mainButton) {
          await page.evaluate(() => window.scrollTo(0, 0));
          await expect(page.getByTestId(s.mainButton), 'main button on the first phone screen').toBeInViewport();
        }
        await shot(page, name, lang, width);
      });
    }
  }
}
