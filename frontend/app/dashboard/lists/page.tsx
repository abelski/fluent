'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { BACKEND_URL, getToken, unenrollProgram } from '../../../lib/api';
import StatsBar from '../components/StatsBar';
import { useT } from '../../../lib/useT';
import { getStarLevel, setStarLevel } from '../../../lib/starLevel';

interface WordListSummary {
  id: number;
  title: string;
  title_en: string | null;
  description: string | null;
  description_en: string | null;
  subcategory: string | null;
  word_count: number;
  star_counts?: Record<string, number>;
}

interface SubcategoryMeta {
  cefr_level: string | null;
  difficulty: string | null;
  article_url: string | null;
  article_name_ru: string | null;
  article_name_en: string | null;
  name_ru: string | null;
  name_en: string | null;
  enrollment_count?: number;
  is_published?: boolean;
}

interface ListProgress {
  total: number;
  known: number;
  learning: number;
  new: number;
}

interface Quota {
  premium_active: boolean;
  premium_until: string | null;
  sessions_today: number;
  daily_limit: number | null;
}

export default function ListsPage() {
  const { tr, plural, lang } = useT();
  const router = useRouter();
  const [starLevel, setStarLevelState] = useState<number>(1);
  const [lists, setLists] = useState<WordListSummary[]>([]);
  const [enrolledKeys, setEnrolledKeys] = useState<Set<string>>(new Set());
  const [subcategoryMeta, setSubcategoryMeta] = useState<Record<string, SubcategoryMeta>>({});
  const [progress, setProgress] = useState<Record<number, ListProgress>>({});
  const [loading, setLoading] = useState(true);
  const [quota, setQuota] = useState<Quota | null>(null);
  const [openSubcategories, setOpenSubcategories] = useState<Set<string>>(new Set());
  const [removingKeys, setRemovingKeys] = useState<Set<string>>(new Set());
  const [confirmKey, setConfirmKey] = useState<string | null>(null);
  const firstSubcategoryOpened = useRef(false);

  useEffect(() => {
    if (!getToken()) {
      router.replace('/login');
      return;
    }

    const token = getToken()!;

    fetch(`${BACKEND_URL}/api/me/quota`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { if (data) setQuota(data); })
      .catch((err) => console.error('Failed to fetch quota:', err));

    fetch(`${BACKEND_URL}/api/subcategory-meta`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : {}))
      .then((data: Record<string, SubcategoryMeta>) => setSubcategoryMeta(data))
      .catch((err) => console.error('Failed to fetch subcategory meta:', err));

    Promise.all([
      fetch(`${BACKEND_URL}/api/lists`, { headers: { Authorization: `Bearer ${token}` } })
        .then((r) => r.json())
        .then((data: WordListSummary[]) => (Array.isArray(data) ? data : [])),
      fetch(`${BACKEND_URL}/api/me/programs`, { headers: { Authorization: `Bearer ${token}` } })
        .then((r) => (r.ok ? r.json() : []))
        .catch(() => []),
    ])
      .then(([allLists, enrolled]) => {
        const keys = new Set<string>(Array.isArray(enrolled) ? enrolled : []);
        setEnrolledKeys(keys);
        setLists(allLists);

        if (allLists.length === 0) return;
        fetch(`${BACKEND_URL}/api/me/lists-progress`, {
          headers: { Authorization: `Bearer ${token}` },
        })
          .then((r) => (r.ok ? r.json() : {}))
          .then((data: Record<string, ListProgress>) => {
            const map: Record<number, ListProgress> = {};
            for (const [k, v] of Object.entries(data)) map[Number(k)] = v;
            setProgress(map);
          })
          .catch((err) => console.error('Failed to fetch lists progress:', err));
      })
      .catch((err) => console.error('Failed to fetch lists:', err))
      .finally(() => setLoading(false));
  }, []);

  async function handleUnenroll(subcategoryKey: string) {
    setRemovingKeys((prev: Set<string>) => new Set(prev).add(subcategoryKey));
    try {
      await unenrollProgram(subcategoryKey);
      setEnrolledKeys((prev: Set<string>) => { const next = new Set(prev); next.delete(subcategoryKey); return next; });
    } catch (err) {
      console.error(err);
    } finally {
      setRemovingKeys((prev: Set<string>) => { const next = new Set(prev); next.delete(subcategoryKey); return next; });
    }
  }

  // Close confirm modal on Escape
  const handleEscape = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') setConfirmKey(null);
  }, []);
  useEffect(() => {
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [handleEscape]);

  // Read star level from cookie on mount
  useEffect(() => {
    setStarLevelState(getStarLevel());
  }, []);

  function handleStarLevel(level: number) {
    setStarLevel(level);
    setStarLevelState(level);
  }

  // Open all enrolled subcategories when lists load (only once)
  useEffect(() => {
    if (lists.length > 0 && !firstSubcategoryOpened.current) {
      firstSubcategoryOpened.current = true;
      const allKeys = new Set(
        lists
          .filter((l) => enrolledKeys.has(l.subcategory ?? ''))
          .map((l) => l.subcategory ?? 'other')
      );
      setOpenSubcategories(allKeys.size > 0 ? allKeys : new Set([lists[0].subcategory ?? 'other']));
    }
  }, [lists, enrolledKeys]);

  const limitReached = quota !== null && quota.daily_limit !== null && quota.sessions_today >= quota.daily_limit;

  return (
    <main className="bg-[#F5F5F7] min-h-screen text-gray-900">
      <div className="max-w-4xl mx-auto px-6 py-8">
        <StatsBar />

        {/* Quota banner */}
        {quota && !quota.premium_active && (
          <div className={`mb-6 rounded-xl px-5 py-4 border flex flex-col sm:flex-row sm:items-center gap-3 ${
            limitReached
              ? 'bg-red-50 border-red-200'
              : 'bg-white border-gray-100'
          }`}>
            <div className="flex-1">
              {limitReached ? (
                <p className="text-red-600 font-medium text-sm">{tr.lists.limitReached.replace('{count}', String(quota.sessions_today)).replace('{limit}', String(quota.daily_limit))}</p>
              ) : (
                <p className="text-gray-500 text-sm">{tr.lists.sessionsToday} <span className="text-gray-900 font-medium">{quota.sessions_today} / {quota.daily_limit}</span></p>
              )}
            </div>
            <Link href="/pricing" className="shrink-0 text-xs font-medium text-emerald-600 hover:text-emerald-700 border border-emerald-200 rounded-full px-3 py-1.5 transition-colors">
              {tr.lists.getPremium}
            </Link>
          </div>
        )}
        {quota?.premium_active && quota.premium_until && (
          <div className="mb-6 rounded-xl px-5 py-3 border border-emerald-100 bg-emerald-50 flex items-center gap-2">
            <span className="text-emerald-600 text-sm font-medium">✦ Premium</span>
            <span className="text-gray-400 text-sm">{tr.lists.premiumUntil} {new Date(quota.premium_until).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })}</span>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-4 mb-2">
          <h1 className="text-3xl font-bold">{tr.lists.title}</h1>
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-400">{tr.lists.starSelectorLabel}</span>
            {([
              [1, `★ — ${tr.lists.star1Label}`],
              [2, `★★ — ${tr.lists.star2Label}`],
              [3, `★★★ — ${tr.lists.star3Label}`],
            ] as [number, string][]).map(([level, tooltip]) => (
              <div key={level} className="relative group">
                <button
                  onClick={() => handleStarLevel(level)}
                  className={`px-3 py-1 rounded-full text-sm border transition-colors ${
                    starLevel === level
                      ? 'bg-gray-900 text-white border-gray-900'
                      : 'bg-white text-gray-500 border-gray-300 hover:border-gray-900'
                  }`}
                >
                  {'★'.repeat(level)}
                </button>
                <div className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 rounded-lg bg-gray-900 px-3 py-1.5 text-xs text-white opacity-0 group-hover:opacity-100 transition-opacity z-50">
                  {tooltip}
                  <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900" />
                </div>
              </div>
            ))}
          </div>
        </div>
        <p className="text-gray-400 mb-8">{tr.lists.subtitle}</p>

        {loading ? (
          <div className="flex justify-center py-20">
            <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : enrolledKeys.size === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
            <p className="text-gray-500 text-lg">{tr.programs.emptyState}</p>
            <Link
              href="/programs"
              className="px-6 py-3 bg-emerald-600 text-white text-sm font-semibold rounded-full hover:bg-emerald-700 transition-colors shadow-sm shadow-emerald-600/20"
            >
              {tr.programs.emptyStateCta}
            </Link>
          </div>
        ) : (() => {
          // Filter to enrolled subcategories only
          const enrolledLists = lists.filter((l) => enrolledKeys.has(l.subcategory ?? ''));
          // Group lists by subcategory
          const grouped: { key: string; label: string; lists: WordListSummary[] }[] = [];
          for (const list of enrolledLists) {
            const key = list.subcategory ?? 'other';
            const existing = grouped.find((g) => g.key === key);
            if (existing) {
              existing.lists.push(list);
            } else {
              const scMeta = subcategoryMeta[key];
              const scLabel = (lang === 'en' ? scMeta?.name_en : scMeta?.name_ru) ?? tr.lists.subcategories[key] ?? key;
              grouped.push({ key, label: scLabel, lists: [list] });
            }
          }
          return (
            <>
            <div className="flex flex-col gap-4">
              {grouped.map((group) => {
                const isOpen = openSubcategories.has(group.key);
                const meta = subcategoryMeta[group.key];
                return (
                  <div key={group.key} className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-shadow">
                    <button
                      onClick={() => setOpenSubcategories((prev) => {
                        const next = new Set(prev);
                        next.has(group.key) ? next.delete(group.key) : next.add(group.key);
                        return next;
                      })}
                      aria-expanded={isOpen}
                      className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors text-left cursor-pointer"
                    >
                      <div className="flex items-center gap-3 flex-wrap">
                        <span role="heading" aria-level={2} className="font-semibold text-gray-900">{group.label}</span>
                        <span className="text-gray-400 text-sm">{group.lists.length} {plural(group.lists.length, tr.lists.listsCount)}</span>
                        {meta?.is_published === false && (
                          <span className="text-[10px] font-semibold uppercase tracking-wide bg-amber-50 text-amber-600 border border-amber-200 rounded px-1.5 py-px leading-tight">
                            В тестировании
                          </span>
                        )}
                        {meta?.cefr_level && (
                          <span className="text-xs font-semibold px-2 py-0.5 rounded-full border border-blue-200 bg-blue-50 text-blue-700">
                            {meta.cefr_level}
                          </span>
                        )}
                        {meta?.difficulty && (
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${
                            meta.difficulty === 'easy' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                            meta.difficulty === 'medium' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                            'bg-red-50 text-red-700 border-red-200'
                          }`}>
                            {tr.admin.difficultyOptions[meta.difficulty] ?? meta.difficulty}
                          </span>
                        )}
                        {meta?.article_url && (() => {
                          const isExternal = meta.article_url.startsWith('http');
                          // Ensure internal paths always have a leading slash
                          const href = isExternal || meta.article_url.startsWith('/')
                            ? meta.article_url
                            : `/${meta.article_url}`;
                          return (
                            <a
                              href={href}
                              target={isExternal ? '_blank' : undefined}
                              rel={isExternal ? 'noopener noreferrer' : undefined}
                              onClick={(e) => e.stopPropagation()}
                              className="inline-flex items-center gap-1 text-xs text-emerald-600 hover:text-emerald-700"
                            >
                              <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
                                <path d="M7 1h4v4M11 1L5.5 6.5M5 2H2a1 1 0 00-1 1v7a1 1 0 001 1h7a1 1 0 001-1V8" strokeLinecap="round" strokeLinejoin="round"/>
                              </svg>
                              {(lang === 'ru' ? meta.article_name_ru : meta.article_name_en) || 'Статья'}
                            </a>
                          );
                        })()}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={(e) => { e.stopPropagation(); setConfirmKey(group.key); }}
                          disabled={removingKeys.has(group.key)}
                          title={tr.programs.removeBtn}
                          className="text-gray-300 hover:text-red-500 transition-colors disabled:opacity-40 p-1 rounded"
                        >
                          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M2 4h12M5 4V2h6v2M6 7v5M10 7v5M3 4l1 9a1 1 0 001 1h6a1 1 0 001-1l1-9" />
                          </svg>
                        </button>
                        <svg
                          width="14" height="14" viewBox="0 0 12 12" fill="currentColor"
                          className={`text-gray-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
                        >
                          <path d="M6 8L1 3h10L6 8z" />
                        </svg>
                      </div>
                    </button>

                    {isOpen && (
                      <div className="px-5 py-4 border-t border-gray-100">
                        <div className="grid gap-4 sm:grid-cols-2">
                          {group.lists.map((list) => {
                            const p = progress[list.id];
                            const knownPct = p ? (p.known / p.total) * 100 : 0;
                            const learningPct = p ? (p.learning / p.total) * 100 : 0;
                            const displayTitle = lang === 'en' ? (list.title_en || list.title) : list.title;
                            const displayDesc = lang === 'en' ? (list.description_en || list.description) : list.description;
                            const isDone = p && p.total > 0 && p.known >= p.total;
                            return (
                              <div
                                key={list.id}
                                className="relative bg-gray-50 border border-gray-100 rounded-2xl p-5 flex flex-col gap-4"
                              >
                                {isDone && (
                                  <div className="absolute top-0 right-0 bg-emerald-500 text-white text-xs font-bold px-3 py-1 rounded-bl-xl rounded-tr-2xl tracking-wide">
                                    ✓ Done
                                  </div>
                                )}
                                <div>
                                  <h2 className="text-lg font-semibold">{displayTitle}</h2>
                                  {displayDesc && (
                                    <p className="text-gray-400 text-sm mt-1">{displayDesc}</p>
                                  )}
                                </div>

                                <div className="flex flex-col gap-1.5">
                                  <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden flex">
                                    <div className="h-full bg-emerald-500 transition-all duration-500" style={{ width: `${knownPct}%` }} />
                                    <div className="h-full bg-amber-400 transition-all duration-500" style={{ width: `${learningPct}%` }} />
                                  </div>
                                  {p && (
                                    <p className="text-gray-400 text-xs">
                                      {p.known} / {p.total} {tr.lists.learned}
                                      {p.learning > 0 && <span className="text-amber-500 ml-1">· {p.learning} {plural(p.learning, tr.lists.inProgress)}</span>}
                                    </p>
                                  )}
                                </div>

                                <div className="flex items-center justify-between mt-auto">
                                  <div className="flex flex-col">
                                    <span className="text-gray-400 text-sm">{list.word_count} {plural(list.word_count, tr.lists.wordsCount)}</span>
                                    {list.star_counts && starLevel !== 3 && list.star_counts[String(starLevel)] !== list.word_count && (
                                      <span className="text-xs text-gray-400">{list.star_counts[String(starLevel)]} {'★'.repeat(starLevel)}</span>
                                    )}
                                  </div>
                                  <div className="flex gap-2">
                                    <Link
                                      href={`/dashboard/lists/${list.id}`}
                                      className="px-4 py-2.5 text-sm text-gray-500 hover:text-gray-900 border border-gray-200 rounded-full transition-colors"
                                    >
                                      {tr.lists.browse}
                                    </Link>
                                    {limitReached ? (
                                      <button
                                        disabled
                                        title={tr.lists.studyDisabledTitle}
                                        className="px-4 py-2.5 text-sm bg-emerald-600/30 rounded-full font-semibold cursor-not-allowed opacity-40"
                                      >
                                        {tr.lists.study}
                                      </button>
                                    ) : (
                                      <Link
                                        href={`/dashboard/lists/${list.id}/study`}
                                        className="px-4 py-2.5 text-sm bg-emerald-600 hover:bg-emerald-700 rounded-full transition-colors font-semibold text-white shadow-sm shadow-emerald-600/20"
                                      >
                                        {tr.lists.study}
                                      </Link>
                                    )}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="mt-6 text-center">
              <Link
                href="/programs"
                className="text-sm text-emerald-600 hover:text-emerald-700 transition-colors"
              >
                {tr.programs.emptyStateCta} →
              </Link>
            </div>
            </>
          );
        })()}
      </div>

      {/* Confirm remove program modal */}
      {confirmKey !== null && (() => {
        const meta = subcategoryMeta[confirmKey];
        const label = (lang === 'en' ? meta?.name_en : meta?.name_ru) ?? tr.lists.subcategories[confirmKey] ?? confirmKey;
        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
            onClick={() => setConfirmKey(null)}
          >
            <div
              className="bg-white rounded-2xl shadow-xl p-6 mx-4 w-full max-w-sm flex flex-col gap-4"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 className="text-lg font-semibold text-gray-900">
                Убрать программу «{label}»?
              </h2>
              <p className="text-sm text-gray-500">
                Ваш прогресс сохранится — вы сможете снова записаться в программу в любое время.
              </p>
              <div className="flex gap-3 justify-end">
                <button
                  onClick={() => setConfirmKey(null)}
                  className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 border border-gray-200 rounded-full transition-colors"
                >
                  Отмена
                </button>
                <button
                  onClick={async () => {
                    const key = confirmKey;
                    setConfirmKey(null);
                    await handleUnenroll(key);
                  }}
                  disabled={removingKeys.has(confirmKey)}
                  className="px-4 py-2 text-sm font-semibold text-white bg-red-500 hover:bg-red-600 rounded-full transition-colors disabled:opacity-40"
                >
                  Убрать
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </main>
  );
}
