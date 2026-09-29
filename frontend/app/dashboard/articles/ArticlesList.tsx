'use client';

// #55 — Статьи in the #53 bento layout: hero → category chips → bento (newest + next 3)
// → theme cards. Rendered from the build-time `initialArticles` first so the exported
// HTML carries every article link for crawlers, then refreshed at runtime.

import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { BACKEND_URL } from '../../../lib/api';
import { useT } from '../../../lib/useT';
import { ARTICLE_THEMES as THEMES, type ArticleSummary } from './types';
import TakChevron from '../../../components/TakChevron';
import PageShell from '../components/PageShell';
import {
  BENTO_GRID, BentoChips, BentoHero, CARD, CARD_GRID, FEATURED_HEADING, FEATURED_SHELL, HERO_ART, HERO_ART_LABEL,
  INK_BTN, KICKER, SectionHeading,
} from '../components/BentoParts';

const CATEGORIES = ['all', 'learning_materials', 'adaptation', 'blog'] as const;
type Category = (typeof CATEGORIES)[number];

const OTHER = 'other';
const themeOf = (a: ArticleSummary) => (a.theme && (THEMES as readonly string[]).includes(a.theme) ? a.theme : OTHER);

export default function ArticlesList({ initialArticles }: { initialArticles: ArticleSummary[] }) {
  // useSearchParams bails the static export out to client rendering up to this boundary,
  // so the fallback IS the pre-rendered HTML: it renders the full «Все» view from the
  // build-time list, which keeps every article link in the HTML for crawlers.
  return (
    <Suspense fallback={<ArticlesBento articles={initialArticles} loading={false} category="all" />}>
      <ArticlesListInner initialArticles={initialArticles} />
    </Suspense>
  );
}

function ArticlesListInner({ initialArticles }: { initialArticles: ArticleSummary[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [articles, setArticles] = useState<ArticleSummary[]>(initialArticles);
  const [loading, setLoading] = useState(initialArticles.length === 0);

  const rawCategory = searchParams.get('category');
  const category: Category = CATEGORIES.includes(rawCategory as Category) ? (rawCategory as Category) : 'all';

  // Refresh at runtime so articles published after the static build show up.
  useEffect(() => {
    fetch(`${BACKEND_URL}/api/articles`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { if (data) setArticles(data); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const onCategory = (next: Category) => {
    const params = new URLSearchParams(searchParams.toString());
    if (next === 'all') params.delete('category');
    else params.set('category', next);
    const qs = params.toString();
    router.push(qs ? `/dashboard/articles?${qs}` : '/dashboard/articles', { scroll: false });
  };

  return <ArticlesBento articles={articles} loading={loading} category={category} onCategory={onCategory} />;
}

function ArticlesBento({
  articles,
  loading,
  category,
  onCategory,
}: {
  articles: ArticleSummary[];
  loading: boolean;
  category: Category;
  onCategory?: (c: Category) => void;
}) {
  const { tr, lang, plural } = useT();
  const t = tr.articles;
  // Theme to scroll to once its card is rendered (a hero theme may sit under another category).
  const [scrollTo, setScrollTo] = useState<string | null>(null);

  const list = useMemo(
    () => (category === 'all' ? articles : articles.filter((a) => a.category === category)),
    [articles, category],
  );

  useEffect(() => {
    if (!scrollTo) return;
    const el = document.getElementById(`theme-${scrollTo}`);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setScrollTo(null);
  }, [scrollTo, list]);

  const labels: Record<Category, string> = {
    all: t.categoryAll,
    learning_materials: t.categoryLearning,
    adaptation: t.categoryAdaptation,
    blog: t.categoryBlog,
  };
  const title = (a: ArticleSummary) => (lang === 'ru' ? a.title_ru : a.title_en);
  const date = (a: ArticleSummary) =>
    new Date(a.created_at).toLocaleDateString(tr.common.dateLocale, { day: 'numeric', month: 'long', year: 'numeric' });
  const href = (a: ArticleSummary) => `/dashboard/articles/${a.slug}`;

  const newest = articles[0]; // the API sorts newest first
  const learning = articles.filter((a) => a.category === 'learning_materials').length;
  const themeCounts = THEMES
    .map((k) => [k, articles.filter((a) => themeOf(a) === k).length] as const)
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1]);
  const [featured, ...rest] = list;
  const groups = [...THEMES, OTHER]
    .map((k) => [k, list.filter((a) => themeOf(a) === k)] as const)
    .filter(([, items]) => items.length > 0);

  return (
    <PageShell className="pb-20 flex flex-col gap-5">
      <BentoHero
        testId="articles-hero"
        title={t.title}
        subtitle={t.subtitle}
        count={articles.length}
        countTestId="articles-hero-count"
        badge={learning > 0 ? t.learningCount.replace('{n}', String(learning)) : null}
        label={t.heroLabel}
        pct={null}
        actions={newest ? (
          <Link href={href(newest)} className={INK_BTN} data-testid="articles-read-newest">
            {t.readNewest} <TakChevron size={10} />
          </Link>
        ) : null}
        art={themeCounts.length > 0 ? (
          <div className={`${HERO_ART} w-[320px]`} data-testid="articles-popular-themes">
            <div className={HERO_ART_LABEL}>{t.popularThemes}</div>
            <div className="flex flex-wrap gap-1.5">
              {themeCounts.map(([k, n]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => { if (category !== 'all') onCategory?.('all'); setScrollTo(k); }}
                  className="text-[12.5px] px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors"
                  data-testid={`popular-theme-${k}`}
                >
                  {t.themes[k]}
                  <span className="ml-1 text-emerald-600/70 tabular-nums">{n}</span>
                </button>
              ))}
            </div>
          </div>
        ) : null}
        mascotPhrase="Paskaitykime!"
      />

      <BentoChips
        items={CATEGORIES.map((c) => ({
          key: c,
          label: labels[c],
          count: c === 'all' ? articles.length : articles.filter((a) => a.category === c).length,
          active: category === c,
          testId: `category-${c}`,
          onClick: onCategory ? () => onCategory(c) : undefined,
        }))}
      />

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : !featured ? (
        <p className="text-faint text-sm text-center py-16">{t.noArticles}</p>
      ) : (
        <>
          <section className={BENTO_GRID}>
            <article className={FEATURED_SHELL} data-testid="featured-card">
              <div className={KICKER}>{t.newest} · {labels[featured.category as Category] ?? featured.category}</div>
              <h2 className={FEATURED_HEADING} data-testid="featured-heading">{title(featured)}</h2>
              <div className="text-sm text-muted">{date(featured)}</div>
              <div>
                <span className="inline-flex text-xs px-2.5 py-0.5 rounded-full bg-[#f2f3f3] text-[#5b6067]">
                  {t.themes[themeOf(featured)]}
                </span>
              </div>
              <div className="mt-auto pt-2">
                <Link href={href(featured)} className={INK_BTN} data-testid="featured-read">
                  {t.readMore} <TakChevron size={10} />
                </Link>
              </div>
            </article>
            <div className="flex flex-col gap-4">
              {rest.slice(0, 3).map((a) => (
                <Link
                  key={a.slug}
                  href={href(a)}
                  data-testid="stack-article"
                  className={`${CARD} px-[22px] py-5 flex flex-col gap-2 hover:border-faint transition-colors`}
                >
                  <span className={KICKER}>{labels[a.category as Category] ?? a.category}</span>
                  <h3 className="text-[17px] font-bold text-ink leading-snug">{title(a)}</h3>
                  <span className="text-[13px] text-muted">{date(a)}</span>
                </Link>
              ))}
            </div>
          </section>

          <section className="flex flex-col gap-3 mt-3" data-testid="theme-section">
            <SectionHeading title={t.byTheme} countLabel={`${list.length} ${plural(list.length, t.articlesCount)}`} />
            <div className={CARD_GRID}>
              {groups.map(([k, items]) => (
                <div key={k} id={`theme-${k}`} className={`${CARD} px-5 py-[18px] flex flex-col gap-3 scroll-mt-24`} data-testid="theme-card" data-theme={k}>
                  <div className="flex justify-between items-baseline gap-2.5">
                    <h3 className="text-[14.5px] font-semibold text-ink">{t.themes[k]}</h3>
                    <span className="text-[13px] text-faint tabular-nums">{items.length}</span>
                  </div>
                  <div className="flex flex-col">
                    {items.map((a, i) => (
                      <Link
                        key={a.slug}
                        href={href(a)}
                        className={`text-[13.5px] leading-snug text-ink hover:text-emerald-700 transition-colors py-2 min-h-11 min-[860px]:min-h-0 flex items-center ${i > 0 ? 'border-t border-line-soft' : 'pt-0'}`}
                      >
                        {title(a)}
                      </Link>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </PageShell>
  );
}
