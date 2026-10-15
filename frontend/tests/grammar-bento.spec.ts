import { test, expect } from '@playwright/test';
import { daysAgo, mockGrammar } from './helpers/grammarBento';

// #66 — Грамматика as overview («В процессе» / «Завершённые» / «Другие программы») plus the
// program page on `?program=<id>`. Fully mocked (fixtures in helpers/grammarBento.ts):
// program 1 = singular cases (lessons 1–17, six topics; 7–8 is a two-level numbers topic),
// 2 = verbs (201–204, two topics), 3 = plural cases (20–21, one topic).
// overview-pages.spec.ts covers the page states on both pages; this file covers the details.

const L = 'L' as const;
// Free user in program 1: first topic passed (weakest 80%), next is Kilmininkas · Базовый (50%).
const FREE = { 1: 0.9, 2: 0.8, 3: 0.9, 4: 0.5, 5: L, 6: L, 7: L, 8: L, 9: L, 10: L, 11: L, 12: L, 13: L, 14: L, 15: L, 16: L, 17: L };
const P3_DONE = { 20: 0.9, 21: 0.8 };

test.describe('Grammar overview — no programs', () => {
  test('hero shows 0, no badge, «Начать с падежей», no continue or review', async ({ page }) => {
    await mockGrammar(page, { enrolled: [] });
    await page.goto('/dashboard/grammar');
    const hero = page.getByTestId('stats-card-grammar');
    await expect(page.getByTestId('grammar-hero-count')).toHaveText('0');
    await expect(hero).not.toContainText(/из \d/);
    await expect(page.getByTestId('hero-start-cases')).toHaveText('Начать с падежей');
    await expect(page.getByTestId('hero-continue')).toHaveCount(0);
    await expect(page.getByTestId('hero-review')).toHaveCount(0);
    await expect(page.getByTestId('in-progress-section')).toHaveCount(0);
    await expect(page.getByTestId('completed-section')).toHaveCount(0);
  });

  test('catalogue lists every program; cases first and recommended; counts', async ({ page }) => {
    await mockGrammar(page, { enrolled: [] });
    await page.goto('/dashboard/grammar');
    const cat = page.getByTestId('catalogue-section');
    await expect(cat.getByRole('heading', { level: 2 })).toHaveText('Программы');
    const cards = cat.locator('[data-testid^="catalog-card-"]:not([data-testid$="-inside"]):not([data-testid$="-add"])');
    await expect(cards).toHaveCount(3);
    await expect(cards.first()).toHaveAttribute('data-testid', 'catalog-card-1');
    await expect(page.getByTestId('catalog-card-1')).toContainText('С неё проще всего начать');
    await expect(page.getByTestId('catalog-card-2')).not.toContainText('С неё проще всего начать');
    await expect(page.getByTestId('catalog-card-1')).toContainText('17 уроков · 6 тем');
    await expect(page.getByTestId('catalog-card-2')).toContainText('4 урока · 2 темы');
    await expect(page.getByTestId('catalog-card-1')).toContainText('Начальный');
  });

  test('«Что внутри» opens the format line and the topics; case name drops a trailing (LT title)', async ({ page }) => {
    await mockGrammar(page, { enrolled: [] });
    await page.goto('/dashboard/grammar');
    const card = page.getByTestId('catalog-card-1');
    await expect(card.getByText('Родительный — Kilmininkas Vns.')).toBeHidden();
    await page.getByTestId('catalog-card-1-inside').click();
    await expect(card.getByText(/^В каждой теме 3 уровня/)).toBeVisible();
    await expect(card.getByText('Родительный — Kilmininkas Vns.')).toBeVisible();
    await expect(card).not.toContainText('(Kilmininkas)');
    // An informative parenthetical stays.
    await expect(card).toContainText('Числительные: Именительный (kiek? yra) — Skaičiai: Vardininkas (kiek yra?)');
  });

  test('hero start enrolls the cases program and opens its page with the added banner', async ({ page }) => {
    const { calls } = await mockGrammar(page, { enrolled: [] });
    await page.goto('/dashboard/grammar');
    await page.getByTestId('hero-start-cases').click();
    await expect.poll(() => calls).toContain('POST /api/me/grammar-programs/1');
    await expect(page).toHaveURL(/\/dashboard\/grammar\/?\?program=1$/);
    await expect(page.getByTestId('added-banner')).toContainText('«Литовские падежи» — теперь в твоих программах');
    await expect(page.getByTestId('program-header')).toContainText('Литовские падежи');
  });

  test('catalogue «Добавить» enrolls that program; «Отменить» removes it again', async ({ page }) => {
    const { calls } = await mockGrammar(page, { enrolled: [] });
    await page.goto('/dashboard/grammar');
    await page.getByTestId('catalog-card-2-add').click();
    await expect.poll(() => calls).toEqual(['POST /api/me/grammar-programs/2']);
    await expect(page).toHaveURL(/\?program=2$/);
    await page.getByTestId('added-undo').click();
    await expect.poll(() => calls).toEqual(['POST /api/me/grammar-programs/2', 'DELETE /api/me/grammar-programs/2']);
    await expect(page).toHaveURL(/\/dashboard\/grammar\/?$/);
    await expect(page.getByTestId('hero-start-cases')).toBeVisible();
  });

  test('guest pressing «Начать с падежей» goes to /login without enrolling', async ({ page }) => {
    const { calls } = await mockGrammar(page, { enrolled: [], guest: true });
    await page.goto('/dashboard/grammar');
    await page.getByTestId('hero-start-cases').click();
    await expect(page).toHaveURL(/\/login/);
    expect(calls).toEqual([]);
  });

  test('enroll failure shows the error line', async ({ page }) => {
    await mockGrammar(page, { enrolled: [], enrollStatus: 500 });
    await page.goto('/dashboard/grammar');
    await page.getByTestId('hero-start-cases').click();
    await expect(page.getByTestId('grammar-action-error')).toHaveText('Не получилось — попробуйте ещё раз.');
  });

  test('EN copy', async ({ page }) => {
    await mockGrammar(page, { enrolled: [], lang: 'en' });
    await page.goto('/dashboard/grammar');
    await expect(page.getByTestId('hero-start-cases')).toHaveText('Start with cases');
    await expect(page.getByTestId('catalogue-section').getByRole('heading', { level: 2 })).toHaveText('Programs');
    await expect(page.getByTestId('catalog-card-1')).toContainText('Beginner');
    await expect(page.getByTestId('catalog-card-1')).toContainText('17 lessons · 6 topics');
    await expect(page.getByTestId('catalog-card-1')).toContainText('The easiest place to start');
  });
});

test.describe('Grammar overview — enrolled', () => {
  test('in-progress card names the next step; the hero is the only «Продолжить»', async ({ page }) => {
    await mockGrammar(page, { enrolled: [1], scores: FREE });
    await page.goto('/dashboard/grammar');
    await expect(page.getByTestId('grammar-hero-count')).toHaveText('3');
    await expect(page.getByTestId('stats-card-grammar')).toContainText('из 17');
    await expect(page.getByTestId('hero-next')).toHaveText(
      'Дальше — Литовские падежи: Kilmininkas Vns. · Базовый — лучший 50% · нужно больше 75%');
    const card = page.getByTestId('program-card-1');
    await expect(card).toContainText('3/17 уроков');
    await expect(card).toContainText('Дальше — Kilmininkas Vns. · Базовый — лучший 50% · нужно больше 75%');
    await expect(card).toHaveAttribute('href', /\/dashboard\/grammar\/?\?program=1$/);
    const continues = page.getByRole('button', { name: 'Продолжить' }).or(page.getByRole('link', { name: 'Продолжить' }));
    await expect(continues).toHaveCount(1);
    // The rest of the catalogue moves under «Другие программы».
    await expect(page.getByTestId('catalogue-section').getByRole('heading', { level: 2 })).toHaveText('Другие программы');
    await expect(page.getByTestId('catalog-card-1')).toHaveCount(0);
  });

  test('hero «Продолжить» starts the next lesson', async ({ page }) => {
    const { tasks } = await mockGrammar(page, { enrolled: [1], scores: FREE });
    await page.goto('/dashboard/grammar');
    await page.getByTestId('hero-continue').click();
    await expect.poll(() => tasks).toEqual(['lessons/4']);
  });

  test('the hero continues the program practised last', async ({ page }) => {
    await mockGrammar(page, { enrolled: [1, 2], scores: FREE, lastResult: { 1: daysAgo(5), 2: daysAgo(1) } });
    await page.goto('/dashboard/grammar');
    await expect(page.getByTestId('hero-next')).toContainText('Глаголы: Настоящее время');
    await page.unrouteAll({ behavior: 'ignoreErrors' });
    await mockGrammar(page, { enrolled: [1, 2], scores: FREE, lastResult: { 1: daysAgo(1), 2: daysAgo(5) } });
    await page.goto('/dashboard/grammar');
    await expect(page.getByTestId('hero-next')).toContainText('Литовские падежи: Kilmininkas Vns.');
  });

  test('a finished program is one «Завершённые» row; «Пора повторить» after 7 days; review scoped to it', async ({ page }) => {
    const { tasks } = await mockGrammar(page, {
      enrolled: [1, 3], scores: { ...FREE, ...P3_DONE }, lastResult: { 1: daysAgo(1), 3: daysAgo(10) },
    });
    await page.goto('/dashboard/grammar');
    await expect(page.getByTestId('program-card-3')).toHaveCount(0);
    await page.getByTestId('completed-section').locator('summary').click();
    const row = page.getByTestId('completed-row-3');
    await expect(row).toContainText('Множественное число');
    await expect(row).toContainText('2/2');
    await expect(row.getByTestId('due-tag')).toHaveText('Пора повторить');
    await expect(row).toContainText('последний раз 10 дней назад · слабее всего: Vardininkas Dgs. · Смешанный — ✓ 80%');
    await row.getByTestId('completed-review').click();
    await expect.poll(() => tasks).toEqual(['remind?program_id=3']);
  });

  test('no «Пора повторить» within 7 days', async ({ page }) => {
    await mockGrammar(page, { enrolled: [3], scores: P3_DONE, lastResult: { 3: daysAgo(3) } });
    await page.goto('/dashboard/grammar');
    await page.getByTestId('completed-section').locator('summary').click();
    const row = page.getByTestId('completed-row-3');
    await expect(row).toContainText('последний раз 3 дня назад');
    await expect(row.getByTestId('due-tag')).toHaveCount(0);
  });

  test('everything enrolled is done → hero says so and offers the review', async ({ page }) => {
    const { tasks } = await mockGrammar(page, { enrolled: [3], scores: P3_DONE, lastResult: { 3: daysAgo(10) } });
    await page.goto('/dashboard/grammar');
    await expect(page.getByTestId('hero-next')).toHaveText('✓ Все уроки пройдены');
    await expect(page.getByTestId('hero-continue')).toHaveCount(0);
    await expect(page.getByTestId('in-progress-section')).toHaveCount(0);
    await page.getByTestId('hero-review').click();
    await expect.poll(() => tasks).toEqual(['remind?program_id=3']);
  });

  test('review with nothing eligible (404) says so instead of spinning', async ({ page }) => {
    await mockGrammar(page, { enrolled: [3], scores: P3_DONE, remindStatus: 404 });
    await page.goto('/dashboard/grammar');
    await page.getByTestId('hero-review').click();
    await expect(page.getByTestId('grammar-remind-none')).toHaveText(
      'Пока нечего повторять: пройди хотя бы один урок «Смешанный» в этой программе.');
    await expect(page.getByTestId('stats-card-grammar')).toBeVisible();
  });
});

test.describe('Grammar program page', () => {
  test('header: stats, «Дальше», one button that starts the next lesson; switcher chips', async ({ page }) => {
    const { tasks } = await mockGrammar(page, { enrolled: [1, 2], scores: FREE });
    await page.goto('/dashboard/grammar?program=1');
    const header = page.getByTestId('program-header');
    await expect(header.getByRole('heading', { level: 1 })).toHaveText('Литовские падежи');
    await expect(page.getByTestId('program-done')).toHaveText('3');
    await expect(header).toContainText('из 17');
    await expect(header).toContainText('1 из 6 тем');
    await expect(page.getByTestId('program-next')).toHaveText('Дальше — Kilmininkas Vns. · Базовый — лучший 50% · нужно больше 75%');
    await expect(page.getByTestId('switch-chip-2')).toContainText('Глаголы0/4');
    await expect(page.getByTestId('switch-chip-1')).toHaveCount(0);
    await page.getByTestId('program-continue').click();
    await expect.poll(() => tasks).toEqual(['lessons/4']);
  });

  test('«Осталось»: next topic first, level states, a level opens its lesson', async ({ page }) => {
    const { tasks } = await mockGrammar(page, { enrolled: [1], scores: FREE });
    await page.goto('/dashboard/grammar?program=1');
    const remaining = page.getByTestId('remaining-card');
    await expect(remaining).toContainText('Осталось5 тем');
    await expect(remaining).toContainText('С ✓ — пройден (больше 75%), без ✓ — лучшая попытка.');
    const next = remaining.getByTestId('topic-row').first();
    await expect(next).toHaveAttribute('data-state', 'next');
    await expect(next).toContainText('Дальше');
    await expect(next).toContainText('Kilmininkas Vns.');
    await expect(next.getByTestId('level-button')).toHaveText('Базовый50%');
    await expect(next.getByTestId('lesson-locked')).toHaveCount(2);
    await next.getByTestId('level-button').click();
    await expect.poll(() => tasks).toEqual(['lessons/4']);
  });

  test('locks state their reason: level, first locked topic without a tap, the next one on tap', async ({ page }) => {
    await mockGrammar(page, { enrolled: [1], scores: FREE });
    await page.goto('/dashboard/grammar?program=1');
    const rows = page.getByTestId('remaining-card').getByTestId('topic-row');
    await expect(rows.nth(0).getByTestId('lock-reason')).toHaveText('Продвинутый откроется после «Kilmininkas Vns. · Базовый» — нужно больше 75%');
    await expect(rows.nth(1)).toHaveAttribute('data-state', 'locked');
    await expect(rows.nth(1).getByTestId('lock-reason')).toHaveText('Откроется после «Kilmininkas Vns. · Смешанный» — нужно больше 75%');
    await expect(rows.nth(2).getByTestId('lock-reason')).toHaveCount(0);
    await rows.nth(2).click();
    await expect(rows.nth(2).getByTestId('lock-reason')).toHaveText(
      'Откроется после «Skaičiai: Vardininkas (kiek yra?) · Продвинутый» — нужно больше 75%');
  });

  test('the locked tail is folded; free users get the Premium link', async ({ page }) => {
    await mockGrammar(page, { enrolled: [1], scores: FREE });
    await page.goto('/dashboard/grammar?program=1');
    const fold = page.getByTestId('fold-locked');
    await expect(fold).not.toHaveAttribute('open', '');
    await expect(fold.locator('summary')).toHaveText('Ещё 2 темы — откроются по порядку');
    await expect(fold.getByText('Įnagininkas Vns.')).toBeHidden();
    await fold.locator('summary').click();
    await expect(fold.getByText('Įnagininkas Vns.')).toBeVisible();
    await expect(page.getByTestId('premium-link')).toHaveAttribute('href', /\/pricing\/?$/);
  });

  test('«Пройдено» is folded while in progress; it starts with a review scoped to the program', async ({ page }) => {
    const { tasks } = await mockGrammar(page, { enrolled: [1], scores: FREE });
    await page.goto('/dashboard/grammar?program=1');
    const passed = page.getByTestId('passed-card');
    await expect(passed).not.toHaveAttribute('open', '');
    await expect(passed.locator('summary')).toContainText('Пройдено1 тема · слабее всего: Vardininkas Vns. · Продвинутый ✓ 80%');
    await expect(page.getByTestId('passed-review')).toBeHidden();
    await passed.locator('summary').click();
    await page.getByTestId('passed-review').click();
    await expect.poll(() => tasks).toEqual(['remind?program_id=1']);
  });

  test('a finished program: done line, review button, «Пройдено» open, no «Осталось»', async ({ page }) => {
    const { tasks } = await mockGrammar(page, { enrolled: [3], scores: P3_DONE, lastResult: { 3: daysAgo(10) } });
    await page.goto('/dashboard/grammar?program=3');
    const line = page.getByTestId('program-next');
    await expect(line).toContainText('✓ Все уроки пройдены');
    await expect(line.getByTestId('due-tag')).toBeVisible();
    await expect(line).toContainText('последний раз 10 дней назад');
    await expect(line).toContainText('Слабее всего: Vardininkas Dgs. · Смешанный — ✓ 80%');
    await expect(page.getByTestId('remaining-card')).toHaveCount(0);
    await expect(page.getByTestId('passed-card')).toHaveAttribute('open', '');
    await page.getByTestId('program-review').click();
    await expect.poll(() => tasks).toEqual(['remind?program_id=3']);
  });

  test('⋯ → «Убрать программу» asks first, then DELETEs and returns to the overview', async ({ page }) => {
    const { calls } = await mockGrammar(page, { enrolled: [1], scores: FREE });
    await page.goto('/dashboard/grammar?program=1');
    await page.getByTestId('program-menu').click();
    await page.getByTestId('unenroll-button').click();
    await expect(page.getByTestId('unenroll-confirm')).toContainText('Литовские падежи');
    expect(calls).toEqual([]);
    await page.getByTestId('unenroll-confirm-button').click();
    await expect.poll(() => calls).toEqual(['DELETE /api/me/grammar-programs/1']);
    await expect(page).toHaveURL(/\/dashboard\/grammar\/?$/);
    await expect(page.getByTestId('hero-start-cases')).toBeVisible();
  });

  test('unenroll failure shows the error line and stays on the program', async ({ page }) => {
    await mockGrammar(page, { enrolled: [1], enrollStatus: 500 });
    await page.goto('/dashboard/grammar?program=1');
    await page.getByTestId('program-menu').click();
    await page.getByTestId('unenroll-button').click();
    await page.getByTestId('unenroll-confirm-button').click();
    await expect(page.getByTestId('grammar-action-error')).toBeVisible();
    await expect(page.getByTestId('program-header')).toBeVisible();
  });

  test('an unknown or not-enrolled ?program= falls back to the overview', async ({ page }) => {
    await mockGrammar(page, { enrolled: [1], scores: FREE });
    await page.goto('/dashboard/grammar?program=2');
    await expect(page.getByTestId('stats-card-grammar')).toBeVisible();
    await expect(page.getByTestId('program-header')).toHaveCount(0);
  });

  test('375px: level cells ≥ 44px, full-width button, no horizontal overflow', async ({ page }) => {
    await mockGrammar(page, { enrolled: [1], scores: FREE, width: 375 });
    await page.goto('/dashboard/grammar?program=1');
    const cell = await page.getByTestId('level-button').first().boundingBox();
    expect(cell!.height).toBeGreaterThanOrEqual(44);
    const btn = await page.getByTestId('program-continue').boundingBox();
    const header = await page.getByTestId('program-header').boundingBox();
    expect(btn!.width).toBeGreaterThan(header!.width - 60);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test('EN program page', async ({ page }) => {
    await mockGrammar(page, { enrolled: [1], scores: FREE, lang: 'en' });
    await page.goto('/dashboard/grammar?program=1');
    await expect(page.getByTestId('program-header').getByRole('heading', { level: 1 })).toHaveText('Lithuanian Cases');
    await expect(page.getByTestId('program-next')).toHaveText('Up next — Kilmininkas Vns. · Basic — best 50% · need over 75%');
    await expect(page.getByTestId('program-continue')).toContainText('Continue');
    await expect(page.getByTestId('remaining-card')).toContainText('Remaining5 topics');
  });
});
