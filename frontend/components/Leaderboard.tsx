'use client';

import { useEffect, useState } from 'react';
import { BACKEND_URL, getToken } from '../lib/api';
import { useT } from '../lib/useT';

type Period = 'week' | 'all';

interface Entry {
  rank: number;
  picture: string | null;
  score: number;
}

function parseCurrentPicture(token: string): string | null {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.picture ?? null;
  } catch {
    return null;
  }
}

const CROWN_COLORS = [
  'text-yellow-400',   // 1st — gold
  'text-slate-400',    // 2nd — silver
  'text-amber-600',    // 3rd — bronze
];

function CrownIcon({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M5 16L3 5l5.5 5L12 4l3.5 6L21 5l-2 11H5zm0 3a1 1 0 0 0 0 2h14a1 1 0 0 0 0-2H5z" />
    </svg>
  );
}

export default function Leaderboard() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [period, setPeriod] = useState<Period>('week');
  const { tr } = useT();
  const t = tr.landing;

  useEffect(() => {
    const token = getToken();
    if (!token) return;
    fetch(`${BACKEND_URL}/api/leaderboard?period=${period}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { if (data) setEntries(data); else setEntries([]); })
      .catch(() => {});
  }, [period]);

  const token = getToken();
  const currentPicture = token ? parseCurrentPicture(token) : null;

  if (!token) return null;

  return (
    <div data-testid="leaderboard" className="bg-white rounded-2xl p-5 mb-4">
      <div className="flex items-center justify-between mb-1">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{t.leaderboardTitle}</p>
        <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5">
          <button
            onClick={() => setPeriod('week')}
            className={`text-xs font-medium px-2.5 py-1 rounded-md transition-colors ${
              period === 'week'
                ? 'bg-white text-gray-800 shadow-sm'
                : 'text-gray-400 hover:text-gray-600'
            }`}
          >
            {t.leaderboardWeek}
          </button>
          <button
            onClick={() => setPeriod('all')}
            className={`text-xs font-medium px-2.5 py-1 rounded-md transition-colors ${
              period === 'all'
                ? 'bg-white text-gray-800 shadow-sm'
                : 'text-gray-400 hover:text-gray-600'
            }`}
          >
            {t.leaderboardAllTime}
          </button>
        </div>
      </div>
      <p className="text-[11px] text-gray-300 mb-3">
        {period === 'week' ? t.leaderboardWeekSub : t.leaderboardAllSub}
      </p>

      {entries.length === 0 ? (
        <p className="text-xs text-gray-400 text-center py-2">
          {period === 'week' ? t.leaderboardWeekEmpty : '—'}
        </p>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-1">
          {entries.map((entry) => {
            const isMe = currentPicture && entry.picture === currentPicture;
            const crownColor = entry.rank <= 3 ? CROWN_COLORS[entry.rank - 1] : null;
            return (
              <div
                key={entry.rank}
                data-testid="leaderboard-entry"
                className="flex flex-col items-center gap-1 shrink-0"
              >
                {/* crown or spacer */}
                <div className="h-5 flex items-center justify-center">
                  {crownColor ? (
                    <CrownIcon className={`w-5 h-5 ${crownColor}`} />
                  ) : (
                    <span className="text-[10px] font-bold text-gray-300">{entry.rank}</span>
                  )}
                </div>

                {/* avatar */}
                {entry.picture ? (
                  <img
                    src={entry.picture}
                    referrerPolicy="no-referrer"
                    className={`w-10 h-10 rounded-full object-cover ${
                      isMe ? 'ring-2 ring-emerald-400 ring-offset-1' : ''
                    }`}
                    alt=""
                  />
                ) : (
                  <div className={`w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-400 text-sm font-bold ${
                    isMe ? 'ring-2 ring-emerald-400 ring-offset-1' : ''
                  }`}>
                    {entry.rank}
                  </div>
                )}

                {/* rank for top 3 */}
                {entry.rank <= 3 && (
                  <span className="text-[10px] font-bold text-gray-400">{entry.rank}</span>
                )}

                {/* score */}
                <span className="text-xs font-semibold text-gray-600 tabular-nums leading-none">
                  {entry.score}
                </span>
                <span className="text-[10px] text-gray-300 leading-none">{t.leaderboardPts}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
