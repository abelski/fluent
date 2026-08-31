'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { BACKEND_URL, getToken } from '../../../lib/api';
import { useT } from '../../../lib/useT';
import type { Translations } from '../../../lib/i18n/types';
import ProgressStatCard from './ProgressStatCard';
import PageMascot from '../../../components/PageMascot';

interface Stats {
  known: number;
  streak: number;
  mistakes: number;
  due_review: number;
}

// Plan #16 — milestone-triggered Premium nudge. Highest threshold first so a user
// who jumps straight past several thresholds (e.g. catching up after time away)
// gets the single most impressive one, not the smallest.
const STREAK_MILESTONES: number[] = [30, 14, 7, 3];
const KNOWN_MILESTONES: number[] = [100, 50];

type Motivations = Translations['stats']['motivations'];
const STREAK_MOTIVATION_KEY: Record<number, keyof Motivations> = {
  30: 'streak30', 14: 'streak14', 7: 'streak7', 3: 'streak3',
};
const KNOWN_MOTIVATION_KEY: Record<number, keyof Motivations> = {
  100: 'known100', 50: 'known50',
};

const STREAK_SHOWN_KEY = 'fluent_milestone_streak_shown';
const WORDS_SHOWN_KEY = 'fluent_milestone_words_shown';

interface Milestone {
  kind: 'streak' | 'known';
  threshold: number;
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
  // Plan #16 — milestone nudge state. `premiumActive` starts `null` (unresolved)
  // so the nudge never flashes for a Premium user while the quota fetch is in
  // flight. Admins are excluded too (Goals: "a free user..."), even though they
  // are not exempt from the daily session quota itself.
  const [premiumActive, setPremiumActive] = useState<boolean | null>(null);
  const [isAdminUser, setIsAdminUser] = useState(false);
  const [milestone, setMilestone] = useState<Milestone | null>(null);
  const [milestoneDismissed, setMilestoneDismissed] = useState(false);

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

  // Plan #16 — one-time `/api/me/quota` fetch for `premium_active`, mirroring the
  // same fetch-on-mount pattern used elsewhere (PricingClient.tsx, Header.tsx).
  useEffect(() => {
    const token = getToken();
    if (!token) { setPremiumActive(false); return; }
    fetch(`${BACKEND_URL}/api/me/quota`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        setPremiumActive(data?.premium_active === true);
        setIsAdminUser(data?.is_admin === true || data?.is_superadmin === true);
      })
      .catch(() => setPremiumActive(false));
  }, []);

  // Plan #16 — check for a newly-crossed streak/known-words milestone whenever fresh
  // stats land, but only once we know the user is not Premium. Streak takes priority
  // over words if both are newly crossed in the same load (Requirement 5). The
  // crossed threshold is persisted to localStorage immediately (view = dedup) so it
  // never re-shows for that same threshold, even across page reloads.
  useEffect(() => {
    if (!stats || premiumActive !== false || isAdminUser || typeof window === 'undefined') return;

    const streakShown = Number(window.localStorage.getItem(STREAK_SHOWN_KEY) ?? '0');
    const crossedStreak = STREAK_MILESTONES.find((t) => stats.streak >= t && streakShown < t);
    if (crossedStreak !== undefined) {
      window.localStorage.setItem(STREAK_SHOWN_KEY, String(crossedStreak));
      setMilestone({ kind: 'streak', threshold: crossedStreak });
      return;
    }

    const wordsShown = Number(window.localStorage.getItem(WORDS_SHOWN_KEY) ?? '0');
    const crossedKnown = KNOWN_MILESTONES.find((t) => stats.known >= t && wordsShown < t);
    if (crossedKnown !== undefined) {
      window.localStorage.setItem(WORDS_SHOWN_KEY, String(crossedKnown));
      setMilestone({ kind: 'known', threshold: crossedKnown });
    }
  }, [stats, premiumActive, isAdminUser]);

  if (!stats) return null;

  const showMilestoneNudge = milestone !== null && !milestoneDismissed;
  const milestoneHeadline = milestone
    ? tr.stats.motivations[
        milestone.kind === 'streak' ? STREAK_MOTIVATION_KEY[milestone.threshold] : KNOWN_MOTIVATION_KEY[milestone.threshold]
      ]
    : null;

  const { currentLevel, nextLevel, next: cefrNext, pct: vocabPct } = getCefrProgress(stats.known, cefrLevels);

  return (
    <div className="mb-5">
      <ProgressStatCard
        theme="emerald"
        icon={<PageMascot phrase="Sveikas!" className="shrink-0" />}
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
      {showMilestoneNudge && (
        <div
          className="mt-4 flex items-start justify-between gap-3 border border-line rounded-[14px] px-5 py-4 bg-white"
          data-testid="milestone-nudge"
        >
          <div>
            <p className="text-sm font-semibold text-ink mb-1">{milestoneHeadline}</p>
            <p className="text-[13px] text-muted mb-2">{tr.stats.milestonePremiumHint}</p>
            <Link
              href="/pricing"
              className="text-[13px] font-semibold text-emerald-600 hover:text-emerald-700 transition-colors"
            >
              {tr.stats.milestonePremiumButton}
            </Link>
          </div>
          <button
            type="button"
            onClick={() => setMilestoneDismissed(true)}
            aria-label="×"
            className="shrink-0 text-gray-400 hover:text-gray-900 transition-colors leading-none"
            data-testid="milestone-nudge-dismiss"
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
}
