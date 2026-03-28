import type { Metadata } from 'next';
import LandingClient from './LandingClient';

export const metadata: Metadata = {
  title: 'Fluent — Learn Lithuanian Online',
  description: 'Master Lithuanian vocabulary and grammar with smart spaced repetition, declension exercises, and real reading articles. Free to start.',
  openGraph: {
    title: 'Fluent — Learn Lithuanian Online',
    description: 'Master Lithuanian vocabulary and grammar with smart spaced repetition.',
    url: 'https://fluent.lt/',
    type: 'website',
    images: [
      { url: '/og-default-en.svg', width: 1200, height: 630, alt: 'Fluent — Learn Lithuanian Online' },
      { url: '/og-default-ru.svg', width: 1200, height: 630, alt: 'Fluent — Учите литовский' },
    ],
  },
  alternates: {
    canonical: 'https://fluent.lt/',
  },
};

export default function RootPage() {
  return <LandingClient />;
}
