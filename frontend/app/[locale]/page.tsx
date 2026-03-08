import { useTranslations } from 'next-intl';
import Link from 'next/link';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';

export default function LandingPage({ params: { locale } }: { params: { locale: string } }) {
  const t = useTranslations('landing');

  return (
    <main className="relative min-h-screen bg-[#07070f] flex flex-col overflow-hidden">
      {/* Background glow */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div className="w-[700px] h-[500px] bg-violet-700/20 blur-[120px] rounded-full" />
      </div>

      {/* Nav */}
      <nav className="relative z-10 flex justify-between items-center px-8 py-6">
        <span className="text-white font-bold text-2xl tracking-tight">
          fluent<span className="text-violet-400">.</span>
        </span>
        <div className="flex gap-2">
          <Link
            href="/en"
            className={`text-sm px-4 py-1.5 rounded-full font-medium transition-all ${
              locale === 'en'
                ? 'bg-white/15 text-white'
                : 'text-white/40 hover:text-white hover:bg-white/10'
            }`}
          >
            EN
          </Link>
          <Link
            href="/ru"
            className={`text-sm px-4 py-1.5 rounded-full font-medium transition-all ${
              locale === 'ru'
                ? 'bg-white/15 text-white'
                : 'text-white/40 hover:text-white hover:bg-white/10'
            }`}
          >
            RU
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-4 text-center">
        {/* Badge */}
        <div className="mb-6 inline-flex items-center gap-2 bg-violet-500/15 border border-violet-500/25 rounded-full px-4 py-2">
          <span className="text-lg">🇱🇹</span>
          <span className="text-violet-300 text-sm font-medium">{t('badge')}</span>
        </div>

        {/* Headline */}
        <h1 className="text-5xl md:text-7xl font-extrabold text-white mb-5 leading-tight tracking-tight">
          {t('headline')}
        </h1>

        {/* Subheadline */}
        <p className="text-white/50 text-lg md:text-xl max-w-lg mb-10 leading-relaxed">
          {t('subheadline')}
        </p>

        {/* Google login button */}
        <a
          href={`${BACKEND_URL}/api/auth/google`}
          className="group flex items-center gap-3 bg-white text-gray-800 font-semibold px-8 py-4 rounded-2xl text-lg hover:bg-gray-50 active:scale-95 transition-all duration-150 shadow-2xl shadow-violet-500/20"
        >
          <GoogleIcon />
          {t('cta')}
        </a>

        {/* Tagline */}
        <p className="mt-5 text-white/25 text-sm">{t('tagline')}</p>
      </div>

      {/* Bottom fade */}
      <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-[#07070f] to-transparent" />
    </main>
  );
}

function GoogleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}
