import { test, expect } from '@playwright/test';
import { mockGrammar } from './helpers/grammarBento';

// #53 — grammar lesson list as hero → program chips → bento → topic cards.
// Fully mocked (fixtures in helpers/grammarBento.ts): program 1 = singular cases
// (lessons 1–8, three topics; 7–8 are a numbers-style topic), 2 = verbs (201–204), 3 = plural cases (20–21).

test.describe('Grammar bento — no programs', () => {
  test('hero shows 0, no badge, «Начать с падежей», no remind or continue', async ({ page }) => {
    await mockGrammar(page, { enrolled: [] });
    await page.goto('/dashboard/grammar');
    const hero = page.getByTestId('stats-card-grammar');
    await expect(page.getByTestId('grammar-hero-count')).toHaveText('0');
    await expect(hero).not.toContainText(/из \d/);
    await expect(page.getByTestId('hero-start-cases')).toHaveText('Начать с падежей');
    await expect(page.getByTestId('hero-continue')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Напомни что я мог забыть' })).toHaveCount(0);
  });

  test('featured previews cases without its own enroll; stack offers description + «Добавить»', async ({ page }) => {
    await mockGrammar(page, { enrolled: [] });
    await page.goto('/dashboard/grammar');
    const featured = page.getByTestId('featured-card');
    await expect(featured).toHaveAttribute('data-kind', 'preview');
    await expect(featured).toContainText('Литовские падежи');
    await expect(featured).toContainText('8 уроков · 3 темы');
    await expect(page.getByTestId('featured-add')).toHaveCount(0);
    for (const id of [2, 3]) {
      await expect(page.getByTestId(`stack-card-${id}`)).toContainText(/Спряжение|Падежи во множественном/);
      await expect(page.getByTestId(`stack-add-${id}`)).toHaveText('Добавить');
    }
  });

  test('preview topic cards show no scores and disabled levels', async ({ page }) => {
    await mockGrammar(page, { enrolled: [], scores: { 1: 0.9, 2: 0.5 } });
    await page.goto('/dashboard/grammar');
    const topics = page.getByTestId('topics-section');
    await expect(topics).toContainText('Что внутри: Литовские падежи');
    await expect(topics).not.toContainText('✓');
    await expect(topics).not.toContainText('%');
    await expect(topics.getByTestId('level-button').first()).toBeDisabled();
    await expect(page.getByTestId('unenroll-button')).toHaveCount(0);
  });

  test('enroll from hero calls POST for the cases program and switches to enrolled', async ({ page }) => {
    const { calls } = await mockGrammar(page, { enrolled: [] });
    await page.goto('/dashboard/grammar');
    await page.getByTestId('hero-start-cases').click();
    await expect.poll(() => calls).toContain('POST /api/me/grammar-programs/1');
    const chip = page.getByTestId('category-program-1');
    await expect(chip).toHaveAttribute('aria-pressed', 'true');
    await expect(chip.getByTestId('enrolled-dot')).toBeVisible();
    await expect(page.getByTestId('unenroll-button')).toBeVisible();
    await expect(page).toHaveURL(/\/dashboard\/grammar/);
  });

  test('stack «Добавить» calls POST for that program', async ({ page }) => {
    const { calls } = await mockGrammar(page, { enrolled: [] });
    await page.goto('/dashboard/grammar');
    await page.getByTestId('stack-add-2').click();
    await expect.poll(() => calls).toContain('POST /api/me/grammar-programs/2');
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
    await expect(page.getByTestId('topics-section')).toContainText("What's inside: Lithuanian Cases");
    await expect(page.getByTestId('featured-card')).toContainText('Program · Beginner');
  });
});

test.describe('Grammar bento — chips', () => {
  test('counts, enrolled dot and «Все» count', async ({ page }) => {
    await mockGrammar(page, { enrolled: [1] });
    await page.goto('/dashboard/grammar');
    await expect(page.getByTestId('category-all')).toContainText('8');
    await expect(page.getByTestId('category-program-2')).toContainText('4');
    await expect(page.getByTestId('category-program-3')).toContainText('2');
    await expect(page.getByTestId('category-program-1').getByTestId('enrolled-dot')).toBeVisible();
    await expect(page.getByTestId('enrolled-dot')).toHaveCount(1);
  });

  test('«Все» counts every program when none is enrolled', async ({ page }) => {
    await mockGrammar(page, { enrolled: [] });
    await page.goto('/dashboard/grammar');
    await expect(page.getByTestId('category-all')).toContainText('14');
  });

  test('selecting a chip switches featured and topics', async ({ page }) => {
    await mockGrammar(page, { enrolled: [1] });
    await page.goto('/dashboard/grammar');
    await page.getByTestId('category-program-2').click();
    await expect(page.getByTestId('featured-card')).toHaveAttribute('data-kind', 'preview');
    await expect(page.getByTestId('featured-card')).toContainText('Глаголы');
    await expect(page.getByTestId('topics-section')).toContainText('Что внутри: Глаголы');
  });
});

test.describe('Grammar bento — featured card', () => {
  test('next lesson skips passed and locked lessons; LT heading + case name', async ({ page }) => {
    await mockGrammar(page, { enrolled: [1, 2], scores: { 1: 0.9, 2: 0.9, 3: 0.9, 4: 'L', 5: 0.9 } });
    await page.goto('/dashboard/grammar');
    const featured = page.getByTestId('featured-card');
    await expect(featured).toHaveAttribute('data-kind', 'next');
    await expect(featured).toContainText('Продолжить отсюда · Литовские падежи');
    await expect(page.getByTestId('featured-heading')).toHaveText('Kilmininkas Vns.');
    await expect(page.getByTestId('featured-subheading')).toHaveText('Родительный');
    await expect(featured).toContainText('Повторение · урок 3 из 3 · 10 заданий');
  });

  test('case name drops a trailing (LT title) but keeps an informative parenthetical', async ({ page }) => {
    await mockGrammar(page, { enrolled: [1], scores: { 1: 0.9, 2: 0.9, 3: 0.9 } });
    await page.goto('/dashboard/grammar');
    await expect(page.getByTestId('featured-subheading')).toHaveText('Родительный');
    const topics = page.getByTestId('topics-section');
    await expect(topics).not.toContainText('(Kilmininkas)');
    await expect(topics).not.toContainText('(Vardininkas)');
    await expect(topics).toContainText('Числительные: Именительный (kiek? yra)');
  });

  test('EN case name drops the trailing (LT title) too', async ({ page }) => {
    await mockGrammar(page, { enrolled: [1], scores: { 1: 0.9, 2: 0.9, 3: 0.9 }, lang: 'en' });
    await page.goto('/dashboard/grammar');
    await expect(page.getByTestId('featured-subheading')).toHaveText('Genitive');
    await expect(page.getByTestId('topics-section')).toContainText('Numbers: Nominative (kiek? yra)');
  });

  test('verb lesson uses its plain title, EN title in EN, no sub-heading', async ({ page }) => {
    await mockGrammar(page, { enrolled: [2], lang: 'en' });
    await page.goto('/dashboard/grammar');
    await expect(page.getByTestId('featured-heading')).toHaveText('Present tense');
    await expect(page.getByTestId('featured-subheading')).toHaveCount(0);
  });

  test('hero «Продолжить» starts the same lesson as the featured card', async ({ page }) => {
    const { tasks } = await mockGrammar(page, { enrolled: [1], scores: { 1: 0.9 } });
    await page.goto('/dashboard/grammar');
    await page.getByTestId('hero-continue').click();
    await expect.poll(() => tasks.length).toBe(1);
    await page.goto('/dashboard/grammar');
    await page.getByTestId('featured-start').click();
    await expect.poll(() => tasks.length).toBe(2);
    expect(tasks[0]).toBe('lessons/2');
    expect(tasks[1]).toBe(tasks[0]);
  });

  test('nothing left → preview of a not-enrolled program with «Добавить»; hero hides «Продолжить»', async ({ page }) => {
    await mockGrammar(page, { enrolled: [1], scores: { 1: 1, 2: 1, 3: 1, 4: 1, 5: 1, 6: 1, 7: 1, 8: 'L' } });
    await page.goto('/dashboard/grammar');
    await expect(page.getByTestId('featured-card')).toHaveAttribute('data-kind', 'preview');
    await expect(page.getByTestId('featured-card')).toContainText('Глаголы');
    await expect(page.getByTestId('featured-add')).toBeVisible();
    await expect(page.getByTestId('hero-continue')).toHaveCount(0);
  });

  test('everything enrolled and done → summary with /pricing link', async ({ page }) => {
    const passedAll = { 1: 1, 2: 1, 3: 1, 4: 1, 5: 1, 6: 1, 7: 1, 8: 'L', 20: 1, 21: 1, 201: 1, 202: 1, 203: 1, 204: 1 } as const;
    await mockGrammar(page, { enrolled: [1, 2, 3], scores: passedAll });
    await page.goto('/dashboard/grammar');
    await expect(page.getByTestId('featured-card')).toHaveAttribute('data-kind', 'done');
    await expect(page.getByTestId('featured-premium-link')).toHaveAttribute('href', /\/pricing\/?$/);
    await expect(page.getByTestId('hero-continue')).toHaveCount(0);
  });
});

test.describe('Grammar bento — topic cards', () => {
  test('level button starts its lesson', async ({ page }) => {
    const { tasks } = await mockGrammar(page, { enrolled: [1] });
    await page.goto('/dashboard/grammar');
    await page.getByTestId('topics-section').getByTestId('level-button').nth(1).click();
    await expect.poll(() => tasks).toEqual(['lessons/2']);
  });

  test('locked level is disabled with upsell; ✓ when passed, % when attempted', async ({ page }) => {
    await mockGrammar(page, { enrolled: [1], scores: { 1: 0.9, 2: 0.5, 3: 'L' } });
    await page.goto('/dashboard/grammar');
    const card = page.getByTestId('topic-card').first();
    await expect(card.getByTestId('level-button').nth(0)).toContainText('✓');
    await expect(card.getByTestId('level-button').nth(1)).toContainText('50%');
    await expect(card.getByTestId('lesson-locked')).toBeDisabled();
    await expect(card.getByTestId('lesson-locked-upsell')).toHaveAttribute('href', /\/pricing\/?$/);
    await expect(card).toContainText('1/3');
  });

  test('level button is at least 44px tall at 375px', async ({ page }) => {
    await mockGrammar(page, { enrolled: [1], width: 375 });
    await page.goto('/dashboard/grammar');
    const box = await page.getByTestId('level-button').first().boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
  });

  test('«Убрать» asks for confirmation, then calls DELETE', async ({ page }) => {
    const { calls } = await mockGrammar(page, { enrolled: [1] });
    await page.goto('/dashboard/grammar');
    await page.getByTestId('unenroll-button').click();
    await expect(page.getByTestId('unenroll-confirm')).toContainText('Литовские падежи');
    expect(calls).toEqual([]);
    await page.getByTestId('unenroll-confirm-button').click();
    await expect.poll(() => calls).toEqual(['DELETE /api/me/grammar-programs/1']);
    await expect(page.getByTestId('hero-start-cases')).toBeVisible();
  });

  test('unenroll failure shows the error line', async ({ page }) => {
    await mockGrammar(page, { enrolled: [1], enrollStatus: 500 });
    await page.goto('/dashboard/grammar');
    await page.getByTestId('unenroll-button').click();
    await page.getByTestId('unenroll-confirm-button').click();
    await expect(page.getByTestId('grammar-action-error')).toBeVisible();
  });
});
