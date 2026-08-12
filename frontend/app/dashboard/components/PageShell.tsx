import type { ReactNode } from 'react';

interface PageShellProps {
  children: ReactNode;
  className?: string;
  testId?: string;
}

// The shared shell for the 5 top-nav dashboard pages (Слова, Фразы, Грамматика,
// Практика, Статьи): the 1180px `.page` container, no decorative blur, no shadow.
// Originated on /dashboard/grammar and /dashboard/lists — see
// design system/Component Library (as-built).html for the full convention.
export default function PageShell({ children, className, testId }: PageShellProps) {
  return (
    <main className="min-h-screen text-gray-900" data-testid={testId}>
      <div className={`page px-4 sm:px-8 pt-7${className ? ` ${className}` : ''}`}>
        {children}
      </div>
    </main>
  );
}
