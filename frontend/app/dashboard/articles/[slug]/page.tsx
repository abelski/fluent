import { ArticlePageBody } from './articleSeo';

export default function ArticlePage({ params }: { params: { slug: string } }) {
  return <ArticlePageBody slug={params.slug} lang="ru" />;
}
