'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { BACKEND_URL } from '../../../../lib/api';
import { useT } from '../../../../lib/useT';
import type { Article } from './types';

function resolveSlug(): string {
  if (typeof window === 'undefined') return '_';
  const parts = window.location.pathname.split('/').filter(Boolean);
  return parts[2] ?? '_';
}

export default function ArticleContent({ initialArticle }: { initialArticle: Article | null }) {
  const { tr, lang } = useT();
  const [article, setArticle] = useState<Article | null>(initialArticle);
  const [loading, setLoading] = useState(initialArticle === null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (initialArticle !== null) return;
    const slug = resolveSlug();
    fetch(`${BACKEND_URL}/api/articles/${slug}`)
      .then((r) => {
        if (r.status === 404) { setNotFound(true); return null; }
        return r.ok ? r.json() : null;
      })
      .then((data) => { if (data) setArticle(data); })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [initialArticle]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (notFound || !article) {
    return (
      <main className="min-h-screen bg-slate-50 flex flex-col items-center justify-center gap-4">
        <p className="text-gray-400">Article not found.</p>
        <Link href="/dashboard/articles" className="text-sm text-emerald-600 hover:underline">
          {tr.articles.backToArticles}
        </Link>
      </main>
    );
  }

  const title = lang === 'ru' ? article.title_ru : article.title_en;
  const body = lang === 'ru' ? article.body_ru : article.body_en;

  return (
    <main className="bg-slate-50 text-gray-900 min-h-screen">
      <div className="pointer-events-none fixed inset-0 flex items-start justify-center overflow-hidden">
        <div className="w-full max-w-[600px] h-[400px] bg-emerald-100/40 blur-[120px] rounded-full mt-[-100px]" />
      </div>

      <div className="relative z-10 max-w-3xl mx-auto px-6 py-8">
        <Link
          href="/dashboard/articles"
          className="text-sm text-gray-400 hover:text-gray-900 transition-colors mb-6 block"
        >
          {tr.articles.backToArticles}
        </Link>

        <div className="mb-6">
          <h1 className="text-3xl font-bold leading-tight mb-3">{title}</h1>
          <div className="flex flex-wrap items-center gap-3">
            {article.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {article.tags.map((tag) => (
                  <span
                    key={tag}
                    className="text-xs px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-gray-900 rounded-full"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}
            <span className="text-gray-400 text-xs">
              {new Date(article.created_at).toLocaleDateString(
                lang === 'ru' ? 'ru-RU' : 'en-GB',
                { day: 'numeric', month: 'long', year: 'numeric' }
              )}
            </span>
          </div>
        </div>

        <article className="prose prose-gray max-w-none
          prose-headings:font-bold prose-headings:text-gray-900
          prose-h1:text-2xl prose-h2:text-xl prose-h3:text-lg
          prose-p:text-gray-700 prose-p:leading-relaxed
          prose-li:text-gray-700
          prose-ol:list-decimal prose-ol:pl-6
          prose-ul:list-disc prose-ul:pl-6
          prose-strong:text-gray-900
          prose-a:text-emerald-600 prose-a:no-underline hover:prose-a:underline
          prose-code:bg-gray-100 prose-code:px-1 prose-code:rounded prose-code:text-sm
          prose-blockquote:border-l-emerald-500 prose-blockquote:text-gray-500
          prose-hr:border-gray-200
          prose-table:my-0">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              table: ({ children }) => (
                <div className="overflow-x-auto w-full my-8">
                  <table>{children}</table>
                </div>
              ),
            }}
          >
            {body}
          </ReactMarkdown>
        </article>
      </div>
    </main>
  );
}
