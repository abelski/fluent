'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  BACKEND_URL,
  getToken,
  getPhrasePrograms,
  unenrollPhraseProgram,
  getMyPhraseLists,
  createMyPhraseList,
  deleteMyPhraseList,
  type PhraseProgramSummary,
  type PhraseListSummary,
} from '../../../lib/api';
import { useT } from '../../../lib/useT';
import { getPhraseStarLevel, setPhraseStarLevel } from '../../../lib/starLevel';
import ProgressStatCard from '../components/ProgressStatCard';
import QuotaBanner from '../components/QuotaBanner';

interface Quota {
  premium_active: boolean;
  premium_until: string | null;
  sessions_today: number;
  daily_limit: number | null;
  is_admin?: boolean;
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

// Milestone thresholds for the phrases progress track (analogous to CEFR thresholds for words)
const PHRASE_MILESTONES = [0, 50, 100, 250, 500, 1000];

function getPhraseMilestoneProgress(learned: number) {
  for (let i = 1; i < PHRASE_MILESTONES.length; i++) {
    if (learned < PHRASE_MILESTONES[i]) {
      const prev = PHRASE_MILESTONES[i - 1];
      const next = PHRASE_MILESTONES[i];
      return { next, pct: Math.round(((learned - prev) / (next - prev)) * 100) };
    }
  }
  return { next: null as number | null, pct: 100 };
}

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
  const { tr, plural } = useT();
  const t = tr.phraseLists;
  const listDifficultyLabels: Record<number, string> = { 1: t.easy, 2: t.medium, 3: t.hard };
  const [programs, setPrograms] = useState<PhraseProgramSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [quota, setQuota] = useState<Quota | null>(null);
  const [myLists, setMyLists] = useState<PhraseListSummary[]>([]);
  const [openMyLists, setOpenMyLists] = useState(true);
  const [phraseStarLevel, setPhraseStarLevelState] = useState<number>(1);

  // Read phrase star level from cookie on mount
  useEffect(() => {
    setPhraseStarLevelState(getPhraseStarLevel());
  }, []);

  function handlePhraseStarLevel(level: number) {
    setPhraseStarLevel(level);
    setPhraseStarLevelState(level);
  }
  const [showCreate, setShowCreate] = useState(false);
  const [newListTitle, setNewListTitle] = useState('');
  const [creating, setCreating] = useState(false);
  const [confirmDeleteList, setConfirmDeleteList] = useState<number | null>(null);
  const [confirmUnenroll, setConfirmUnenroll] = useState<number | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState<boolean | null>(null);
  const [phraseStats, setPhraseStats] = useState<{ learned: number; due: number } | null>(null);
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
          setPhraseStats({ learned: data.phrases_learned ?? 0, due: data.phrases_due_review ?? 0 });
        }
      })
      .catch(console.error);

    getMyPhraseLists().then(setMyLists).catch(console.error);
  }, []);

  async function handleCreateList() {
    const title = newListTitle.trim();
    if (!title) return;
    setCreating(true);
    try {
      const { id } = await createMyPhraseList({ title, difficulty: 1 });
      router.push(`/dashboard/phrases/lists/${id}/edit`);
    } catch (e) {
      console.error(e);
      setCreating(false);
    }
  }

  async function handleDeleteList(listId: number) {
    try {
      await deleteMyPhraseList(listId);
      setMyLists((prev) => prev.filter((l) => l.id !== listId));
    } catch (e) {
      console.error(e);
    } finally {
      setConfirmDeleteList(null);
    }
  }

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

  async function handleUnenroll(programId: number) {
    try {
      await unenrollPhraseProgram(programId);
      setPrograms((prev) =>
        prev.map((p) => (p.id === programId ? { ...p, enrolled: false, stage_distribution: null } : p))
      );
      setOpenPrograms((prev) => { const n = new Set(prev); n.delete(programId); return n; });
    } catch (e) {
      console.error(e);
    } finally {
      setConfirmUnenroll(null);
    }
  }

  const limitReached = quota && !quota.premium_active && quota.daily_limit !== null && quota.sessions_today >= quota.daily_limit;
  const eligible = !!quota && (quota.premium_active || quota.is_admin === true);

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
        <p className="text-gray-600 mb-4">{t.loginPrompt}</p>
        <Link href="/login" className="bg-emerald-600 text-white px-5 py-2.5 rounded-xl text-sm font-medium hover:bg-emerald-700 transition-colors">
          {t.login}
        </Link>
      </main>
    );
  }

  const enrolledPrograms = programs.filter((p) => p.enrolled);

  return (
    <main className="min-h-screen bg-[#F5F5F7] text-gray-900 flex flex-col items-center px-4 py-10" data-testid="phrases-page">
      <div className="pointer-events-none fixed inset-0 flex items-start justify-center overflow-hidden">
        <div className="w-full max-w-[600px] h-[400px] bg-emerald-100/40 blur-[120px] rounded-full mt-[-100px]" />
      </div>

      <div className="relative z-10 w-full max-w-4xl">
        {/* Phrases stats card */}
        {phraseStats && (() => {
          const m = getPhraseMilestoneProgress(phraseStats.learned);
          return (
            <div className="mb-10">
              <ProgressStatCard
                theme="purple"
                icon="💬"
                count={phraseStats.learned}
                label={t.learnedLabel}
                nextMilestone={m.next !== null ? String(m.next) : null}
                milestone={{
                  pct: m.pct,
                  caption: m.next !== null
                    ? t.milestoneCaption
                        .replace('{count}', String(phraseStats.learned))
                        .replace('{target}', String(m.next))
                    : null,
                }}
                primaryAction={{ href: '/dashboard/phrases/review', label: t.reviewPhrases }}
                secondaryAction={{ href: '/dashboard/phrases/vocabulary', label: t.allPhrases }}
                due={{
                  count: phraseStats.due,
                  total: phraseStats.learned,
                  caption: t.needRefresh
                    .replace('{due}', String(phraseStats.due))
                    .replace('{total}', String(phraseStats.learned)),
                }}
                testId="stats-card-phrases"
              />
            </div>
          );
        })()}

        <QuotaBanner quota={quota} />

        <h1 className="text-3xl font-bold mb-1">{t.pageTitle}</h1>
        <p className="text-gray-400 mb-8">{t.pageSubtitle}</p>

        {/* Мои списки — a program-style container holding the user's lists as chapter-like cards */}
        <section className="mb-8" data-testid="my-lists-section">
          <div className="bg-white border border-emerald-200 rounded-2xl overflow-hidden shadow-sm">
            {/* Program header */}
            <div className="w-full flex items-center justify-between px-5 py-4">
              <button
                onClick={() => setOpenMyLists((o) => !o)}
                aria-expanded={openMyLists}
                className="flex items-center gap-3 flex-wrap text-left cursor-pointer"
              >
                <span className="font-semibold text-gray-900">{t.myLists}</span>
                {myLists.length > 0 && (
                  <span className="text-gray-400 text-sm">
                    {myLists.reduce((s, l) => s + l.phrase_count, 0)} {plural(myLists.reduce((s, l) => s + l.phrase_count, 0), t.phrasesPlural)}
                  </span>
                )}
              </button>
              <div className="flex items-center gap-3 shrink-0">
                {eligible && (
                  <button
                    onClick={() => { setNewListTitle(''); setShowCreate(true); }}
                    data-testid="create-list-button"
                    className="text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 px-3 py-1.5 rounded-full transition-colors"
                  >
                    {t.createList}
                  </button>
                )}
                <button onClick={() => setOpenMyLists((o) => !o)} aria-label="toggle" className="p-1 cursor-pointer">
                  <svg width="14" height="14" viewBox="0 0 12 12" fill="currentColor" className={`text-gray-400 transition-transform duration-200 ${openMyLists ? 'rotate-180' : ''}`}>
                    <path d="M6 8L1 3h10L6 8z" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Program body */}
            {openMyLists && (
              <div className="px-5 py-4 border-t border-gray-100">
                {myLists.length > 0 && (
                  <div className="flex items-center gap-2 mb-4" data-testid="phrase-star-selector">
                    <span className="text-sm text-gray-400">{tr.lists.starSelectorLabel}</span>
                    {[1, 2, 3].map((level) => (
                      <button
                        key={level}
                        onClick={() => handlePhraseStarLevel(level)}
                        className={`px-3 py-1 rounded-full text-sm border transition-colors ${
                          phraseStarLevel === level
                            ? 'bg-gray-900 text-white border-gray-900'
                            : 'bg-white text-gray-500 border-gray-300 hover:border-gray-900'
                        }`}
                      >
                        {'★'.repeat(level)}
                      </button>
                    ))}
                  </div>
                )}
                {myLists.length === 0 ? (
                  !eligible ? (
                    <div className="relative rounded-2xl bg-gradient-to-br from-amber-50 to-white border border-amber-100 overflow-hidden p-5">
                      <div className="flex items-start gap-3">
                        <div className="flex-shrink-0 w-11 h-11 rounded-xl bg-amber-100 flex items-center justify-center text-xl">⭐️</div>
                        <div>
                          <p className="font-semibold text-gray-900">{t.upsellTitle}</p>
                          <p className="text-sm text-gray-500 mt-1">{t.upsellBody}</p>
                          <Link href="/pricing" className="inline-block mt-3 text-xs font-medium bg-amber-500 hover:bg-amber-600 text-white px-3 py-1.5 rounded-full transition-colors">
                            {t.upsellCta}
                          </Link>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-dashed border-gray-200 p-6 text-center">
                      <p className="text-sm text-gray-500 mb-3">{t.noLists}</p>
                      <button
                        onClick={() => { setNewListTitle(''); setShowCreate(true); }}
                        className="text-sm font-semibold text-emerald-600 hover:text-emerald-700"
                      >
                        {t.createFirst}
                      </button>
                    </div>
                  )
                ) : (
                  <div className="grid gap-4 sm:grid-cols-2">
                    {myLists.map((lst) => {
                      const dist = lst.stage_distribution;
                      const total = lst.phrase_count;
                      const mastered = dist?.stage2 ?? 0;
                      const learning = dist?.stage1 ?? 0;
                      const masteredPct = total > 0 ? (mastered / total) * 100 : 0;
                      const learningPct = total > 0 ? (learning / total) * 100 : 0;
                      const isDone = total > 0 && mastered >= total;
                      return (
                        <div
                          key={lst.id}
                          className={`relative bg-gray-50 border border-gray-100 rounded-2xl p-5 flex flex-col gap-4 ${eligible ? '' : 'opacity-70'}`}
                          data-testid="my-list-card"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-2 flex-wrap pr-2">
                              <h3 className="text-base font-semibold">{lst.title}</h3>
                              {lst.star_min != null && lst.star_max != null && (
                                <span
                                  className="text-xs font-semibold px-2 py-0.5 rounded-full border bg-amber-50 text-amber-600 border-amber-200 whitespace-nowrap"
                                  data-testid="list-star-badge"
                                >
                                  {lst.star_min === lst.star_max
                                    ? '★'.repeat(lst.star_max)
                                    : `${'★'.repeat(lst.star_min)}–${'★'.repeat(lst.star_max)}`}
                                </span>
                              )}
                              {isDone && (
                                <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-emerald-500 text-white tracking-wide">✓ Done</span>
                              )}
                            </div>
                            <button
                              onClick={() => setConfirmDeleteList(lst.id)}
                              title={t.deleteList}
                              className="text-gray-300 hover:text-red-500 transition-colors p-1 rounded shrink-0"
                            >
                              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M2 4h12M5 4V2h6v2M6 7v5M10 7v5M3 4l1 9a1 1 0 001 1h6a1 1 0 001-1l1-9" />
                              </svg>
                            </button>
                          </div>

                          {total > 0 && (
                            <div className="flex flex-col gap-1.5">
                              <div className="w-full h-1.5 bg-gray-200 rounded-full overflow-hidden flex">
                                <div className="h-full bg-emerald-500 transition-all duration-500" style={{ width: `${masteredPct}%` }} />
                                <div className="h-full bg-amber-400 transition-all duration-500" style={{ width: `${learningPct}%` }} />
                              </div>
                              <p className="text-gray-400 text-xs">
                                {mastered} / {total} {t.masteredWord}
                                {learning > 0 && <span className="text-amber-500 ml-1">· {learning} {t.learningWord}</span>}
                              </p>
                            </div>
                          )}

                          <div className="flex items-center justify-between mt-auto">
                            <span className="text-gray-400 text-sm">{lst.phrase_count} {plural(lst.phrase_count, t.phrasesPlural)}</span>
                            <div className="flex gap-2">
                              {eligible ? (
                                <>
                                  <Link
                                    href={`/dashboard/phrases/lists/${lst.id}/edit`}
                                    className="px-4 py-2.5 text-sm text-gray-500 hover:text-gray-900 border border-gray-200 rounded-full transition-colors"
                                  >
                                    {t.edit}
                                  </Link>
                                  {lst.phrase_count > 0 && (
                                    <Link
                                      href={`/dashboard/phrases/lists/${lst.id}/study`}
                                      className="px-4 py-2.5 text-sm rounded-full font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm shadow-emerald-600/20 transition-colors"
                                    >
                                      {t.study}
                                    </Link>
                                  )}
                                </>
                              ) : (
                                <Link
                                  href="/pricing"
                                  data-testid="premium-locked"
                                  className="px-4 py-2.5 text-sm rounded-full font-semibold bg-amber-100 text-amber-700 border border-amber-200 hover:bg-amber-200 transition-colors"
                                >
                                  {t.premiumOnly}
                                </Link>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </section>

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
                      <span className="text-gray-400 text-sm">{program.phrase_count} {plural(program.phrase_count, t.phrasesPlural)}</span>
                      {listDifficultyLabels[program.difficulty] && (
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${DIFFICULTY_BADGE[program.difficulty]}`}>
                          {listDifficultyLabels[program.difficulty]}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setConfirmUnenroll(program.id); }}
                        title={t.removeProgram}
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
                              ? (ch.title ?? t.chapter.replace('{n}', String(ch.num)))
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
                                    {ch.mastered} / {ch.total} {t.masteredWord}
                                    {ch.learning > 0 && <span className="text-amber-500 ml-1">· {ch.learning} {t.learningWord}</span>}
                                  </p>
                                </div>
                                <div className="flex items-center justify-between mt-auto">
                                  <span className="text-gray-400 text-sm">{ch.total} {plural(ch.total, t.phrasesPlural)}</span>
                                  <div className="flex gap-2">
                                    <Link
                                      href={`/dashboard/phrases/${program.id}`}
                                      className="px-4 py-2.5 text-sm text-gray-500 hover:text-gray-900 border border-gray-200 rounded-full transition-colors"
                                    >
                                      {t.browse}
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
                                      {t.study}
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

        {enrolledPrograms.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
            <p className="text-gray-500 text-lg">{t.noPrograms}</p>
            <Link
              href="/phrase-programs"
              className="px-6 py-3 bg-emerald-600 text-white text-sm font-semibold rounded-full hover:bg-emerald-700 transition-colors shadow-sm shadow-emerald-600/20"
            >
              {t.seeAllPrograms}
            </Link>
          </div>
        )}

        {enrolledPrograms.length > 0 && (
          <div className="mt-6 text-center">
            <Link
              href="/phrase-programs"
              className="text-sm text-emerald-600 hover:text-emerald-700 transition-colors"
            >
              {t.seeAllProgramsArrow}
            </Link>
          </div>
        )}
      </div>

      {/* Create list dialog */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center px-4" onClick={() => !creating && setShowCreate(false)}>
          <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold text-gray-900 mb-3">{t.newList}</h3>
            <input
              autoFocus
              value={newListTitle}
              onChange={(e) => setNewListTitle(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleCreateList(); }}
              placeholder={t.listName}
              data-testid="new-list-title"
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-emerald-200"
            />
            <div className="flex gap-3 justify-end">
              <button onClick={() => setShowCreate(false)} disabled={creating} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 border border-gray-200 rounded-full transition-colors">
                {t.cancel}
              </button>
              <button onClick={handleCreateList} disabled={creating || !newListTitle.trim()} data-testid="confirm-create-list" className="px-4 py-2 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-full transition-colors disabled:opacity-40">
                {creating ? t.creating : t.create}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete list confirm dialog */}
      {confirmDeleteList !== null && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center px-4" onClick={() => setConfirmDeleteList(null)}>
          <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold text-gray-900 mb-2">{t.deleteListTitle}</h3>
            <p className="text-sm text-gray-500 mb-5">{t.deleteListBody}</p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setConfirmDeleteList(null)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 border border-gray-200 rounded-full transition-colors">
                {t.cancel}
              </button>
              <button onClick={() => handleDeleteList(confirmDeleteList)} className="px-4 py-2 text-sm font-semibold text-white bg-red-500 hover:bg-red-600 rounded-full transition-colors">
                {t.delete}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Unenroll confirm dialog */}
      {confirmUnenroll !== null && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center px-4" onClick={() => setConfirmUnenroll(null)}>
          <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold text-gray-900 mb-2">{t.removeProgramTitle}</h3>
            <p className="text-sm text-gray-500 mb-5">{t.removeProgramBody}</p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setConfirmUnenroll(null)}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 border border-gray-200 rounded-full transition-colors"
              >
                {t.cancel}
              </button>
              <button
                onClick={() => handleUnenroll(confirmUnenroll)}
                className="px-4 py-2 text-sm font-semibold text-white bg-red-500 hover:bg-red-600 rounded-full transition-colors"
              >
                {t.remove}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
