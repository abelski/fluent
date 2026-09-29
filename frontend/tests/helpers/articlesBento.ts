import type { Page } from '@playwright/test';

// Shared mocked /api/articles for the #55 articles page (articles-bento.spec.ts and
// plan55-screenshots.spec.ts). ARTICLES is sorted newest first, like the real endpoint.

const a = (slug: string, category: string, theme: string | null, date: string, ru: string, en: string) =>
  ({ slug, category, theme, created_at: `${date}T10:00:00`, title_ru: ru, title_en: en, tags: [] });

export const ARTICLES = [
  a('pronunciation', 'learning_materials', 'words', '2026-09-22', 'Литовское произношение', 'Lithuanian pronunciation'),
  a('regitra', 'adaptation', 'life', '2026-05-22', 'Литовский для Регитры', 'Lithuanian for Regitra'),
  a('verb-conditional', 'learning_materials', 'verbs', '2026-05-14', 'Условное наклонение', 'Conditional mood'),
  a('verb-future', 'learning_materials', 'verbs', '2026-05-13', 'Будущее время', 'Future tense'),
  a('how-to-use', 'blog', 'start', '2026-05-07', 'Как пользоваться Fluent', 'How to use Fluent'),
  a('numbers-time', 'learning_materials', 'numbers', '2026-05-04', 'Время по-литовски', 'Time in Lithuanian'),
  a('cases-explained', 'learning_materials', 'cases', '2026-04-23', 'Падежи литовского языка', 'Lithuanian cases explained'),
  a('new-untagged', 'blog', null, '2026-04-20', 'Новая статья без темы', 'A new article without a topic'),
  a('a2-exam', 'adaptation', 'life', '2026-03-16', 'Как подготовиться к экзамену A2', 'How to prepare for the A2 exam'),
];

export async function mockArticles(page: Page, opts: { lang?: 'ru' | 'en'; width?: number; articles?: unknown[] } = {}) {
  await page.addInitScript((lang) => {
    localStorage.setItem('fluent_lang', lang);
    localStorage.setItem('cookie_consent', 'accepted');
  }, opts.lang ?? 'ru');
  await page.setViewportSize({ width: opts.width ?? 1280, height: 900 });
  await page.route('**/api/**', (r) => r.fulfill({ json: [] }));
  await page.route('**/api/billing/config', (r) => r.fulfill({ json: { enabled: true } }));
  await page.route('**/api/articles', (r) => r.fulfill({ json: opts.articles ?? ARTICLES }));
}
