'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { getToken } from '../../lib/api';

// Public SEO pages — must stay reachable without a token (kept in sync with
// the Allow list in backend robots.txt and the sitemap).
const PUBLIC_PREFIXES = [
  '/dashboard/articles',
  '/dashboard/grammar',
  '/dashboard/lists',
  '/dashboard/phrases',
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
      return;
    }

    function checkAuth() {
      if (!getToken()) {
        router.replace('/');
      }
    }

    checkAuth();
    window.addEventListener('visibilitychange', checkAuth);
    return () => window.removeEventListener('visibilitychange', checkAuth);
  }, [router, pathname]);

  return <>{children}</>;
}
