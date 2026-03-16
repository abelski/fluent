'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { BACKEND_URL, getToken } from '../../../lib/api';
import StatsBar from '../components/StatsBar';
import { useT } from '../../../lib/useT';

interface WordListSummary {
  id: number;
  title: string;
  description: string | null;
  subcategory: string | null;
  word_count: number;
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
  const { tr, plural } = useT();
  const [lists, setLists] = useState<WordListSummary[]>([]);
  const [progress, setProgress] = useState<Record<number, ListProgress>>({});
  const [loading, setLoading] = useState(true);
  const [quota, setQuota] = useState<Quota | null>(null);
  const [openSubcategories, setOpenSubcategories] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!getToken()) {
      window.location.href = '/login';
      return;
    }

    const token = getToken()!;

    fetch(`${BACKEND_URL}/api/me/quota`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { if (data) setQuota(data); })
      .catch(() => {});

    fetch(`${BACKEND_URL}/api/lists`)
      .then((r) => r.json())
      .then((data: WordListSummary[]) => {
        const validData = Array.isArray(data) ? data : [];
        setLists(validData);

        if (validData.length === 0) return;

        fetch(`${BACKEND_URL}/api/me/lists-progress`, {
          headers: { Authorization: `Bearer ${token}` },
        })
          .then((r) => (r.ok ? r.json() : {}))
          .then((data: Record<string, ListProgress>) => {
            const map: Record<number, ListProgress> = {};
            for (const [k, v] of Object.entries(data)) {
              map[Number(k)] = v;
            }
            setProgress(map);
          })
          .catch(() => {});
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Open the first subcategory when lists load
  useEffect(() => {
    if (lists.length > 0 && openSubcategories.size === 0) {
      const firstKey = lists[0].subcategory ?? 'other';
      setOpenSubcategories(new Set([firstKey]));
    }
  }, [lists]); // eslint-disable-line react-hooks/exhaustive-deps

  const limitReached = quota !== null && quota.daily_limit !== null && quota.sessions_today >= quota.daily_limit;

  return (
    <main className="bg-slate-50 text-gray-900">
      <div className="pointer-events-none fixed inset-0 flex items-start justify-center overflow-hidden">
        <div className="w-full max-w-[600px] h-[400px] bg-emerald-100/40 blur-[120px] rounded-full mt-[-100px]" />
      </div>

      <div className="relative z-10 max-w-4xl mx-auto px-6 py-8">
        <StatsBar />

        {/* Quota banner */}
        {quota && !quota.premium_active && (
          <div className={`mb-6 rounded-xl px-5 py-4 border flex flex-col sm:flex-row sm:items-center gap-3 ${
            limitReached
              ? 'bg-red-50 border-gray-900'
              : 'bg-white border-gray-900'
          }`}>
            <div className="flex-1">
              {limitReached ? (
                <p className="text-red-600 font-medium text-sm">{tr.lists.limitReached.replace('{count}', String(quota.sessions_today)).replace('{limit}', String(quota.daily_limit))}</p>
              ) : (
                <p className="text-gray-500 text-sm">{tr.lists.sessionsToday} <span className="text-gray-900 font-medium">{quota.sessions_today} / {quota.daily_limit}</span></p>
              )}
            </div>
            <Link href="/pricing" className="shrink-0 text-xs font-medium text-emerald-600 hover:text-emerald-600 border border-gray-900 rounded-lg px-3 py-1.5 transition-colors">
              {tr.lists.getPremium}
            </Link>
          </div>
        )}
        {quota?.premium_active && quota.premium_until && (
          <div className="mb-6 rounded-xl px-5 py-3 border border-gray-900 bg-emerald-50 flex items-center gap-2">
            <span className="text-emerald-600 text-sm font-medium">✦ Premium</span>
            <span className="text-gray-400 text-sm">{tr.lists.premiumUntil} {new Date(quota.premium_until).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })}</span>
          </div>
        )}

        <h1 className="text-3xl font-bold mb-2">{tr.lists.title}</h1>
        <p className="text-gray-400 mb-10">{tr.lists.subtitle}</p>

        {loading ? (
          <div className="flex justify-center py-20">
            <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (() => {
          // Group lists by subcategory
          const grouped: { key: string; label: string; lists: WordListSummary[] }[] = [];
          for (const list of lists) {
            const key = list.subcategory ?? 'other';
            const existing = grouped.find((g) => g.key === key);
            if (existing) {
              existing.lists.push(list);
            } else {
              grouped.push({ key, label: tr.lists.subcategories[key] ?? key, lists: [list] });
            }
          }
          return (
            <div className="flex flex-col gap-4">
              {grouped.map((group) => {
                const isOpen = openSubcategories.has(group.key);
                return (
                  <div key={group.key} className="border border-gray-900 rounded-2xl overflow-hidden">
                    <button
                      onClick={() => setOpenSubcategories((prev) => {
                        const next = new Set(prev);
                        next.has(group.key) ? next.delete(group.key) : next.add(group.key);
                        return next;
                      })}
                      aria-expanded={isOpen}
                      className="w-full flex items-center justify-between px-5 py-4 bg-gray-50 hover:bg-gray-100 transition-colors text-left cursor-pointer"
                    >
                      <div className="flex items-center gap-3">
                        <span className="font-semibold text-gray-900">{group.label}</span>
                        <span className="text-gray-400 text-sm">{group.lists.length} {plural(group.lists.length, tr.lists.listsCount)}</span>
                      </div>
                      <svg
                        width="14" height="14" viewBox="0 0 12 12" fill="currentColor"
                        className={`text-gray-400 transition-transform duration-200 shrink-0 ${isOpen ? 'rotate-180' : ''}`}
                      >
                        <path d="M6 8L1 3h10L6 8z" />
                      </svg>
                    </button>

                    {isOpen && (
                      <div className="px-5 py-4 border-t border-gray-900">
                        <div className="grid gap-4 sm:grid-cols-2">
                          {group.lists.map((list) => {
                            const p = progress[list.id];
                            const knownPct = p ? (p.known / p.total) * 100 : 0;
                            const learningPct = p ? (p.learning / p.total) * 100 : 0;
                            return (
                              <div
                                key={list.id}
                                className="bg-white border border-gray-900 rounded-2xl p-6 flex flex-col gap-4"
                              >
                                <div>
                                  <h2 className="text-lg font-semibold">{list.title}</h2>
                                  {list.description && (
                                    <p className="text-gray-400 text-sm mt-1">{list.description}</p>
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
                                  <span className="text-gray-400 text-sm">{list.word_count} {plural(list.word_count, tr.lists.wordsCount)}</span>
                                  <div className="flex gap-2">
                                    <Link
                                      href={`/dashboard/lists/${list.id}`}
                                      className="px-4 py-2.5 text-sm text-gray-500 hover:text-gray-900 border border-gray-900 rounded-lg transition-colors"
                                    >
                                      {tr.lists.browse}
                                    </Link>
                                    {limitReached ? (
                                      <button
                                        disabled
                                        title={tr.lists.studyDisabledTitle}
                                        className="px-4 py-2.5 text-sm bg-emerald-600/30 rounded-lg font-medium cursor-not-allowed opacity-40"
                                      >
                                        {tr.lists.study}
                                      </button>
                                    ) : (
                                      <Link
                                        href={`/dashboard/lists/${list.id}/study`}
                                        className="px-4 py-2.5 text-sm bg-gray-900 hover:bg-gray-800 rounded-lg transition-colors font-medium text-white"
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
          );
        })()}
      </div>
    </main>
  );
}
