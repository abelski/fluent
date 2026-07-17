'use client';

import { useEffect, useState } from 'react';
import { BACKEND_URL, getToken } from '../../../lib/api';
import { useT } from '../../../lib/useT';
import ProgressStatCard from './ProgressStatCard';

interface Stats {
  known: number;
  streak: number;
  mistakes: number;
  due_review: number;
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
      <ProgressStatCard
        theme="emerald"
        icon="📚"
        count={stats.known}
        countBadge={`≈ ${currentLevel === '0' ? 'A0' : currentLevel}`}
        label={tr.stats.wordsLearned}
        nextMilestone={nextLevel}
        milestone={{
          pct: vocabPct,
          caption: nextLevel
            ? tr.stats.progressToNext
                .replace('{count}', String(stats.known))
                .replace('{target}', String(cefrNext))
                .replace('{level}', nextLevel)
            : null,
        }}
        primaryAction={{ href: '/dashboard/review?mode=known', label: tr.stats.remindForgotten }}
        secondaryAction={{ href: '/dashboard/vocabulary', label: tr.stats.viewVocabulary }}
        due={{
          count: stats.due_review,
          total: stats.known,
          caption: tr.stats.dueReviewOf
            .replace('{due}', String(stats.due_review))
            .replace('{total}', String(stats.known)),
        }}
        testId="stats-card-words"
      />
    </div>
  );
}
