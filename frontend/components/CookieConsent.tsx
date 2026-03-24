'use client';

import { useEffect, useState } from 'react';
import { useT } from '../lib/useT';

export default function CookieConsent() {
  const { tr } = useT();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem('cookie_consent')) {
      setVisible(true);
    }
  }, []);

  function accept() {
    localStorage.setItem('cookie_consent', 'accepted');
    window.dispatchEvent(new CustomEvent('cookieConsent', { detail: 'accepted' }));
    setVisible(false);
  }

  function decline() {
    localStorage.setItem('cookie_consent', 'declined');
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 p-4 sm:p-6">
      <div className="max-w-4xl mx-auto bg-[#080f08] border border-emerald-500/20 rounded-2xl px-5 py-4 flex flex-col sm:flex-row sm:items-center gap-4 shadow-xl">
        <p className="text-white/60 text-sm leading-relaxed flex-1">
          {tr.cookie.message}{' '}
          <span className="text-white/40">{tr.cookie.messageNote}</span>
        </p>
        <div className="flex gap-2 shrink-0">
          <button
            onClick={decline}
            className="px-4 py-2 text-sm text-white/40 hover:text-white border border-white/10 hover:border-white/20 rounded-lg transition-colors"
          >
            {tr.cookie.decline}
          </button>
          <button
            onClick={accept}
            className="px-4 py-2 text-sm font-medium bg-emerald-600 hover:bg-emerald-500 rounded-lg transition-colors"
          >
            {tr.cookie.accept}
          </button>
        </div>
      </div>
    </div>
  );
}
