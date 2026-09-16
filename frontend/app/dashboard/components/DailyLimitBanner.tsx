'use client';

import Link from 'next/link';
import { useT } from '../../../lib/useT';
import PremiumOfferCard from './PremiumOfferCard';

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
 *
 * #25 — at 0 remaining this became a real offer instead of a one-line text link.
 * Measured cause: 28 users hit the wall and never once reached Stripe Checkout.
 * The 1-remaining nudge is unchanged — that user can still study, so a full
 * upsell card there would be an interruption, not an offer.
 */
export default function DailyLimitBanner({ quota }: DailyLimitBannerProps) {
  const { tr } = useT();
  if (!quota || quota.premium_active || quota.daily_limit == null) return null;

  const remaining = quota.daily_limit - quota.sessions_today;
  if (remaining >= 2) return null;

  // Still has one session left — keep the thin nudge.
  if (remaining === 1) {
    return (
      <div
        className="flex flex-wrap items-center justify-between gap-3 border border-line rounded-[14px] px-5 py-3.5 mb-6"
        data-testid="daily-limit-banner"
      >
        <p className="text-[13.5px] text-ink">{tr.lists.limitNear}</p>
        <Link
          href="/pricing"
          className="shrink-0 text-[13px] font-semibold text-emerald-600 hover:text-emerald-700 transition-colors"
        >
          {tr.lists.getPremium}
        </Link>
      </div>
    );
  }

  // Out of sessions — the only moment the user actually feels the limit, so this
  // is where the offer goes. Shape, button and price line come from the shared
  // PremiumOfferCard (#32); only the copy is specific to hitting the daily wall.
  return (
    <PremiumOfferCard
      testId="daily-limit-banner"
      className="mb-6"
      title={tr.lists.wallTitle}
      subtitle={tr.lists.wallSubtitle}
      perks={tr.lists.wallPerks}
    />
  );
}
