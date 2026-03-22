'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getToken } from '../../lib/api';

export default function DashboardPage() {
  const router = useRouter();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlToken = params.get('token');

    if (urlToken) {
      localStorage.setItem('fluent_token', urlToken);
      window.history.replaceState({}, '', window.location.pathname);
    }

    const token = urlToken || getToken();

    if (!token) {
      router.replace('/login');
      return;
    }

    // Full reload so all components pick up the newly stored token
    window.location.href = '/dashboard/lists';
  }, [router]);

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );
}
