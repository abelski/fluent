import type { Page } from '@playwright/test';
import { makeFakeJwt } from './grammarBento';

// #66 — mocked Слова (/dashboard/lists) and Фразы (/dashboard/phrases) for the compact-hero
// checks (design-system-parity.spec.ts) and the screenshots (overview-pages.spec.ts). Signed
// in with progress, so the stat cards render their buttons. Never touches the real backend.

export const LONG_GREETING = {
  lithuanian: 'Nebeprisikiškiakopūsteliaudavote',
  translation_ru: 'вы больше не собирали заячью капусточку',
  translation_en: 'you no longer used to gather wood sorrel',
};

export async function mockShellPages(page: Page, o: { lang?: 'ru' | 'en'; width?: number; longGreeting?: boolean } = {}) {
  await page.addInitScript(([token, lang]) => {
    localStorage.setItem('fluent_token', token);
    localStorage.setItem('fluent_lang', lang);
    localStorage.setItem('cookie_consent', 'accepted');
  }, [makeFakeJwt(), o.lang ?? 'ru'] as const);
  await page.setViewportSize({ width: o.width ?? 1280, height: 900 });
  await page.route('**/api/**', (r) => r.fulfill({ json: [] }));
  await page.route('**/api/billing/config', (r) => r.fulfill({ json: { enabled: true } }));
  await page.route('**/api/me/stats', (r) => r.fulfill({ json: {
    known: 723, streak: 3, mistakes: 0, due_review: 69, phrases_learned: 189, phrases_due_review: 18 } }));
  await page.route('**/api/me/quota', (r) => r.fulfill({ json: {
    is_premium: false, premium_active: false, premium_until: null, sessions_today: 0, daily_limit: 10, is_admin: false, is_superadmin: false } }));
  await page.route('**/api/me/welcome', (r) => r.fulfill({ json: { shown: true, content: null } }));
  await page.route('**/api/subcategory-meta', (r) => r.fulfill({ json: {} }));
  await page.route('**/api/me/lists-progress', (r) => r.fulfill({ json: {} }));
  await page.route('**/api/words/random-easy', (r) => r.fulfill({ json: o.longGreeting
    ? LONG_GREETING
    : { lithuanian: 'Labas', translation_ru: 'привет', translation_en: 'hello' } }));
  await page.route('**/api/phrases/random', (r) => r.fulfill({ json: {
    text: 'Labas rytas!', translation: 'Доброе утро!', translation_en: 'Good morning!' } }));
}
