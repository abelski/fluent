'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useT } from '../../lib/useT';
import { BACKEND_URL, getToken } from '../../lib/api';
import TakChevron from '../../components/TakChevron';

// This page is a documented "heavy-border pages left alone" deviation in the component
// library — it keeps border-gray-900 / rounded-2xl rather than the newer flat tokens.
// Do not migrate it here; #11 only replaced the mailto CTA with real checkout.

type Quota = {
  premium_active: boolean;
  premium_until: string | null;
  subscription_status: string | null;
  has_billing_account: boolean;
};

function CheckIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="shrink-0 mt-0.5">
      <circle cx="8" cy="8" r="8" fill="currentColor" fillOpacity="0.15" />
      <path d="M5 8l2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function PricingClient() {
  const { tr, lang } = useT();

  const [billingEnabled, setBillingEnabled] = useState<boolean | null>(null);
  const [quota, setQuota] = useState<Quota | null>(null);
  const [loggedIn, setLoggedIn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 'success' while we wait for the webhook to land; then 'activated', or 'slow' if the
  // poll budget runs out first. 'cancelled' is dismissible; the others are terminal.
  const [returned, setReturned] = useState<'success' | 'cancelled' | 'activated' | 'slow' | null>(null);

  const fetchQuota = useCallback(async (): Promise<Quota | null> => {
    const token = getToken();
    if (!token) return null;
    try {
      const r = await fetch(`${BACKEND_URL}/api/me/quota`, { headers: { Authorization: `Bearer ${token}` } });
      if (!r.ok) return null;
      const q: Quota = await r.json();
      setQuota(q);
      return q;
    } catch {
      return null;
    }
  }, []);

  // Latched behind a startedRef, like the continue-session mount effect
  // (frontend/app/dashboard/continue/page.tsx) — React double-invokes mount effects
  // under some hydration paths, and here that would fire two independent poll chains
  // against the same 2s/5-attempt budget instead of one, racing each other. The gate
  // makes sure exactly one chain ever starts.
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    setLoggedIn(!!getToken());

    fetch(`${BACKEND_URL}/api/billing/config`)
      .then((r) => (r.ok ? r.json() : { enabled: false }))
      .then((d) => setBillingEnabled(!!d.enabled))
      .catch(() => setBillingEnabled(false));

    // Read the Checkout return via window.location rather than useSearchParams: under
    // `output: 'export'` useSearchParams forces a Suspense/CSR bailout for the whole route.
    const param = new URLSearchParams(window.location.search).get('checkout');
    if (param === 'cancelled') { setReturned('cancelled'); fetchQuota(); return; }

    if (param === 'success') {
      setReturned('success');
      // The webhook is normally faster than this redirect, but it is not guaranteed to be —
      // and a flat "success" over a still-free account reads as a broken payment.
      let attempts = 0;
      const poll = async () => {
        const q = await fetchQuota();
        if (q?.premium_active) { setReturned('activated'); return; }
        // Budget spent (~10s). Don't leave a permanent "activating…" — say it may take a
        // minute, because the payment itself did succeed; only our copy of it is late.
        if (++attempts < 5) setTimeout(poll, 2000); else setReturned('slow');
      };
      poll();
      return;
    }

    fetchQuota();
  }, [fetchQuota]);

  const go = async (path: string) => {
    setBusy(true);
    setError(null);
    try {
      const token = getToken();
      const r = await fetch(`${BACKEND_URL}${path}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token ?? ''}` },
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok || !data.url) { setError(tr.pricing.checkoutError); setBusy(false); return; }
      window.location.href = data.url;
    } catch {
      setError(tr.pricing.checkoutError);
      setBusy(false);
    }
  };

  const premiumActive = quota?.premium_active === true;
  const btnClass = 'w-full py-3 text-center text-sm font-medium bg-gray-900 hover:bg-gray-800 text-white rounded-xl transition-colors disabled:opacity-60';

  function PremiumCta() {
    // Billing off (no STRIPE_* env, e.g. before go-live) — keep the pre-#11 contact CTA.
    if (billingEnabled === false) {
      return (
        <a
          href="mailto:artyrbelski@gmail.com?subject=Fluent Premium&body=Привет! Хочу получить Premium-доступ."
          className={btnClass}
          data-testid="premium-cta-contact"
        >
          {tr.pricing.contactUs}
        </a>
      );
    }
    if (billingEnabled === null) return <div className={`${btnClass} opacity-40`} aria-hidden />;

    if (!loggedIn) {
      return (
        <a href={`${BACKEND_URL}/api/auth/google`} className={btnClass} data-testid="premium-cta-login">
          {tr.pricing.loginToUpgrade}
        </a>
      );
    }
    if (premiumActive && quota?.has_billing_account) {
      return (
        <button type="button" onClick={() => go('/api/billing/portal-session')} disabled={busy}
          className={btnClass} data-testid="premium-cta-manage">
          {tr.pricing.manageButton}
        </button>
      );
    }
    // Premium granted by an admin or a leaderboard reward — nothing to manage, nothing to buy.
    if (premiumActive) return null;

    return (
      <button type="button" onClick={() => go('/api/billing/checkout-session')} disabled={busy}
        className={btnClass} data-testid="premium-cta-upgrade">
        {tr.pricing.upgradeButton}
      </button>
    );
  }

  function premiumNote() {
    if (quota?.subscription_status === 'past_due') return tr.pricing.pastDue;
    if (premiumActive && quota?.premium_until) {
      return tr.pricing.renewsOn.replace(
        '{date}',
        new Date(quota.premium_until).toLocaleDateString(lang === 'ru' ? 'ru-RU' : 'en-GB'),
      );
    }
    if (billingEnabled === false) return tr.pricing.contactNote;
    return null;
  }

  return (
    <main className="bg-slate-50 text-gray-900 min-h-screen">
      <div className="pointer-events-none fixed inset-0 flex items-start justify-center overflow-hidden">
        <div className="w-full max-w-[700px] h-[500px] bg-emerald-100/40 blur-[140px] rounded-full mt-[-150px]" />
      </div>

      <div className="relative z-10 max-w-4xl mx-auto px-6 py-16">

        {/* Header */}
        <div className="text-center mb-4">
          <span className="inline-block text-xs font-semibold uppercase tracking-widest text-emerald-600/70 mb-4">{tr.pricing.badge}</span>
          <h1 className="font-headline text-4xl sm:text-5xl font-bold tracking-tight mb-4">{tr.pricing.title}</h1>
        </div>

        {/* Mission statement */}
        <div className="max-w-2xl mx-auto text-center mb-16">
          <p className="text-gray-500 text-lg leading-relaxed">{tr.pricing.mission}</p>
        </div>

        {/* Checkout return notices */}
        {returned === 'success' && (
          <div className="max-w-2xl mx-auto mb-6 bg-emerald-50 border border-emerald-200 rounded-2xl px-5 py-4 text-sm text-emerald-800"
            data-testid="checkout-activating">
            {tr.pricing.activating}
          </div>
        )}
        {returned === 'slow' && (
          <div className="max-w-2xl mx-auto mb-6 bg-emerald-50 border border-emerald-200 rounded-2xl px-5 py-4 text-sm text-emerald-800"
            data-testid="checkout-activating-slow">
            {tr.pricing.activatingSlow}
          </div>
        )}
        {returned === 'activated' && (
          <div className="max-w-2xl mx-auto mb-6 bg-emerald-50 border border-emerald-200 rounded-2xl px-5 py-4 text-sm text-emerald-800"
            data-testid="checkout-activated">
            {tr.pricing.activated}
          </div>
        )}
        {returned === 'cancelled' && (
          <div className="max-w-2xl mx-auto mb-6 flex items-start gap-3 bg-gray-50 border border-gray-200 rounded-2xl px-5 py-4 text-sm text-gray-600"
            data-testid="checkout-cancelled">
            <span className="flex-1">{tr.pricing.cancelledNote}</span>
            <button type="button" onClick={() => setReturned(null)} aria-label="×"
              className="shrink-0 text-gray-400 hover:text-gray-900 transition-colors leading-none"
              data-testid="checkout-cancelled-dismiss">
              ×
            </button>
          </div>
        )}
        {error && (
          <div className="max-w-2xl mx-auto mb-6 bg-red-50 border border-red-200 rounded-2xl px-5 py-4 text-sm text-red-700"
            data-testid="checkout-error">
            {error}
          </div>
        )}

        {/* Beta / billing notice */}
        <div className="max-w-2xl mx-auto mb-10 flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-2xl px-5 py-4">
          <span className="text-xl shrink-0">{billingEnabled ? '💳' : '🚧'}</span>
          <p className="text-sm text-amber-800 leading-relaxed" data-testid="pricing-banner">
            {billingEnabled ? tr.pricing.betaBannerPaid : tr.pricing.betaBanner}
          </p>
        </div>

        {/* Cards */}
        <div className="grid sm:grid-cols-2 gap-6 max-w-2xl mx-auto">

          {/* Free */}
          <div className="bg-white border border-gray-900 rounded-2xl p-8 flex flex-col">
            <div className="mb-6">
              <p className="text-gray-400 text-sm font-medium uppercase tracking-wide mb-2">{tr.pricing.freeLabel}</p>
              <div className="flex items-end gap-1">
                <span className="text-4xl font-bold">{tr.pricing.freePrice}</span>
                <span className="text-gray-400 mb-1">{tr.pricing.perMonth}</span>
              </div>
            </div>
            <ul className="flex flex-col gap-3 flex-1 mb-8">
              {tr.pricing.freeFeatures.map((f) => (
                <li key={f} className="flex items-start gap-2.5 text-gray-500 text-sm">
                  <CheckIcon />
                  {f}
                </li>
              ))}
            </ul>
            <Link
              href="/dashboard/lists"
              className="w-full py-3 text-center text-sm font-medium border border-gray-900 hover:bg-gray-50 rounded-xl transition-colors text-gray-500 hover:text-gray-900"
            >
              {tr.pricing.startFree}
            </Link>
            <p className="text-gray-400 text-xs text-center mt-3">{tr.pricing.freeNote}</p>
          </div>

          {/* Premium */}
          <div className="relative bg-emerald-600/10 border border-gray-900 rounded-2xl p-8 flex flex-col">
            <div className="absolute top-4 right-4 text-[10px] font-bold uppercase tracking-widest bg-emerald-100 text-emerald-600 border border-gray-900 rounded-full px-2.5 py-1">
              Premium
            </div>
            <div className="mb-6">
              <p className="text-emerald-600/70 text-sm font-medium uppercase tracking-wide mb-2">Premium</p>
              <div className="flex items-end gap-1">
                <span className="text-4xl font-bold">{tr.pricing.premiumPrice}</span>
                <span className="text-gray-400 mb-1">{tr.pricing.perMonth}</span>
              </div>
              <p className="text-gray-400 text-xs mt-2" data-testid="price-comparison">{tr.pricing.priceComparison}</p>
            </div>
            <ul className="flex flex-col gap-3 flex-1 mb-8">
              {tr.pricing.premiumFeatures.map((f) => (
                <li key={f} className="flex items-start gap-2.5 text-gray-700 text-sm">
                  <span className="text-emerald-600"><CheckIcon /></span>
                  {f}
                </li>
              ))}
            </ul>
            <PremiumCta />
            {premiumNote() && (
              <p className="text-gray-400 text-xs text-center mt-3" data-testid="premium-note">{premiumNote()}</p>
            )}
          </div>
        </div>

        {/* Why section */}
        <div className="mt-20 max-w-2xl mx-auto text-center">
          <h2 className="font-headline text-2xl font-bold mb-4">{tr.pricing.whyTitle}</h2>
          <p className="text-gray-400 leading-relaxed">{tr.pricing.whyBody}</p>
        </div>

        <div className="mt-10 text-center">
          <Link href="/dashboard/lists" className="text-gray-400 hover:text-gray-900 text-sm transition-colors">
            <TakChevron direction="left" size={10} className="inline-block align-[-1px] mr-1" />{tr.pricing.backToLists}
          </Link>
        </div>
      </div>
    </main>
  );
}
