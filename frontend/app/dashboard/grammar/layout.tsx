import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Грамматика литовского языка — падежи и склонения',
  description: 'Упражнения на падежи литовского языка: именительный, родительный, дательный и другие. Практикуйте склонения существительных и прилагательных.',
  alternates: { canonical: 'https://fluent.lt/dashboard/grammar/' },
  openGraph: {
    title: 'Грамматика литовского языка — падежи и склонения',
    description: 'Упражнения на падежи литовского языка: именительный, родительный, дательный и другие.',
    url: 'https://fluent.lt/dashboard/grammar/',
    locale: 'ru_RU',
    alternateLocale: 'en_US',
    images: [
      { url: '/og-default-ru.svg', width: 1200, height: 630, alt: 'Грамматика литовского языка' },
      { url: '/og-default-en.svg', width: 1200, height: 630, alt: 'Lithuanian Grammar Exercises' },
    ],
  },
};

export default function GrammarLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
