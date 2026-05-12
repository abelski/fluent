'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { BACKEND_URL, getToken } from '../lib/api';
import { useT } from '../lib/useT';
import Leaderboard from '../components/Leaderboard';

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

function localIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function ActivityCalendar({ dates }: { dates: string[] }) {
  const { tr } = useT();
  const activeSet = new Set(dates);
  const today = new Date();
  const todayStr = localIso(today);

  const year = today.getFullYear();
  const month = today.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDow = new Date(year, month, 1).getDay(); // 0=Sun
  const leadingEmpty = firstDow === 0 ? 6 : firstDow - 1; // Mon-first offset

  const cells: { dayNum: number | null; dateStr: string | null }[] = [];
  for (let i = 0; i < leadingEmpty; i++) cells.push({ dayNum: null, dateStr: null });
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ dayNum: d, dateStr: localIso(new Date(year, month, d)) });
  }

  return (
    <div className="streak-calendar">
      <div className="grid grid-cols-7 mb-2">
        {tr.stats.calendarDayLabels.map((l) => (
          <div key={l} className="text-center text-xs font-semibold text-gray-400 pb-1">{l}</div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((cell, i) => {
          if (!cell.dateStr) return <div key={`e${i}`} className="h-10" />;
          const isActive = activeSet.has(cell.dateStr) && cell.dateStr <= todayStr;
          const isToday = cell.dateStr === todayStr;
          const isFuture = cell.dateStr > todayStr;
          return (
            <div key={cell.dateStr} className="flex flex-col items-center mb-1">
              <div
                title={cell.dateStr}
                className={[
                  'w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold select-none',
                  isActive ? 'ring-2 ring-emerald-500 text-emerald-600 bg-white' : 'bg-gray-100 text-gray-500',
                  isFuture ? 'opacity-40' : '',
                ].join(' ')}
              >
                {cell.dayNum}
              </div>
              <div className={['w-1.5 h-1.5 rounded-full mt-0.5', isToday ? 'bg-orange-500' : 'invisible'].join(' ')} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function LandingClient() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [activityDates, setActivityDates] = useState<string[]>([]);
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
    fetch(`${BACKEND_URL}/api/me/activity-calendar`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => { if (!r.ok) return null; return r.json(); })
      .then((data) => { if (data?.dates) setActivityDates(data.dates); })
      .catch(() => {});
  }, []);

  if (loggedIn === null) return null; // waiting for auth check — show nothing to avoid flash
  return loggedIn ? <UserHome stats={stats} activityDates={activityDates} /> : <GuestLanding />;
}

function UserHome({ stats, activityDates }: { stats: Stats | null; activityDates: string[] }) {
  const { tr, plural } = useT();
  const t = tr.landing;

  const streak = stats?.streak ?? 0;
  const streakNext = nextStreakMilestone(streak);
  const streakPct = streakMilestoneProgress(streak);


  return (
    <main className="bg-[#F5F5F7] min-h-screen">
      <div className="max-w-2xl mx-auto px-4 py-10">
        {/* Streak card */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden mb-4">
          <div className="flex">
            {/* Left: month calendar */}
            <div className="flex-1 p-5 border-r border-gray-100 min-w-0">
              <p className="text-xl font-bold text-gray-900 mb-4">
                {streak > 0 ? `${streak} ${plural(streak, tr.stats.streakDay)}!` : tr.stats.calendarStartStreak}
              </p>
              <p className="text-xs font-semibold text-gray-400 mb-3 uppercase tracking-wide">
                {tr.stats.calendarMonthNames[new Date().getMonth()]} {new Date().getFullYear()}
              </p>
              <ActivityCalendar dates={activityDates} />
            </div>
            {/* Right: streak counter + flame */}
            <div className="w-36 shrink-0 flex flex-col items-center justify-center gap-4 p-4">
              <div className="text-center">
                <p className="text-5xl font-extrabold text-gray-900 leading-none">{streak}</p>
                <p className="text-xs text-gray-500 mt-1">{plural(streak, tr.stats.streakDay)}</p>
              </div>
              {/* Circular progress ring around flame */}
              <div className="relative w-20 h-20 flex items-center justify-center">
                <svg className="absolute inset-0 w-full h-full" viewBox="0 0 80 80">
                  <circle cx="40" cy="40" r="34" fill="none" stroke="#f3f4f6" strokeWidth="5" />
                  {streakPct > 0 && (
                    <circle
                      cx="40" cy="40" r="34"
                      fill="none" stroke="#f97316" strokeWidth="5"
                      strokeLinecap="round"
                      strokeDasharray={`${2 * Math.PI * 34}`}
                      strokeDashoffset={`${2 * Math.PI * 34 * (1 - streakPct / 100)}`}
                      transform="rotate(-90 40 40)"
                    />
                  )}
                </svg>
                <span className="text-3xl relative z-10">🔥</span>
              </div>
              {streakNext && (
                <p className="text-[11px] text-center text-gray-400 leading-tight">
                  {tr.stats.calendarNextGoal}<br /><span className="font-bold text-orange-500">{streakNext}</span>
                </p>
              )}
            </div>
          </div>
        </div>

        <Leaderboard />

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
