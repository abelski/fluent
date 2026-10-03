import type { Metadata } from 'next';
import { INDEX_TITLE, INDEX_URL, languages } from './[slug]/articleSeo';

export const metadata: Metadata = {
  title: INDEX_TITLE.ru,
  description: 'Полезные материалы для изучения литовского языка: грамматика, словарный запас, подготовка к экзаменам A2 и B1.',
  alternates: { canonical: INDEX_URL.ru, languages: languages(INDEX_URL.ru, INDEX_URL.en) },
};

export default function ArticlesLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
