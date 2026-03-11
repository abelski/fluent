'use client';

import { useEffect, useState } from 'react';
import { BACKEND_URL, getToken } from '../../../lib/api';

interface Stats {
  known: number;
  streak: number;
}

function motivation(known: number, streak: number): string {
  if (streak >= 30) return 'Невероятно! Ты настоящая машина.';
  if (streak >= 14) return 'Две недели без остановки — это сила!';
  if (streak >= 7) return 'Неделя подряд. Так держать!';
  if (streak >= 3) return 'Хорошая серия! Не останавливайся.';
  if (streak === 2) return 'Два дня подряд — хорошее начало!';
  if (known >= 100) return 'Уже больше сотни слов — впечатляет!';
  if (known >= 50) return 'Полсотни слов позади. Продолжай!';
  if (known > 0) return 'Отличный старт! Каждое слово на счету.';
  return 'Начни учить — первое слово уже ждёт!';
}

function streakLabel(n: number): string {
  if (n === 1) return 'день подряд';
  if (n < 5) return 'дня подряд';
  return 'дней подряд';
}

export default function StatsBar() {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    const token = getToken();
    if (!token) return;
    fetch(`${BACKEND_URL}/api/me/stats`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) setStats({ known: data.known, streak: data.streak });
      })
      .catch(() => {});
  }, []);

  if (!stats) return null;

  return (
    <div className="relative mb-10 rounded-2xl overflow-hidden">
      {/* glow */}
      <div className="absolute inset-0 bg-gradient-to-r from-emerald-600/20 via-emerald-500/10 to-transparent pointer-events-none" />
      <div className="absolute inset-px rounded-2xl bg-[#060d07]/60 pointer-events-none" />

      <div className="relative border border-emerald-500/25 rounded-2xl px-6 py-5 flex flex-col sm:flex-row sm:items-center gap-4">
        {/* stats */}
        <div className="flex items-center gap-6 flex-1">
          <div className="flex items-center gap-3">
            <span className="text-2xl leading-none">📚</span>
            <div>
              <p className="text-2xl font-bold text-white leading-none">{stats.known}</p>
              <p className="text-white/40 text-xs mt-0.5">слов выучено</p>
            </div>
          </div>

          {stats.streak > 0 && (
            <>
              <div className="w-px h-8 bg-white/10 hidden sm:block" />
              <div className="flex items-center gap-3">
                <span className="text-2xl leading-none">🔥</span>
                <div>
                  <p className="text-2xl font-bold text-white leading-none">{stats.streak}</p>
                  <p className="text-white/40 text-xs mt-0.5">{streakLabel(stats.streak)}</p>
                </div>
              </div>
            </>
          )}
        </div>

        {/* motivation */}
        <p className="text-emerald-300/80 text-sm font-medium sm:text-right">
          {motivation(stats.known, stats.streak)}
        </p>
      </div>
    </div>
  );
}
