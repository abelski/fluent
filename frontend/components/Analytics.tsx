'use client';

import Script from 'next/script';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

declare global {
  interface Window {
    gtag: (...args: unknown[]) => void;
    dataLayer: unknown[];
  }
}

const GA_ID = process.env.NEXT_PUBLIC_GA_ID;

export default function Analytics() {
  const pathname = usePathname();
  const [consented, setConsented] = useState(false);

  useEffect(() => {
    if (localStorage.getItem('cookie_consent') === 'accepted') {
      setConsented(true);
    }
    function onConsent(e: Event) {
      if ((e as CustomEvent).detail === 'accepted') setConsented(true);
    }
    window.addEventListener('cookieConsent', onConsent);
    return () => window.removeEventListener('cookieConsent', onConsent);
  }, []);

  // Track page views on route changes (initial view handled by gtag config below)
  useEffect(() => {
    if (consented && typeof window.gtag === 'function') {
      window.gtag('event', 'page_view', { page_path: pathname });
    }
  }, [pathname, consented]);

  if (!GA_ID || !consented) return null;

  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
        strategy="afterInteractive"
      />
      <Script id="ga-init" strategy="afterInteractive">{`
        window.dataLayer = window.dataLayer || [];
        function gtag(){dataLayer.push(arguments);}
        gtag('js', new Date());
        gtag('config', '${GA_ID}');
      `}</Script>
    </>
  );
}
