import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import Header from '../components/Header';
import Footer from '../components/Footer';
import MistakeButton from '../components/MistakeButton';
import CookieConsent from '../components/CookieConsent';
import LangSync from '../components/LangSync';
import Analytics from '../components/Analytics';
import BetaBanner from '../components/BetaBanner';

const inter = Inter({ subsets: ['latin', 'cyrillic'] });

export const metadata: Metadata = {
  title: {
    default: 'Fluent — Learn Lithuanian',
    template: '%s | Fluent',
  },
  description: 'Learn Lithuanian vocabulary and grammar with spaced repetition, declension exercises, and reading articles. Free to start.',
  icons: { icon: '/favicon.svg' },
  metadataBase: new URL('https://fluent.lt'),
  verification: {
    google: '-00UmFLXQcYnWqG0atvHSxdW2m5P6s0oHsfw7gZPtgQ',
  },
  openGraph: {
    siteName: 'Fluent',
    locale: 'en_US',
    type: 'website',
  },
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <body className={`${inter.className} bg-slate-50 text-gray-900 min-h-screen flex flex-col`}>
        <LangSync />
        <BetaBanner />
        <Header />
        <div className="flex-1">{children}</div>
        <Footer />
        <MistakeButton />
        <CookieConsent />
        <Analytics />
      </body>
    </html>
  );
}
