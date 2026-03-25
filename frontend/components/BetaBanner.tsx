'use client';

import { useT } from '../lib/useT';

export default function BetaBanner() {
  const { tr } = useT();
  return (
    <div className="w-full bg-amber-50 border-b border-amber-100 px-4 py-2 text-center text-xs text-amber-700 font-medium tracking-wide">
      {tr.nav.beta}
    </div>
  );
}
