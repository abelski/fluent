'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getToken } from '../../lib/api';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  useEffect(() => {
    function checkAuth() {
      if (!getToken()) {
        router.replace('/');
      }
    }

    checkAuth();
    window.addEventListener('visibilitychange', checkAuth);
    return () => window.removeEventListener('visibilitychange', checkAuth);
  }, [router]);

  return <>{children}</>;
}
