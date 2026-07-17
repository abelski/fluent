'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { BACKEND_URL, getToken } from '../../../../lib/api';
import { useT } from '../../../../lib/useT';

interface LearnedPhrase {
  id: number;
  text: string;
  translation: string;
  translation_en: string | null;
  chapter: number | null;
  chapter_title: string | null;
  program_id: number;
  program_title: string | null;
  lesson_stage: number;
  next_review: string | null;
}

export default function PhrasesVocabularyPage() {
  const { tr, lang } = useT();
  const router = useRouter();
  const PAGE_SIZE = 50;
  const [phrases, setPhrases] = useState<LearnedPhrase[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [memoryFilter, setMemoryFilter] = useState<'all' | 'ok' | 'fading' | 'due'>('all');
  const [page, setPage] = useState(1);

  const fetchPhrases = () => {
    const token = getToken();
    if (!token) { router.replace('/login'); return; }
    fetch(`${BACKEND_URL}/api/me/learned-phrases`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    })
      .then((r) => (r.ok ? r.json() : []))
      .then((data: LearnedPhrase[]) => setPhrases(Array.isArray(data) ? data : []))
      .catch((err) => console.error('Failed to fetch phrases:', err))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchPhrases();
    const onVisible = () => { if (document.visibilityState === 'visible') fetchPhrases(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    let list = phrases;
    if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter(
        (p) =>
          p.text.toLowerCase().includes(q) ||
          p.translation.toLowerCase().includes(q) ||
          (p.translation_en ?? '').toLowerCase().includes(q),
      );
    }
    if (memoryFilter !== 'all') {
      list = list.filter((p) => memoryState(p.next_review).key === memoryFilter);
    }
    // Sort: null / overdue first (most urgent), then by next_review ascending
    return [...list].sort((a, b) => {
      const da = a.next_review ? new Date(a.next_review).getTime() : 0;
      const db = b.next_review ? new Date(b.next_review).getTime() : 0;
      return da - db;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phrases, query, memoryFilter, tr]);

  // Reset to page 1 when filter or query changes
  useEffect(() => { setPage(1); }, [query, memoryFilter]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Count phrases per memory state (from full list, not filtered)
  const memoryCounts = useMemo(() => {
    const counts = { ok: 0, fading: 0, due: 0 };
    for (const p of phrases) counts[memoryState(p.next_review).key]++;
    return counts;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phrases, tr]);

  function memoryState(nextReview: string | null): { key: 'ok' | 'fading' | 'due'; label: string; cls: string } {
    if (!nextReview) return { key: 'due', label: tr.stats.memoryDue, cls: 'bg-red-50 text-red-600 border-red-200' };
    const diff = Math.floor((new Date(nextReview).getTime() - Date.now()) / 86_400_000);
    if (diff > 3) return { key: 'ok', label: tr.stats.memoryOk, cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
    if (diff >= 0) return { key: 'fading', label: tr.stats.memoryFading, cls: 'bg-amber-50 text-amber-700 border-amber-200' };
    return { key: 'due', label: tr.stats.memoryDue, cls: 'bg-red-50 text-red-600 border-red-200' };
  }

  function formatDate(iso: string | null): string {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString(lang === 'ru' ? 'ru-RU' : 'en-GB', {
      day: 'numeric',
      month: 'short',
    });
  }

  return (
    <main className="bg-slate-50 text-gray-900">
      <div className="relative z-10 max-w-4xl mx-auto px-6 py-8">
        <Link href="/dashboard/phrases" className="text-sm text-gray-400 hover:text-gray-700 transition-colors">
          {tr.phrasesVocabulary.back}
        </Link>

        <div className="mt-4 mb-8 flex flex-col sm:flex-row sm:items-end gap-4">
          <div className="flex-1">
            <h1 className="text-3xl font-bold">{tr.phrasesVocabulary.title}</h1>
            <p className="text-gray-400 mt-1">
              {tr.phrasesVocabulary.subtitle}
              {!loading && phrases.length > 0 && (
                <span className="ml-2 text-gray-500 font-medium">— {phrases.length}</span>
              )}
            </p>
          </div>
          {!loading && phrases.length > 0 && (
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={tr.phrasesVocabulary.searchPlaceholder}
              className="w-full sm:w-72 px-4 py-2.5 text-sm border border-gray-900 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          )}
        </div>

        {!loading && phrases.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-4">
            {([
              ['all',    tr.vocabulary.filterAll, phrases.length,      null],
              ['due',    tr.stats.memoryDue,      memoryCounts.due,    tr.phrasesVocabulary.tooltipDue],
              ['fading', tr.stats.memoryFading,   memoryCounts.fading, tr.phrasesVocabulary.tooltipFading],
              ['ok',     tr.stats.memoryOk,       memoryCounts.ok,     tr.phrasesVocabulary.tooltipOk],
            ] as ['all' | 'due' | 'fading' | 'ok', string, number, string | null][]).map(([key, label, count, tooltip]) => (
              <div key={key} className="relative group">
                <button
                  onClick={() => setMemoryFilter(key)}
                  className={`text-xs font-medium px-3 py-1 rounded-full border transition-colors ${
                    memoryFilter === key
                      ? key === 'all'    ? 'bg-gray-900 text-white border-gray-900'
                      : key === 'ok'     ? 'bg-emerald-600 text-white border-emerald-600'
                      : key === 'fading' ? 'bg-amber-500 text-white border-amber-500'
                      : 'bg-red-500 text-white border-red-500'
                      : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400'
                  }`}
                >
                  {label}{count > 0 && <span className="ml-1 opacity-70">({count})</span>}
                </button>
                {tooltip && (
                  <div className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-56 rounded-lg bg-gray-900 px-3 py-2 text-xs text-white opacity-0 group-hover:opacity-100 transition-opacity z-50 text-center">
                    {tooltip}
                    <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900" />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-20">
            <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : phrases.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-gray-400 mb-4">{tr.phrasesVocabulary.empty}</p>
            <Link
              href="/dashboard/phrases"
              className="inline-block px-5 py-2.5 bg-purple-600 text-white text-sm font-semibold rounded-full hover:bg-purple-700 transition-colors"
            >
              {tr.phrasesVocabulary.startCta}
            </Link>
          </div>
        ) : (
          <div className="border border-gray-900 rounded-2xl overflow-hidden bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-900 bg-gray-50">
                  <th className="text-left px-5 py-3 font-semibold text-gray-700">{tr.phrasesVocabulary.columnPhrase}</th>
                  <th className="text-left px-5 py-3 font-semibold text-gray-700">{tr.vocabulary.columnTranslation}</th>
                  <th className="text-left px-5 py-3 font-semibold text-gray-700 hidden sm:table-cell">{tr.vocabulary.columnMemory}</th>
                  <th className="text-left px-5 py-3 font-semibold text-gray-700 hidden md:table-cell">{tr.vocabulary.columnNextReview}</th>
                </tr>
              </thead>
              <tbody>
                {paginated.map((p, i) => {
                  const translation = lang === 'en' ? (p.translation_en || p.translation) : p.translation;
                  return (
                    <tr
                      key={p.id}
                      className={`border-b border-gray-100 last:border-0 ${i % 2 === 0 ? '' : 'bg-gray-50/50'}`}
                    >
                      <td className="px-5 py-3 font-medium text-gray-900">
                        {p.text}
                        {p.program_title && (
                          <p className="text-xs text-gray-400 font-normal mt-0.5">
                            {p.program_title}{p.chapter_title ? ` · ${p.chapter_title}` : ''}
                          </p>
                        )}
                      </td>
                      <td className="px-5 py-3 text-gray-600">{translation || '—'}</td>
                      <td className="px-5 py-3 hidden sm:table-cell">
                        {(() => {
                          const ms = memoryState(p.next_review);
                          return (
                            <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full border ${ms.cls}`}>
                              {ms.label}
                            </span>
                          );
                        })()}
                      </td>
                      <td className="px-5 py-3 text-gray-400 hidden md:table-cell whitespace-nowrap">
                        {p.next_review ? formatDate(p.next_review) : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {filtered.length === 0 && (
              <p className="text-center py-10 text-gray-400 text-sm">{tr.phrasesVocabulary.empty}</p>
            )}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-4">
            <p className="text-sm text-gray-400">
              {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} / {filtered.length}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg hover:border-gray-400 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                ←
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter((p) => p === 1 || p === totalPages || Math.abs(p - page) <= 2)
                .reduce<(number | '…')[]>((acc, p, idx, arr) => {
                  if (idx > 0 && p - (arr[idx - 1] as number) > 1) acc.push('…');
                  acc.push(p);
                  return acc;
                }, [])
                .map((p, i) =>
                  p === '…' ? (
                    <span key={`ellipsis-${i}`} className="px-2 py-1.5 text-sm text-gray-400">…</span>
                  ) : (
                    <button
                      key={p}
                      onClick={() => setPage(p as number)}
                      className={`px-3 py-1.5 text-sm border rounded-lg transition-colors ${
                        page === p ? 'bg-gray-900 text-white border-gray-900' : 'border-gray-200 hover:border-gray-400'
                      }`}
                    >
                      {p}
                    </button>
                  )
                )}
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg hover:border-gray-400 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                →
              </button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
