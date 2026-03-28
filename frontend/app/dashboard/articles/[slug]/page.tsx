import ArticleContent from './ArticleContent';
import type { Article } from './types';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:8000';

export default async function ArticlePage({
  params,
}: {
  params: { slug: string };
}) {
  // '_' is the static-export placeholder — ArticleContent resolves the real
  // slug from window.location at runtime (for articles published after build).
  if (params.slug === '_') {
    return <ArticleContent initialArticle={null} />;
  }

  try {
    const res = await fetch(`${BACKEND_URL}/api/articles/${params.slug}`);
    if (!res.ok) return <ArticleContent initialArticle={null} />;
    const article: Article = await res.json();
    const jsonLd = {
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: article.title_ru,
      datePublished: article.created_at,
      dateModified: article.updated_at,
      url: `https://fluent.lt/dashboard/articles/${article.slug}/`,
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
