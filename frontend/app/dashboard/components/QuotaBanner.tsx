'use client';

import Link from 'next/link';
import { useT } from '../../../lib/useT';

export interface QuotaInfo {
  premium_active: boolean;
  premium_until?: string | null;
  sessions_today: number;
  daily_limit: number | null;
}

export default function QuotaBanner({ quota }: { quota: QuotaInfo | null }) {
  const { tr } = useT();
  if (!quota) return null;

  // Premium status now shows as a small label under the avatar in the header
  // (see Header.tsx) instead of a banner on the page.
  if (quota.premium_active) return null;

  const limitReached = quota.daily_limit !== null && quota.sessions_today >= quota.daily_limit;
  return (
    <div
      className={`mb-6 rounded-xl px-5 py-4 border flex flex-col sm:flex-row sm:items-center gap-3 ${
        limitReached ? 'bg-red-50 border-red-200' : 'bg-white border-gray-100'
      }`}
      data-testid="quota-banner"
    >
      <div className="flex-1">
        {limitReached ? (
          <p className="text-red-600 font-medium text-sm">{tr.lists.limitReached.replace('{count}', String(quota.sessions_today)).replace('{limit}', String(quota.daily_limit))}</p>
        ) : (
          <p className="text-gray-500 text-sm">{tr.lists.sessionsToday} <span className="text-gray-900 font-medium">{quota.sessions_today}{quota.daily_limit !== null ? ` / ${quota.daily_limit}` : ''}</span></p>
        )}
      </div>
      <Link href="/pricing" className="shrink-0 text-xs font-medium text-emerald-600 hover:text-emerald-700 border border-emerald-200 rounded-full px-3 py-1.5 transition-colors">
        {tr.lists.getPremium}
      </Link>
    </div>
  );
}
