import { ArticlePageBody } from '../../../../dashboard/articles/[slug]/articleSeo';

export default function EnArticlePage({ params }: { params: { slug: string } }) {
  return <ArticlePageBody slug={params.slug} lang="en" />;
}
