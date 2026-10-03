import type { Metadata } from 'next';
import { articleMetadata, articleStaticParams } from '../../../../dashboard/articles/[slug]/articleSeo';

// EN twins (#48c): only articles passing the content gate (title_en + body_en) are prerendered.
export function generateStaticParams() {
  return articleStaticParams('en');
}

export function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  return articleMetadata(params.slug, 'en');
}

export default function EnArticleSlugLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
