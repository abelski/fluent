import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Грамматика литовского языка — падежи и склонения',
  description: 'Упражнения на падежи литовского языка: именительный, родительный, дательный и другие. Практикуйте склонения существительных и прилагательных.',
  alternates: { canonical: 'https://fluent.lt/dashboard/grammar/' },
};

export default function GrammarLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
