import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Fluent Premium',
  robots: { index: false, follow: false },
};

export default function PremiumLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
