'use client';

import Link from 'next/link';
import { useT } from '../../../lib/useT';

interface QuotaLike {
  premium_active: boolean;
  sessions_today: number;
  daily_limit: number | null;
}

interface DailyLimitBannerProps {
  quota: QuotaLike | null;
}

/**
 * Plan #16 — a small, *conditional* daily-limit notice for free users close to
 * today's session cap. Deliberately not an always-visible banner: `QuotaBanner`
 * (an always-on "Sessions today: N/limit" banner) was removed from these same
 * two pages in changelog #9 at the user's explicit request. This renders nothing
 * unless the user has 1 or 0 free sessions left today.
 */
export default function DailyLimitBanner({ quota }: DailyLimitBannerProps) {
  const { tr } = useT();
  if (!quota || quota.premium_active || quota.daily_limit == null) return null;

  const remaining = quota.daily_limit - quota.sessions_today;
  if (remaining >= 2) return null;

  const message = remaining <= 0
    ? tr.lists.limitReached
        .replace('{count}', String(quota.sessions_today))
        .replace('{limit}', String(quota.daily_limit))
    : tr.lists.limitNear;

  return (
    <div
      className="flex flex-wrap items-center justify-between gap-3 border border-line rounded-[14px] px-5 py-3.5 mb-6"
      data-testid="daily-limit-banner"
    >
      <p className="text-[13.5px] text-ink">{message}</p>
      <Link
        href="/pricing"
        className="shrink-0 text-[13px] font-semibold text-emerald-600 hover:text-emerald-700 transition-colors"
      >
        {tr.lists.getPremium}
      </Link>
    </div>
  );
}
