'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { BACKEND_URL, getToken } from '../../../lib/api';
import { useT } from '../../../lib/useT';

interface Stats {
  known: number;
  streak: number;
  mistakes: number;
}

export default function StatsBar() {
  const { tr, plural } = useT();
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    const token = getToken();
    if (!token) return;
    fetch(`${BACKEND_URL}/api/me/stats`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) setStats({ known: data.known, streak: data.streak, mistakes: data.mistakes ?? 0 });
      })
      .catch(() => {});
  }, []);

  if (!stats) return null;

  function motivation(known: number, streak: number): string {
    const m = tr.stats.motivations;
    if (streak >= 30) return m.streak30;
    if (streak >= 14) return m.streak14;
    if (streak >= 7) return m.streak7;
    if (streak >= 3) return m.streak3;
    if (streak === 2) return m.streak2;
    if (known >= 100) return m.known100;
    if (known >= 50) return m.known50;
    if (known > 0) return m.knownSome;
    return m.none;
  }

  return (
    <div className="relative mb-10 rounded-2xl overflow-hidden">
      {/* glow */}
      <div className="absolute inset-0 bg-gradient-to-r from-emerald-200/40 via-emerald-100/30 to-transparent pointer-events-none" />
      <div className="absolute inset-px rounded-2xl bg-white/80 pointer-events-none" />

      <div className="relative border border-gray-900 rounded-2xl px-6 py-5 flex flex-col sm:flex-row sm:items-center gap-4">
        {/* stats */}
        <div className="flex items-center gap-6 flex-1">
          <div className="flex items-center gap-3">
            <span className="text-2xl leading-none">📚</span>
            <div>
              <p className="text-2xl font-bold text-gray-900 leading-none">{stats.known}</p>
              <p className="text-gray-400 text-xs mt-0.5">{tr.stats.wordsLearned}</p>
              {stats.known > 0 && (
                <Link
                  href="/dashboard/review?mode=known"
                  className="text-xs text-emerald-600 hover:text-emerald-700 font-medium transition-colors whitespace-nowrap"
                >
                  {tr.stats.reviewLearned}
                </Link>
              )}
              {stats.mistakes > 0 && (
                <Link
                  href="/dashboard/review?mode=mistakes"
                  className="block text-xs text-amber-600 hover:text-amber-700 font-medium transition-colors whitespace-nowrap"
                >
                  {tr.stats.reviewMistakes.replace('{n}', String(stats.mistakes))}
                </Link>
              )}
            </div>
          </div>

          {stats.streak > 0 && (
            <>
              <div className="w-px h-8 bg-gray-200 hidden sm:block" />
              <div className="flex items-center gap-3">
                <span className="text-2xl leading-none">🔥</span>
                <div>
                  <p className="text-2xl font-bold text-gray-900 leading-none">{stats.streak}</p>
                  <p className="text-gray-400 text-xs mt-0.5">{plural(stats.streak, tr.stats.streakDay)}</p>
                </div>
              </div>
            </>
          )}
        </div>

        <p className="text-emerald-600 text-sm font-medium sm:text-right">
          {motivation(stats.known, stats.streak)}
        </p>
      </div>
    </div>
  );
}
