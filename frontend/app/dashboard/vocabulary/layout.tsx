import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Мой словарный запас',
  robots: { index: false, follow: false },
};

export default function VocabularyLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
