import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Слова литовского языка по уровням',
  description: 'Тематические словари литовского языка по уровням CEFR: A1, A2, B1. Учите слова с умным повторением и отслеживайте прогресс.',
  alternates: { canonical: 'https://fluent.lt/dashboard/lists/' },
};

export default function ListsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
