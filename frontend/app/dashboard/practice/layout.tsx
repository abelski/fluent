import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Практика',
  robots: { index: false, follow: false },
};

export default function PracticeLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
