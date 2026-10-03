// Shared by the RU article routes and their EN twins under app/en/ (#48c):
// static params, metadata (canonical + hreflang) and the page body with JSON-LD.
import type { Metadata } from 'next';
import ArticleContent from './ArticleContent';
import type { Article } from './types';

type Lang = 'ru' | 'en';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:8000';
const SITE = 'https://fluent.lt';

export const INDEX_URL: Record<Lang, string> = {
  ru: `${SITE}/dashboard/articles/`,
  en: `${SITE}/en/dashboard/articles/`,
};
export const INDEX_TITLE: Record<Lang, string> = {
  ru: 'Статьи о литовском языке', // i18n-allow — RU SEO title, unchanged
  en: 'Articles about the Lithuanian language',
};

const articleUrl = (slug: string, lang: Lang) =>
  `${SITE}${lang === 'en' ? '/en' : ''}/dashboard/articles/${slug}/`;

/** hreflang set for a RU/EN pair. RU stays x-default to protect the current audience. */
export const languages = (ru: string, en: string) => ({ ru, en, 'x-default': ru });

/** Content gate: only an article with both an English title and body gets an EN twin. */
export const hasEn = (a: Pick<Article, 'title_en' | 'body_en'>) => !!(a.title_en?.trim() && a.body_en?.trim());

async function fetchArticle(slug: string): Promise<Article | null> {
  const res = await fetch(`${BACKEND_URL}/api/articles/${slug}`);
  return res.ok ? res.json() : null;
}

export async function articleStaticParams(lang: Lang) {
  try {
    const [regular, footer] = await Promise.all([
      fetch(`${BACKEND_URL}/api/articles`).then((r) => (r.ok ? r.json() : [])),
      fetch(`${BACKEND_URL}/api/footer-articles`).then((r) => (r.ok ? r.json() : [])),
    ]);
    let slugs: string[] = [...regular, ...footer].map((a: { slug: string }) => a.slug);
    if (lang === 'en') {
      const articles = await Promise.all(slugs.map(fetchArticle));
      slugs = articles.filter((a): a is Article => !!a && hasEn(a)).map((a) => a.slug);
    }
    return [{ slug: '_' }, ...slugs.map((slug) => ({ slug }))];
  } catch {
    return [{ slug: '_' }];
  }
}

export async function articleMetadata(slug: string, lang: Lang): Promise<Metadata> {
  // The `_` placeholder sets its own alternates: Next replaces `alternates` wholesale,
  // and inheriting the index's would hand it the index's hreflang set.
  if (slug === '_') return { title: INDEX_TITLE[lang], alternates: { canonical: INDEX_URL[lang] } };
  try {
    const article = await fetchArticle(slug);
    if (!article) return {};
    const en = lang === 'en';
    const title = en ? article.title_en : article.title_ru;
    const desc = (en ? article.body_en : article.body_ru)
      .replace(/^#.*\n+/, '')
      .replace(/[#*`[\]]/g, '')
      .replace(/\s+/g, ' ')
      .slice(0, 160)
      .trim();
    const ruUrl = articleUrl(article.slug, 'ru');
    const enUrl = articleUrl(article.slug, 'en');
    const ruImage = { url: '/og-default-ru.svg', width: 1200, height: 630, alt: article.title_ru };
    const enImage = { url: '/og-default-en.svg', width: 1200, height: 630, alt: article.title_en };
    return {
      title,
      description: desc,
      alternates: {
        canonical: en ? enUrl : ruUrl,
        ...(hasEn(article) && { languages: languages(ruUrl, enUrl) }),
      },
      openGraph: {
        title,
        description: desc,
        url: en ? enUrl : ruUrl,
        type: 'article',
        locale: en ? 'en_US' : 'ru_RU',
        alternateLocale: [en ? 'ru_RU' : 'en_US'],
        images: en ? [enImage, ruImage] : [ruImage, enImage],
      },
    };
  } catch {
    return {};
  }
}

export async function ArticlePageBody({ slug, lang }: { slug: string; lang: Lang }) {
  // '_' is the static-export placeholder — ArticleContent resolves the real
  // slug from window.location at runtime (for articles published after build).
  if (slug === '_') return <ArticleContent initialArticle={null} />;
  try {
    const article = await fetchArticle(slug);
    if (!article) return <ArticleContent initialArticle={null} />;
    const jsonLd = {
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: lang === 'en' && article.title_en ? article.title_en : article.title_ru,
      datePublished: article.created_at,
      dateModified: article.updated_at,
      url: articleUrl(article.slug, lang),
      publisher: { '@type': 'Organization', name: 'Fluent', url: 'https://fluent.lt' },
    };
    return (
      <>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        <ArticleContent initialArticle={article} />
      </>
    );
  } catch {
    return <ArticleContent initialArticle={null} />;
  }
}
