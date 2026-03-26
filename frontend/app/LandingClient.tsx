'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { BACKEND_URL, getToken } from '../lib/api';
import { useT } from '../lib/useT';

interface Stats {
  known: number;
  learning: number;
  total_studied: number;
  streak: number;
  mistakes: number;
  grammar_lessons_passed: number;
  practice_exams_completed: number;
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" className="shrink-0">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  );
}

function BookIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <path d="M4 4h9a3 3 0 0 1 3 3v11a3 3 0 0 1-3 3H4V4z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M16 18a3 3 0 0 0 3-3V7a3 3 0 0 0-3-3" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8 9h5M8 12h3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function PencilIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <path d="M16.862 4.487a2.121 2.121 0 0 1 3 3L8 19.35l-4 1 1-4 11.862-11.863z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function TargetIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="12" cy="12" r="1" fill="currentColor" />
    </svg>
  );
}

function BookmarkIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <path d="M5 4a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v17l-7-3.5L5 21V4z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

function FlameIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <path d="M12 21c-4-1-7-4.5-7-8.5 0-2.5 1.5-4.5 3-5.5.5 1.5 1 2.5 2 3C10 8 10.5 6 10.5 4c2 1.5 4.5 4 4.5 8 .75-.75 1-2 1-3 1.5 1.5 2 3.5 2 4.5 0 2.5-2.5 6-6 8z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function FolderIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <path d="M3 8a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

function RefreshIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <path d="M4 12a8 8 0 1 0 8-8H9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4 6v6h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function LandingClient() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loggedIn, setLoggedIn] = useState(false);

  useEffect(() => {
    const token = getToken();
    if (!token) return;
    fetch(`${BACKEND_URL}/api/me/stats`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => { if (!r.ok) return null; return r.json(); })
      .then((data) => { if (data) { setStats(data); setLoggedIn(true); } })
      .catch(() => {});
  }, []);

  return loggedIn ? <UserHome stats={stats} /> : <GuestLanding />;
}

function UserHome({ stats }: { stats: Stats | null }) {
  const { tr } = useT();
  const t = tr.landing;

  const cards = [
    { label: t.cardWordsLabel, value: stats?.known ?? '—', sub: stats ? t.cardWordsInProgress.replace('{n}', String(stats.learning)) : '', icon: <BookmarkIcon />, color: 'text-emerald-600', bg: 'bg-emerald-50', href: '/dashboard/vocabulary' },
    { label: t.cardGrammarLabel, value: stats?.grammar_lessons_passed ?? '—', sub: t.cardGrammarSub, icon: <PencilIcon />, color: 'text-blue-600', bg: 'bg-blue-50', href: '/dashboard/grammar' },
    { label: t.cardTestsLabel, value: stats?.practice_exams_completed ?? '—', sub: t.cardTestsSub, icon: <TargetIcon />, color: 'text-purple-600', bg: 'bg-purple-50', href: '/dashboard/practice' },
    { label: t.cardStreakLabel, value: stats ? `${stats.streak} дн.` : '—', sub: t.cardStreakSub, icon: <FlameIcon />, color: 'text-amber-600', bg: 'bg-amber-50', href: '/dashboard/lists' },
  ];

  return (
    <main className="bg-[#F5F5F7] min-h-screen">
      <div className="max-w-2xl mx-auto px-4 py-10">
        <h1 className="font-headline text-2xl font-bold mb-1">{t.progressTitle}</h1>
        <p className="text-gray-500 text-sm mb-6">{t.progressSubtitle}</p>

        <div className="grid grid-cols-2 gap-3 mb-4">
          {cards.map((c) => (
            <Link key={c.label} href={c.href}
              className="bg-white rounded-2xl p-4 flex flex-col gap-3 hover:shadow-md transition-all active:scale-[0.98]"
            >
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${c.bg} ${c.color}`}>
                {c.icon}
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900 leading-none mb-1">{c.value}</p>
                <p className="text-xs font-medium text-gray-700">{c.label}</p>
                {c.sub && <p className="text-xs text-gray-400 mt-0.5">{c.sub}</p>}
              </div>
            </Link>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-3 mb-4">
          <Link href="/dashboard/lists" className="bg-white rounded-2xl p-4 flex items-center gap-3 hover:shadow-md transition-all active:scale-[0.98]">
            <div className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center text-gray-500 shrink-0"><FolderIcon /></div>
            <div>
              <p className="font-semibold text-sm leading-tight">{t.quickDictionaries}</p>
              <p className="text-xs text-gray-400">{t.quickDictionariesSub}</p>
            </div>
          </Link>
          <Link href="/dashboard/review" className="bg-white rounded-2xl p-4 flex items-center gap-3 hover:shadow-md transition-all active:scale-[0.98]">
            <div className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center text-gray-500 shrink-0"><RefreshIcon /></div>
            <div>
              <p className="font-semibold text-sm leading-tight">{t.quickReview}</p>
              <p className="text-xs text-gray-400">{t.quickReviewSub}</p>
            </div>
          </Link>
        </div>

        <div className="bg-white rounded-2xl p-5 flex items-center justify-between gap-4">
          <div>
            <p className="font-semibold text-sm mb-0.5">{t.premiumTitle}</p>
            <p className="text-xs text-gray-500 leading-relaxed">{t.premiumBody}</p>
          </div>
          <Link href="/pricing" className="shrink-0 text-xs font-semibold text-emerald-600 hover:text-emerald-700 transition-colors whitespace-nowrap">
            {t.premiumCta}
          </Link>
        </div>
      </div>
    </main>
  );
}

function GuestLanding() {
  const { tr } = useT();
  const t = tr.landing;

  const features = [
    { icon: <BookIcon />, title: t.featureDictionaries, desc: t.featureDictionariesDesc },
    { icon: <PencilIcon />, title: t.featureGrammar, desc: t.featureGrammarDesc },
    { icon: <TargetIcon />, title: t.featureTests, desc: t.featureTestsDesc },
  ];

  return (
    <main>
      {/* Hero */}
      <section className="bg-[#F5F5F7] px-5 pt-16 pb-12 sm:pt-24 sm:pb-20 text-center">
        <div className="max-w-xl mx-auto">
          <h1 className="font-headline text-[2.75rem] sm:text-6xl font-extrabold text-gray-900 tracking-tight leading-[1.08] mb-4">
            {t.guestHeading}
          </h1>
          <p className="text-gray-500 text-base sm:text-lg leading-relaxed mb-8 max-w-sm mx-auto">
            {t.guestSubtitle}
          </p>
          <a
            href={`${BACKEND_URL}/api/auth/google`}
            className="inline-flex items-center gap-2.5 bg-emerald-600 text-white font-semibold px-7 py-3.5 rounded-full text-base hover:bg-emerald-700 transition-colors active:scale-95 shadow-lg shadow-emerald-600/20 w-full sm:w-auto justify-center"
          >
            <GoogleIcon />
            {t.guestCta}
          </a>
          <p className="text-xs text-gray-400 mt-3">Бесплатно · Без рекламы</p>
        </div>
      </section>

      {/* Features */}
      <section className="bg-white px-5 py-12 sm:py-16">
        <div className="max-w-xl mx-auto">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {features.map((f) => (
              <div key={f.title} className="bg-[#F5F5F7] rounded-2xl p-5">
                <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-emerald-600 shadow-sm mb-4">
                  {f.icon}
                </div>
                <p className="font-semibold text-sm text-gray-900 mb-1">{f.title}</p>
                <p className="text-xs text-gray-500 leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Premium */}
      <section className="bg-white px-5 pb-12 sm:pb-16">
        <div className="max-w-xl mx-auto">
          <div className="bg-gray-900 rounded-2xl p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <p className="font-semibold text-white mb-1">{t.premiumTitle}</p>
              <p className="text-sm text-gray-400 leading-relaxed">{t.premiumBody}</p>
            </div>
            <Link href="/pricing" className="shrink-0 inline-flex items-center gap-1 text-emerald-400 font-semibold text-sm hover:text-emerald-300 transition-colors whitespace-nowrap">
              {t.premiumCta}
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
