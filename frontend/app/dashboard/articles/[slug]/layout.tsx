import type { Metadata } from 'next';
import type { Article } from './types';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:8000';

export async function generateStaticParams() {
  try {
    const [regular, footer] = await Promise.all([
      fetch(`${BACKEND_URL}/api/articles`).then((r) => (r.ok ? r.json() : [])),
      fetch(`${BACKEND_URL}/api/footer-articles`).then((r) => (r.ok ? r.json() : [])),
    ]);
    const slugs = [...regular, ...footer].map((a: { slug: string }) => ({ slug: a.slug }));
    return [{ slug: '_' }, ...slugs];
  } catch {
    return [{ slug: '_' }];
  }
}

export async function generateMetadata({
  params,
}: {
  params: { slug: string };
}): Promise<Metadata> {
  if (params.slug === '_') return { title: 'Статьи о литовском языке' };
  try {
    const res = await fetch(`${BACKEND_URL}/api/articles/${params.slug}`);
    if (!res.ok) return {};
    const article: Article = await res.json();
    const desc = article.body_ru.replace(/[#*`[\]]/g, '').slice(0, 160).trim();
    return {
      title: article.title_ru,
      description: desc,
      alternates: {
        canonical: `https://fluent.lt/dashboard/articles/${article.slug}/`,
      },
      openGraph: {
        title: article.title_ru,
        description: desc,
        url: `https://fluent.lt/dashboard/articles/${article.slug}/`,
        type: 'article',
        locale: 'ru_RU',
        alternateLocale: ['en_US'],
        images: [
          { url: '/og-default-ru.svg', width: 1200, height: 630, alt: article.title_ru },
          { url: '/og-default-en.svg', width: 1200, height: 630, alt: article.title_en },
        ],
      },
    };
  } catch {
    return {};
  }
}

export default function ArticleSlugLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
