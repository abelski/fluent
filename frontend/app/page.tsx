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

export default function RootPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null); // null = loading

  useEffect(() => {
    const token = getToken();
    if (!token) {
      setLoggedIn(false);
      return;
    }
    fetch(`${BACKEND_URL}/api/me/stats`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => {
        if (!r.ok) { setLoggedIn(false); return null; }
        return r.json();
      })
      .then((data) => {
        if (data) { setStats(data); setLoggedIn(true); }
      })
      .catch(() => setLoggedIn(false));
  }, []);

  if (loggedIn === null) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!loggedIn) {
    return <GuestLanding />;
  }

  return <UserHome stats={stats} />;
}

function UserHome({ stats }: { stats: Stats | null }) {
  const { tr } = useT();
  const t = tr.landing;

  const cards = [
    {
      label: t.cardWordsLabel,
      value: stats?.known ?? '—',
      sub: stats ? t.cardWordsInProgress.replace('{n}', String(stats.learning)) : '',
      color: 'bg-emerald-50 border-emerald-200',
      icon: '📚',
      href: '/dashboard/vocabulary',
    },
    {
      label: t.cardGrammarLabel,
      value: stats?.grammar_lessons_passed ?? '—',
      sub: t.cardGrammarSub,
      color: 'bg-blue-50 border-blue-200',
      icon: '✏️',
      href: '/dashboard/grammar',
    },
    {
      label: t.cardTestsLabel,
      value: stats?.practice_exams_completed ?? '—',
      sub: t.cardTestsSub,
      color: 'bg-purple-50 border-purple-200',
      icon: '🎯',
      href: '/dashboard/practice',
    },
    {
      label: t.cardStreakLabel,
      value: stats ? `${stats.streak} дн.` : '—',
      sub: t.cardStreakSub,
      color: 'bg-amber-50 border-amber-200',
      icon: '🔥',
      href: '/dashboard/lists',
    },
  ];

  return (
    <main className="bg-slate-50 text-gray-900 min-h-screen">
      <div className="pointer-events-none fixed inset-0 flex items-start justify-center overflow-hidden">
        <div className="w-full max-w-[600px] h-[400px] bg-emerald-100/40 blur-[120px] rounded-full mt-[-100px]" />
      </div>

      <div className="relative z-10 max-w-3xl mx-auto px-6 py-12">
        <h1 className="text-3xl font-bold mb-1">{t.progressTitle}</h1>
        <p className="text-gray-400 mb-8 text-sm">{t.progressSubtitle}</p>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-10">
          {cards.map((c) => (
            <Link
              key={c.label}
              href={c.href}
              className={`rounded-2xl border p-4 flex flex-col gap-2 hover:shadow-md transition-shadow ${c.color}`}
            >
              <span className="text-2xl">{c.icon}</span>
              <span className="text-2xl font-bold text-gray-900">{c.value}</span>
              <div>
                <p className="text-sm font-medium text-gray-700">{c.label}</p>
                {c.sub && <p className="text-xs text-gray-400">{c.sub}</p>}
              </div>
            </Link>
          ))}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-8">
          <Link href="/dashboard/lists" className="flex items-center gap-3 bg-white border border-gray-200 rounded-2xl px-5 py-4 hover:border-gray-900 transition-colors">
            <span className="text-xl">🗂️</span>
            <div>
              <p className="font-semibold text-sm">{t.quickDictionaries}</p>
              <p className="text-xs text-gray-400">{t.quickDictionariesSub}</p>
            </div>
          </Link>
          <Link href="/dashboard/review" className="flex items-center gap-3 bg-white border border-gray-200 rounded-2xl px-5 py-4 hover:border-gray-900 transition-colors">
            <span className="text-xl">🔄</span>
            <div>
              <p className="font-semibold text-sm">{t.quickReview}</p>
              <p className="text-xs text-gray-400">{t.quickReviewSub}</p>
            </div>
          </Link>
        </div>

        <p className="text-sm text-gray-400 italic mb-6">{t.toolsTagline}</p>

        <div className="bg-white border border-gray-200 rounded-2xl px-6 py-5">
          <p className="font-semibold text-sm mb-1">{t.premiumTitle}</p>
          <p className="text-xs text-gray-500 mb-3">{t.premiumBody}</p>
          <Link href="/pricing" className="text-xs font-medium text-emerald-700 hover:text-emerald-900 transition-colors">
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

  return (
    <main className="bg-slate-50 text-gray-900 min-h-screen">
      <div className="pointer-events-none fixed inset-0 flex items-start justify-center overflow-hidden">
        <div className="w-full max-w-[700px] h-[500px] bg-emerald-100/50 blur-[140px] rounded-full mt-[-120px]" />
      </div>

      <div className="relative z-10 max-w-2xl mx-auto px-6 py-20 flex flex-col items-center text-center">
        <h1 className="text-5xl font-bold mb-4 tracking-tight">{t.guestHeading}</h1>
        <p className="text-gray-500 text-lg mb-10 max-w-md">
          {t.guestSubtitle}
        </p>

        <Link
          href="/login"
          className="px-8 py-3 bg-gray-900 text-white rounded-xl font-semibold text-base hover:bg-gray-700 transition-colors mb-12"
        >
          {t.guestCta}
        </Link>

        <div className="grid grid-cols-3 gap-6 w-full max-w-lg mb-10">
          {[
            { icon: '📚', title: t.featureDictionaries, desc: t.featureDictionariesDesc },
            { icon: '✏️', title: t.featureGrammar, desc: t.featureGrammarDesc },
            { icon: '🎯', title: t.featureTests, desc: t.featureTestsDesc },
          ].map((f) => (
            <div key={f.title} className="bg-white border border-gray-200 rounded-2xl p-5 flex flex-col gap-2">
              <span className="text-3xl">{f.icon}</span>
              <p className="font-semibold text-sm">{f.title}</p>
              <p className="text-xs text-gray-400">{f.desc}</p>
            </div>
          ))}
        </div>

        <div className="bg-white border border-gray-200 rounded-2xl px-6 py-5 w-full max-w-lg text-left">
          <p className="font-semibold text-sm mb-1">{t.premiumTitle}</p>
          <p className="text-xs text-gray-500 mb-3">{t.premiumBody}</p>
          <Link href="/pricing" className="text-xs font-medium text-emerald-700 hover:text-emerald-900 transition-colors">
            {t.premiumCta}
          </Link>
        </div>
      </div>
    </main>
  );
}
