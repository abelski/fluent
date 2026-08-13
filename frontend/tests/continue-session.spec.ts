import { test, expect } from '@playwright/test';
import type { Page, Route } from '@playwright/test';

/**
 * "Продолжить занятие" — the combined words → grammar → phrases session.
 * See plans/improvements/active/plan_continue-session-rework.md
 *
 * What this guards:
 *  1. The continue-CTA on `/` renders the design system's TakChevron, not the
 *     retired bespoke PlayIcon triangle, and points at /dashboard/continue.
 *  2. All three phases run back-to-back off ONE payload, ending back on `/`.
 *  3. A user with zero passed grammar lessons simply gets words → phrases —
 *     the missing phase is skipped, never an error screen.
 *  4. The whole combined flow costs exactly ONE daily session, not one per phase.
 *
 * (4) is the core correctness property of the plan, so the mocks below behave
 * like the real backend rather than returning a constant: every endpoint that
 * charges `quota_check_and_increment` server-side (/me/continue-session,
 * /lists/{id}/study, /grammar/lessons/{id}/tasks) pushes onto `charged`, and
 * /api/me/quota reports `sessions_today` derived from it. A frontend that
 * re-fetched a phase instead of walking the single payload would therefore show
 * up as a second charge in the quota banner, exactly as it would in production.
 */

const BASE_SESSIONS_TODAY = 3;
const DAILY_LIMIT = 10;

function makeFakeJwt(): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = btoa(JSON.stringify({ email: 'test@test.com', name: 'Test User', exp: 9999999999 }));
  return `${header}.${payload}.fakesignature`;
}

const WORD = {
  id: 9001,
  lithuanian: 'katė',
  accented: null,
  translation_en: 'cat',
  translation_ru: 'кошка',
  hint: null,
  status: 'known',
};

const GRAMMAR_TASK = {
  type: 'declension',
  prompt_lt: 'katė',
  prompt_ru: 'кошка',
  case_name: 'Kilmininkas',
  number: 'vienaskaita',
  answer: 'katės',
};

// lesson_stage 0 → the intro card, the shortest honest path through PhraseSession.
const PHRASE = {
  id: 7101,
  text: 'Labas rytas',
  translation: 'Доброе утро',
  translation_en: null,
  alt_texts: null,
  lesson_stage: 0,
  blank_word: 'rytas',
  mcq_distractors: ['vakaras', 'diena', 'naktis'],
  word_tiles: null,
  translation_tiles: null,
  translation_en_tiles: null,
  next_review: null,
};

const STATS = {
  known: 12,
  learning: 3,
  total_studied: 15,
  streak: 2,
  mistakes: 0,
  grammar_lessons_passed: 1,
  practice_exams_completed: 0,
};

const SETTINGS = {
  words_per_session: 10,
  phrases_per_session: 10,
  new_words_ratio: 0.7,
  lesson_mode: 'thorough',
  use_question_timer: false,
  question_timer_seconds: 5,
};

interface FakeBackend {
  /** One entry per request that would charge a daily session on the real backend. */
  charged: string[];
  /** Phase endpoints that must never be hit during the combined flow. */
  perPhaseFetches: string[];
  /** Grammar results actually saved — proves the phase records progress as usual. */
  grammarResults: { lessonId: string; body: unknown }[];
  /** SM-2 progress writes, which must happen exactly as in the standalone flows. */
  wordProgress: number;
  phraseProgress: number;
}

function continuePayload(withGrammar: boolean) {
  return {
    phases: withGrammar ? ['words', 'grammar', 'phrases'] : ['words', 'phrases'],
    words: [WORD],
    grammar: withGrammar
      ? { lesson_id: 3, level: 'basic', rules: [], hint: null, tasks: [GRAMMAR_TASK] }
      : null,
    phrases: [PHRASE],
    needs_enrollment: [],
  };
}

async function setup(
  page: Page,
  opts: { withGrammar: boolean; limitReached?: boolean; needsEnrollment?: string[] },
): Promise<FakeBackend> {
  const fake: FakeBackend = {
    charged: [],
    perPhaseFetches: [],
    grammarResults: [],
    wordProgress: 0,
    phraseProgress: 0,
  };

  await page.addInitScript((token) => {
    localStorage.setItem('fluent_token', token);
    localStorage.setItem('fluent_lang', 'ru');
    localStorage.setItem('fluent_complexity', 'medium');
  }, makeFakeJwt());

  // ── Home page + chrome ──────────────────────────────────────────────────────
  await page.route('**/api/me/stats', (r) => r.fulfill({ json: STATS }));
  await page.route('**/api/me/activity-calendar', (r) => r.fulfill({ json: { dates: [] } }));
  await page.route('**/api/news**', (r) => r.fulfill({ json: [] }));
  await page.route('**/api/leaderboard**', (r) => r.fulfill({ json: [] }));
  await page.route('**/api/me/lists-progress', (r) => r.fulfill({ json: {} }));
  await page.route('**/api/me/settings', (r) => r.fulfill({ json: SETTINGS }));

  // Quota is derived, not constant — see the file header.
  await page.route('**/api/me/quota', (r) =>
    r.fulfill({
      json: {
        is_premium: false,
        premium_active: false,
        premium_until: null,
        sessions_today: BASE_SESSIONS_TODAY + fake.charged.length,
        daily_limit: DAILY_LIMIT,
        is_admin: false,
      },
    }),
  );

  // ── The one call that starts (and pays for) the combined session ────────────
  await page.route('**/api/me/continue-session', (r) => {
    if (opts.limitReached) {
      // What quota_check_and_increment() raises when the daily limit is used up.
      return r.fulfill({
        status: 429,
        json: { detail: { code: 'daily_limit_reached', limit: DAILY_LIMIT, sessions_today: DAILY_LIMIT } },
      });
    }
    if (opts.needsEnrollment && opts.needsEnrollment.length > 0) {
      // The hard gate: nothing is charged, no phase content is sent.
      return r.fulfill({
        json: { phases: [], words: [], grammar: null, phrases: [], needs_enrollment: opts.needsEnrollment },
      });
    }
    fake.charged.push('/me/continue-session');
    return r.fulfill({ json: continuePayload(opts.withGrammar) });
  });

  // ── Per-item progress recording (never charges quota) ───────────────────────
  await page.route('**/api/words/*/progress', (r) => {
    fake.wordProgress += 1;
    return r.fulfill({ json: {} });
  });
  await page.route('**/api/phrases/*/progress', (r) => {
    fake.phraseProgress += 1;
    return r.fulfill({ json: { lesson_stage: 1, next_review: null, interval: 1 } });
  });
  await page.route('**/api/grammar/lessons/*/results', (r) => {
    const lessonId = new URL(r.request().url()).pathname.split('/').at(-2) ?? '';
    fake.grammarResults.push({ lessonId, body: r.request().postDataJSON() });
    return r.fulfill({ json: { ok: true } });
  });

  // ── Endpoints the combined flow must not touch ──────────────────────────────
  // The first two charge quota server-side; the last two would let the client
  // re-decide a phase's size. Any hit here is a bug, but serve them anyway so the
  // failure surfaces as an explicit assertion rather than a console error.
  const charging = async (route: Route) => {
    fake.charged.push(new URL(route.request().url()).pathname);
    await route.fulfill({ json: { words: [], distractors: [] } });
  };
  await page.route('**/api/lists/*/study**', charging);
  await page.route('**/api/grammar/lessons/*/tasks**', charging);

  const perPhase = async (route: Route) => {
    fake.perPhaseFetches.push(new URL(route.request().url()).pathname);
    await route.fulfill({ json: [] });
  };
  await page.route('**/api/review/known**', perPhase);
  await page.route('**/api/phrases/review**', perPhase);

  return fake;
}

// ── Phase drivers ─────────────────────────────────────────────────────────────

/**
 * Flashcard → "Легко" → type the word → match round.
 * Mid-flow (the default): the match round hands off straight to the next phase,
 * no done screen. Only the last phase in the sequence shows one — pass
 * `isLast: true` and the caller asserts/clicks it themselves.
 */
async function playWordPhase(page: Page, opts: { isLast?: boolean } = {}) {
  await page.getByRole('button', { name: 'Легко' }).click({ timeout: 15_000 });

  const input = page.locator('main input[type="text"]').first();
  await expect(input).toBeVisible({ timeout: 10_000 });
  await input.fill(WORD.lithuanian);
  await page.getByRole('button', { name: 'Проверить' }).click();

  await playMatchRound(page);
  if (opts.isLast) {
    await expect(page.getByTestId('done-primary')).toBeVisible({ timeout: 10_000 });
  }
}

/** Answer the single grammar task correctly; the runner then reports the score. */
async function playGrammarPhase(page: Page) {
  const input = page.locator('main input[type="text"]').first();
  await expect(input).toBeVisible({ timeout: 10_000 });
  await input.fill(GRAMMAR_TASK.answer);
  await page.getByRole('button', { name: 'Проверить' }).click();
}

/**
 * Intro card → "Запомнил" → match round.
 * Same mid-flow-vs-last-phase split as playWordPhase — see its comment.
 */
async function playPhrasePhase(page: Page, opts: { isLast?: boolean } = {}) {
  await expect(page.getByTestId('phrase-session-stage0')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText(PHRASE.text)).toBeVisible();
  await page.getByTestId('got-it-btn').click();

  await playMatchRound(page);
  if (opts.isLast) {
    await expect(page.getByTestId('done-primary')).toBeVisible({ timeout: 10_000 });
  }
}

/** Both QuizSession and PhraseSession end in a one-pair match round. */
async function playMatchRound(page: Page) {
  const left = page.getByTestId('match-left-0');
  await expect(left).toBeVisible({ timeout: 15_000 });
  await left.click();
  await page.getByTestId('match-right-0').click();
  await page.getByTestId('match-continue').click({ timeout: 10_000 });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe('Continue-session CTA', () => {
  test('renders the TakChevron glyph, not the retired PlayIcon triangle', async ({ page }) => {
    await setup(page, { withGrammar: true });
    await page.goto('/');

    const cta = page.getByTestId('continue-cta');
    await expect(cta).toBeVisible({ timeout: 10_000 });
    // trailingSlash: true in next.config.js, so the rendered href may carry one.
    await expect(cta).toHaveAttribute('href', /^\/dashboard\/continue\/?$/);
    await expect(cta).toContainText('Продолжить занятие');

    // TakChevron crops TAK's chevron torso — viewBox + polygon are its signature.
    const chevron = cta.locator('svg[viewBox="55 70 93 90"]');
    await expect(chevron).toHaveCount(1);
    await expect(chevron.locator('polygon')).toHaveAttribute(
      'points',
      '55,70 115,70 148,115 115,160 55,160 88,115',
    );

    // The old bespoke triangle must be gone from the badge.
    await expect(cta.locator('path[d="M6 4l14 8-14 8V4z"]')).toHaveCount(0);
  });
});

test.describe('Combined continue session', () => {
  test('runs words → grammar → phrases back-to-back and ends on the home page', async ({ page }) => {
    const fake = await setup(page, { withGrammar: true });
    await page.goto('/dashboard/continue');

    // Phase 1 — words, reusing QuizSession (header label from the review flow).
    // Mid-flow: hands off to grammar right after the match round, no done screen.
    await expect(page.getByText('Повторение выученных', { exact: false })).toBeVisible({ timeout: 15_000 });
    await playWordPhase(page);

    // Phase 2 — grammar, reusing GrammarTaskRunner. Also hands off with no done screen.
    await expect(page.getByText(GRAMMAR_TASK.prompt_lt)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('1 / 1')).toBeVisible();
    await playGrammarPhase(page);

    // Phase 3 — phrases, reusing PhraseSession. Last phase: shows the real done screen.
    await playPhrasePhase(page, { isLast: true });
    await expect(page.getByTestId('done-primary')).toHaveText('Ещё раз');

    // Per-item progress recording is the standalone flows' — a GrammarLessonResult
    // row for grammar, SM-2 writes for the word and the phrase.
    expect(fake.grammarResults).toEqual([
      { lessonId: '3', body: { score: 1, total: 1 } },
    ]);
    expect(fake.wordProgress).toBeGreaterThan(0);
    expect(fake.phraseProgress).toBeGreaterThan(0);

    // …and the flow ends back on the home page it started from.
    await page.getByRole('link', { name: /Назад к программам/ }).click();
    await expect(page).toHaveURL(/^https?:\/\/[^/]+\/$/, { timeout: 10_000 });
    await expect(page.getByTestId('continue-cta')).toBeVisible({ timeout: 10_000 });

    // One payload for all three phases — no per-phase re-fetch.
    expect(fake.charged).toEqual(['/me/continue-session']);
    expect(fake.perPhaseFetches).toEqual([]);
  });

  test('skips the grammar phase when the user has no passed lessons', async ({ page }) => {
    const fake = await setup(page, { withGrammar: false });
    await page.goto('/dashboard/continue');

    await expect(page.getByText('Повторение выученных', { exact: false })).toBeVisible({ timeout: 15_000 });
    // Sequence collapses to words → phrases: the words phase hands off straight to
    // phrases (not grammar) right after the match round.
    await playWordPhase(page);

    await playPhrasePhase(page, { isLast: true });
    await expect(page.getByTestId('done-primary')).toHaveText('Ещё раз');

    // No grammar UI and no error state anywhere along the way. `case_name` only ever
    // renders on the declension card, so it is a grammar-only tell.
    await expect(page.getByText(GRAMMAR_TASK.case_name)).toHaveCount(0);
    await expect(page.getByText('Нечего повторять')).toHaveCount(0);
    await expect(page.getByTestId('continue-empty')).toHaveCount(0);
    expect(fake.grammarResults).toEqual([]);
    expect(fake.charged).toEqual(['/me/continue-session']);
  });

  test('surfaces the enrollment gate when the user is missing one category, with a link to join one', async ({ page }) => {
    const fake = await setup(page, { withGrammar: true, needsEnrollment: ['grammar'] });
    await page.goto('/dashboard/continue');

    const gate = page.getByTestId('continue-needs-enrollment');
    await expect(gate).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('continue-enroll-grammar')).toHaveAttribute('href', /^\/dashboard\/grammar\/programs\/?$/);
    // Only the missing category gets a link — words/phrases are already enrolled.
    await expect(page.getByTestId('continue-enroll-words')).toHaveCount(0);
    await expect(page.getByTestId('continue-enroll-phrases')).toHaveCount(0);

    // Hard gate: no phase starts, nothing is charged.
    await expect(page.getByTestId('done-primary')).toHaveCount(0);
    await expect(page.getByText(WORD.lithuanian)).toHaveCount(0);
    expect(fake.charged).toEqual([]);
    expect(fake.perPhaseFetches).toEqual([]);
  });

  test('enrollment gate lists all three categories and links to each program page', async ({ page }) => {
    await setup(page, { withGrammar: true, needsEnrollment: ['words', 'grammar', 'phrases'] });
    await page.goto('/dashboard/continue');

    await expect(page.getByTestId('continue-needs-enrollment')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('continue-enroll-words')).toHaveAttribute('href', /^\/dashboard\/lists\/?$/);
    await expect(page.getByTestId('continue-enroll-grammar')).toHaveAttribute('href', /^\/dashboard\/grammar\/programs\/?$/);
    await expect(page.getByTestId('continue-enroll-phrases')).toHaveAttribute('href', /^\/dashboard\/phrases\/?$/);
  });

  test('surfaces the limit-reached screen instead of a free partial session', async ({ page }) => {
    const fake = await setup(page, { withGrammar: true, limitReached: true });
    await page.goto('/dashboard/continue');

    await expect(page.getByText('Лимит на сегодня исчерпан')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('link', { name: 'Получить Premium' })).toHaveAttribute('href', /\/pricing/);

    // No phase may start on the back of a refused session.
    await expect(page.getByTestId('done-primary')).toHaveCount(0);
    await expect(page.getByText(WORD.lithuanian)).toHaveCount(0);
    expect(fake.perPhaseFetches).toEqual([]);
    expect(fake.charged).toEqual([]);
  });

  test('charges exactly one daily session for the whole three-phase flow', async ({ page }) => {
    const fake = await setup(page, { withGrammar: true });

    // Baseline, read the same way quota.spec.ts reads it — off the lists banner.
    await page.goto('/dashboard/lists');
    await expect(page.getByText(/Сессий сегодня/)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(`${BASE_SESSIONS_TODAY} / ${DAILY_LIMIT}`)).toBeVisible();

    await page.goto('/dashboard/continue');
    await playWordPhase(page);
    await playGrammarPhase(page);
    await playPhrasePhase(page, { isLast: true });

    // Exactly one charge for three phases — the whole point of the rework.
    expect(fake.charged).toEqual(['/me/continue-session']);

    await page.goto('/dashboard/lists');
    await expect(page.getByText(/Сессий сегодня/)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(`${BASE_SESSIONS_TODAY + 1} / ${DAILY_LIMIT}`)).toBeVisible();
    await expect(page.getByText(`${BASE_SESSIONS_TODAY + 2} / ${DAILY_LIMIT}`)).toHaveCount(0);
  });
});
