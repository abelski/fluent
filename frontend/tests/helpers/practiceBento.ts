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
  id: number, title_ru: string, title_en: string, section: readonly [string, string] | null,
  extra: Partial<{ pass: number; q: number; is_final: boolean; is_premium: boolean; lesson_text_lt: string }> = {},
) => ({
  id, title_ru, title_en, description_ru: null, description_en: null,
  lesson_text_lt: extra.lesson_text_lt ?? null,
  question_count: extra.q ?? 10, active_question_count: 40, pass_threshold: extra.pass ?? 0.6,
  is_premium: extra.is_premium ?? false, is_final: extra.is_final ?? false,
  section_ru: section?.[0] ?? null, section_en: section?.[1] ?? null,
});

// Real titles: Constitution title_ru is Lithuanian; Reading title_en is Lithuanian.
export const TESTS: Record<number, ReturnType<typeof test>[]> = {
  1: [
    test(101, 'Пример теста Конституция Литвы', 'Sample test Lithuanian Constitution', FIN, { pass: 0, q: 20 }),
    test(102, '1 pamoka: Valstybiniai pagrindai (1–6 str.)', 'Lesson 1: Art. 1–6', B1),
    test(103, '2 pamoka: Įstatymai, teritorija, pilietybė (7–12 str.)', 'Lesson 2: Art. 7–12', B1),
    test(104, '3 pamoka: Kalba, simboliai, sostinė (13–17 str.)', 'Lesson 3: Art. 13–17', B1),
    test(105, 'Kartojimas 1: 1–3 pamokos (1–17 str.)', 'Review 1: Lessons 1–3', B1, { pass: 0.7 }),
    test(106, '4 pamoka: Judėjimas, dalyvavimas, rinkimai (32–37 str.)', 'Lesson 4: Art. 32–37', B2),
    test(107, '5 pamoka: Šeima, vaikai, švietimas (38–41 str.)', 'Lesson 5: Art. 38–41', B2),
    test(108, 'Kartojimas 2: 4–5 pamokos (32–41 str.)', 'Review 2: Lessons 4–5', B2, { pass: 0.7 }),
    test(109, 'Tik skaičiai ir datos', 'Dates & Numbers Test', FIN, { pass: 0.7 }),
    test(110, 'Baigiamasis egzaminas', 'Final Exam', FIN, { pass: 0.75, q: 30, is_final: true, is_premium: true }),
  ],
  2: [
    test(201, '«Это мой друг»', '2 skyrius — Čia mano draugas', null, {
      pass: 0.7, q: 6, lesson_text_lt: '**Tomas:** Labas! Čia mano draugas Jonas.\n**Jonas:** Labas, malonu susipažinti.',
    }),
    test(202, '«Какой твой адрес?»', '3 skyrius — Koks tavo adresas?', null, { pass: 0.7, q: 6 }),
    test(203, 'На рынке', '8 skyrius — Turguje', null, { pass: 0.7, q: 6 }),
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
  await page.route('**/api/me/practice-categories/*', (r) => {
    const url = new URL(r.request().url());
    calls.push(`${r.request().method()} ${url.pathname}`);
    return r.fulfill({ status: m.enrollStatus ?? 200, json: m.enrollStatus ? { detail: 'boom' } : { ok: true } });
  });
  return { calls, exams };
}
