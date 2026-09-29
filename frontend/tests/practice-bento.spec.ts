import { test, expect } from '@playwright/test';
import { mockPractice } from './helpers/practiceBento';

// #55 — practice page as hero → category chips → bento → section cards.
// Fully mocked (fixtures in helpers/practiceBento.ts): category 1 = Constitution
// (101 sample, 102–105 block 1, 106–108 block 2, 109 numbers, 110 final + premium),
// 2 = Reading (201–203, no sections; 201 has a reading text).

// Block 1 partly done: 101 sample passed, 102 passed, 103 attempted 50%, rest locked.
const PARTIAL = { 101: 1, 102: 0.9, 103: 0.5, 104: 'L', 105: 'L', 106: 'L', 107: 'L', 108: 'L', 109: 'L', 110: 'L' } as const;
const ALL_CONST = { 101: 1, 102: 0.9, 103: 0.8, 104: 0.7, 105: 0.9, 106: 0.8, 107: 0.8, 108: 0.9, 109: 0.8, 110: 0.9 } as const;
const ALL_READING = { 201: 1, 202: 1, 203: 0.9 } as const;

test.describe('Practice bento — onboarding (none / guest)', () => {
  test('guest sees the page, not /login; hero 0; preview; disabled buttons', async ({ page }) => {
    await mockPractice(page, { enrolled: [], guest: true });
    await page.goto('/dashboard/practice');
    await expect(page.getByTestId('practice-hero-count')).toHaveText('0');
    await expect(page).toHaveURL(/\/dashboard\/practice\/?$/);
    const hero = page.getByTestId('stats-card-practice');
    await expect(hero).not.toContainText(/из \d/);
    await expect(page.getByTestId('hero-start-practice')).toHaveText('Начать с Конституции');
    await expect(page.getByTestId('hero-continue')).toHaveCount(0);
    const featured = page.getByTestId('featured-card');
    await expect(featured).toHaveAttribute('data-kind', 'preview');
    await expect(featured).toContainText('Конституция');
    await expect(featured).toContainText('10 тестов');
    await expect(page.getByTestId('featured-add')).toHaveCount(0); // the hero already offers it
    await expect(page.getByTestId('stack-add-2')).toHaveText('Добавить');
    const sections = page.getByTestId('practice-sections');
    await expect(sections).toContainText('Что внутри: Конституция');
    await expect(sections).not.toContainText('✓');
    await expect(sections).not.toContainText('%');
    const buttons = sections.getByTestId('practice-test-button');
    await expect(buttons.first()).toBeDisabled();
    await expect(page.getByTestId('unenroll-button')).toHaveCount(0);
  });

  test('guest «Начать с Конституции» and «Добавить» go to /login', async ({ page }) => {
    const { calls } = await mockPractice(page, { enrolled: [], guest: true });
    await page.goto('/dashboard/practice');
    await page.getByTestId('hero-start-practice').click();
    await expect(page).toHaveURL(/\/login/);
    await page.goto('/dashboard/practice');
    await page.getByTestId('stack-add-2').click();
    await expect(page).toHaveURL(/\/login/);
    expect(calls).toEqual([]);
  });

  test('signed-in hero start enrolls the first category and selects it', async ({ page }) => {
    const { calls } = await mockPractice(page, { enrolled: [] });
    await page.goto('/dashboard/practice');
    await page.getByTestId('hero-start-practice').click();
    await expect.poll(() => calls).toContain('POST /api/me/practice-categories/1');
    const chip = page.getByTestId('category-practice-1');
    await expect(chip).toHaveAttribute('aria-pressed', 'true');
    await expect(chip.getByTestId('enrolled-dot')).toBeVisible();
    await expect(page.getByTestId('unenroll-button')).toBeVisible();
  });

  test('enroll failure shows the error line', async ({ page }) => {
    await mockPractice(page, { enrolled: [], enrollStatus: 500 });
    await page.goto('/dashboard/practice');
    await page.getByTestId('hero-start-practice').click();
    await expect(page.getByTestId('practice-action-error')).toBeVisible();
  });
});

test.describe('Practice bento — enrolled', () => {
  test('featured card shows the next test: title, other title, meta, best score', async ({ page }) => {
    await mockPractice(page, { enrolled: [1], scores: PARTIAL });
    await page.goto('/dashboard/practice');
    const featured = page.getByTestId('featured-card');
    await expect(featured).toHaveAttribute('data-kind', 'next');
    await expect(page.getByTestId('featured-heading')).toHaveText('2 pamoka: Įstatymai, teritorija, pilietybė (7–12 str.)');
    await expect(page.getByTestId('featured-subheading')).toHaveText('Lesson 2: Art. 7–12');
    await expect(page.getByTestId('featured-meta')).toHaveText('10 вопросов · проходной балл 60%');
    await expect(page.getByTestId('featured-best')).toHaveText('лучший результат 50%');
    await expect(featured).toContainText('2/10 тестов');
    await expect(page.getByTestId('practice-hero-count')).toHaveText('2');
    await expect(page.getByTestId('stats-card-practice')).toContainText('из 10');
  });

  test('hero «Продолжить» and «Начать тест» open the next test via ?test=', async ({ page }) => {
    const { exams } = await mockPractice(page, { enrolled: [1], scores: PARTIAL });
    await page.goto('/dashboard/practice');
    await page.getByTestId('hero-continue').click();
    await expect(page).toHaveURL(/\/dashboard\/practice\/1\/?\?test=103$/);
    await expect(page.getByText('Kokia yra Lietuvos sostinė?').first()).toBeVisible();
    expect(exams).toEqual([103]);
    await page.goto('/dashboard/practice');
    await page.getByTestId('featured-start').click();
    await expect(page).toHaveURL(/\?test=103$/);
  });

  test('section cards: grouping, order, button states', async ({ page }) => {
    await mockPractice(page, { enrolled: [1], scores: PARTIAL });
    await page.goto('/dashboard/practice');
    const cards = page.getByTestId('practice-section-card');
    await expect(cards).toHaveCount(3);
    await expect(cards.nth(0)).toContainText('Блок 1: статьи 1–31');
    await expect(cards.nth(1)).toContainText('Блок 2: статьи 32–54');
    await expect(cards.nth(2)).toContainText('Итоговые тесты'); // sample test sorts first, card goes last
    const b1 = cards.nth(0).getByTestId('practice-test-button');
    await expect(b1).toHaveCount(4);
    await expect(b1.nth(0)).toHaveAttribute('data-state', 'passed');
    await expect(b1.nth(0)).toContainText('✓');
    await expect(b1.nth(1)).toHaveAttribute('data-state', 'attempted');
    await expect(b1.nth(1)).toContainText('50%');
    await expect(b1.nth(2)).toHaveAttribute('data-state', 'locked');
    await expect(b1.nth(2)).toBeDisabled();
    await expect(cards.nth(0)).toContainText('1/4');
    // Premium label on the final exam for a free user.
    await expect(cards.nth(2).getByTestId('practice-test-button').last()).toContainText('Premium');
  });

  test('a section button opens the test; «Назад» returns to /dashboard/practice', async ({ page }) => {
    await mockPractice(page, { enrolled: [1], scores: PARTIAL });
    await page.goto('/dashboard/practice');
    await page.getByTestId('practice-section-card').nth(0).getByTestId('practice-test-button').nth(0).click();
    await expect(page).toHaveURL(/\/dashboard\/practice\/1\/?\?test=102$/);
    await expect(page.getByText('Kokia yra Lietuvos sostinė?').first()).toBeVisible();
    await page.getByTestId('practice-back').click();
    await expect(page).toHaveURL(/\/dashboard\/practice\/?$/);
    await expect(page.getByTestId('featured-card')).toBeVisible();
  });

  test('?test= of a test with a reading text opens the reading view first', async ({ page }) => {
    const { exams } = await mockPractice(page, { enrolled: [2] });
    await page.goto('/dashboard/practice/2?test=201');
    await expect(page.getByText('Labas! Čia mano draugas Jonas.')).toBeVisible();
    expect(exams).toEqual([]);
  });

  test('?test= of a locked test stays on the category list', async ({ page }) => {
    const { exams } = await mockPractice(page, { enrolled: [1], scores: PARTIAL });
    await page.goto('/dashboard/practice/1?test=106');
    await expect(page.getByText('4 pamoka: Judėjimas, dalyvavimas, rinkimai (32–37 str.)')).toBeVisible();
    await page.waitForTimeout(500);
    expect(exams).toEqual([]);
  });

  test('final exam card: shown for an enrolled category, starts the is_final test', async ({ page }) => {
    await mockPractice(page, { enrolled: [1], scores: { ...ALL_CONST, 110: null }, premium: true });
    await page.goto('/dashboard/practice');
    const card = page.getByTestId('final-exam-card');
    await expect(card).toContainText('Итоговый экзамен');
    await expect(card).toContainText('Baigiamasis egzaminas · 30 вопросов · 75%');
    await card.click();
    await expect(page).toHaveURL(/\/dashboard\/practice\/1\/?\?test=110$/);
  });

  test('final exam card is absent without enrollment and disabled while locked', async ({ page }) => {
    await mockPractice(page, { enrolled: [], });
    await page.goto('/dashboard/practice');
    await expect(page.getByTestId('featured-card')).toBeVisible();
    await expect(page.getByTestId('final-exam-card')).toHaveCount(0);
    await page.unrouteAll();
    await mockPractice(page, { enrolled: [1], scores: PARTIAL });
    await page.goto('/dashboard/practice');
    await expect(page.getByTestId('final-exam-card')).toBeDisabled();
  });

  test('exam 403 from the server shows the premium wall', async ({ page }) => {
    // The list says "premium user" (stale client state) — only the server's 403 stops it.
    const { exams } = await mockPractice(page, { enrolled: [1], scores: { ...ALL_CONST, 110: null }, premium: true, examStatus: 403 });
    await page.goto('/dashboard/practice/1?test=110');
    await expect(page.getByTestId('practice-premium-wall')).toBeVisible();
    expect(exams).toEqual([110]);
    await expect(page.getByText('Kokia yra Lietuvos sostinė?')).toHaveCount(0);
  });

  test('«Убрать» asks, then DELETEs; a 404 counts as removed', async ({ page }) => {
    const { calls } = await mockPractice(page, { enrolled: [1], scores: PARTIAL, enrollStatus: 404 });
    await page.goto('/dashboard/practice');
    await page.getByTestId('category-practice-1').click();
    await page.getByTestId('unenroll-button').click();
    await expect(page.getByTestId('unenroll-confirm')).toBeVisible();
    await page.getByTestId('unenroll-confirm-button').click();
    await expect.poll(() => calls).toContain('DELETE /api/me/practice-categories/1');
    await expect(page.getByTestId('category-practice-1').getByTestId('enrolled-dot')).toHaveCount(0);
    await expect(page.getByTestId('practice-action-error')).toHaveCount(0);
    await expect(page.getByTestId('practice-sections')).toContainText('Что внутри: Конституция');
  });

  test('nothing left: previews a non-enrolled category, no hero «Продолжить»', async ({ page }) => {
    await mockPractice(page, { enrolled: [1], scores: ALL_CONST });
    await page.goto('/dashboard/practice');
    const featured = page.getByTestId('featured-card');
    await expect(featured).toHaveAttribute('data-kind', 'preview');
    await expect(featured).toContainText('Чтение');
    await expect(page.getByTestId('featured-add')).toBeVisible();
    await expect(page.getByTestId('hero-continue')).toHaveCount(0);
  });

  test('nothing left anywhere: completion summary', async ({ page }) => {
    await mockPractice(page, { enrolled: [1, 2], scores: { ...ALL_CONST, ...ALL_READING } });
    await page.goto('/dashboard/practice');
    const featured = page.getByTestId('featured-card');
    await expect(featured).toHaveAttribute('data-kind', 'done');
    await expect(featured).toContainText('Все тесты сданы');
    await expect(page.getByTestId('hero-continue')).toHaveCount(0);
  });

  test('chip selection switches the featured card and the sections', async ({ page }) => {
    await mockPractice(page, { enrolled: [1], scores: PARTIAL });
    await page.goto('/dashboard/practice');
    await page.getByTestId('category-practice-2').click();
    await expect(page.getByTestId('category-practice-2')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('featured-card')).toHaveAttribute('data-kind', 'preview');
    await expect(page.getByTestId('featured-card')).toContainText('Чтение');
    const sections = page.getByTestId('practice-sections');
    await expect(sections).toContainText('Что внутри: Чтение');
    // Reading tests have no section: one card each, a single «Начать» button, disabled in preview.
    await expect(page.getByTestId('practice-section-card')).toHaveCount(3);
    await expect(page.getByTestId('practice-section-card').first()).toContainText('«Это мой друг»');
    await expect(page.getByTestId('practice-test-button').first()).toHaveText('Начать');
    await expect(page.getByTestId('practice-test-button').first()).toBeDisabled();
    await page.getByTestId('stack-card-1').click();
    await expect(page.getByTestId('featured-card')).toHaveAttribute('data-kind', 'next');
  });
});

test.describe('Practice bento — mobile and EN', () => {
  test('375px: 44px test buttons and chips, no horizontal overflow, sample hidden', async ({ page }) => {
    await mockPractice(page, { enrolled: [1], scores: PARTIAL, width: 375 });
    await page.goto('/dashboard/practice');
    await expect(page.getByTestId('featured-card')).toBeVisible();
    const box = await page.getByTestId('practice-test-button').first().boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
    const chip = await page.getByTestId('category-all').boundingBox();
    expect(chip!.height).toBeGreaterThanOrEqual(44);
    await expect(page.getByTestId('practice-sample')).toBeHidden();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test('EN copy: titles flip to English, LT becomes the sub-heading', async ({ page }) => {
    await mockPractice(page, { enrolled: [1], scores: PARTIAL, lang: 'en' });
    await page.goto('/dashboard/practice');
    await expect(page.getByTestId('stats-card-practice')).toContainText('Practice');
    await expect(page.getByTestId('category-all')).toContainText('All');
    await expect(page.getByTestId('featured-heading')).toHaveText('Lesson 2: Art. 7–12');
    await expect(page.getByTestId('featured-subheading')).toHaveText('2 pamoka: Įstatymai, teritorija, pilietybė (7–12 str.)');
    await expect(page.getByTestId('featured-meta')).toHaveText('10 questions · pass mark 60%');
    await expect(page.getByTestId('practice-section-card').first()).toContainText('Block 1: articles 1–31');
    await expect(page.getByTestId('hero-continue')).toContainText('Continue');
  });
});
