import type { Page } from '@playwright/test';
import { makeFakeJwt } from './grammarBento';

// Shared mocked home page for the #56 effort radar (effort-radar.spec.ts and
// plan56-screenshots.spec.ts). Every endpoint the signed-in home touches is mocked.

export const SHIFT = { week: { words: 18, phrases: 6, grammar: 55 }, all: { words: 1180, phrases: 160, grammar: 120 } };
export const USUAL = { week: { words: 62, phrases: 28, grammar: 20 }, all: { words: 930, phrases: 310, grammar: 240 } };
export const EMPTY_WEEK = { week: { words: 0, phrases: 0, grammar: 0 }, all: USUAL.all };
export const NO_POINTS = { week: EMPTY_WEEK.week, all: EMPTY_WEEK.week };

export async function mockHome(page: Page, effort: unknown, opts: { lang?: 'ru' | 'en'; width?: number; guest?: boolean } = {}) {
  await page.addInitScript(([token, lang]) => {
    if (token) localStorage.setItem('fluent_token', token);
    localStorage.setItem('fluent_lang', lang);
    localStorage.setItem('cookie_consent', 'accepted');
  }, [opts.guest ? '' : makeFakeJwt(), opts.lang ?? 'ru'] as const);
  await page.setViewportSize({ width: opts.width ?? 1280, height: 900 });
  await page.route('**/api/**', (r) => r.fulfill({ json: [] }));
  await page.route('**/api/billing/config', (r) => r.fulfill({ json: { enabled: true } }));
  await page.route('**/api/me/stats', (r) => r.fulfill({ json: {
    known: 120, learning: 30, total_studied: 150, streak: 6, mistakes: 0, grammar_lessons_passed: 4, practice_exams_completed: 1 } }));
  await page.route('**/api/me/quota', (r) => r.fulfill({ json: {
    is_premium: false, premium_active: false, premium_until: null, sessions_today: 0, daily_limit: 10, is_admin: false } }));
  await page.route('**/api/me/activity-calendar**', (r) => r.fulfill({ json: { dates: [] } }));
  await page.route('**/api/news**', (r) => r.fulfill({ json: [] }));
  await page.route('**/api/leaderboard**', (r) => r.fulfill({ json: {
    entries: [{ rank: 1, picture: null, score: 412 }, { rank: 2, picture: null, score: 388 }, { rank: 3, picture: null, score: 120 }],
    me: { rank: 3, score: 120 } } }));
  await page.route('**/api/me/effort', (r) => r.fulfill({ json: effort }));
}
