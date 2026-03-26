'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { BACKEND_URL, getToken, enrollProgram, unenrollProgram } from '../../lib/api';
import { useT } from '../../lib/useT';

interface WordListSummary {
  id: number;
  subcategory: string | null;
  word_count: number;
}

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

interface ProgramCard {
  key: string;
  name: string;
  meta: SubcategoryMeta;
  wordCount: number;
  listCount: number;
  enrollmentCount: number;
}

function BookIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </svg>
  );
}

export default function ProgramsPage() {
  const { tr, plural, lang } = useT();
  const router = useRouter();
  const [programs, setPrograms] = useState<ProgramCard[]>([]);
  const [enrolledKeys, setEnrolledKeys] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<Set<string>>(new Set());

  useEffect(() => {
    const token = getToken();
    if (!token) {
      router.replace('/');
      return;
    }

    Promise.all([
      fetch(`${BACKEND_URL}/api/lists`, { headers: { Authorization: `Bearer ${token}` } })
        .then((r) => (r.ok ? r.json() : []))
        .catch(() => []),
      fetch(`${BACKEND_URL}/api/subcategory-meta`, { headers: { Authorization: `Bearer ${token}` } })
        .then((r) => (r.ok ? r.json() : {}))
        .catch(() => ({})),
      fetch(`${BACKEND_URL}/api/me/programs`, { headers: { Authorization: `Bearer ${token}` } })
        .then((r) => (r.ok ? r.json() : []))
        .catch(() => []),
    ]).then(([listsData, metaData, enrolledData]: [WordListSummary[], Record<string, SubcategoryMeta>, string[]]) => {
      const enrolled = new Set<string>(Array.isArray(enrolledData) ? enrolledData : []);
      setEnrolledKeys(enrolled);

      // Aggregate word/list counts per subcategory
      const countMap: Record<string, { wordCount: number; listCount: number }> = {};
      for (const list of (Array.isArray(listsData) ? listsData : [])) {
        const key = list.subcategory ?? '';
        if (!key) continue;
        if (!countMap[key]) countMap[key] = { wordCount: 0, listCount: 0 };
        countMap[key].wordCount += list.word_count;
        countMap[key].listCount += 1;
      }

      // Build program cards from subcategoryMeta, sorted by popularity
      const cards: ProgramCard[] = Object.entries(metaData)
        .filter(([key]) => countMap[key])  // only show subcategories that have lists
        .map(([key, meta]) => ({
          key,
          name: (lang === 'en' ? meta.name_en : meta.name_ru) ?? key,
          meta,
          wordCount: countMap[key]?.wordCount ?? 0,
          listCount: countMap[key]?.listCount ?? 0,
          enrollmentCount: meta.enrollment_count ?? 0,
        }))
        .sort((a, b) => b.enrollmentCount - a.enrollmentCount);

      setPrograms(cards);
    }).finally(() => setLoading(false));
  }, []);

  async function handleToggle(key: string) {
    setPending((p) => new Set(p).add(key));
    try {
      if (enrolledKeys.has(key)) {
        await unenrollProgram(key);
        setEnrolledKeys((prev) => { const next = new Set(prev); next.delete(key); return next; });
      } else {
        await enrollProgram(key);
        setEnrolledKeys((prev) => new Set(prev).add(key));
      }
    } catch (err) {
      console.error(err);
    } finally {
      setPending((p) => { const next = new Set(p); next.delete(key); return next; });
    }
  }

  const difficultyColors: Record<string, string> = {
    easy: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    medium: 'bg-amber-50 text-amber-700 border-amber-200',
    hard: 'bg-red-50 text-red-700 border-red-200',
  };

  return (
    <main className="bg-[#F5F5F7] min-h-screen text-gray-900">
      <div className="max-w-4xl mx-auto px-6 py-8">
        <div className="mb-6">
          <Link href="/dashboard/lists" className="text-sm text-gray-400 hover:text-gray-700 transition-colors">
            ← {tr.common.backToLists}
          </Link>
        </div>

        <h1 className="text-3xl font-bold mb-2">{tr.programs.title}</h1>
        <p className="text-gray-500 mb-8 text-sm">{tr.programs.subtitle}</p>

        {loading ? (
          <div className="flex justify-center py-20">
            <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : programs.length === 0 ? (
          <p className="text-gray-400 text-center py-20">Нет доступных программ</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {programs.map((prog) => {
              const isEnrolled = enrolledKeys.has(prog.key);
              const isPending = pending.has(prog.key);
              const displayName = (lang === 'en' ? prog.meta.name_en : prog.meta.name_ru) ?? prog.key;
              return (
                <div
                  key={prog.key}
                  className="bg-white rounded-2xl p-5 hover:shadow-md transition-all active:scale-[0.98] border border-gray-100 flex flex-col gap-4"
                >
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 bg-emerald-50 rounded-xl flex items-center justify-center text-emerald-600 shadow-sm shrink-0">
                      <BookIcon />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <h2 className="font-semibold text-gray-900 leading-tight">{displayName}</h2>
                        {isEnrolled && (
                          <span className="shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                            {tr.programs.enrolledBadge}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                        {prog.meta.cefr_level && (
                          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                            {prog.meta.cefr_level}
                          </span>
                        )}
                        {prog.meta.difficulty && (
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${difficultyColors[prog.meta.difficulty] ?? 'bg-gray-50 text-gray-500 border-gray-200'}`}>
                            {tr.admin.difficultyOptions[prog.meta.difficulty] ?? prog.meta.difficulty}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 text-sm text-gray-400 flex-wrap">
                    <span>{prog.wordCount} {plural(prog.wordCount, tr.programs.wordsCount)}</span>
                    <span className="text-gray-200">·</span>
                    <span>{prog.listCount} {prog.listCount === 1 ? 'набор' : prog.listCount < 5 ? 'набора' : 'наборов'}</span>
                    {prog.enrollmentCount > 0 && (
                      <>
                        <span className="text-gray-200">·</span>
                        <span className="flex items-center gap-1">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M12 12c2.7 0 5-2.3 5-5s-2.3-5-5-5-5 2.3-5 5 2.3 5 5 5zm0 2c-3.3 0-10 1.7-10 5v2h20v-2c0-3.3-6.7-5-10-5z"/></svg>
                          {tr.programs.enrolledCount.replace('{n}', String(prog.enrollmentCount))}
                        </span>
                      </>
                    )}
                  </div>

                  {prog.meta.article_url && (
                    <a
                      href={prog.meta.article_url}
                      target={prog.meta.article_url.startsWith('http') ? '_blank' : undefined}
                      rel={prog.meta.article_url.startsWith('http') ? 'noopener noreferrer' : undefined}
                      className="text-xs text-emerald-600 hover:text-emerald-800 hover:underline truncate"
                      onClick={(e) => e.stopPropagation()}
                    >
                      📖 {(lang === 'en' ? prog.meta.article_name_en : prog.meta.article_name_ru) ?? prog.meta.article_url}
                    </a>
                  )}

                  <div className="flex items-center justify-between mt-1">
                    <Link
                      href={`/programs/${prog.key}`}
                      className="text-sm text-gray-400 hover:text-emerald-600 transition-colors font-medium"
                    >
                      {tr.programs.details} →
                    </Link>
                    <button
                      onClick={() => handleToggle(prog.key)}
                      disabled={isPending}
                      className={`text-sm font-semibold px-5 py-2 rounded-full transition-all active:scale-95 disabled:opacity-50 ${
                        isEnrolled
                          ? 'border border-gray-300 text-gray-500 hover:border-red-400 hover:text-red-600'
                          : 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm shadow-emerald-600/20'
                      }`}
                    >
                      {isPending ? '...' : isEnrolled ? tr.programs.removeBtn : tr.programs.addBtn}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
