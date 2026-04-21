'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { BACKEND_URL, getToken } from '../../../lib/api';
import { useT } from '../../../lib/useT';

interface Stats {
  known: number;
  streak: number;
  mistakes: number;
  due_review: number;
  phrases_learned: number;
  phrases_due_review: number;
}

interface CefrLevel { level: string; threshold: number; }

const CEFR_LEVELS_DEFAULT: CefrLevel[] = [
  { level: '0',  threshold: 0 },
  { level: 'A1', threshold: 500 },
  { level: 'A2', threshold: 1000 },
  { level: 'B1', threshold: 2000 },
  { level: 'B2', threshold: 4000 },
  { level: 'C1', threshold: 8000 },
  { level: 'C2', threshold: 16000 },
];

function getCefrProgress(known: number, levels: CefrLevel[]) {
  for (let i = 1; i < levels.length; i++) {
    if (known < levels[i].threshold) {
      return {
        currentLevel: levels[i - 1].level,
        nextLevel: levels[i].level,
        prev: levels[i - 1].threshold,
        next: levels[i].threshold,
        pct: Math.round(((known - levels[i - 1].threshold) / (levels[i].threshold - levels[i - 1].threshold)) * 100),
      };
    }
  }
  const last = levels[levels.length - 1];
  return { currentLevel: last.level, nextLevel: null as string | null, prev: 0, next: 0, pct: 100 };
}

export default function StatsBar() {
  const { tr } = useT();
  const [stats, setStats] = useState<Stats | null>(null);
  const [cefrLevels, setCefrLevels] = useState<CefrLevel[]>(CEFR_LEVELS_DEFAULT);

  const fetchStats = () => {
    const token = getToken();
    if (!token) return;
    fetch(`${BACKEND_URL}/api/me/stats`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) setStats({
          known: data.known,
          streak: data.streak,
          mistakes: data.mistakes ?? 0,
          due_review: data.due_review ?? 0,
          phrases_learned: data.phrases_learned ?? 0,
          phrases_due_review: data.phrases_due_review ?? 0,
        });
      })
      .catch((err) => console.error('API error:', err));
  };

  useEffect(() => {
    fetch(`${BACKEND_URL}/api/admin/settings/cefr-thresholds`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { if (Array.isArray(data) && data.length) setCefrLevels(data); })
      .catch(() => {});
    fetchStats();
    const onVisible = () => { if (document.visibilityState === 'visible') fetchStats(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!stats) return null;

  const { currentLevel, nextLevel, next: cefrNext, pct: vocabPct } = getCefrProgress(stats.known, cefrLevels);

  return (
    <div className="mb-10">
      {/* Vocabulary card */}
      <div className="relative rounded-2xl bg-gradient-to-br from-emerald-50 to-white border border-emerald-100 shadow-sm overflow-hidden p-5">
        <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-100/40 rounded-full -translate-y-8 translate-x-8 pointer-events-none" />
        <div className="flex items-start justify-between gap-3 relative">
          <div className="flex items-center gap-3">
            <div className="flex-shrink-0 w-11 h-11 rounded-xl bg-emerald-100 flex items-center justify-center text-xl">
              📚
            </div>
            <div>
              <div className="flex items-baseline gap-2">
                <p className="text-3xl font-extrabold text-gray-900 leading-none tracking-tight">{stats.known}</p>
                <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 whitespace-nowrap">
                  ≈ {currentLevel === '0' ? 'A0' : currentLevel}
                </span>
              </div>
              <p className="text-gray-500 text-xs mt-1 font-medium">{tr.stats.wordsLearned}</p>
            </div>
          </div>
          {nextLevel && (
            <div className="text-right flex-shrink-0">
              <p className="text-[10px] text-emerald-600 font-semibold uppercase tracking-wide">Next</p>
              <p className="text-sm font-bold text-emerald-700">{nextLevel}</p>
            </div>
          )}
        </div>

        <div className="mt-4">
          <div className="h-1.5 bg-emerald-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-emerald-500 rounded-full transition-all duration-700"
              style={{ width: `${vocabPct}%` }}
            />
          </div>
          {nextLevel && (
            <p className="text-[10px] text-gray-400 mt-1">{stats.known} / {cefrNext} до {nextLevel}</p>
          )}
        </div>

        {stats.known > 0 && (
          <div className="mt-3">
            <div className="flex flex-wrap gap-2">
              <Link
                href="/dashboard/review?mode=known"
                className="inline-block text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-medium px-3 py-1.5 rounded-full transition-colors"
              >
                {tr.stats.remindForgotten}
              </Link>
              <Link
                href="/dashboard/vocabulary"
                className="inline-block text-xs border border-emerald-200 hover:bg-emerald-50 text-emerald-700 font-medium px-3 py-1.5 rounded-full transition-colors"
              >
                {tr.stats.viewVocabulary}
              </Link>
            </div>
            {stats.due_review > 0 && (
              <div className="mt-2">
                <div className="h-1 bg-emerald-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-400 rounded-full transition-all duration-700"
                    style={{ width: `${Math.min(100, (stats.due_review / stats.known) * 100)}%` }}
                  />
                </div>
                <p className="text-[10px] text-gray-400 mt-1">
                  {tr.stats.dueReviewOf
                    .replace('{due}', String(stats.due_review))
                    .replace('{total}', String(stats.known))}
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
