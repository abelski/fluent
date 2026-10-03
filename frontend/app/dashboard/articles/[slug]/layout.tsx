import type { Metadata } from 'next';
import { articleMetadata, articleStaticParams } from './articleSeo';

export function generateStaticParams() {
  return articleStaticParams('ru');
}

export function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  return articleMetadata(params.slug, 'ru');
}

export default function ArticleSlugLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
