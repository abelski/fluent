'use client';

import { useEffect } from 'react';
import { getToken } from '../../lib/api';

export default function DashboardPage() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlToken = params.get('token');

    if (urlToken) {
      localStorage.setItem('fluent_token', urlToken);
      window.history.replaceState({}, '', window.location.pathname);
    }

    const token = urlToken || getToken();

    if (!token) {
      window.location.href = '/';
      return;
    }

    window.location.href = '/dashboard/lists';
  }, []);

  return (
    <div className="min-h-screen bg-[#07070f] flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );
}
