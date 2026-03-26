import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Program Details — Fluent',
  description: 'Explore card stacks and vocabulary inside this learning program.',
};

export function generateStaticParams() {
  return [{ key: '_' }];
}

export default function ProgramDetailLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
