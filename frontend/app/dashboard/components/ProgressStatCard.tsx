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
  /**
   * Either a navigating action (`href`, rendered as a `Link`) or an in-place one
   * (`onClick`, rendered as a `<button>` — used by Грамматика's remind action,
   * which fetches before deciding where the user ends up). `disabled` + `hint`
   * are for the onClick form: the button dims and a caption explains why.
   */
  primaryAction?: { label: string; href?: string; onClick?: () => void; disabled?: boolean; hint?: string } | null;
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

  // #66 compact phone layout: below `sm` the card is a 2-column grid — the numbers, bar and
  // "Next" label on the left with TAK beside them, the buttons full width underneath — instead
  // of TAK stacked above everything. The wrappers are `display: contents` there and the
  // original flex row from `sm` up, so desktop is unchanged.
  return (
    <div
      className="relative rounded-[14px] bg-white border border-line px-4 py-5 sm:px-[26px] sm:py-[22px] grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-3 sm:flex sm:flex-row sm:items-center sm:gap-6"
      data-testid={testId}
    >
      <div className="col-start-2 row-start-1 row-span-3 self-start sm:contents" data-testid="stat-card-icon">{icon}</div>

      <div className="contents sm:block sm:flex-1 sm:min-w-0">
        <div className="col-start-1 row-start-1 self-end flex items-baseline flex-wrap gap-2 sm:gap-2.5">
          <p className="text-[30px] font-bold text-gray-900 leading-none">{count}</p>
          {countBadge && (
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${c.badge} whitespace-nowrap`}>
              {countBadge}
            </span>
          )}
          <p className="text-[13px] text-muted">{label}</p>
        </div>

        {milestone && (
          <div className="col-start-1 row-start-2 sm:mt-3">
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
          <div className="col-span-2 row-start-4 sm:mt-3.5">
            <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2.5">
              {primaryAction && (
                primaryAction.href ? (
                  <Link
                    href={primaryAction.href}
                    className={`inline-block text-center text-xs ${c.primaryBtn} font-semibold px-3.5 py-2 rounded-lg transition-colors`}
                  >
                    {primaryAction.label}
                  </Link>
                ) : (
                  <button
                    type="button"
                    onClick={primaryAction.onClick}
                    disabled={primaryAction.disabled}
                    className={`inline-block text-center text-xs ${c.primaryBtn} font-semibold px-3.5 py-2 rounded-lg transition-colors ${
                      primaryAction.disabled ? 'opacity-50 cursor-not-allowed' : ''
                    }`}
                  >
                    {primaryAction.label}
                  </button>
                )
              )}
              {secondaryAction && (
                <Link
                  href={secondaryAction.href}
                  className={`inline-block text-center text-xs border ${SECONDARY_BTN} font-semibold px-3.5 py-2 rounded-lg transition-colors`}
                >
                  {secondaryAction.label} <TakChevron size={10} className="inline-block align-[-1px]" />
                </Link>
              )}
            </div>
            {primaryAction?.hint && (
              <p className="text-xs text-faint mt-1.5">{primaryAction.hint}</p>
            )}
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
        <div className="col-start-1 row-start-3 flex items-baseline gap-1.5 sm:block sm:text-right sm:shrink-0" data-testid="stat-card-next">
          <p className="text-[11px] text-gray-500 font-semibold uppercase tracking-wide">{tr.stats.nextLabel}</p>
          <p className="text-sm font-semibold text-ink">{nextMilestone}</p>
        </div>
      )}
    </div>
  );
}
