'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { BACKEND_URL } from '../../../lib/api';
import { useT } from '../../../lib/useT';

interface ArticleSummary {
  slug: string;
  title_ru: string;
  title_en: string;
  tags: string[];
  created_at: string;
}

export default function ArticlesPage() {
  const { tr, lang } = useT();
  const [articles, setArticles] = useState<ArticleSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${BACKEND_URL}/api/articles`)
      .then((r) => (r.ok ? r.json() : []))
      .then(setArticles)
      .catch(() => setArticles([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <main className="bg-slate-50 text-gray-900 min-h-screen">
      <div className="pointer-events-none fixed inset-0 flex items-start justify-center overflow-hidden">
        <div className="w-full max-w-[600px] h-[400px] bg-emerald-100/40 blur-[120px] rounded-full mt-[-100px]" />
      </div>

      <div className="relative z-10 max-w-3xl mx-auto px-6 py-8">
        <h1 className="text-3xl font-bold mb-2">{tr.articles.title}</h1>
        <p className="text-gray-400 mb-8">{tr.articles.subtitle}</p>

        {loading && (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {!loading && articles.length === 0 && (
          <p className="text-gray-400 text-sm text-center py-16">{tr.articles.noArticles}</p>
        )}

        <div className="flex flex-col gap-4">
          {articles.map((article) => {
            const title = lang === 'ru' ? article.title_ru : article.title_en;
            return (
              <Link
                key={article.slug}
                href={`/dashboard/articles/${article.slug}`}
                className="group block rounded-2xl border border-gray-900 bg-white p-5 hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <h2 className="font-semibold text-gray-900 text-lg leading-snug group-hover:text-emerald-600 transition-colors">
                      {title}
                    </h2>
                    {article.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-2">
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
                    <p className="text-gray-400 text-xs mt-2">
                      {new Date(article.created_at).toLocaleDateString(
                        lang === 'ru' ? 'ru-RU' : 'en-GB',
                        { day: 'numeric', month: 'long', year: 'numeric' }
                      )}
                    </p>
                  </div>
                  <span className="text-sm text-emerald-600 font-medium shrink-0 mt-0.5">
                    {tr.articles.readMore}
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </main>
  );
}
