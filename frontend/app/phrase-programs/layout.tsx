import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Программы фраз — Fluent',
  description: 'Выберите программы для изучения литовских фраз.',
  alternates: { canonical: 'https://fluent.lt/phrase-programs/' },
};

export default function PhraseProgramsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
