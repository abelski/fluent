'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { BACKEND_URL } from '../../../lib/api';
import { useT } from '../../../lib/useT';
import type { ArticleSummary } from './types';
import PageMascot from '../../../components/PageMascot';
import TakChevron from '../../../components/TakChevron';
import PageShell from '../components/PageShell';

const CATEGORIES = ['all', 'learning_materials', 'adaptation', 'blog'] as const;
type Category = (typeof CATEGORIES)[number];

export default function ArticlesList({ initialArticles }: { initialArticles: ArticleSummary[] }) {
  return (
    <Suspense fallback={<PageShell>{null}</PageShell>}>
      <ArticlesListInner initialArticles={initialArticles} />
    </Suspense>
  );
}

function ArticlesListInner({ initialArticles }: { initialArticles: ArticleSummary[] }) {
  const { tr, lang } = useT();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [articles, setArticles] = useState<ArticleSummary[]>(initialArticles);
  const [loading, setLoading] = useState(initialArticles.length === 0);

  const rawCategory = searchParams.get('category');
  const activeCategory: Category = CATEGORIES.includes(rawCategory as Category)
    ? (rawCategory as Category)
    : 'all';

  // Refresh at runtime so articles published after the static build show up.
  useEffect(() => {
    fetch(`${BACKEND_URL}/api/articles`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { if (data) setArticles(data); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const categoryLabels: Record<Category, string> = {
    all: tr.articles.categoryAll,
    learning_materials: tr.articles.categoryLearning,
    adaptation: tr.articles.categoryAdaptation,
    blog: tr.articles.categoryBlog,
  };

  const filteredArticles = useMemo(
    () => (activeCategory === 'all' ? articles : articles.filter((a) => a.category === activeCategory)),
    [articles, activeCategory]
  );

  const handleCategoryClick = (category: Category) => {
    const params = new URLSearchParams(searchParams.toString());
    if (category === 'all') {
      params.delete('category');
    } else {
      params.set('category', category);
    }
    const qs = params.toString();
    router.push(qs ? `/dashboard/articles?${qs}` : '/dashboard/articles', { scroll: false });
  };

  return (
    <PageShell>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-[32px] font-bold mb-1.5">{tr.articles.title}</h1>
            <p className="text-[15px] text-muted mb-4">{tr.articles.subtitle}</p>
          </div>
          <PageMascot phrase="Paskaitykime!" className="hidden sm:block shrink-0" />
        </div>

        <div className="flex flex-wrap items-center gap-1 bg-[#f2f3f3] rounded-full p-1 mb-5 w-fit">
          {CATEGORIES.map((category) => (
            <button
              key={category}
              onClick={() => handleCategoryClick(category)}
              className={`px-4 py-2 text-sm rounded-full transition-colors ${
                activeCategory === category
                  ? 'bg-white font-semibold text-ink shadow-[0_1px_2px_rgba(0,0,0,0.06)]'
                  : 'text-muted hover:text-ink'
              }`}
            >
              {categoryLabels[category]}
            </button>
          ))}
        </div>

        {loading && (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {!loading && filteredArticles.length === 0 && (
          <p className="text-gray-400 text-sm text-center py-16">{tr.articles.noArticles}</p>
        )}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredArticles.map((article) => {
            const title = lang === 'ru' ? article.title_ru : article.title_en;
            return (
              <Link
                key={article.slug}
                href={`/dashboard/articles/${article.slug}`}
                className="group flex flex-col gap-3 rounded-[14px] border border-line bg-white p-5 hover:bg-gray-50 transition-colors"
              >
                <h2 className="font-semibold text-gray-900 text-base leading-snug line-clamp-2 group-hover:text-emerald-600 transition-colors">
                  {title}
                </h2>
                {article.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
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
                <div className="mt-auto flex items-center justify-between gap-2 pt-1">
                  <p className="text-gray-400 text-xs">
                    {new Date(article.created_at).toLocaleDateString(
                      lang === 'ru' ? 'ru-RU' : 'en-GB',
                      { day: 'numeric', month: 'long', year: 'numeric' }
                    )}
                  </p>
                  <span className="text-sm text-emerald-600 font-medium shrink-0">
                    {tr.articles.readMore} <TakChevron size={10} className="inline-block align-[-1px]" />
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
    </PageShell>
  );
}
