'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';

interface User {
  id: string;
  name: string;
  email: string;
  picture?: string;
  lang: string;
}

export default function DashboardPage() {
  const t = useTranslations('dashboard');
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    // Grab token from URL (set by backend after OAuth) or from storage
    const params = new URLSearchParams(window.location.search);
    const urlToken = params.get('token');

    if (urlToken) {
      localStorage.setItem('fluent_token', urlToken);
      window.history.replaceState({}, '', window.location.pathname);
    }

    const token = urlToken || localStorage.getItem('fluent_token');

    if (!token) {
      window.location.href = '/';
      return;
    }

    fetch(`${BACKEND_URL}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => {
        if (!r.ok) throw new Error('Unauthorized');
        return r.json();
      })
      .then(setUser)
      .catch(() => {
        localStorage.removeItem('fluent_token');
        window.location.href = '/';
      });
  }, []);

  function logout() {
    localStorage.removeItem('fluent_token');
    window.location.href = '/';
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-[#07070f] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-[#07070f] text-white">
      {/* Background glow */}
      <div className="pointer-events-none fixed inset-0 flex items-start justify-center">
        <div className="w-[600px] h-[400px] bg-violet-700/10 blur-[120px] rounded-full mt-[-100px]" />
      </div>

      <div className="relative z-10 max-w-4xl mx-auto px-6 py-8">
        {/* Nav */}
        <nav className="flex justify-between items-center mb-12">
          <span className="font-bold text-xl tracking-tight">
            fluent<span className="text-violet-400">.</span>
          </span>
          <button
            onClick={logout}
            className="text-white/40 hover:text-white text-sm transition-colors"
          >
            {t('logout')}
          </button>
        </nav>

        {/* User greeting */}
        <div className="flex items-center gap-4 mb-10">
          {user.picture && (
            <img
              src={user.picture}
              alt={user.name}
              className="w-14 h-14 rounded-full ring-2 ring-violet-500/30"
            />
          )}
          <div>
            <h1 className="text-2xl font-bold">
              {t('welcome')}, {user.name}!
            </h1>
            <p className="text-white/40 mt-0.5">{t('subtitle')}</p>
          </div>
        </div>

        {/* Coming soon placeholder */}
        <div className="bg-white/[0.04] border border-white/[0.08] rounded-2xl p-16 text-center">
          <p className="text-4xl mb-4">🇱🇹</p>
          <p className="text-white/30 text-lg">{t('comingSoon')}</p>
        </div>
      </div>
    </main>
  );
}
