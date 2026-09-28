import type { Page } from '@playwright/test';

// Shared mocked API for the #53 grammar lesson list (grammar-bento.spec.ts and
// plan53-screenshots.spec.ts). Everything is mocked: the local backend shares the
// production DB, so these tests must never enroll/unenroll for real.

export function makeFakeJwt(): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = btoa(JSON.stringify({ email: 'test@test.com', name: 'Test User', exp: 9999999999 }));
  return `${header}.${payload}.fakesignature`;
}

// Case index → [name, group]; programs 1 and 3 filter on the group.
// Rule names mirror the real API shape: «Родительный (Kilmininkas)» repeats the LT title.
const CONFIG = {
  lessons: [],
  cases: { '1': ['Vardininkas', 'Vienaskaita'], '2': ['Kilmininkas', 'Vienaskaita'], '3': ['Naudininkas', 'Vienaskaita'], '8': ['Vardininkas', 'Daugiskaita'] },
};

export const PROGRAMS = [
  {
    id: 1, title: 'Литовские падежи', title_en: 'Lithuanian Cases',
    description: 'Семь падежей в единственном числе: окончания, вопросы, когда какой нужен.',
    description_en: 'The seven singular cases: endings, questions, and when to use each.',
    difficulty: 1, lesson_filter: '["Vienaskaita"]', program_type: 'cases',
  },
  {
    id: 2, title: 'Глаголы', title_en: 'Verbs',
    description: 'Спряжение в настоящем и прошедшем времени.',
    description_en: 'Conjugation in present and past tense.',
    difficulty: 2, lesson_filter: null, program_type: 'verbs',
  },
  {
    id: 3, title: 'Множественное число', title_en: 'Plural',
    description: 'Падежи во множественном числе.',
    description_en: 'The cases in the plural.',
    difficulty: 2, lesson_filter: '["Daugiskaita"]', program_type: 'cases',
  },
];

const rule = (name_ru: string, name_en: string) => ({
  question: 'Кто? Что?', name_ru, name_en, usage: '', endings_sg: '', endings_pl: '',
});

type Score = number | null | 'L'; // best_score_pct, or 'L' = locked
const noun = (id: number, title: string, level: string, cases: number[], r: ReturnType<typeof rule>) =>
  ({ id, title, level, cases, task_count: 10, rules: [r] });

const NOUNS = [
  noun(1, 'Vardininkas Vns.', 'basic', [1], rule('Именительный (Vardininkas)', 'Nominative (Vardininkas)')),
  noun(2, 'Vardininkas Vns.', 'advanced', [1], rule('Именительный (Vardininkas)', 'Nominative (Vardininkas)')),
  noun(3, 'Vardininkas Vns.', 'practice', [1], rule('Именительный (Vardininkas)', 'Nominative (Vardininkas)')),
  noun(4, 'Kilmininkas Vns.', 'basic', [2], rule('Родительный (Kilmininkas)', 'Genitive (Kilmininkas)')),
  noun(5, 'Kilmininkas Vns.', 'advanced', [2], rule('Родительный (Kilmininkas)', 'Genitive (Kilmininkas)')),
  noun(6, 'Kilmininkas Vns.', 'practice', [2], rule('Родительный (Kilmininkas)', 'Genitive (Kilmininkas)')),
  noun(7, 'Skaičiai: Vardininkas (kiek yra?)', 'basic', [1], rule('Числительные: Именительный (kiek? yra)', 'Numbers: Nominative (kiek? yra)')),
  noun(8, 'Skaičiai: Vardininkas (kiek yra?)', 'advanced', [1], rule('Числительные: Именительный (kiek? yra)', 'Numbers: Nominative (kiek? yra)')),
  noun(20, 'Vardininkas Dgs.', 'basic', [8], rule('Именительный мн.ч. (Vardininkas Dgs.)', 'Nominative plural (Vardininkas Dgs.)')),
  noun(21, 'Vardininkas Dgs.', 'practice', [8], rule('Именительный мн.ч. (Vardininkas Dgs.)', 'Nominative plural (Vardininkas Dgs.)')),
];
const VERBS = [
  { id: 201, title: 'Настоящее время', title_en: 'Present tense', level: 'basic', tense_key: 'present', task_count: 10 },
  { id: 202, title: 'Настоящее время', title_en: 'Present tense', level: 'practice', tense_key: 'present', task_count: 10 },
  { id: 203, title: 'Прошедшее время', title_en: 'Past tense', level: 'basic', tense_key: 'past', task_count: 10 },
  { id: 204, title: 'Прошедшее время', title_en: 'Past tense', level: 'practice', tense_key: 'past', task_count: 10 },
];

function withScores<T extends { id: number }>(ls: T[], scores: Record<number, Score>) {
  return ls.map((l) => {
    const s = scores[l.id] ?? null;
    return { ...l, is_locked: s === 'L', best_score_pct: s === 'L' ? null : s };
  });
}

export const TASKS = [
  { type: 'declension', prompt_lt: 'namas', prompt_ru: 'дом', case_name: 'Vardininkas', number: 'vienaskaita', answer: 'namas' },
];

export interface GrammarMock {
  enrolled: number[];
  scores?: Record<number, Score>;
  guest?: boolean;
  lang?: 'ru' | 'en';
  width?: number;
  enrollStatus?: number; // status for POST/DELETE /me/grammar-programs/*
}

/** Mocks every endpoint the grammar page touches. Returns the list of mutation calls
 * ("POST /api/me/grammar-programs/1") and started-lesson task requests ("lessons/4"). */
export async function mockGrammar(page: Page, m: GrammarMock) {
  const calls: string[] = [];
  const tasks: string[] = [];
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
    is_premium: false, premium_active: false, premium_until: null, sessions_today: 0,
    daily_limit: 10, is_admin: false, is_superadmin: false } }));
  await page.route('**/api/admin/grammar/config', (r) => r.fulfill({ json: CONFIG }));
  await page.route('**/api/grammar-programs', (r) =>
    r.fulfill({ json: PROGRAMS.map((p) => ({ ...p, enrolled: enrolled.has(p.id) })) }));
  await page.route('**/api/grammar/lessons', (r) => r.fulfill({ json: withScores(NOUNS, m.scores ?? {}) }));
  await page.route('**/api/grammar/verb-lessons?program_type=verbs', (r) =>
    r.fulfill({ json: withScores(VERBS, m.scores ?? {}) }));
  await page.route('**/api/grammar/verb-lessons?program_type=verb_cases', (r) => r.fulfill({ json: [] }));
  await page.route(/\/api\/grammar\/(lessons|verb-lessons|remind)\/?(\d+)?\/?tasks/, (r) => {
    tasks.push(new URL(r.request().url()).pathname.replace('/api/grammar/', '').replace('/tasks', ''));
    return r.fulfill({ json: TASKS });
  });
  await page.route('**/api/me/grammar-programs/*', (r) => {
    const url = new URL(r.request().url());
    calls.push(`${r.request().method()} ${url.pathname}`);
    return r.fulfill({ status: m.enrollStatus ?? 200, json: m.enrollStatus ? { detail: 'boom' } : { ok: true } });
  });
  return { calls, tasks };
}
