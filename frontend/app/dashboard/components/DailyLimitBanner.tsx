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
  // is where the offer goes: what it costs, what it unlocks, one real button.
  return (
    <div className="border border-line rounded-[14px] px-5 py-5 mb-6" data-testid="daily-limit-banner">
      <p className="text-[15px] font-semibold text-ink mb-1">{tr.lists.wallTitle}</p>
      <p className="text-[13.5px] text-muted mb-4">{tr.lists.wallSubtitle}</p>
      <ul className="flex flex-col gap-1.5 mb-5">
        {tr.lists.wallPerks.map((perk) => (
          <li key={perk} className="flex items-start gap-2 text-[13.5px] text-ink">
            <span className="text-emerald-600 leading-5">✓</span>
            {perk}
          </li>
        ))}
      </ul>
      <Link
        href="/pricing"
        data-testid="daily-limit-cta"
        className="inline-block px-5 py-2.5 text-center text-[14px] font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl transition-colors"
      >
        {tr.lists.wallCta.replace('{price}', tr.pricing.premiumPrice)}
      </Link>
    </div>
  );
}
