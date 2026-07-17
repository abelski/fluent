'use client';

import Link from 'next/link';

type Theme = 'emerald' | 'purple';

const THEME: Record<Theme, {
  card: string;
  decoration: string;
  iconBox: string;
  badge: string;
  nextLabel: string;
  nextValue: string;
  track: string;
  bar: string;
  dueBar: string;
  primaryBtn: string;
  secondaryBtn: string;
}> = {
  emerald: {
    card: 'from-emerald-50 to-white border-emerald-100',
    decoration: 'bg-emerald-100/40',
    iconBox: 'bg-emerald-100',
    badge: 'bg-emerald-100 text-emerald-700',
    nextLabel: 'text-emerald-600',
    nextValue: 'text-emerald-700',
    track: 'bg-emerald-100',
    bar: 'bg-emerald-500',
    dueBar: 'bg-emerald-400',
    primaryBtn: 'bg-emerald-600 hover:bg-emerald-700',
    secondaryBtn: 'border-emerald-200 hover:bg-emerald-50 text-emerald-700',
  },
  purple: {
    card: 'from-purple-50 to-white border-purple-100',
    decoration: 'bg-purple-100/40',
    iconBox: 'bg-purple-100',
    badge: 'bg-purple-100 text-purple-700',
    nextLabel: 'text-purple-600',
    nextValue: 'text-purple-700',
    track: 'bg-purple-100',
    bar: 'bg-purple-500',
    dueBar: 'bg-purple-400',
    primaryBtn: 'bg-purple-600 hover:bg-purple-700',
    secondaryBtn: 'border-purple-200 hover:bg-purple-50 text-purple-700',
  },
};

export interface ProgressStatCardProps {
  theme: Theme;
  icon: string;
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
  const c = THEME[theme];

  return (
    <div
      className={`relative rounded-2xl bg-gradient-to-br ${c.card} border shadow-sm overflow-hidden p-5`}
      data-testid={testId}
    >
      <div className={`absolute top-0 right-0 w-24 h-24 ${c.decoration} rounded-full -translate-y-8 translate-x-8 pointer-events-none`} />
      <div className="flex items-start justify-between gap-3 relative">
        <div className="flex items-center gap-3">
          <div className={`flex-shrink-0 w-11 h-11 rounded-xl ${c.iconBox} flex items-center justify-center text-xl`}>
            {icon}
          </div>
          <div>
            <div className="flex items-baseline gap-2">
              <p className="text-3xl font-extrabold text-gray-900 leading-none tracking-tight">{count}</p>
              {countBadge && (
                <span className={`text-[11px] font-semibold px-1.5 py-0.5 rounded ${c.badge} whitespace-nowrap`}>
                  {countBadge}
                </span>
              )}
            </div>
            <p className="text-gray-500 text-xs mt-1 font-medium">{label}</p>
          </div>
        </div>
        {nextMilestone && (
          <div className="text-right flex-shrink-0">
            <p className={`text-[10px] ${c.nextLabel} font-semibold uppercase tracking-wide`}>Next</p>
            <p className={`text-sm font-bold ${c.nextValue}`}>{nextMilestone}</p>
          </div>
        )}
      </div>

      {milestone && (
        <div className="mt-4">
          <div className={`h-1.5 ${c.track} rounded-full overflow-hidden`}>
            <div
              className={`h-full ${c.bar} rounded-full transition-all duration-700`}
              style={{ width: `${Math.min(100, Math.max(0, milestone.pct))}%` }}
            />
          </div>
          {milestone.caption && (
            <p className="text-[10px] text-gray-400 mt-1">{milestone.caption}</p>
          )}
        </div>
      )}

      {count > 0 && (
        <div className="mt-3">
          <div className="flex flex-wrap gap-2">
            {primaryAction && (
              <Link
                href={primaryAction.href}
                className={`inline-block text-xs ${c.primaryBtn} text-white font-medium px-3 py-1.5 rounded-full transition-colors`}
              >
                {primaryAction.label}
              </Link>
            )}
            {secondaryAction && (
              <Link
                href={secondaryAction.href}
                className={`inline-block text-xs border ${c.secondaryBtn} font-medium px-3 py-1.5 rounded-full transition-colors`}
              >
                {secondaryAction.label}
              </Link>
            )}
          </div>
          {due && due.count > 0 && due.total > 0 && (
            <div className="mt-2">
              <div className={`h-1 ${c.track} rounded-full overflow-hidden`}>
                <div
                  className={`h-full ${c.dueBar} rounded-full transition-all duration-700`}
                  style={{ width: `${Math.min(100, (due.count / due.total) * 100)}%` }}
                />
              </div>
              <p className="text-[10px] text-gray-400 mt-1">{due.caption}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
