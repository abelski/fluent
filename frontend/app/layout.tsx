import { Inter } from 'next/font/google';
import './globals.css';
import Header from '../components/Header';
import Footer from '../components/Footer';
import MistakeButton from '../components/MistakeButton';
import CookieConsent from '../components/CookieConsent';
import LangSync from '../components/LangSync';

const inter = Inter({ subsets: ['latin', 'cyrillic'] });

export const metadata = {
  title: 'Fluent — Learn Lithuanian',
  description: 'The fun way to master Lithuanian',
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
        <Header />
        <div className="flex-1">{children}</div>
        <Footer />
        <MistakeButton />
        <CookieConsent />
      </body>
    </html>
  );
}
