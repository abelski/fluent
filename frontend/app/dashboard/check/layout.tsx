import type { Metadata } from 'next';

// #62a — private page: noindex + robots.txt Disallow (see documentation/knowledge-check.md).
export const metadata: Metadata = {
  title: 'Проверка знаний',
  robots: { index: false, follow: false },
};

export default function CheckLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
