import type { Page } from '@playwright/test';
import { makeFakeJwt } from './grammarBento';

// Shared mocked API for the #55 practice page (practice-bento.spec.ts and
// plan55-screenshots.spec.ts). Everything is mocked: the local backend shares the
// production DB, so these tests must never enroll, unenroll or save a result for real.

export const CATEGORIES = [
  {
    id: 1, name_ru: 'Конституция', name_en: 'Constitution', sort_order: 0, source_url: null,
    description_ru: 'Подготовка к гражданству и ПМЖ: уроки по статьям, повторения и итоговый экзамен.',
    description_en: 'Citizenship and residency prep: lessons by article, reviews and a final exam.',
  },
  {
    id: 2, name_ru: 'Чтение', name_en: 'Reading', sort_order: 1, source_url: null,
    description_ru: 'Короткие тексты из жизни: адрес, рынок, аренда. Формат экзамена A2.',
    description_en: 'Short everyday texts: addresses, the market, renting. A2 exam format.',
  },
];

const B1 = ['Блок 1: статьи 1–31', 'Block 1: articles 1–31'] as const;
const B2 = ['Блок 2: статьи 32–54', 'Block 2: articles 32–54'] as const;
const FIN = ['Итоговые тесты', 'Final tests'] as const;

const test = (
  id: number, title_ru: string, title_en: string, title_lt: string | null, section: readonly [string, string] | null,
  extra: Partial<{ pass: number; q: number; is_final: boolean; is_premium: boolean; lesson_text_lt: string }> = {},
) => ({
  id, title_ru, title_en, title_lt, description_ru: null, description_en: null,
  lesson_text_lt: extra.lesson_text_lt ?? null,
  question_count: extra.q ?? 10, active_question_count: 40, pass_threshold: extra.pass ?? 0.6,
  is_premium: extra.is_premium ?? false, is_final: extra.is_final ?? false,
  section_ru: section?.[0] ?? null, section_en: section?.[1] ?? null,
});

// Titles as they are after the #66 data fix (backend/scripts/fix_practice_titles_66.py):
// title_ru / title_en in the UI language, title_lt the Lithuanian original.
export const TESTS: Record<number, ReturnType<typeof test>[]> = {
  1: [
    test(101, 'Пробный тест', 'Sample test', null, FIN, { pass: 0, q: 20 }),
    test(102, 'Тест 1: статьи 1–6', 'Test 1: Art. 1–6', '1 pamoka: Valstybiniai pagrindai (1–6 str.)', B1),
    test(103, 'Тест 2: статьи 7–12', 'Test 2: Art. 7–12', '2 pamoka: Įstatymai, teritorija, pilietybė (7–12 str.)', B1),
    test(104, 'Тест 3: статьи 13–17', 'Test 3: Art. 13–17', '3 pamoka: Kalba, simboliai, sostinė (13–17 str.)', B1),
    test(105, 'Контрольная 1: статьи 1–17', 'Checkpoint 1: Art. 1–17', 'Kartojimas 1: 1–3 pamokos (1–17 str.)', B1, { pass: 0.7 }),
    test(106, 'Тест 4: статьи 32–37', 'Test 4: Art. 32–37', '4 pamoka: Judėjimas, dalyvavimas, rinkimai (32–37 str.)', B2),
    test(107, 'Тест 5: статьи 38–41', 'Test 5: Art. 38–41', '5 pamoka: Šeima, vaikai, švietimas (38–41 str.)', B2),
    test(108, 'Контрольная 2: статьи 32–41', 'Checkpoint 2: Art. 32–41', 'Kartojimas 2: 4–5 pamokos (32–41 str.)', B2, { pass: 0.7 }),
    test(109, 'Даты и числа', 'Dates & Numbers Test', 'Tik skaičiai ir datos', FIN, { pass: 0.7 }),
    test(110, 'Итоговый экзамен', 'Final Exam', 'Baigiamasis egzaminas', FIN, { pass: 0.75, q: 30, is_final: true, is_premium: true }),
  ],
  2: [
    test(201, 'Это мой друг', 'This is my friend', '2 skyrius — Čia mano draugas', null, {
      pass: 0.7, q: 6, lesson_text_lt: '**Tomas:** Labas! Čia mano draugas Jonas.\n**Jonas:** Labas, malonu susipažinti.',
    }),
    test(202, 'Какой твой адрес?', "What's your address?", '3 skyrius — Koks tavo adresas?', null, { pass: 0.7, q: 6 }),
    test(203, 'На рынке', 'At the market', '8 skyrius — Turguje', null, { pass: 0.7, q: 6 }),
  ],
};

export type Score = number | null | 'L'; // best_score_pct, or 'L' = locked

export const QUESTIONS = [
  {
    id: 1, question_ru: 'Столица Литвы?', question_lt: 'Kokia yra Lietuvos sostinė?',
    option_a: 'Vilnius', option_b: 'Kaunas', option_c: 'Klaipėda', option_d: 'Trakai', correct_option: 'a', category: null,
  },
];

export interface PracticeMock {
  enrolled: number[];
  scores?: Record<number, Score>;
  guest?: boolean;
  premium?: boolean; // /me/quota premium_active
  lang?: 'ru' | 'en';
  width?: number;
  enrollStatus?: number; // status for POST/DELETE /me/practice-categories/*
  examStatus?: number; // status for GET /practice/tests/*/exam
  lastResult?: Record<number, string | null>; // #66 — category id → last_result_at
}

/** Mocks every endpoint the practice page and the category page touch. Returns the
 * mutation calls ("DELETE /api/me/practice-categories/1") and exam requests (test ids). */
export async function mockPractice(page: Page, m: PracticeMock) {
  const calls: string[] = [];
  const exams: number[] = [];
  const enrolled = new Set(m.enrolled);
  await page.addInitScript(([token, lang]) => {
    if (token) localStorage.setItem('fluent_token', token);
    localStorage.setItem('fluent_lang', lang);
    localStorage.setItem('cookie_consent', 'accepted');
  }, [m.guest ? '' : makeFakeJwt(), m.lang ?? 'ru'] as const);
  await page.setViewportSize({ width: m.width ?? 1280, height: 900 });

  // Fallback first so every specific route below wins.
  await page.route('**/api/**', (r) => r.fulfill({ json: [] }));
  await page.route('**/api/billing/config', (r) => r.fulfill({ json: { enabled: true } }));
  await page.route('**/api/me/quota', (r) => r.fulfill({ json: {
    is_premium: !!m.premium, premium_active: !!m.premium, premium_until: null, sessions_today: 0,
    daily_limit: 10, is_admin: false, is_superadmin: false } }));
  await page.route('**/api/practice/categories', (r) =>
    r.fulfill({ json: CATEGORIES.map((c) => ({
      ...c, test_count: TESTS[c.id].length, enrolled: !m.guest && enrolled.has(c.id) })) }));
  await page.route(/\/api\/practice\/categories\/(\d+)\/tests/, (r) => {
    const id = Number(new URL(r.request().url()).pathname.split('/')[4]);
    const scores = m.scores ?? {};
    return r.fulfill({ json: (TESTS[id] ?? []).map((t) => {
      const s = m.guest ? null : scores[t.id] ?? null;
      return { ...t, is_locked: s === 'L', best_score_pct: s === 'L' ? null : s };
    }) });
  });
  await page.route(/\/api\/practice\/tests\/(\d+)\/exam/, (r) => {
    const id = Number(new URL(r.request().url()).pathname.split('/')[4]);
    exams.push(id);
    if (m.examStatus && m.examStatus !== 200) {
      return r.fulfill({ status: m.examStatus, json: { detail: { code: 'premium_required' } } });
    }
    const t = Object.values(TESTS).flat().find((x) => x.id === id)!;
    return r.fulfill({ json: {
      test: { id, title_ru: t.title_ru, title_en: t.title_en, pass_threshold: t.pass_threshold, lesson_text_lt: t.lesson_text_lt },
      questions: QUESTIONS,
    } });
  });
  // #66 — enrolled categories with the latest result date (drives «Пора повторить» and the hero).
  await page.route('**/api/me/practice-categories', (r) =>
    r.fulfill({ json: m.guest ? [] : [...enrolled].map((id) => ({
      id, tests_passed: 0, tests_total: TESTS[id]?.length ?? 0, last_result_at: m.lastResult?.[id] ?? null })) }));
  await page.route('**/api/me/practice-categories/*', (r) => {
    const url = new URL(r.request().url());
    const method = r.request().method();
    calls.push(`${method} ${url.pathname}`);
    // Stateful like the server: the page reloads categories after enrolling.
    if (!m.enrollStatus) {
      const id = Number(url.pathname.split('/').pop());
      if (method === 'POST') enrolled.add(id);
      if (method === 'DELETE') enrolled.delete(id);
    }
    return r.fulfill({ status: m.enrollStatus ?? 200, json: m.enrollStatus ? { detail: 'boom' } : { ok: true } });
  });
  return { calls, exams };
}
