'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { BACKEND_URL, getToken } from '../../../../lib/api';
import { useT } from '../../../../lib/useT';
import PageMascot from '../../../../components/PageMascot';
import TakChevron from '../../../../components/TakChevron';

interface LearnedPhrase {
  id: number;
  text: string;
  translation: string;
  translation_en: string | null;
  chapter: number | null;
  chapter_title: string | null;
  chapter_title_en: string | null;
  program_id: number;
  program_title: string | null;
  program_title_en: string | null;
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
    if (!nextReview) return { key: 'due', label: tr.stats.memoryDue, cls: 'bg-[#fdeceb] text-[#c2504a]' };
    const diff = Math.floor((new Date(nextReview).getTime() - Date.now()) / 86_400_000);
    if (diff > 3) return { key: 'ok', label: tr.stats.memoryOk, cls: 'bg-[#e9f6ee] text-[#0f9d68]' };
    if (diff >= 0) return { key: 'fading', label: tr.stats.memoryFading, cls: 'bg-[#fdf6e3] text-[#8a6d1f]' };
    return { key: 'due', label: tr.stats.memoryDue, cls: 'bg-[#fdeceb] text-[#c2504a]' };
  }

  function formatDate(iso: string | null): string {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString(lang === 'ru' ? 'ru-RU' : 'en-GB', {
      day: 'numeric',
      month: 'short',
    });
  }

  return (
    <main className="text-gray-900">
      <div className="page relative z-10 px-4 sm:px-8 pt-6">
        <Link href="/dashboard/phrases" className="text-sm text-gray-400 hover:text-gray-700 transition-colors">
          <TakChevron direction="left" size={10} className="inline-block align-[-1px] mr-1" />{tr.phrasesVocabulary.back}
        </Link>

        <div className="mt-4 mb-8 flex flex-col sm:flex-row sm:items-start gap-4 sm:gap-6">
          <div className="flex items-end gap-4 sm:gap-5 flex-1">
            <PageMascot phrase="Kartokime!" className="hidden sm:block" />
            <div className="flex-1">
              <h1 className="text-[28px] font-bold leading-tight">{tr.phrasesVocabulary.title}</h1>
              <p className="text-gray-400 text-sm mt-1.5">
                {tr.phrasesVocabulary.subtitle}
                {!loading && phrases.length > 0 && (
                  <span className="ml-2 text-gray-500 font-medium">— {phrases.length}</span>
                )}
              </p>
            </div>
          </div>
          {!loading && phrases.length > 0 && (
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={tr.phrasesVocabulary.searchPlaceholder}
              className="w-full sm:w-64 px-4 py-2.5 text-sm border border-gray-200 rounded-[10px] bg-white focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          )}
        </div>

        {!loading && phrases.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-5">
            {([
              ['all',    tr.vocabulary.filterAll, phrases.length,      null],
              ['due',    tr.stats.memoryDue,      memoryCounts.due,    tr.phrasesVocabulary.tooltipDue],
              ['fading', tr.stats.memoryFading,   memoryCounts.fading, tr.phrasesVocabulary.tooltipFading],
              ['ok',     tr.stats.memoryOk,       memoryCounts.ok,     tr.phrasesVocabulary.tooltipOk],
            ] as ['all' | 'due' | 'fading' | 'ok', string, number, string | null][]).map(([key, label, count, tooltip]) => (
              <div key={key} className="relative group">
                <button
                  onClick={() => setMemoryFilter(key)}
                  className={`text-[13px] font-semibold px-3.5 py-2 rounded-full transition-colors ${
                    memoryFilter === key
                      ? key === 'all'    ? 'bg-ink text-white'
                      : key === 'ok'     ? 'bg-[#e9f6ee] text-[#0f9d68]'
                      : key === 'fading' ? 'bg-[#fdf6e3] text-[#8a6d1f]'
                      : 'bg-destructive text-white'
                      // The "needs review" chip stays red-tinted even when
                      // unselected, as in the prototype.
                      : key === 'due'    ? 'bg-[#fdeceb] text-[#c2504a]'
                      : 'bg-[#f2f3f3] text-[#5b6067]'
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
          <div className="border border-line rounded-[14px] overflow-hidden bg-white">
            <table className="w-full text-sm table-fixed">
              <thead>
                <tr className="border-b border-line-strong">
                  <th className="text-left px-6 py-3.5 font-semibold text-gray-400 text-xs uppercase tracking-wider w-[37.5%]">{tr.phrasesVocabulary.columnPhrase}</th>
                  <th className="text-left px-6 py-3.5 font-semibold text-gray-400 text-xs uppercase tracking-wider w-[31.25%]">{tr.vocabulary.columnTranslation}</th>
                  <th className="text-left px-6 py-3.5 font-semibold text-gray-400 text-xs uppercase tracking-wider hidden sm:table-cell w-[15.625%]">{tr.vocabulary.columnMemory}</th>
                  <th className="text-left px-6 py-3.5 font-semibold text-gray-400 text-xs uppercase tracking-wider hidden md:table-cell w-[15.625%]">{tr.vocabulary.columnNextReview}</th>
                </tr>
              </thead>
              <tbody>
                {paginated.map((p) => {
                  const translation = lang === 'en' ? (p.translation_en || p.translation) : p.translation;
                  return (
                    <tr
                      key={p.id}
                      className="border-b border-line-soft last:border-0 hover:bg-[#fafbfa] transition-colors"
                    >
                      <td className="px-6 py-3.5 text-[14px] font-semibold text-ink">
                        {p.text}
                      </td>
                      <td className="px-6 py-3.5 text-[13.5px] text-[#3a3d42]">{translation || '—'}</td>
                      <td className="px-6 py-3.5 hidden sm:table-cell">
                        {(() => {
                          const ms = memoryState(p.next_review);
                          return (
                            <span className={`inline-block text-xs font-semibold px-2.5 py-1 rounded-full ${ms.cls}`}>
                              {ms.label}
                            </span>
                          );
                        })()}
                      </td>
                      <td className="px-6 py-3.5 text-[13px] text-muted hidden md:table-cell whitespace-nowrap">
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
                <TakChevron direction="left" size={11} className="inline-block" />
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
                <TakChevron size={11} className="inline-block" />
              </button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
