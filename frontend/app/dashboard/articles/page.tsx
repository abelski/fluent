import ArticlesList from './ArticlesList';
import type { ArticleSummary } from './types';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:8000';

export default async function ArticlesPage() {
  // Fetch the article list at build time so the exported HTML contains real
  // links for crawlers; ArticlesList refreshes the list at runtime.
  let initialArticles: ArticleSummary[] = [];
  try {
    const res = await fetch(`${BACKEND_URL}/api/articles`);
    if (res.ok) initialArticles = await res.json();
  } catch {
    // Backend unavailable during build — the client refetches at runtime.
  }
  return <ArticlesList initialArticles={initialArticles} />;
}
