import type { Metadata } from 'next';
import { INDEX_TITLE, INDEX_URL, languages } from '../../../dashboard/articles/[slug]/articleSeo';

// EN twin metadata (#48c). Sets its own alternates and openGraph: Next replaces
// both wholesale, and the inherited root values are RU.
const description =
  'Materials for learning Lithuanian: grammar, vocabulary, and preparing for the A2 and B1 exams.';

export const metadata: Metadata = {
  title: INDEX_TITLE.en,
  description,
  alternates: { canonical: INDEX_URL.en, languages: languages(INDEX_URL.ru, INDEX_URL.en) },
  openGraph: {
    title: `${INDEX_TITLE.en} | Fluent`,
    description,
    url: INDEX_URL.en,
    siteName: 'Fluent',
    type: 'website',
    locale: 'en_US',
    alternateLocale: ['ru_RU'],
    images: [{ url: '/og-default-en.svg', width: 1200, height: 630, alt: 'Fluent — Learn Lithuanian' }],
  },
};

export default function EnArticlesLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
