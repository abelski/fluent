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


function PlayIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <path d="M6 4l14 8-14 8V4z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}


interface NewsItem {
  id: number;
  title_ru: string;
  title_en: string;
  body_ru: string;
  body_en: string;
  published_at: string;
}

function NewsSection({ inline = false }: { inline?: boolean }) {
  const { tr, lang } = useT();
  const t = tr.news;
  const [posts, setPosts] = useState<NewsItem[]>([]);
  const [showAll, setShowAll] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());

  useEffect(() => {
    fetch(`${BACKEND_URL}/api/news?limit=20`)
      .then((r) => { if (!r.ok) return null; return r.json(); })
      .then((data) => { if (Array.isArray(data)) setPosts(data); })
      .catch(() => {});
  }, []);

  if (posts.length === 0) return null;

  const INITIAL = 3;
  const visible = showAll ? posts : posts.slice(0, INITIAL);
  const hasMore = posts.length > INITIAL;

  const content = (
    <>
      <h2 className="font-headline text-xl font-bold text-gray-900 mb-4">{t.sectionTitle}</h2>
      <div className="flex flex-col gap-3">
        {visible.map((post) => {
          const title = lang === 'ru' ? post.title_ru : post.title_en;
          const body = lang === 'ru' ? post.body_ru : post.body_en;
          const isLong = body.length > 120;
          const expanded = expandedIds.has(post.id);
          const displayBody = isLong && !expanded ? body.slice(0, 120).trimEnd() + '…' : body;
          const date = new Date(post.published_at).toLocaleDateString(lang === 'ru' ? 'ru-RU' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
          return (
            <div key={post.id} className="bg-white rounded-2xl p-5">
              <p className="font-semibold text-sm text-gray-900 mb-1">{title}</p>
              {displayBody && <p className="text-xs text-gray-500 leading-relaxed mb-2">{displayBody}</p>}
              {isLong && (
                <button
                  onClick={() => setExpandedIds((prev) => {
                    const next = new Set(prev);
                    expanded ? next.delete(post.id) : next.add(post.id);
                    return next;
                  })}
                  className="text-xs text-emerald-600 hover:text-emerald-700 font-medium mb-2"
                >
                  {expanded ? (lang === 'ru' ? 'Свернуть' : 'Show less') : (lang === 'ru' ? 'Читать далее' : 'Read more')}
                </button>
              )}
              <p className="text-xs text-gray-400">{date}</p>
            </div>
          );
        })}
      </div>
      {hasMore && (
        <button
          onClick={() => setShowAll((v) => !v)}
          className="mt-4 text-sm font-semibold text-emerald-600 hover:text-emerald-700 transition-colors"
        >
          {showAll ? t.showLess : `${t.showMore} (${posts.length - INITIAL})`}
        </button>
      )}
    </>
  );

  if (inline) {
    return <div className="mt-2 mb-3">{content}</div>;
  }

  return (
    <section className="bg-[#F5F5F7] px-5 py-12 sm:py-16">
      <div className="max-w-xl mx-auto">{content}</div>
    </section>
  );
}

// ── Streak card helpers ───────────────────────────────────────────────────────

const STREAK_MILESTONES = [3, 7, 14, 30, 60, 100];

function nextStreakMilestone(value: number): number | null {
  return STREAK_MILESTONES.find((m) => m > value) ?? null;
}

function streakMilestoneProgress(value: number): number {
  const next = nextStreakMilestone(value);
  if (!next) return 100;
  const prev = [...STREAK_MILESTONES].reverse().find((m) => m <= value) ?? 0;
  return Math.round(((value - prev) / (next - prev)) * 100);
}

export default function LandingClient() {
  const [stats, setStats] = useState<Stats | null>(null);
  // null = still determining auth state (token exists, waiting for API)
  // true = confirmed logged in, false = confirmed guest
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null);

  useEffect(() => {
    const token = getToken();
    if (!token) { setLoggedIn(false); return; }
    fetch(`${BACKEND_URL}/api/me/stats`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => { if (!r.ok) return null; return r.json(); })
      .then((data) => {
        if (data) { setStats(data); setLoggedIn(true); }
        else { setLoggedIn(false); }
      })
      .catch(() => { setLoggedIn(false); });
  }, []);

  if (loggedIn === null) return null; // waiting for auth check — show nothing to avoid flash
  return loggedIn ? <UserHome stats={stats} /> : <GuestLanding />;
}

function UserHome({ stats }: { stats: Stats | null }) {
  const { tr, plural } = useT();
  const t = tr.landing;

  const streak = stats?.streak ?? 0;
  const known = stats?.known ?? 0;
  const streakNext = nextStreakMilestone(streak);
  const streakPct = streakMilestoneProgress(streak);

  function motivation(): string {
    const m = tr.stats.motivations;
    if (streak >= 30) return m.streak30;
    if (streak >= 14) return m.streak14;
    if (streak >= 7) return m.streak7;
    if (streak >= 3) return m.streak3;
    if (streak === 2) return m.streak2;
    if (known >= 100) return m.known100;
    if (known >= 50) return m.known50;
    if (known > 0) return m.knownSome;
    return m.none;
  }

  return (
    <main className="bg-[#F5F5F7] min-h-screen">
      <div className="max-w-2xl mx-auto px-4 py-10">
        {/* Streak card */}
        <div className="relative rounded-2xl bg-gradient-to-br from-orange-50 to-white border border-orange-100 shadow-sm overflow-hidden p-5 mb-4">
          <div className="absolute top-0 right-0 w-24 h-24 bg-orange-100/40 rounded-full -translate-y-8 translate-x-8 pointer-events-none" />
          <div className="flex items-start justify-between gap-3 relative">
            <div className="flex items-center gap-3">
              <div className="flex-shrink-0 w-11 h-11 rounded-xl bg-orange-100 flex items-center justify-center text-xl">
                🔥
              </div>
              <div>
                <p className="text-3xl font-extrabold text-gray-900 leading-none tracking-tight">{streak}</p>
                <p className="text-gray-500 text-xs mt-1 font-medium">{plural(streak, tr.stats.streakDay)}</p>
              </div>
            </div>
            {streakNext && streak > 0 && (
              <div className="text-right flex-shrink-0">
                <p className="text-[10px] text-orange-600 font-semibold uppercase tracking-wide">Next</p>
                <p className="text-sm font-bold text-orange-700">{streakNext}</p>
              </div>
            )}
          </div>
          {streak > 0 && (
            <div className="mt-4">
              <div className="h-1.5 bg-orange-100 rounded-full overflow-hidden">
                <div className="h-full bg-orange-500 rounded-full transition-all duration-700" style={{ width: `${streakPct}%` }} />
              </div>
              {streakNext && (
                <p className="text-[10px] text-gray-400 mt-1">{streak} / {streakNext} до следующей цели</p>
              )}
            </div>
          )}
          <p className="mt-3 text-sm text-orange-700 font-medium">{motivation()}</p>
        </div>

        {(() => {
          const hasStudied = (stats?.total_studied ?? 0) > 0;
          return (
            <Link
              href={hasStudied ? '/dashboard/review' : '/dashboard/lists'}
              className="bg-emerald-600 rounded-2xl p-4 flex items-center gap-3 hover:bg-emerald-700 transition-colors active:scale-[0.98] mb-4"
            >
              <div className="w-9 h-9 rounded-xl bg-emerald-500 flex items-center justify-center text-white shrink-0">
                <PlayIcon />
              </div>
              <div>
                <p className="font-semibold text-sm text-white leading-tight">
                  {hasStudied ? t.continueCta : t.continueCtaNew}
                </p>
                <p className="text-xs text-emerald-200">
                  {hasStudied ? t.continueCtaSub : t.continueCtaNewSub}
                </p>
              </div>
            </Link>
          );
        })()}

        <NewsSection inline />

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

      <NewsSection />
    </main>
  );
}
