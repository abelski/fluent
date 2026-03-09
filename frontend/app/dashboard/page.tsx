'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { BACKEND_URL, getToken } from '../../lib/api';

interface User {
  name: string;
  email: string;
  picture?: string;
}

interface WordListSummary {
  id: number;
  title: string;
  description: string | null;
  word_count: number;
}

interface Stats {
  known: number;
  learning: number;
  total_studied: number;
}

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [lists, setLists] = useState<WordListSummary[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);

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

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    fetch(`${BACKEND_URL}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    })
      .then((r) => {
        clearTimeout(timeout);
        if (!r.ok) throw new Error('Unauthorized');
        return r.json();
      })
      .then(setUser)
      .catch(() => {
        clearTimeout(timeout);
        localStorage.removeItem('fluent_token');
        window.location.href = '/';
      });

    fetch(`${BACKEND_URL}/api/lists`)
      .then((r) => r.json())
      .then((data) => setLists(Array.isArray(data) ? data : []))
      .catch(() => {});

    fetch(`${BACKEND_URL}/api/me/stats`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then(setStats)
      .catch(() => {});
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
            Выйти
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
            <h1 className="text-2xl font-bold">С возвращением, {user.name}!</h1>
            <p className="text-white/40 mt-0.5">Готов продолжить путь к литовскому?</p>
          </div>
        </div>

        {/* Progress */}
        {stats && stats.total_studied > 0 && (
          <div className="mb-10">
            <h2 className="text-sm font-medium text-white/40 uppercase tracking-wider mb-3">
              Твой прогресс
            </h2>
            <div className="flex gap-4 flex-wrap">
              <div className="bg-white/[0.04] border border-white/[0.08] rounded-2xl px-6 py-4">
                <div className="text-2xl font-bold text-violet-400">{stats.known}</div>
                <div className="text-white/40 text-sm mt-0.5">Знаю</div>
              </div>
              <div className="bg-white/[0.04] border border-white/[0.08] rounded-2xl px-6 py-4">
                <div className="text-2xl font-bold text-amber-400">{stats.learning}</div>
                <div className="text-white/40 text-sm mt-0.5">Учу</div>
              </div>
              <div className="bg-white/[0.04] border border-white/[0.08] rounded-2xl px-6 py-4">
                <div className="text-2xl font-bold text-white/60">{stats.total_studied}</div>
                <div className="text-white/40 text-sm mt-0.5">Изучено</div>
              </div>
            </div>
          </div>
        )}

        {/* Exercises */}
        <div className="mb-5">
          <h2 className="text-lg font-semibold">Упражнения</h2>
          <p className="text-white/40 text-sm mt-0.5">Нажми на упражнение, чтобы начать</p>
        </div>

        {lists.length === 0 ? (
          <div className="bg-white/[0.04] border border-white/[0.08] rounded-2xl p-16 text-center">
            <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin mx-auto" />
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {lists.map((list) => (
              <div
                key={list.id}
                onClick={() => router.push(`/dashboard/lists/${list.id}/study`)}
                className="bg-white/[0.04] border border-white/[0.08] rounded-2xl p-6 flex flex-col gap-4 hover:border-violet-500/40 transition-colors cursor-pointer group"
              >
                <div className="flex-1">
                  <h3 className="font-semibold group-hover:text-violet-300 transition-colors">
                    {list.title}
                  </h3>
                  {list.description && (
                    <p className="text-white/40 text-sm mt-1 line-clamp-2">{list.description}</p>
                  )}
                </div>
                <div className="flex items-center justify-between mt-auto">
                  <span className="text-white/30 text-sm">{list.word_count} слов</span>
                  <Link
                    href={`/dashboard/lists/${list.id}`}
                    onClick={(e) => e.stopPropagation()}
                    className="px-4 py-1.5 text-sm text-white/60 hover:text-white border border-white/10 hover:border-white/30 rounded-lg transition-colors"
                  >
                    Просмотр
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
