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

const VOCAB_MILESTONES = [10, 25, 50, 100, 200, 500, 1000];
const STREAK_MILESTONES = [3, 7, 14, 30, 60, 100];

function nextMilestone(value: number, milestones: number[]): number | null {
  return milestones.find((m) => m > value) ?? null;
}

function milestoneProgress(value: number, milestones: number[]): number {
  const next = nextMilestone(value, milestones);
  if (!next) return 100;
  const prev = [...milestones].reverse().find((m) => m <= value) ?? 0;
  return Math.round(((value - prev) / (next - prev)) * 100);
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
      .catch((err) => console.error('API error:', err));
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

  const vocabNext = nextMilestone(stats.known, VOCAB_MILESTONES);
  const vocabPct = milestoneProgress(stats.known, VOCAB_MILESTONES);
  const streakNext = nextMilestone(stats.streak, STREAK_MILESTONES);
  const streakPct = milestoneProgress(stats.streak, STREAK_MILESTONES);

  return (
    <div className="mb-10">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">

        {/* Vocabulary card */}
        <div className="relative rounded-2xl bg-gradient-to-br from-emerald-50 to-white border border-emerald-100 shadow-sm overflow-hidden p-5">
          <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-100/40 rounded-full -translate-y-8 translate-x-8 pointer-events-none" />
          <div className="flex items-start justify-between gap-3 relative">
            <div className="flex items-center gap-3">
              <div className="flex-shrink-0 w-11 h-11 rounded-xl bg-emerald-100 flex items-center justify-center text-xl">
                📚
              </div>
              <div>
                <p className="text-3xl font-extrabold text-gray-900 leading-none tracking-tight">{stats.known}</p>
                <p className="text-gray-500 text-xs mt-1 font-medium">{tr.stats.wordsLearned}</p>
              </div>
            </div>
            {vocabNext && (
              <div className="text-right flex-shrink-0">
                <p className="text-[10px] text-emerald-600 font-semibold uppercase tracking-wide">Next</p>
                <p className="text-sm font-bold text-emerald-700">{vocabNext}</p>
              </div>
            )}
          </div>

          {/* Progress bar */}
          <div className="mt-4">
            <div className="h-1.5 bg-emerald-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-500 rounded-full transition-all duration-700"
                style={{ width: `${vocabPct}%` }}
              />
            </div>
            {vocabNext && (
              <p className="text-[10px] text-gray-400 mt-1">{stats.known} / {vocabNext} до следующей цели</p>
            )}
          </div>

          {/* Action links */}
          {stats.known > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              <Link
                href="/dashboard/review?mode=known"
                className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-medium px-3 py-1 rounded-full transition-colors"
              >
                {tr.stats.reviewLearned}
              </Link>
              <Link
                href="/dashboard/vocabulary"
                className="text-xs border border-emerald-200 hover:bg-emerald-50 text-emerald-700 font-medium px-3 py-1 rounded-full transition-colors"
              >
                {tr.stats.viewVocabulary}
              </Link>
              {stats.mistakes > 0 && (
                <Link
                  href="/dashboard/review?mode=mistakes"
                  className="text-xs bg-amber-100 hover:bg-amber-200 text-amber-700 font-medium px-3 py-1 rounded-full transition-colors"
                >
                  {tr.stats.reviewMistakes.replace('{n}', String(stats.mistakes))}
                </Link>
              )}
            </div>
          )}
        </div>

        {/* Streak card */}
        <div className="relative rounded-2xl bg-gradient-to-br from-orange-50 to-white border border-orange-100 shadow-sm overflow-hidden p-5">
          <div className="absolute top-0 right-0 w-24 h-24 bg-orange-100/40 rounded-full -translate-y-8 translate-x-8 pointer-events-none" />
          <div className="flex items-start justify-between gap-3 relative">
            <div className="flex items-center gap-3">
              <div className="flex-shrink-0 w-11 h-11 rounded-xl bg-orange-100 flex items-center justify-center text-xl">
                🔥
              </div>
              <div>
                <p className="text-3xl font-extrabold text-gray-900 leading-none tracking-tight">{stats.streak}</p>
                <p className="text-gray-500 text-xs mt-1 font-medium">{plural(stats.streak, tr.stats.streakDay)}</p>
              </div>
            </div>
            {streakNext && stats.streak > 0 && (
              <div className="text-right flex-shrink-0">
                <p className="text-[10px] text-orange-600 font-semibold uppercase tracking-wide">Next</p>
                <p className="text-sm font-bold text-orange-700">{streakNext}</p>
              </div>
            )}
          </div>

          {/* Progress bar */}
          {stats.streak > 0 && (
            <div className="mt-4">
              <div className="h-1.5 bg-orange-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-orange-500 rounded-full transition-all duration-700"
                  style={{ width: `${streakPct}%` }}
                />
              </div>
              {streakNext && (
                <p className="text-[10px] text-gray-400 mt-1">{stats.streak} / {streakNext} до следующей цели</p>
              )}
            </div>
          )}

          {/* Motivation */}
          <p className="mt-3 text-sm text-orange-700 font-medium">
            {motivation(stats.known, stats.streak)}
          </p>
        </div>

      </div>
    </div>
  );
}
