'use client';

import Link from 'next/link';
import { useT } from '../../../lib/useT';

interface PremiumOfferCardProps {
  title: string;
  subtitle: string;
  perks: readonly string[];
  /** Root test id; the CTA and price line get `-cta` / `-price` suffixes. */
  testId: string;
  className?: string;
}

/**
 * #32 — the one Premium offer. Before this there were four different-looking upsells:
 * this flat card with a green button on /dashboard/lists, an amber gradient card with an
 * orange pill next to it, a dark-button screen behind the 429, and /dashboard/premium with
 * a `mailto:` link. Same product, four designs, and only two of them named the price.
 *
 * Anything that sells Premium renders this. The copy varies — what the user just ran into
 * differs by surface — but the shape, the button and the price line never do.
 *
 * The price sits under the button, not inside it: #25 measured 28 users hitting a wall with
 * no price who never reached Checkout, so it has to be on the card before the click; a
 * button should still name the action rather than carry the terms as well.
 */
export default function PremiumOfferCard({
  title, subtitle, perks, testId, className = '',
}: PremiumOfferCardProps) {
  const { tr } = useT();
  return (
    <div className={`border border-line rounded-[14px] px-5 py-5 ${className}`} data-testid={testId}>
      <p className="text-[15px] font-semibold text-ink mb-1">{title}</p>
      <p className="text-[13.5px] text-muted mb-4">{subtitle}</p>
      <ul className="flex flex-col gap-1.5 mb-5">
        {perks.map((perk) => (
          <li key={perk} className="flex items-start gap-2 text-[13.5px] text-ink">
            <span className="text-emerald-600 leading-5">✓</span>
            {perk}
          </li>
        ))}
      </ul>
      <Link
        href="/pricing"
        data-testid={`${testId}-cta`}
        className="inline-block px-5 py-2.5 text-center text-[14px] font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl transition-colors"
      >
        {tr.lists.wallCta}
      </Link>
      <p className="text-[12.5px] text-faint mt-2" data-testid={`${testId}-price`}>
        {tr.lists.wallPriceNote.replace('{price}', tr.pricing.premiumPrice)}
      </p>
    </div>
  );
}
