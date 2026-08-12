'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { BACKEND_URL } from '../../../lib/api';
import { useT } from '../../../lib/useT';
import type { ArticleSummary } from './types';
import PageMascot from '../../../components/PageMascot';
import PageShell from '../components/PageShell';

export default function ArticlesList({ initialArticles }: { initialArticles: ArticleSummary[] }) {
  const { tr, lang } = useT();
  const [articles, setArticles] = useState<ArticleSummary[]>(initialArticles);
  const [loading, setLoading] = useState(initialArticles.length === 0);

  // Refresh at runtime so articles published after the static build show up.
  useEffect(() => {
    fetch(`${BACKEND_URL}/api/articles`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { if (data) setArticles(data); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <PageShell>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-[32px] font-bold mb-1.5">{tr.articles.title}</h1>
            <p className="text-[15px] text-muted mb-4">{tr.articles.subtitle}</p>
          </div>
          <PageMascot phrase="Paskaitykime!" className="hidden sm:block shrink-0" />
        </div>

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
                className="group block rounded-[14px] border border-line bg-white p-5 hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <h2 className="font-headline font-semibold text-gray-900 text-lg leading-snug group-hover:text-emerald-600 transition-colors">
                      {title}
                    </h2>
                    {article.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {article.tags.map((tag) => (
                          <span
                            key={tag}
                            className="text-xs px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full"
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
    </PageShell>
  );
}
