'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { BACKEND_URL, getToken } from '../../../lib/api';

function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" className="shrink-0">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  );
}

interface WordListSummary {
  id: number;
  title: string;
  description: string | null;
  word_count: number;
}

interface ListProgress {
  total: number;
  known: number;
  learning: number;
  new: number;
}

interface JwtUser {
  name: string;
  picture?: string;
}

function parseJwtUser(token: string): JwtUser | null {
  try {
    return JSON.parse(atob(token.split('.')[1]));
  } catch {
    return null;
  }
}

export default function ListsPage() {
  const [lists, setLists] = useState<WordListSummary[]>([]);
  const [progress, setProgress] = useState<Record<number, ListProgress>>({});
  const [loading, setLoading] = useState(true);
  const [isAuthed, setIsAuthed] = useState<boolean | null>(null);
  const [user, setUser] = useState<JwtUser | null>(null);

  useEffect(() => {
    const token = getToken();
    setIsAuthed(!!token);
    if (token) setUser(parseJwtUser(token));
  }, []);

  useEffect(() => {
    fetch(`${BACKEND_URL}/api/lists`)
      .then((r) => r.json())
      .then((data: WordListSummary[]) => {
        const validData = Array.isArray(data) ? data : [];
        setLists(validData);

        const token = getToken();
        if (!token || validData.length === 0) return;

        fetch(`${BACKEND_URL}/api/me/lists-progress`, {
          headers: { Authorization: `Bearer ${token}` },
        })
          .then((r) => (r.ok ? r.json() : {}))
          .then((data: Record<string, ListProgress>) => {
            const map: Record<number, ListProgress> = {};
            for (const [k, v] of Object.entries(data)) {
              map[Number(k)] = v;
            }
            setProgress(map);
          })
          .catch(() => {});
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <main className="min-h-screen bg-[#07070f] text-white">
      <div className="pointer-events-none fixed inset-0 flex items-start justify-center">
        <div className="w-[600px] h-[400px] bg-violet-700/10 blur-[120px] rounded-full mt-[-100px]" />
      </div>

      <div className="relative z-10 max-w-4xl mx-auto px-6 py-8">
        <nav className="flex justify-between items-center mb-12">
          <Link href="/dashboard/lists" className="font-bold text-xl tracking-tight">
            fluent<span className="text-violet-400">.</span>
          </Link>
          {isAuthed === false && (
            <a
              href={`${BACKEND_URL}/api/auth/google`}
              className="flex items-center gap-2 bg-white text-gray-800 font-medium px-4 py-2 rounded-xl text-sm hover:bg-gray-100 transition-colors"
            >
              <GoogleIcon />
              Войти
            </a>
          )}
          {isAuthed && user && (
            <div className="flex items-center gap-2.5">
              {user.picture ? (
                <img
                  src={user.picture}
                  alt={user.name}
                  className="w-8 h-8 rounded-full ring-1 ring-white/10"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="w-8 h-8 rounded-full bg-violet-600 flex items-center justify-center text-sm font-medium">
                  {user.name.charAt(0).toUpperCase()}
                </div>
              )}
              <span className="text-white/50 text-sm hidden sm:block">{user.name}</span>
            </div>
          )}
        </nav>

        {/* Tab navigation */}
        <div className="flex gap-1 mb-10 bg-white/[0.04] border border-white/[0.08] rounded-xl p-1 w-fit">
          <span className="px-5 py-2 rounded-lg text-sm font-medium bg-white/[0.08] text-white">
            Словари
          </span>
          <Link
            href="/dashboard/grammar"
            className="px-5 py-2 rounded-lg text-sm font-medium text-white/50 hover:text-white transition-colors"
          >
            Грамматика
          </Link>
        </div>

        <h1 className="text-3xl font-bold mb-2">Словари</h1>
        <p className="text-white/40 mb-10">Выбери список для изучения</p>

        {loading ? (
          <div className="flex justify-center py-20">
            <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {lists.map((list) => {
              const p = progress[list.id];
              const knownPct = p ? (p.known / p.total) * 100 : 0;
              const learningPct = p ? (p.learning / p.total) * 100 : 0;

              return (
                <div
                  key={list.id}
                  className="bg-white/[0.04] border border-white/[0.08] rounded-2xl p-6 flex flex-col gap-4 hover:border-violet-500/40 transition-colors"
                >
                  <div>
                    <h2 className="text-lg font-semibold">{list.title}</h2>
                    {list.description && (
                      <p className="text-white/40 text-sm mt-1">{list.description}</p>
                    )}
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <div className="w-full h-1.5 bg-white/[0.06] rounded-full overflow-hidden flex">
                      <div
                        className="h-full bg-emerald-500 transition-all duration-500"
                        style={{ width: `${knownPct}%` }}
                      />
                      <div
                        className="h-full bg-amber-400 transition-all duration-500"
                        style={{ width: `${learningPct}%` }}
                      />
                    </div>
                    {p && (
                      <p className="text-white/30 text-xs">
                        {p.known} / {p.total} выучено
                        {p.learning > 0 && (
                          <span className="text-amber-400/60 ml-1">· {p.learning} в процессе</span>
                        )}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center justify-between mt-auto">
                    <span className="text-white/30 text-sm">{list.word_count} слов</span>
                    <div className="flex gap-2">
                      <Link
                        href={`/dashboard/lists/${list.id}`}
                        className="px-4 py-1.5 text-sm text-white/60 hover:text-white border border-white/10 hover:border-white/30 rounded-lg transition-colors"
                      >
                        Browse
                      </Link>
                      <Link
                        href={`/dashboard/lists/${list.id}/study`}
                        className="px-4 py-1.5 text-sm bg-violet-600 hover:bg-violet-500 rounded-lg transition-colors font-medium"
                      >
                        Учить
                      </Link>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
