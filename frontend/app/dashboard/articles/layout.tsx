import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Статьи о литовском языке',
  description: 'Полезные материалы для изучения литовского языка: грамматика, словарный запас, подготовка к экзаменам A2 и B1.',
  alternates: { canonical: 'https://fluent.lt/dashboard/articles/' },
};

export default function ArticlesLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
