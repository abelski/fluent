'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  BACKEND_URL,
  getToken,
  getPhrasePrograms,
  enrollPhraseProgram,
  unenrollPhraseProgram,
  type PhraseProgramSummary,
} from '../../../lib/api';

interface Quota {
  premium_active: boolean;
  sessions_today: number;
  daily_limit: number | null;
}

interface PhraseRow {
  id: number;
  chapter: number | null;
  chapter_title: string | null;
  lesson_stage: number;
}

interface ChapterSummary {
  num: number | null;
  title: string | null;
  total: number;
  mastered: number;
  learning: number;
}

interface ProgramDetail {
  chapters: ChapterSummary[];
}

const DIFFICULTY_LABELS: Record<number, string> = { 1: 'Лёгкий', 2: 'Средний', 3: 'Сложный' };
const DIFFICULTY_BORDER: Record<number, string> = {
  1: 'border-emerald-200',
  2: 'border-amber-200',
  3: 'border-red-200',
};
const DIFFICULTY_BADGE: Record<number, string> = {
  1: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  2: 'bg-amber-50 text-amber-700 border-amber-200',
  3: 'bg-red-50 text-red-700 border-red-200',
};

export default function PhrasesPage() {
  const router = useRouter();
  const [programs, setPrograms] = useState<PhraseProgramSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [quota, setQuota] = useState<Quota | null>(null);
  const [enrolling, setEnrolling] = useState<Set<number>>(new Set());
  const [confirmUnenroll, setConfirmUnenroll] = useState<number | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState<boolean | null>(null);
  const [phrasesLearned, setPhrasesLearned] = useState(0);
  const [phrasesDueReview, setPhrasesDueReview] = useState(0);
  const [openPrograms, setOpenPrograms] = useState<Set<number>>(new Set());
  const [programDetails, setProgramDetails] = useState<Record<number, ProgramDetail>>({});
  const [loadingDetails, setLoadingDetails] = useState<Set<number>>(new Set());
  const autoOpenDone = useRef(false);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      setIsLoggedIn(false);
      setLoading(false);
      return;
    }
    setIsLoggedIn(true);

    getPhrasePrograms()
      .then(setPrograms)
      .catch(console.error)
      .finally(() => setLoading(false));

    fetch(`${BACKEND_URL}/api/me/quota`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then(setQuota)
      .catch(console.error);

    fetch(`${BACKEND_URL}/api/me/stats`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) {
          setPhrasesLearned(data.phrases_learned ?? 0);
          setPhrasesDueReview(data.phrases_due_review ?? 0);
        }
      })
      .catch(console.error);
  }, []);

  // Auto-open all enrolled programs once data is loaded
  useEffect(() => {
    if (programs.length === 0 || autoOpenDone.current) return;
    const enrolled = programs.filter((p) => p.enrolled);
    if (enrolled.length === 0) return;
    autoOpenDone.current = true;
    const ids = new Set(enrolled.map((p) => p.id));
    setOpenPrograms(ids);
    ids.forEach((id) => fetchProgramDetail(id));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [programs]);

  function fetchProgramDetail(id: number) {
    if (programDetails[id]) return;
    setLoadingDetails((s) => new Set(s).add(id));
    const token = getToken();
    fetch(`${BACKEND_URL}/api/phrase-programs/${id}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data) return;
        // Group phrases into chapter summaries
        const map = new Map<string, ChapterSummary>();
        for (const p of data.phrases as PhraseRow[]) {
          const key = p.chapter !== null ? String(p.chapter) : 'null';
          if (!map.has(key)) {
            map.set(key, { num: p.chapter, title: p.chapter_title, total: 0, mastered: 0, learning: 0 });
          }
          const ch = map.get(key)!;
          ch.total++;
          if (p.lesson_stage === 2) ch.mastered++;
          else if (p.lesson_stage === 1) ch.learning++;
        }
        setProgramDetails((prev) => ({
          ...prev,
          [id]: { chapters: Array.from(map.values()) },
        }));
      })
      .catch(console.error)
      .finally(() => setLoadingDetails((s) => { const n = new Set(s); n.delete(id); return n; }));
  }

  function toggleProgram(id: number) {
    setOpenPrograms((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
        fetchProgramDetail(id);
      }
      return next;
    });
  }

  async function handleEnroll(programId: number) {
    if (!getToken()) { router.push('/login'); return; }
    setEnrolling((s) => new Set(s).add(programId));
    try {
      await enrollPhraseProgram(programId);
      setPrograms((prev) =>
        prev.map((p) => (p.id === programId ? { ...p, enrolled: true } : p))
      );
    } catch (e) {
      console.error(e);
    } finally {
      setEnrolling((s) => { const n = new Set(s); n.delete(programId); return n; });
    }
  }

  async function handleUnenroll(programId: number) {
    setEnrolling((s) => new Set(s).add(programId));
    try {
      await unenrollPhraseProgram(programId);
      setPrograms((prev) =>
        prev.map((p) => (p.id === programId ? { ...p, enrolled: false, stage_distribution: null } : p))
      );
      setOpenPrograms((prev) => { const n = new Set(prev); n.delete(programId); return n; });
    } catch (e) {
      console.error(e);
    } finally {
      setEnrolling((s) => { const n = new Set(s); n.delete(programId); return n; });
      setConfirmUnenroll(null);
    }
  }

  const limitReached = quota && !quota.premium_active && quota.daily_limit !== null && quota.sessions_today >= quota.daily_limit;

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!isLoggedIn) {
    return (
      <main className="min-h-screen bg-slate-50 flex flex-col items-center justify-center px-6 py-12">
        <p className="text-gray-600 mb-4">Войдите, чтобы изучать фразы.</p>
        <Link href="/login" className="bg-emerald-600 text-white px-5 py-2.5 rounded-xl text-sm font-medium hover:bg-emerald-700 transition-colors">
          Войти
        </Link>
      </main>
    );
  }

  const enrolledPrograms = programs.filter((p) => p.enrolled);
  const availablePrograms = programs.filter((p) => !p.enrolled);

  return (
    <main className="min-h-screen bg-[#F5F5F7] text-gray-900 flex flex-col items-center px-4 py-10" data-testid="phrases-page">
      <div className="pointer-events-none fixed inset-0 flex items-start justify-center overflow-hidden">
        <div className="w-full max-w-[600px] h-[400px] bg-emerald-100/40 blur-[120px] rounded-full mt-[-100px]" />
      </div>

      <div className="relative z-10 w-full max-w-4xl">
        <h1 className="text-3xl font-bold mb-1">Фразы</h1>
        <p className="text-gray-400 mb-8">Изучайте литовские фразы шаг за шагом</p>

        {/* Phrases stats widget */}
        {phrasesLearned > 0 && (
          <div className="relative rounded-2xl bg-gradient-to-br from-purple-50 to-white border border-purple-100 shadow-sm overflow-hidden p-5 mb-6">
            <div className="absolute top-0 right-0 w-24 h-24 bg-purple-100/40 rounded-full -translate-y-8 translate-x-8 pointer-events-none" />
            <div className="flex items-center gap-3 relative">
              <div className="flex-shrink-0 w-11 h-11 rounded-xl bg-purple-100 flex items-center justify-center text-xl">
                💬
              </div>
              <div>
                <p className="text-3xl font-extrabold text-gray-900 leading-none tracking-tight">{phrasesLearned}</p>
                <p className="text-gray-500 text-xs mt-1 font-medium">фраз выучено</p>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link
                href="/dashboard/phrases/review"
                className="inline-block text-xs bg-purple-600 hover:bg-purple-700 text-white font-medium px-3 py-1.5 rounded-full transition-colors"
              >
                Повторить фразы
              </Link>
              <Link
                href="/dashboard/phrases/vocabulary"
                className="inline-block text-xs border border-purple-200 hover:bg-purple-50 text-purple-700 font-medium px-3 py-1.5 rounded-full transition-colors"
              >
                Все фразы →
              </Link>
            </div>
            <div className="mt-3">
              <div className="h-1 bg-purple-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-purple-400 rounded-full transition-all duration-700"
                  style={{ width: `${Math.min(100, (phrasesDueReview / phrasesLearned) * 100)}%` }}
                />
              </div>
              <p className="text-[10px] text-gray-400 mt-1">
                {phrasesDueReview} из {phrasesLearned} фраз нужно освежить
              </p>
            </div>
          </div>
        )}

        {/* Quota banner */}
        {quota && (quota.sessions_today > 0 || limitReached) && (
          <div className={`mb-6 px-4 py-3 rounded-xl text-sm flex items-center justify-between gap-3 ${limitReached ? 'bg-amber-50 border border-amber-200 text-amber-800' : 'bg-white border border-gray-100 text-gray-600'}`}>
            <span>
              {limitReached
                ? `Дневной лимит достигнут (${quota.sessions_today}/${quota.daily_limit}). Попробуйте завтра или перейдите на Premium.`
                : `Сессий сегодня: ${quota.sessions_today}${quota.daily_limit ? `/${quota.daily_limit}` : ''}`}
            </span>
            {limitReached && (
              <Link href="/pricing" className="shrink-0 text-xs font-medium text-amber-700 hover:underline">
                Premium →
              </Link>
            )}
          </div>
        )}

        {/* Enrolled programs — accordion with chapter cards inside */}
        {enrolledPrograms.length > 0 && (
          <div className="flex flex-col gap-4 mb-8">
            {enrolledPrograms.map((program) => {
              const isOpen = openPrograms.has(program.id);
              const detail = programDetails[program.id];
              const isLoadingDetail = loadingDetails.has(program.id);

              return (
                <div
                  key={program.id}
                  className={`bg-white border rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-shadow ${DIFFICULTY_BORDER[program.difficulty] ?? 'border-gray-100'}`}
                >
                  {/* Accordion header */}
                  <button
                    onClick={() => toggleProgram(program.id)}
                    aria-expanded={isOpen}
                    className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors text-left cursor-pointer"
                  >
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className="font-semibold text-gray-900">{program.title}</span>
                      <span className="text-gray-400 text-sm">{program.phrase_count} фраз</span>
                      {DIFFICULTY_LABELS[program.difficulty] && (
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${DIFFICULTY_BADGE[program.difficulty]}`}>
                          {DIFFICULTY_LABELS[program.difficulty]}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setConfirmUnenroll(program.id); }}
                        title="Убрать программу"
                        className="text-gray-300 hover:text-red-500 transition-colors p-1 rounded cursor-pointer"
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

                  {/* Chapter grid */}
                  {isOpen && (
                    <div className="px-5 py-4 border-t border-gray-100">
                      {isLoadingDetail ? (
                        <div className="flex justify-center py-6">
                          <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                        </div>
                      ) : detail ? (
                        <div className="grid gap-4 sm:grid-cols-2">
                          {detail.chapters.map((ch, i) => {
                            const isDone = ch.total > 0 && ch.mastered >= ch.total;
                            const masteredPct = ch.total > 0 ? (ch.mastered / ch.total) * 100 : 0;
                            const learningPct = ch.total > 0 ? (ch.learning / ch.total) * 100 : 0;
                            const chapterLabel = ch.num !== null
                              ? (ch.title ?? `Глава ${ch.num}`)
                              : program.title;
                            const studyHref = ch.num !== null
                              ? `/dashboard/phrases/${program.id}/study?chapter=${ch.num}`
                              : `/dashboard/phrases/${program.id}/study`;
                            return (
                              <div key={i} className="relative bg-gray-50 border border-gray-100 rounded-2xl p-5 flex flex-col gap-4">
                                {isDone && (
                                  <div className="absolute top-0 right-0 bg-emerald-500 text-white text-xs font-bold px-3 py-1 rounded-bl-xl rounded-tr-2xl tracking-wide">
                                    ✓ Done
                                  </div>
                                )}
                                <div>
                                  <h2 className="text-base font-semibold pr-16">{chapterLabel}</h2>
                                </div>
                                <div className="flex flex-col gap-1.5">
                                  <div className="w-full h-1.5 bg-gray-200 rounded-full overflow-hidden flex">
                                    <div className="h-full bg-emerald-500 transition-all duration-500" style={{ width: `${masteredPct}%` }} />
                                    <div className="h-full bg-amber-400 transition-all duration-500" style={{ width: `${learningPct}%` }} />
                                  </div>
                                  <p className="text-gray-400 text-xs">
                                    {ch.mastered} / {ch.total} выучено
                                    {ch.learning > 0 && <span className="text-amber-500 ml-1">· {ch.learning} изучается</span>}
                                  </p>
                                </div>
                                <div className="flex items-center justify-between mt-auto">
                                  <span className="text-gray-400 text-sm">{ch.total} фраз</span>
                                  <div className="flex gap-2">
                                    <Link
                                      href={`/dashboard/phrases/${program.id}`}
                                      className="px-4 py-2.5 text-sm text-gray-500 hover:text-gray-900 border border-gray-200 rounded-full transition-colors"
                                    >
                                      Browse
                                    </Link>
                                    <Link
                                      href={studyHref}
                                      data-testid="study-button"
                                      className={`px-4 py-2.5 text-sm rounded-full font-semibold transition-colors ${
                                        limitReached
                                          ? 'bg-emerald-600/30 cursor-not-allowed opacity-40 text-white'
                                          : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm shadow-emerald-600/20'
                                      }`}
                                    >
                                      Учить
                                    </Link>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : null}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Available programs */}
        {availablePrograms.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
              {enrolledPrograms.length > 0 ? 'Другие программы' : 'Доступные программы'}
            </h2>
            <div className="space-y-3">
              {availablePrograms.map((p) => (
                <ProgramCard
                  key={p.id}
                  program={p}
                  limitReached={!!limitReached}
                  enrolling={enrolling.has(p.id)}
                  onEnroll={() => handleEnroll(p.id)}
                />
              ))}
            </div>
          </section>
        )}

        {programs.length === 0 && (
          <p className="text-gray-400 text-center py-12">Программы фраз скоро появятся.</p>
        )}
      </div>

      {/* Unenroll confirm dialog */}
      {confirmUnenroll !== null && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center px-4" onClick={() => setConfirmUnenroll(null)}>
          <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold text-gray-900 mb-2">Убрать программу?</h3>
            <p className="text-sm text-gray-500 mb-5">Программа исчезнет из списка. Ваш прогресс сохранится.</p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setConfirmUnenroll(null)}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 border border-gray-200 rounded-full transition-colors"
              >
                Отмена
              </button>
              <button
                onClick={() => handleUnenroll(confirmUnenroll)}
                className="px-4 py-2 text-sm font-semibold text-white bg-red-500 hover:bg-red-600 rounded-full transition-colors"
              >
                Убрать
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function ProgramCard({
  program,
  limitReached,
  enrolling,
  onEnroll,
}: {
  program: PhraseProgramSummary;
  limitReached: boolean;
  enrolling: boolean;
  onEnroll?: () => void;
}) {
  const DIFFICULTY_LABELS: Record<number, string> = { 1: 'Лёгкий', 2: 'Средний', 3: 'Сложный' };
  const DIFFICULTY_COLORS: Record<number, string> = {
    1: 'bg-emerald-100 text-emerald-700',
    2: 'bg-amber-100 text-amber-700',
    3: 'bg-red-100 text-red-700',
  };

  return (
    <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm" data-testid="phrase-program-card">
      <div className="flex items-start justify-between gap-3">
        <Link href={`/dashboard/phrases/${program.id}`} className="min-w-0 flex-1 group">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-gray-900 truncate group-hover:text-emerald-700 transition-colors">{program.title}</h3>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${DIFFICULTY_COLORS[program.difficulty] ?? 'bg-gray-100 text-gray-500'}`}>
              {DIFFICULTY_LABELS[program.difficulty] ?? ''}
            </span>
          </div>
          {program.description && (
            <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{program.description}</p>
          )}
          <p className="text-xs text-gray-400 mt-1">{program.phrase_count} фраз</p>
        </Link>

        <button
          onClick={onEnroll}
          disabled={enrolling || limitReached}
          data-testid="enroll-button"
          className="shrink-0 px-4 py-2 rounded-xl text-sm font-medium bg-gray-100 text-gray-700 hover:bg-emerald-50 hover:text-emerald-700 transition-colors disabled:opacity-50"
        >
          {enrolling ? '...' : 'Добавить'}
        </button>
      </div>
    </div>
  );
}
