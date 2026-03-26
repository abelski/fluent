'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { BACKEND_URL, getToken, enrollProgram, unenrollProgram } from '../../../lib/api';
import { useT } from '../../../lib/useT';

interface SubcategoryMeta {
  cefr_level: string | null;
  difficulty: string | null;
  name_ru: string | null;
  name_en: string | null;
  article_url: string | null;
  article_name_ru: string | null;
  article_name_en: string | null;
  enrollment_count?: number;
}

interface WordListSummary {
  id: number;
  title: string;
  title_en: string | null;
  subcategory: string | null;
  word_count: number;
}

interface Word {
  id: number;
  lithuanian: string;
  translation_ru: string | null;
  translation_en: string | null;
  hint: string | null;
}

interface StackState {
  expanded: boolean;
  words: Word[] | null;
  loading: boolean;
}

const difficultyColors: Record<string, string> = {
  easy: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  medium: 'bg-amber-50 text-amber-700 border-amber-200',
  hard: 'bg-red-50 text-red-700 border-red-200',
};

function resolveKey(): string {
  if (typeof window === 'undefined') return '_';
  const parts = window.location.pathname.split('/');
  const idx = parts.indexOf('programs');
  return idx !== -1 && parts[idx + 1] ? decodeURIComponent(parts[idx + 1]) : '_';
}

export default function ProgramDetailPage() {
  const { tr, plural, lang } = useT();
  const router = useRouter();

  const [programKey, setProgramKey] = useState<string>('_');
  const [meta, setMeta] = useState<SubcategoryMeta | null>(null);
  const [stacks, setStacks] = useState<WordListSummary[]>([]);
  const [isEnrolled, setIsEnrolled] = useState(false);
  const [enrollPending, setEnrollPending] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [stackStates, setStackStates] = useState<Record<number, StackState>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const key = resolveKey();
    setProgramKey(key);

    const token = getToken();
    if (!token) {
      router.replace('/');
      return;
    }

    Promise.all([
      fetch(`${BACKEND_URL}/api/subcategory-meta`, { headers: { Authorization: `Bearer ${token}` } })
        .then((r) => (r.ok ? r.json() : {})).catch(() => ({})),
      fetch(`${BACKEND_URL}/api/lists`, { headers: { Authorization: `Bearer ${token}` } })
        .then((r) => (r.ok ? r.json() : [])).catch(() => []),
      fetch(`${BACKEND_URL}/api/me/programs`, { headers: { Authorization: `Bearer ${token}` } })
        .then((r) => (r.ok ? r.json() : [])).catch(() => []),
    ]).then(([metaData, listsData, enrolledData]: [Record<string, SubcategoryMeta>, WordListSummary[], string[]]) => {
      const programMeta = metaData[key] ?? null;
      setMeta(programMeta);

      const programStacks = (Array.isArray(listsData) ? listsData : [])
        .filter((l) => l.subcategory === key);
      setStacks(programStacks);

      const enrolled = Array.isArray(enrolledData) ? enrolledData : [];
      setIsEnrolled(enrolled.includes(key));
    }).finally(() => setLoading(false));
  }, []);

  async function handleToggle() {
    if (isEnrolled) {
      setShowConfirm(true);
      return;
    }
    setEnrollPending(true);
    try {
      await enrollProgram(programKey);
      setIsEnrolled(true);
    } catch (err) {
      console.error(err);
    } finally {
      setEnrollPending(false);
    }
  }

  async function handleConfirmUnenroll() {
    setShowConfirm(false);
    setEnrollPending(true);
    try {
      await unenrollProgram(programKey);
      setIsEnrolled(false);
    } catch (err) {
      console.error(err);
    } finally {
      setEnrollPending(false);
    }
  }

  async function toggleStack(stackId: number) {
    const current = stackStates[stackId];
    if (current?.expanded) {
      setStackStates((s) => ({ ...s, [stackId]: { ...s[stackId], expanded: false } }));
      return;
    }

    // Already loaded — just expand (current must exist and words must be non-null)
    if (current !== undefined && current.words !== null) {
      setStackStates((s) => ({ ...s, [stackId]: { ...s[stackId], expanded: true } }));
      return;
    }

    // Lazy load words
    setStackStates((s) => ({ ...s, [stackId]: { expanded: true, words: null, loading: true } }));
    const token = getToken();
    try {
      const res = await fetch(`${BACKEND_URL}/api/lists/${stackId}`, {
        headers: { Authorization: `Bearer ${token ?? ''}` },
      });
      const data = res.ok ? await res.json() : { words: [] };
      const words: Word[] = Array.isArray(data.words) ? data.words : [];
      setStackStates((s) => ({ ...s, [stackId]: { expanded: true, words, loading: false } }));
    } catch {
      setStackStates((s) => ({ ...s, [stackId]: { expanded: true, words: [], loading: false } }));
    }
  }

  const displayName = meta
    ? (lang === 'en' ? meta.name_en : meta.name_ru) ?? programKey
    : programKey;

  if (loading) {
    return (
      <main className="bg-[#F5F5F7] min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </main>
    );
  }

  return (
    <main className="bg-[#F5F5F7] min-h-screen text-gray-900">
      <div className="max-w-4xl mx-auto px-6 py-8">
        <div className="mb-6">
          <Link href="/programs" className="text-sm text-gray-400 hover:text-gray-700 transition-colors">
            ← {tr.programs.title}
          </Link>
        </div>

        {/* Program header */}
        <div className="bg-white rounded-2xl p-6 mb-6 border border-gray-100 shadow-sm">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex-1 min-w-0">
              <h1 className="text-2xl font-bold text-gray-900 mb-2">{displayName}</h1>
              <div className="flex items-center gap-2 flex-wrap mb-3">
                {meta?.cefr_level && (
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                    {meta.cefr_level}
                  </span>
                )}
                {meta?.difficulty && (
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${difficultyColors[meta.difficulty] ?? 'bg-gray-50 text-gray-500 border-gray-200'}`}>
                    {tr.admin.difficultyOptions[meta.difficulty] ?? meta.difficulty}
                  </span>
                )}
                {(meta?.enrollment_count ?? 0) > 0 && (
                  <span className="flex items-center gap-1 text-xs text-gray-400">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M12 12c2.7 0 5-2.3 5-5s-2.3-5-5-5-5 2.3-5 5 2.3 5 5 5zm0 2c-3.3 0-10 1.7-10 5v2h20v-2c0-3.3-6.7-5-10-5z"/></svg>
                    {tr.programs.enrolledCount.replace('{n}', String(meta?.enrollment_count ?? 0))}
                  </span>
                )}
              </div>
              {meta?.article_url && (
                <a
                  href={meta.article_url}
                  target={meta.article_url.startsWith('http') ? '_blank' : undefined}
                  rel={meta.article_url.startsWith('http') ? 'noopener noreferrer' : undefined}
                  className="text-sm text-emerald-600 hover:text-emerald-800 hover:underline inline-flex items-center gap-1"
                >
                  📖 {(lang === 'en' ? meta.article_name_en : meta.article_name_ru) ?? meta.article_url}
                </a>
              )}
            </div>
            <button
              onClick={handleToggle}
              disabled={enrollPending}
              className={`shrink-0 text-sm font-semibold px-6 py-2.5 rounded-full transition-all active:scale-95 disabled:opacity-50 ${
                isEnrolled
                  ? 'border border-gray-300 text-gray-500 hover:border-red-400 hover:text-red-600'
                  : 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm shadow-emerald-600/20'
              }`}
            >
              {enrollPending ? '...' : isEnrolled ? tr.programs.removeBtn : tr.programs.addBtn}
            </button>
          </div>

          <div className="mt-4 pt-4 border-t border-gray-100 text-sm text-gray-400">
            <span>{stacks.length} {stacks.length === 1 ? 'набор' : stacks.length < 5 ? 'набора' : 'наборов'}</span>
            <span className="mx-1.5 text-gray-200">·</span>
            <span>{stacks.reduce((sum, s) => sum + s.word_count, 0)} {plural(stacks.reduce((sum, s) => sum + s.word_count, 0), tr.programs.wordsCount)}</span>
          </div>
        </div>

        {/* Stacks list */}
        {stacks.length === 0 ? (
          <p className="text-gray-400 text-center py-16">Нет наборов в этой программе</p>
        ) : (
          <div className="flex flex-col gap-3">
            {stacks.map((stack) => {
              const state = stackStates[stack.id];
              const isExpanded = state?.expanded ?? false;
              const stackName = (lang === 'en' ? stack.title_en : stack.title) ?? `Stack ${stack.id}`;
              return (
                <div key={stack.id} className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                  <button
                    onClick={() => toggleStack(stack.id)}
                    className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-emerald-50 rounded-lg flex items-center justify-center text-emerald-600 shrink-0">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="2" y="3" width="20" height="14" rx="2" />
                          <path d="M8 21h8M12 17v4" />
                        </svg>
                      </div>
                      <div className="text-left">
                        <div className="font-medium text-gray-900 text-sm">{stackName}</div>
                        <div className="text-xs text-gray-400">{stack.word_count} {plural(stack.word_count, tr.programs.wordsCount)}</div>
                      </div>
                    </div>
                    <svg
                      width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                      className={`text-gray-400 transition-transform shrink-0 ${isExpanded ? 'rotate-180' : ''}`}
                    >
                      <path d="M6 9l6 6 6-6" />
                    </svg>
                  </button>

                  {isExpanded && (
                    <div className="border-t border-gray-100">
                      {state?.loading ? (
                        <div className="flex justify-center py-6">
                          <div className="w-5 h-5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                        </div>
                      ) : (state?.words?.length ?? 0) === 0 ? (
                        <p className="text-gray-400 text-sm text-center py-6">Нет слов</p>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="border-b border-gray-100 bg-gray-50/50">
                                <th className="text-left px-5 py-2.5 text-xs font-semibold text-gray-400 uppercase tracking-wide">{tr.detail.columnLithuanian}</th>
                                <th className="text-left px-5 py-2.5 text-xs font-semibold text-gray-400 uppercase tracking-wide">{tr.detail.columnTranslation}</th>
                                <th className="text-left px-5 py-2.5 text-xs font-semibold text-gray-400 uppercase tracking-wide hidden sm:table-cell">{tr.detail.columnNote}</th>
                              </tr>
                            </thead>
                            <tbody>
                              {state!.words!.map((word) => (
                                <tr key={word.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50">
                                  <td className="px-5 py-2.5 font-medium text-gray-900">{word.lithuanian}</td>
                                  <td className="px-5 py-2.5 text-gray-600">{lang === 'en' ? word.translation_en : word.translation_ru}</td>
                                  <td className="px-5 py-2.5 text-gray-400 hidden sm:table-cell">{word.hint ?? ''}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-xl">
            <h2 className="text-lg font-semibold text-gray-900 mb-2">{tr.programs.removeConfirmTitle}</h2>
            <p className="text-sm text-gray-500 mb-6">{tr.programs.removeConfirmBody}</p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowConfirm(false)}
                className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors"
              >
                {tr.programs.removeConfirmCancel}
              </button>
              <button
                onClick={handleConfirmUnenroll}
                className="px-4 py-2 text-sm font-semibold text-white bg-red-500 hover:bg-red-600 rounded-full transition-colors"
              >
                {tr.programs.removeConfirmOk}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
