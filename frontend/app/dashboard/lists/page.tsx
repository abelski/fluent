'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { BACKEND_URL, getToken } from '../../../lib/api';

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

export default function ListsPage() {
  const [lists, setLists] = useState<WordListSummary[]>([]);
  const [progress, setProgress] = useState<Record<number, ListProgress>>({});
  const [loading, setLoading] = useState(true);

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
    <main className="bg-[#07070f] text-white">
      <div className="pointer-events-none fixed inset-0 flex items-start justify-center">
        <div className="w-[600px] h-[400px] bg-violet-700/10 blur-[120px] rounded-full mt-[-100px]" />
      </div>

      <div className="relative z-10 max-w-4xl mx-auto px-6 py-8">
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
