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


function FolderIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <path d="M3 8a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
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

function RefreshIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <path d="M4 12a8 8 0 1 0 8-8H9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4 6v6h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
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

interface CefrLevel { level: string; threshold: number; }

const CEFR_LEVELS_DEFAULT: CefrLevel[] = [
  { level: '0',  threshold: 0 },
  { level: 'A1', threshold: 500 },
  { level: 'A2', threshold: 1000 },
  { level: 'B1', threshold: 2000 },
  { level: 'B2', threshold: 4000 },
  { level: 'C1', threshold: 8000 },
  { level: 'C2', threshold: 16000 },
];

export default function LandingClient() {
  const [stats, setStats] = useState<Stats | null>(null);
  // null = still determining auth state (token exists, waiting for API)
  // true = confirmed logged in, false = confirmed guest
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null);
  const [cefrLevels, setCefrLevels] = useState<CefrLevel[]>(CEFR_LEVELS_DEFAULT);

  useEffect(() => {
    // Fetch CEFR thresholds (public endpoint, no auth needed)
    fetch(`${BACKEND_URL}/api/admin/settings/cefr-thresholds`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { if (Array.isArray(data) && data.length) setCefrLevels(data); })
      .catch(() => {});

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
  return loggedIn ? <UserHome stats={stats} cefrLevels={cefrLevels} /> : <GuestLanding />;
}

function getCefrLevel(known: number, levels: CefrLevel[]): { level: string; prev: number; next: number; nextLevel: string } {
  // levels[i].threshold = words needed to reach levels[i].level
  // left badge = levels[i-1].level (where you came from)
  // right badge = levels[i].level (where you're going)
  for (let i = 1; i < levels.length; i++) {
    if (known < levels[i].threshold) {
      return {
        level: levels[i - 1].level,
        prev: levels[i - 1].threshold,
        next: levels[i].threshold,
        nextLevel: levels[i].level,
      };
    }
  }
  // User has reached or exceeded the final level
  const last = levels[levels.length - 1];
  const secondLast = levels[levels.length - 2];
  return { level: secondLast.level, prev: secondLast.threshold, next: last.threshold, nextLevel: last.level };
}

function StatsGauge({ stats, t, cefrLevels }: {
  stats: Stats | null;
  t: { cardWordsLabel: string; cardGrammarLabel: string; cardTestsLabel: string; cardStreakLabel: string };
  cefrLevels: CefrLevel[];
}) {
  const known = stats?.known ?? 0;
  const { level, prev, next, nextLevel } = getCefrLevel(known, cefrLevels);
  const ratio = Math.min((known - prev) / (next - prev), 1);

  // Speedometer arc: 240° CW from 150° (8 o'clock) to 30° (4 o'clock), gap at bottom
  // SVG coords: angle θ → (cx + R·cos θ, cy + R·sin θ), sweep-flag=1 = CW on screen
  const R = 72, cx = 100, cy = 90;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const sx = +(cx + R * Math.cos(toRad(150))).toFixed(1); // 37.6
  const sy = +(cy + R * Math.sin(toRad(150))).toFixed(1); // 126
  const ex = +(cx + R * Math.cos(toRad(30))).toFixed(1);  // 162.4
  const ey = +(cy + R * Math.sin(toRad(30))).toFixed(1);  // 126
  const arcLen = +(R * toRad(240)).toFixed(2); // ≈ 301.6
  // large-arc-flag=1 (240° > 180°), sweep-flag=1 (CW)
  const arcPath = `M ${sx},${sy} A ${R},${R} 0 1,1 ${ex},${ey}`;

  const miniStats = [
    {
      value: stats?.grammar_lessons_passed ?? 0,
      label: t.cardGrammarLabel,
      href: '/dashboard/grammar',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path d="M4 4h9a3 3 0 0 1 3 3v11a3 3 0 0 1-3 3H4V4z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
          <path d="M8 9h5M8 12h3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      ),
    },
    {
      value: stats?.practice_exams_completed ?? 0,
      label: t.cardTestsLabel,
      href: '/dashboard/practice',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
          <rect x="8" y="2" width="8" height="4" rx="1" stroke="currentColor" strokeWidth="1.5"/>
          <path d="M8 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2h-2" stroke="currentColor" strokeWidth="1.5"/>
          <path d="M9 12l2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      ),
    },
    {
      value: stats?.streak ?? 0,
      label: t.cardStreakLabel,
      href: '/dashboard/lists',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path d="M12 2c0 0-1 3.5 1 6 0 0-1-1-3-1 0 0 1 3 0 5s-1 4 3 6c0 0-1-2 0-3 0 0 1 2 3 2s4-2 4-5-3-5-3-5 1 2 0 4c0 0-2-4-2-6s-1-3-3-3z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
        </svg>
      ),
    },
  ];

  return (
    <div className="bg-white rounded-2xl p-5 mb-3 border border-gray-100">
      <Link href="/dashboard/vocabulary" className="block">
        <div className="relative">
          <svg viewBox="0 0 200 136" className="w-full max-w-[280px] mx-auto block">
            {/* background track */}
            <path d={arcPath} stroke="#e5e7eb" strokeWidth="14" fill="none" strokeLinecap="round" />
            {/* progress fill */}
            <path
              d={arcPath}
              stroke="#10b981"
              strokeWidth="14"
              fill="none"
              strokeLinecap="round"
              strokeDasharray={arcLen}
              strokeDashoffset={arcLen * (1 - ratio)}
            />
            {/* center: word count */}
            <text x="100" y="82" textAnchor="middle" fontSize="38" fontWeight="700" fill="#111827">{known}</text>
            <text x="100" y="100" textAnchor="middle" fontSize="12" fill="#9ca3af">{t.cardWordsLabel}</text>
            {level !== nextLevel && (
              <text x="100" y="116" textAnchor="middle" fontSize="10" fill="#10b981">{next - known} до {nextLevel}</text>
            )}
          </svg>
          {/* level badges pinned to arc endpoints */}
          <div className="flex justify-between items-center px-1 -mt-1 max-w-[280px] mx-auto">
            <span className="bg-emerald-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-md">{level}</span>
            {level !== nextLevel && (
              <span className="bg-emerald-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-md">{nextLevel}</span>
            )}
          </div>
        </div>
      </Link>
      <div className="grid grid-cols-3 divide-x divide-gray-100 border-t border-gray-100 pt-3 mt-1">
        {miniStats.map((s) => (
          <Link key={s.label} href={s.href} className="flex flex-col items-center gap-1 px-2 py-2 hover:bg-gray-50 rounded-xl transition-colors">
            <span className="text-gray-400">{s.icon}</span>
            <p className="text-lg font-bold text-gray-900 leading-none">{s.value}</p>
            <p className="text-[10px] text-gray-400 leading-tight text-center">{s.label}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}

function UserHome({ stats, cefrLevels }: { stats: Stats | null; cefrLevels: CefrLevel[] }) {
  const { tr } = useT();
  const t = tr.landing;

  return (
    <main className="bg-[#F5F5F7] min-h-screen">
      <div className="max-w-2xl mx-auto px-4 py-10">
        <h1 className="font-headline text-2xl font-bold mb-1">{t.progressTitle}</h1>
        <p className="text-gray-500 text-sm mb-6">{t.progressSubtitle}</p>

        <StatsGauge stats={stats} t={t} cefrLevels={cefrLevels} />

        <div className="grid grid-cols-2 gap-3 mb-3">
          <Link href="/dashboard/lists" className="bg-white rounded-2xl px-4 py-3 flex items-center gap-3 hover:shadow-md transition-all active:scale-[0.98]">
            <div className="w-8 h-8 rounded-xl bg-gray-100 flex items-center justify-center text-gray-500 shrink-0"><FolderIcon /></div>
            <div className="min-w-0">
              <p className="font-semibold text-sm leading-tight truncate">{t.quickDictionaries}</p>
              <p className="text-xs text-gray-400 truncate">{t.quickDictionariesSub}</p>
            </div>
          </Link>
          <Link href="/dashboard/review" className="bg-white rounded-2xl px-4 py-3 flex items-center gap-3 hover:shadow-md transition-all active:scale-[0.98]">
            <div className="w-8 h-8 rounded-xl bg-gray-100 flex items-center justify-center text-gray-500 shrink-0"><RefreshIcon /></div>
            <div className="min-w-0">
              <p className="font-semibold text-sm leading-tight truncate">{t.quickReview}</p>
              <p className="text-xs text-gray-400 truncate">{t.quickReviewSub}</p>
            </div>
          </Link>
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
