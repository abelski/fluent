'use client';

import { useT } from '../lib/useT';

export default function BetaBanner() {
  const { tr } = useT();
  return (
    <div className="w-full bg-blue-50 border-b border-blue-200 px-4 py-2 text-center text-xs text-blue-700">
      {tr.nav.beta}
    </div>
  );
}
