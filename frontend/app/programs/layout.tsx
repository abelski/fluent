import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Все программы — Fluent',
  description: 'Выберите программы для изучения литовского языка.',
};

export default function ProgramsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
