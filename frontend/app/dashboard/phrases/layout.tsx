import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Литовские фразы для повседневного общения',
  description: 'Разговорные фразы на литовском языке: приветствия, покупки, дорога, работа. Учите готовые выражения с интервальным повторением и отслеживайте прогресс.',
  alternates: { canonical: 'https://fluent.lt/dashboard/phrases/' },
  openGraph: {
    title: 'Литовские фразы для повседневного общения',
    description: 'Разговорные фразы на литовском языке: приветствия, покупки, дорога, работа.',
    url: 'https://fluent.lt/dashboard/phrases/',
    locale: 'ru_RU',
    alternateLocale: ['en_US'],
    images: [
      { url: '/og-default-ru.svg', width: 1200, height: 630, alt: 'Литовские фразы' },
      { url: '/og-default-en.svg', width: 1200, height: 630, alt: 'Lithuanian Phrases' },
    ],
  },
};

export default function PhrasesLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
