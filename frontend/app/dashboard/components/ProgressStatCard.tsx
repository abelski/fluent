'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { useT } from '../../../lib/useT';
import TakChevron from '../../../components/TakChevron';

type Theme = 'emerald' | 'purple';

// Only the accent (badge / progress fill / primary action) actually varies by theme in the
// prototypes — the surrounding chrome (border, track, secondary button, "Next" label) is the
// same neutral gray in both the words (emerald) and phrases (purple) mockups.
const THEME: Record<Theme, {
  badge: string;
  bar: string;
  primaryBtn: string;
}> = {
  emerald: {
    badge: 'bg-emerald-50 text-emerald-600',
    bar: 'bg-emerald-600',
    primaryBtn: 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100',
  },
  purple: {
    badge: 'bg-purple-50 text-purple-600',
    bar: 'bg-purple-600',
    primaryBtn: 'bg-purple-600 text-white hover:bg-purple-700',
  },
};

const TRACK = 'bg-gray-100';
const SECONDARY_BTN = 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50';

export interface ProgressStatCardProps {
  theme: Theme;
  icon: ReactNode;
  count: number;
  label: string;
  countBadge?: string | null;
  nextMilestone?: string | null;
  milestone?: { pct: number; caption?: string | null } | null;
  primaryAction?: { href: string; label: string } | null;
  secondaryAction?: { href: string; label: string } | null;
  due?: { count: number; total: number; caption: string } | null;
  testId?: string;
}

export default function ProgressStatCard({
  theme,
  icon,
  count,
  label,
  countBadge,
  nextMilestone,
  milestone,
  primaryAction,
  secondaryAction,
  due,
  testId,
}: ProgressStatCardProps) {
  const { tr } = useT();
  const c = THEME[theme];

  return (
    <div
      className="rounded-[14px] bg-white border border-line px-4 py-5 sm:px-[26px] sm:py-[22px] flex items-center gap-4 sm:gap-6"
      data-testid={testId}
    >
      {icon}

      <div className="flex-1 min-w-0">
        <div className="flex items-baseline flex-wrap gap-2 sm:gap-2.5">
          <p className="text-[30px] font-bold text-gray-900 leading-none">{count}</p>
          {countBadge && (
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${c.badge} whitespace-nowrap`}>
              {countBadge}
            </span>
          )}
          <p className="text-[13px] text-muted">{label}</p>
        </div>

        {milestone && (
          <div className="mt-3">
            <div className={`h-1.5 ${TRACK} rounded-full overflow-hidden`}>
              <div
                className={`h-full ${c.bar} rounded-full transition-all duration-700`}
                style={{ width: `${Math.min(100, Math.max(0, milestone.pct))}%` }}
              />
            </div>
            {milestone.caption && (
              <p className="text-xs text-gray-400 mt-1.5">{milestone.caption}</p>
            )}
          </div>
        )}

        {count > 0 && (
          <div className="mt-3.5">
            <div className="flex flex-wrap gap-2.5">
              {primaryAction && (
                <Link
                  href={primaryAction.href}
                  className={`inline-block text-xs ${c.primaryBtn} font-semibold px-3.5 py-2 rounded-lg transition-colors`}
                >
                  {primaryAction.label}
                </Link>
              )}
              {secondaryAction && (
                <Link
                  href={secondaryAction.href}
                  className={`inline-block text-xs border ${SECONDARY_BTN} font-semibold px-3.5 py-2 rounded-lg transition-colors`}
                >
                  {secondaryAction.label} <TakChevron size={10} className="inline-block align-[-1px]" />
                </Link>
              )}
            </div>
            {due && due.count > 0 && due.total > 0 && (
              <div className="mt-3.5 w-[120px]">
                <div className={`h-1 ${TRACK} rounded-full overflow-hidden`}>
                  <div
                    className={`h-full ${c.bar} rounded-full transition-all duration-700`}
                    style={{ width: `${Math.min(100, (due.count / due.total) * 100)}%` }}
                  />
                </div>
                <p className="text-xs text-gray-400 mt-1.5">{due.caption}</p>
              </div>
            )}
          </div>
        )}
      </div>

      {nextMilestone && (
        <div className="text-right shrink-0">
          <p className="text-[11px] text-gray-500 font-semibold uppercase tracking-wide">{tr.stats.nextLabel}</p>
          <p className="text-sm font-semibold text-ink">{nextMilestone}</p>
        </div>
      )}
    </div>
  );
}
