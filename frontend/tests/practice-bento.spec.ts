import { test, expect } from '@playwright/test';
import { daysAgo } from './helpers/grammarBento';
import { CATEGORIES, TESTS, mockPractice } from './helpers/practiceBento';

// #66 — Практика as overview («В процессе» / «Завершённые» / catalogue grouped by exam) plus
// the program page on `?program=<id>`. Fully mocked (fixtures in helpers/practiceBento.ts):
// category 1 = Constitution (101 sample, 102–105 block 1, 106–108 block 2, 109 dates,
// 110 final + premium), 2 = Reading (201–203, no sections; 201 has a reading text).
// overview-pages.spec.ts covers the page states on both pages; this file covers the details.

const L = 'L' as const;
// Block 1 partly done: 101 sample passed, 102 passed, 103 attempted 50%, rest locked.
const PARTIAL = { 101: 1, 102: 0.9, 103: 0.5, 104: L, 105: L, 106: L, 107: L, 108: L, 109: L, 110: L };
const NEW_CIT = { 102: null, 103: L, 104: L, 105: L, 106: L, 107: L, 108: L, 109: L, 110: L };
const ALL_CONST = { 101: 1, 102: 0.9, 103: 0.8, 104: 0.7, 105: 0.9, 106: 0.8, 107: 0.8, 108: 0.9, 109: 0.8, 110: 0.9 };
const ALL_READING = { 201: 1, 202: 1, 203: 0.9 };
const READING_PART = { 201: 0.5, 202: L, 203: L };

test.describe('Practice overview — onboarding (none / guest)', () => {
  test('guest sees the page, not /login; hero 0; two starts; catalogue by exam', async ({ page }) => {
    await mockPractice(page, { enrolled: [], guest: true });
    await page.goto('/dashboard/practice');
    await expect(page.getByTestId('practice-hero-count')).toHaveText('0');
    await expect(page).toHaveURL(/\/dashboard\/practice\/?$/);
    await expect(page.getByTestId('stats-card-practice')).not.toContainText(/из \d/);
    await expect(page.getByTestId('hero-start-practice')).toHaveText('Начать с Конституции');
    await expect(page.getByTestId('hero-start-a2')).toHaveText('Начать с чтения (A2)');
    await expect(page.getByTestId('hero-continue')).toHaveCount(0);
    const cat = page.getByTestId('catalogue-section');
    await expect(cat).toContainText('Можно готовиться к обоим экзаменам.');
    await expect(page.getByTestId('catalogue-group-cit')).toContainText('Тест по Конституции — гражданство и ПМЖ');
    await expect(page.getByTestId('catalogue-group-cit').getByTestId('catalog-card-1')).toContainText('10 тестов');
    await expect(page.getByTestId('catalogue-group-a2')).toContainText('Языковой экзамен A2');
    await expect(page.getByTestId('catalogue-group-a2').getByTestId('catalog-card-2')).toContainText('Чтение');
    await expect(page.getByTestId('add-all-a2')).toHaveCount(0); // one A2 part only
    await expect(page.getByTestId('in-progress-section')).toHaveCount(0);
  });

  test('«Что внутри»: format, sample test, blocks and the exam', async ({ page }) => {
    await mockPractice(page, { enrolled: [] });
    await page.goto('/dashboard/practice');
    const card = page.getByTestId('catalog-card-1');
    await page.getByTestId('catalog-card-1-inside').click();
    await expect(card.getByText('Тесты по 10–30 вопросов, проходной балл 60–75%. Открываются по порядку.')).toBeVisible();
    await expect(card).toContainText('Пробный тест · 20 вопросов, без проходного балла');
    await expect(card).toContainText('Блок 1: статьи 1–31 · 4 теста');
    await expect(card).toContainText('Экзамен · 30 вопросов');
  });

  test('guest «Начать с Конституции» and «Добавить» go to /login', async ({ page }) => {
    const { calls } = await mockPractice(page, { enrolled: [], guest: true });
    await page.goto('/dashboard/practice');
    await page.getByTestId('hero-start-practice').click();
    await expect(page).toHaveURL(/\/login/);
    await page.goto('/dashboard/practice');
    await page.getByTestId('catalog-card-2-add').click();
    await expect(page).toHaveURL(/\/login/);
    expect(calls).toEqual([]);
  });

  test('signed-in «Начать с Конституции» enrolls and opens the program page; «Отменить» undoes', async ({ page }) => {
    const { calls } = await mockPractice(page, { enrolled: [], scores: NEW_CIT });
    await page.goto('/dashboard/practice');
    await page.getByTestId('hero-start-practice').click();
    await expect.poll(() => calls).toEqual(['POST /api/me/practice-categories/1']);
    await expect(page).toHaveURL(/\/dashboard\/practice\/?\?program=1$/);
    await expect(page.getByTestId('added-banner')).toContainText('«Конституция» — теперь в твоих программах');
    await page.getByTestId('added-undo').click();
    await expect.poll(() => calls).toEqual(['POST /api/me/practice-categories/1', 'DELETE /api/me/practice-categories/1']);
    await expect(page.getByTestId('hero-start-practice')).toBeVisible();
  });

  test('«Начать с чтения (A2)» enrolls Reading', async ({ page }) => {
    const { calls } = await mockPractice(page, { enrolled: [] });
    await page.goto('/dashboard/practice');
    await page.getByTestId('hero-start-a2').click();
    await expect.poll(() => calls).toEqual(['POST /api/me/practice-categories/2']);
    await expect(page).toHaveURL(/\?program=2$/);
  });

  test('«Добавить все части (N)» enrolls every A2 part', async ({ page }) => {
    const { calls } = await mockPractice(page, { enrolled: [] });
    const listening = { id: 3, name_ru: 'Аудирование', name_en: 'Listening', sort_order: 2, source_url: null,
      description_ru: 'Диалоги на слух.', description_en: 'Dialogues by ear.', test_count: 1, enrolled: false };
    // A third, A2 category on top of the shared fixture (routes added later win).
    await page.route('**/api/practice/categories', (r) => r.fulfill({ json: [
      ...CATEGORIES.map((c) => ({ ...c, test_count: TESTS[c.id].length, enrolled: false })),
      listening,
    ] }));
    await page.route('**/api/practice/categories/3/tests', (r) => r.fulfill({ json: [{
      id: 301, title_ru: 'В аптеке', title_en: 'At the pharmacy', title_lt: 'Vaistinėje', description_ru: null, description_en: null,
      lesson_text_lt: null, question_count: 5, active_question_count: 5, pass_threshold: 0.7, is_premium: false, is_final: false,
      section_ru: null, section_en: null, is_locked: false, best_score_pct: null,
    }] }));
    await page.goto('/dashboard/practice');
    await expect(page.getByTestId('add-all-a2')).toHaveText('Добавить все части (2)');
    await expect(page.getByTestId('add-all-cit')).toHaveCount(0);
    await page.getByTestId('add-all-a2').click();
    await expect.poll(() => calls).toEqual(['POST /api/me/practice-categories/2', 'POST /api/me/practice-categories/3']);
  });

  test('enroll failure shows the error line', async ({ page }) => {
    await mockPractice(page, { enrolled: [], enrollStatus: 500 });
    await page.goto('/dashboard/practice');
    await page.getByTestId('hero-start-practice').click();
    await expect(page.getByTestId('practice-action-error')).toHaveText('Не получилось — попробуйте ещё раз.');
  });
});

test.describe('Practice overview — enrolled', () => {
  test('in-progress card names the next test; the hero is the only «Продолжить»', async ({ page }) => {
    await mockPractice(page, { enrolled: [1], scores: PARTIAL });
    await page.goto('/dashboard/practice');
    await expect(page.getByTestId('practice-hero-count')).toHaveText('2');
    await expect(page.getByTestId('stats-card-practice')).toContainText('из 10');
    await expect(page.getByTestId('hero-next')).toHaveText('Дальше — Конституция: Тест 2: статьи 7–12 — лучший 50% · нужно 60%');
    const card = page.getByTestId('program-card-1');
    await expect(card).toContainText('2/10 тестов');
    await expect(card).toContainText('Дальше — Тест 2: статьи 7–12 — лучший 50% · нужно 60%');
    await expect(card).toHaveAttribute('href', /\/dashboard\/practice\/?\?program=1$/);
    const continues = page.getByRole('button', { name: 'Продолжить' }).or(page.getByRole('link', { name: 'Продолжить' }));
    await expect(continues).toHaveCount(1);
    await expect(page.getByTestId('catalogue-section').getByRole('heading', { level: 2 })).toHaveText('Другие программы');
  });

  test('hero «Продолжить» opens the next test via ?test=', async ({ page }) => {
    const { exams } = await mockPractice(page, { enrolled: [1], scores: PARTIAL });
    await page.goto('/dashboard/practice');
    await page.getByTestId('hero-continue').click();
    await expect(page).toHaveURL(/\/dashboard\/practice\/1\/?\?test=103$/);
    await expect(page.getByText('Kokia yra Lietuvos sostinė?').first()).toBeVisible();
    expect(exams).toEqual([103]);
  });

  test('the hero continues the category practised last', async ({ page }) => {
    await mockPractice(page, { enrolled: [1, 2], scores: { ...PARTIAL, ...READING_PART }, lastResult: { 1: daysAgo(4), 2: daysAgo(1) } });
    await page.goto('/dashboard/practice');
    await expect(page.getByTestId('hero-next')).toContainText('Чтение: Это мой друг');
    await page.unrouteAll({ behavior: 'ignoreErrors' });
    await mockPractice(page, { enrolled: [1, 2], scores: { ...PARTIAL, ...READING_PART }, lastResult: { 1: daysAgo(1), 2: daysAgo(4) } });
    await page.goto('/dashboard/practice');
    await expect(page.getByTestId('hero-next')).toContainText('Конституция: Тест 2: статьи 7–12');
  });

  test('a finished category is one row with «Пора повторить»; review reopens its weakest test', async ({ page }) => {
    await mockPractice(page, { enrolled: [1, 2], scores: { ...PARTIAL, ...ALL_READING }, lastResult: { 1: daysAgo(1), 2: daysAgo(9) } });
    await page.goto('/dashboard/practice');
    await expect(page.getByTestId('program-card-2')).toHaveCount(0);
    await page.getByTestId('completed-section').locator('summary').click();
    const row = page.getByTestId('completed-row-2');
    await expect(row).toContainText('Чтение');
    await expect(row).toContainText('3/3');
    await expect(row.getByTestId('due-tag')).toHaveText('Пора повторить');
    await expect(row).toContainText('последний раз 9 дней назад · слабее всего: На рынке — ✓ 90%');
    await expect(row.getByTestId('completed-review')).toHaveText('Повторить · 6 вопросов');
    await expect(row).toContainText('Пройти заново тест, где результат слабее всего');
    await row.getByTestId('completed-review').click();
    await expect(page).toHaveURL(/\/dashboard\/practice\/2\/?\?test=203$/);
  });

  test('everything enrolled is done → hero says so and retakes the weakest test of the most overdue', async ({ page }) => {
    await mockPractice(page, { enrolled: [1, 2], scores: { ...ALL_CONST, ...ALL_READING }, premium: true, lastResult: { 1: daysAgo(2), 2: daysAgo(12) } });
    await page.goto('/dashboard/practice');
    await expect(page.getByTestId('hero-next')).toHaveText('✓ Все тесты пройдены');
    await expect(page.getByTestId('hero-continue')).toHaveCount(0);
    await expect(page.getByTestId('hero-review')).toHaveText('Повторить · 6 вопросов');
    await page.getByTestId('hero-review').click();
    await expect(page).toHaveURL(/\/dashboard\/practice\/2\/?\?test=203$/);
  });
});

test.describe('Practice program page', () => {
  test('a new enrolment starts with the sample test; blocks and the pinned exam follow', async ({ page }) => {
    await mockPractice(page, { enrolled: [1], scores: NEW_CIT });
    await page.goto('/dashboard/practice?program=1');
    await expect(page.getByTestId('program-continue')).toHaveText('Начать');
    const rows = page.getByTestId('remaining-card').getByTestId('test-row');
    await expect(rows.first()).toContainText('Начни здесь');
    await expect(rows.first()).toContainText('Пробный тест');
    await expect(rows.first()).toContainText('Формат как на настоящем экзамене');
    await expect(rows.first()).toContainText('20 вопросов · без проходного балла');
    await expect(rows.first()).toHaveAttribute('href', /\/dashboard\/practice\/1\/?\?test=101$/);
    const last = rows.last();
    await expect(last).toContainText('Итоговый экзамен');
    await expect(last).toContainText('Экзамен');
    await expect(last).toContainText('Premium');
    await expect(last.getByTestId('lock-reason')).toHaveText('Откроется, когда пройдены все блоки и итоговые тесты');
  });

  test('blocks: the current one open, the others name the block before them', async ({ page }) => {
    await mockPractice(page, { enrolled: [1], scores: PARTIAL });
    await page.goto('/dashboard/practice?program=1');
    const blocks = page.getByTestId('practice-block');
    await expect(blocks).toHaveCount(3);
    await expect(blocks.nth(0)).toHaveAttribute('data-current', 'true');
    await expect(blocks.nth(0)).toHaveAttribute('open', '');
    await expect(blocks.nth(0).locator('summary')).toContainText('Блок 1: статьи 1–31');
    await expect(blocks.nth(0).locator('summary')).toContainText('1/4');
    await expect(blocks.nth(1)).not.toHaveAttribute('open', '');
    await expect(blocks.nth(1).locator('summary')).toContainText('Откроется после «Блок 1: статьи 1–31»');
    await expect(blocks.nth(2).locator('summary')).toContainText('Откроется после «Блок 2: статьи 32–54»');
  });

  test('a test row is a whole-row link with the Lithuanian original under the title', async ({ page }) => {
    const { exams } = await mockPractice(page, { enrolled: [1], scores: PARTIAL });
    await page.goto('/dashboard/practice?program=1');
    const next = page.getByTestId('test-row').and(page.locator('[data-state="next"]'));
    await expect(next).toContainText('Дальше');
    await expect(next).toContainText('Тест 2: статьи 7–12');
    await expect(next).toContainText('2 pamoka: Įstatymai, teritorija, pilietybė (7–12 str.)');
    await expect(next).toContainText('10 вопросов · лучший 50% · нужно 60%');
    await next.click();
    await expect(page).toHaveURL(/\/dashboard\/practice\/1\/?\?test=103$/);
    await expect.poll(() => exams).toEqual([103]);
  });

  test('locked rows: the first says why without a tap, the next one on tap', async ({ page }) => {
    await mockPractice(page, { enrolled: [2], scores: READING_PART });
    await page.goto('/dashboard/practice?program=2');
    const rows = page.getByTestId('remaining-card').getByTestId('test-row');
    await expect(rows).toHaveCount(3);
    await expect(rows.nth(1).getByTestId('lock-reason')).toHaveText('Откроется после «Это мой друг» — нужно 70%');
    await expect(rows.nth(2).getByTestId('lock-reason')).toHaveCount(0);
    await rows.nth(2).click();
    await expect(rows.nth(2).getByTestId('lock-reason')).toHaveText('Откроется после «Какой твой адрес?» — нужно 70%');
    await expect(page).toHaveURL(/\?program=2$/); // a locked row never navigates
  });

  test('«Пройдено»: folded while in progress, weakest first, sample last; review retakes the weakest', async ({ page }) => {
    await mockPractice(page, { enrolled: [1], scores: PARTIAL });
    await page.goto('/dashboard/practice?program=1');
    const passed = page.getByTestId('passed-card');
    await expect(passed).not.toHaveAttribute('open', '');
    await expect(passed.locator('summary')).toContainText('Пройдено2 теста · слабее всего: Тест 1: статьи 1–6 ✓ 90%');
    await passed.locator('summary').click();
    const rows = passed.getByTestId('test-row');
    await expect(rows.nth(0)).toContainText('Тест 1: статьи 1–6');
    await expect(rows.nth(1)).toContainText('Пробный тест');
    await page.getByTestId('passed-review').click();
    await expect(page).toHaveURL(/\/dashboard\/practice\/1\/?\?test=102$/);
  });

  test('a finished category: done line, retake button, «Пройдено» open, no «Осталось»', async ({ page }) => {
    await mockPractice(page, { enrolled: [2], scores: ALL_READING, lastResult: { 2: daysAgo(9) } });
    await page.goto('/dashboard/practice?program=2');
    const line = page.getByTestId('program-next');
    await expect(line).toContainText('✓ Все тесты пройдены');
    await expect(line.getByTestId('due-tag')).toBeVisible();
    await expect(line).toContainText('Слабее всего: На рынке — ✓ 90%');
    await expect(page.getByTestId('remaining-card')).toHaveCount(0);
    await expect(page.getByTestId('passed-card')).toHaveAttribute('open', '');
    await page.getByTestId('program-review').click();
    await expect(page).toHaveURL(/\/dashboard\/practice\/2\/?\?test=203$/);
  });

  test('⋯ → «Убрать программу» asks, then DELETEs; a 404 counts as removed', async ({ page }) => {
    const { calls } = await mockPractice(page, { enrolled: [1], scores: PARTIAL, enrollStatus: 404 });
    await page.goto('/dashboard/practice?program=1');
    await page.getByTestId('program-menu').click();
    await page.getByTestId('unenroll-button').click();
    await expect(page.getByTestId('unenroll-confirm')).toContainText('Конституция');
    await page.getByTestId('unenroll-confirm-button').click();
    await expect.poll(() => calls).toContain('DELETE /api/me/practice-categories/1');
    await expect(page).toHaveURL(/\/dashboard\/practice\/?$/);
    await expect(page.getByTestId('practice-action-error')).toHaveCount(0);
    await expect(page.getByTestId('hero-start-practice')).toBeVisible();
  });

  test('switcher chips list my other programs; back returns to the overview', async ({ page }) => {
    await mockPractice(page, { enrolled: [1, 2], scores: { ...PARTIAL, ...ALL_READING } });
    await page.goto('/dashboard/practice?program=1');
    await expect(page.getByTestId('switch-chip-2')).toContainText('✓Чтение');
    await page.getByTestId('switch-chip-2').click();
    await expect(page).toHaveURL(/\?program=2$/);
    await expect(page.getByTestId('program-header')).toContainText('Чтение');
    await page.getByTestId('program-back').click();
    await expect(page).toHaveURL(/\/dashboard\/practice\/?$/);
  });
});

test.describe('Practice — category page links', () => {
  test('?test= of a test with a reading text opens the reading view first', async ({ page }) => {
    const { exams } = await mockPractice(page, { enrolled: [2] });
    await page.goto('/dashboard/practice/2?test=201');
    await expect(page.getByText('Labas! Čia mano draugas Jonas.')).toBeVisible();
    expect(exams).toEqual([]);
  });

  test('?test= of a locked test stays on the category list', async ({ page }) => {
    const { exams } = await mockPractice(page, { enrolled: [1], scores: PARTIAL });
    await page.goto('/dashboard/practice/1?test=106');
    await expect(page.getByText('Тест 4: статьи 32–37')).toBeVisible();
    await page.waitForTimeout(500);
    expect(exams).toEqual([]);
  });

  test('exam 403 from the server shows the premium wall', async ({ page }) => {
    // The list says "premium user" (stale client state) — only the server's 403 stops it.
    const { exams } = await mockPractice(page, { enrolled: [1], scores: { ...ALL_CONST, 110: null }, premium: true, examStatus: 403 });
    await page.goto('/dashboard/practice/1?test=110');
    await expect(page.getByTestId('practice-premium-wall')).toBeVisible();
    expect(exams).toEqual([110]);
    await expect(page.getByText('Kokia yra Lietuvos sostinė?')).toHaveCount(0);
  });
});

test.describe('Practice — mobile and EN', () => {
  test('375px: rows ≥ 44px, sample hidden, no horizontal overflow', async ({ page }) => {
    await mockPractice(page, { enrolled: [1], scores: PARTIAL, width: 375 });
    await page.goto('/dashboard/practice');
    await expect(page.getByTestId('program-card-1')).toBeVisible();
    await expect(page.getByTestId('practice-sample')).toBeHidden();
    let overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    await page.goto('/dashboard/practice?program=1');
    const box = await page.getByTestId('test-row').first().boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
    overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test('EN copy: English titles, the Lithuanian original as the sub-line', async ({ page }) => {
    await mockPractice(page, { enrolled: [1], scores: PARTIAL, lang: 'en' });
    await page.goto('/dashboard/practice');
    await expect(page.getByTestId('stats-card-practice')).toContainText('Practice');
    await expect(page.getByTestId('hero-next')).toHaveText('Up next — Constitution: Test 2: Art. 7–12 — best 50% · need 60%');
    await expect(page.getByTestId('hero-continue')).toContainText('Continue');
    await page.goto('/dashboard/practice?program=1');
    const next = page.getByTestId('test-row').and(page.locator('[data-state="next"]'));
    await expect(next).toContainText('Test 2: Art. 7–12');
    await expect(next).toContainText('2 pamoka: Įstatymai, teritorija, pilietybė (7–12 str.)');
    await expect(page.getByTestId('practice-block').first().locator('summary')).toContainText('Block 1: articles 1–31');
  });
});
