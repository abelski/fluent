'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { BACKEND_URL, getToken, getGrammarPrograms, unenrollGrammarProgram, saveGrammarLessonResult, type GrammarProgramSummary } from '../../../lib/api';
import { useT } from '../../../lib/useT';
import PageMascot from '../../../components/PageMascot';
import TakChevron from '../../../components/TakChevron';
import { MOOD_NEUTRAL } from '../../../lib/mascotMood';
import ProgressStatCard from '../components/ProgressStatCard';
import PageShell from '../components/PageShell';
// The exercise screen itself lives in GrammarTaskRunner so the combined
// continue-session can reuse it; this page keeps the lesson list and done screen.
import GrammarTaskRunner, { type GrammarRule, type Task, type VerbHint } from '../components/GrammarTaskRunner';

interface Lesson {
  id: number;
  title: string;
  level: 'basic' | 'advanced' | 'practice';
  cases?: number[];          // noun lessons only
  tense_key?: string;        // verb lessons only
  task_count: number;
  rules?: GrammarRule[];
  hint?: VerbHint;           // verb conjugation lessons only
  is_locked: boolean;
  best_score_pct: number | null;
  status?: string;
}

const LEVEL_STYLES: Record<string, string> = {
  basic: 'bg-teal-50 border-line text-teal-600',
  advanced: 'bg-emerald-50 border-line text-emerald-600',
  practice: 'bg-amber-50 border-line text-amber-600',
};


function GrammarStatsBar({ lessons }: { lessons: Lesson[] }) {
  const { tr } = useT();
  const total = lessons.length;
  const passed = lessons.filter((l) => l.best_score_pct !== null && l.best_score_pct !== undefined && l.best_score_pct > 0.75).length;
  const pct = total > 0 ? Math.round((passed / total) * 100) : 0;

  if (total === 0) return null;

  const remaining = total - passed;

  return (
    <div className="mb-10">
      <ProgressStatCard
        theme="emerald"
        icon={<PageMascot phrase="Sveikas!" className="shrink-0" />}
        count={passed}
        label={tr.grammar.statsPassed}
        countBadge={`${tr.grammar.statsOf} ${total}`}
        milestone={{
          pct,
          caption: remaining > 0 ? tr.grammar.tipBody.replace('{count}', String(remaining)) : tr.grammar.tipBodyDone,
        }}
        testId="stats-card-grammar"
      />
    </div>
  );
}

function SubcategoryGroup({
  group,
  onStartLesson,
}: {
  group: { title: string; lessons: Lesson[] };
  onStartLesson: (lesson: Lesson) => void;
}) {
  const { tr, plural, lang } = useT();
  const [open, setOpen] = useState(false);

  const passedCount = group.lessons.filter(
    (l) => l.best_score_pct !== null && l.best_score_pct !== undefined && l.best_score_pct > 0.75
  ).length;
  const total = group.lessons.length;
  const complete = total > 0 && passedCount === total;

  return (
    <div>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        data-testid="subcategory-toggle"
        className={`w-full flex items-center justify-between px-6 py-4 bg-white hover:bg-[#fafbfa] transition-colors text-left relative border-l-[3px] ${
          complete ? 'border-l-emerald-600' : 'border-l-transparent'
        }`}
      >
        <div className="flex items-center gap-2 flex-wrap">
          <span role="heading" aria-level={3} className="text-[14.5px] font-semibold text-ink">{group.title}</span>
          {(() => {
            const rule = group.lessons[0]?.rules?.find((r) => r.article_slug);
            if (!rule?.article_slug) return null;
            const title = (lang === 'ru' ? rule.article_title_ru : rule.article_title_en) || 'Статья';
            return (
              <a
                href={`/dashboard/articles/${rule.article_slug}`}
                onClick={(e) => e.stopPropagation()}
                className="inline-flex items-center gap-1 text-[13px] text-emerald-600 hover:text-emerald-700 ml-2"
              >
                <span aria-hidden="true">↗</span>
                {title}
              </a>
            );
          })()}
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-[13.5px] ${complete ? 'text-emerald-600' : 'text-faint'}`}>
            {passedCount > 0 ? `${passedCount}/${total}` : total}{' '}
            {plural(total, tr.grammar.levelsCount)}
            <span
              aria-hidden="true"
              className={`ml-1 inline-block transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
            >
              ▾
            </span>
          </span>
        </div>
      </button>
      {open && (
        <div className="px-5 py-4 bg-white">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {group.lessons.map((lesson) => {
              const locked = lesson.is_locked ?? false;
              const scorePct = lesson.best_score_pct;
              return (
                <button
                  key={lesson.id}
                  onClick={() => !locked && onStartLesson(lesson)}
                  disabled={locked}
                  data-testid={locked ? 'lesson-locked' : undefined}
                  className={`bg-gray-50 border rounded-2xl p-5 text-left flex flex-col gap-3 transition-colors ${
                    locked
                      ? 'border-line opacity-40 cursor-not-allowed'
                      : 'border-line hover:bg-white cursor-pointer'
                  }`}
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    {locked && (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" className="text-gray-400 shrink-0">
                        <path d="M18 8h-1V6A5 5 0 007 6v2H6a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V10a2 2 0 00-2-2zm-6 9a2 2 0 110-4 2 2 0 010 4zm3.1-9H8.9V6a3.1 3.1 0 016.2 0v2z"/>
                      </svg>
                    )}
                    <span className={`text-xs px-2 py-0.5 rounded-full border ${LEVEL_STYLES[lesson.level] ?? ''}`}>
                      {tr.grammar.levels[lesson.level] ?? lesson.level}
                    </span>
                    {lesson.status && lesson.status !== 'published' && (
                      <span className="text-[10px] font-semibold uppercase tracking-wide bg-amber-50 text-amber-600 border border-amber-200 rounded px-1.5 py-px leading-tight">
                        {lesson.status === 'draft' ? tr.grammar.lessonStatusDraft : tr.grammar.lessonStatusTesting}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="text-gray-400 text-xs">{lesson.task_count} {plural(lesson.task_count, tr.grammar.tasksCount)}</div>
                    {scorePct !== null && scorePct !== undefined && (
                      <div className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                        scorePct > 0.75
                          ? 'bg-emerald-50 text-emerald-600'
                          : 'bg-amber-50 text-amber-600'
                      }`}>
                        {Math.round(scorePct * 100)}%
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// Maps case index → group name using the grammar config endpoint.
// Cached in module scope so we only fetch once per page load.
let _caseGroupCache: Record<number, string> | null = null;
async function getCaseGroups(): Promise<Record<number, string>> {
  if (_caseGroupCache) return _caseGroupCache;
  try {
    const r = await fetch(`${BACKEND_URL}/api/admin/grammar/config`);
    if (!r.ok) return {};
    const data = await r.json();
    const map: Record<number, string> = {};
    for (const [k, v] of Object.entries(data.cases as Record<string, [string, string]>)) {
      map[Number(k)] = v[1]; // v[1] is the group name
    }
    _caseGroupCache = map;
    return map;
  } catch {
    return {};
  }
}

function filterLessonsForProgram(
  lessons: Lesson[],
  lessonFilter: string | null,
  caseGroups: Record<number, string>,
  programType: string,
): Lesson[] {
  // Verb programs only show verb lessons (id >= 200); noun programs show noun lessons
  const isVerbProgram = programType === 'verbs' || programType === 'verb_cases';
  const filtered = lessons.filter(l => isVerbProgram ? l.id >= 200 : l.id < 200);
  if (!lessonFilter || isVerbProgram) return filtered;
  let groups: string[];
  try { groups = JSON.parse(lessonFilter); } catch { return filtered; }
  const groupSet = new Set(groups);
  return filtered.filter(l => (l.cases ?? []).every(c => groupSet.has(caseGroups[c] ?? '')));
}

export default function GrammarPage() {
  const { tr, plural, lang } = useT();
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [caseGroups, setCaseGroups] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(true);
  const [openCategories, setOpenCategories] = useState<Set<string>>(new Set());
  const [programs, setPrograms] = useState<GrammarProgramSummary[]>([]);
  const [programsLoading, setProgramsLoading] = useState(true);
  const [unenrolling, setUnenrolling] = useState(false);

  function toggleCategory(key: string) {
    setOpenCategories((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  // Exercise state — the run itself lives in GrammarTaskRunner; the page only keeps
  // what its own done screen needs (final score and TAK's final mood).
  const [activeLesson, setActiveLesson] = useState<Lesson | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [correct, setCorrect] = useState(0);
  const [mood, setMood] = useState(MOOD_NEUTRAL);
  const [done, setDone] = useState(false);
  const [exerciseLoading, setExerciseLoading] = useState(false);

  const fetchLessons = useCallback(() => {
    const token = getToken();
    const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {};
    Promise.all([
      fetch(`${BACKEND_URL}/api/grammar/lessons`, { headers }).then(r => r.json()),
      getCaseGroups(),
      fetch(`${BACKEND_URL}/api/grammar/verb-lessons?program_type=verbs`, { headers }).then(r => r.json()).catch(() => []),
      fetch(`${BACKEND_URL}/api/grammar/verb-lessons?program_type=verb_cases`, { headers }).then(r => r.json()).catch(() => []),
    ])
      .then(([data, groups, verbLessons, verbCaseLessons]) => {
        const nounLessons: Lesson[] = Array.isArray(data) ? data : [];
        const allVerbLessons: Lesson[] = [
          ...(Array.isArray(verbLessons) ? verbLessons : []),
          ...(Array.isArray(verbCaseLessons) ? verbCaseLessons : []),
        ];
        setLessons([...nounLessons, ...allVerbLessons]);
        setCaseGroups(groups);
      })
      .catch((err) => console.error('API error:', err))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchLessons();
  }, [fetchLessons]);

  useEffect(() => {
    getGrammarPrograms()
      .then(ps => {
        setPrograms(ps);
        // Open all enrolled programs by default
        const enrolled = ps.filter(p => p.enrolled);
        if (enrolled.length > 0) {
          setOpenCategories(new Set(enrolled.map(p => `program-${p.id}`)));
        }
      })
      .catch(console.error)
      .finally(() => setProgramsLoading(false));
  }, []);

  async function handleUnenroll(programId: number) {
    setUnenrolling(true);
    try {
      await unenrollGrammarProgram(programId);
      setPrograms((prev) => prev.map((p) => p.id === programId ? { ...p, enrolled: false } : p));
    } catch (e) {
      console.error(e);
    } finally {
      setUnenrolling(false);
    }
  }

  function isVerbLesson(lessonId: number) { return lessonId >= 200; }

  function postResult(lessonId: number, score: number, total: number) {
    saveGrammarLessonResult(lessonId, score, total)
      .then((saved) => { if (saved) fetchLessons(); })
      .catch((err) => console.error('API error:', err));
  }

  function startLesson(lesson: Lesson) {
    setExerciseLoading(true);
    setActiveLesson(lesson);
    setCorrect(0);
    setMood(MOOD_NEUTRAL);
    setDone(false);

    const base = isVerbLesson(lesson.id) ? 'verb-lessons' : 'lessons';
    fetch(`${BACKEND_URL}/api/grammar/${base}/${lesson.id}/tasks`)
      .then((r) => r.json())
      .then((data: Task[]) => {
        setTasks(Array.isArray(data) ? data : []);
      })
      .catch(() => setTasks([]))
      .finally(() => setExerciseLoading(false));
  }

  function resetToLessons() {
    setActiveLesson(null);
    setTasks([]);
    setDone(false);
  }

  // ── Lesson list ────────────────────────────────────────────────────────────
  if (activeLesson === null) {
    const enrolledPrograms = programs.filter((p) => p.enrolled);
    const isEnrolled = enrolledPrograms.length > 0;

    return (
      <PageShell>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-[32px] font-bold mb-1.5">{tr.grammar.title}</h1>
              <p className="text-[15px] text-muted mb-4">{tr.grammar.subtitle}</p>
            </div>
            {/* The mascot lives in the hero card once it renders (enrolled state);
                loading/empty states have no hero, so it stays beside the title
                to keep exactly one mascot on screen at all times. */}
            {(programsLoading || !isEnrolled) && (
              <PageMascot phrase="Mokomės!" className="hidden sm:block shrink-0" />
            )}
          </div>
          <div className="mb-6 rounded-xl px-5 py-4 bg-[#fdf6e3] border border-[#f0e0a8] text-[#8a6d1d] text-[13.5px] leading-[1.5]">
            {tr.grammar.betaNotice}
          </div>

          {programsLoading ? (
            <div className="flex justify-center py-20">
              <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : !isEnrolled ? (
            <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
              <p className="text-gray-500">{tr.grammar.emptyState}</p>
              <Link
                href="/dashboard/grammar/programs"
                className="px-6 py-3 bg-gray-900 hover:bg-gray-800 text-white rounded-xl font-medium transition-colors"
                data-testid="browse-programs-link"
              >
                {tr.grammar.browsePrograms}
              </Link>
            </div>
          ) : (
            <>
              <GrammarStatsBar lessons={lessons} />

              {enrolledPrograms.map((program) => {
                const programLessons = filterLessonsForProgram(lessons, program.lesson_filter ?? null, caseGroups, program.program_type ?? 'cases');
                const catKey = `program-${program.id}`;
                const isOpen = openCategories.has(catKey);

                const subcategoryGroups: { title: string; lessons: Lesson[] }[] = [];
                for (const lesson of programLessons) {
                  const last = subcategoryGroups[subcategoryGroups.length - 1];
                  if (last && last.title === lesson.title) {
                    last.lessons.push(lesson);
                  } else {
                    subcategoryGroups.push({ title: lesson.title, lessons: [lesson] });
                  }
                }

                return (
                  <div key={program.id} className="mb-4">
                    <div
                      className="border border-line rounded-[14px] overflow-hidden bg-white"
                      data-testid={`category-${catKey}`}
                    >
                      <button
                        onClick={() => toggleCategory(catKey)}
                        aria-expanded={isOpen}
                        data-testid={`category-toggle-${catKey}`}
                        className="w-full flex items-center justify-between px-6 py-[18px] bg-white cursor-pointer transition-colors text-left border-b border-line-strong"
                      >
                        <div className="flex items-baseline gap-2.5">
                          <span role="heading" aria-level={2} className="font-bold text-base text-gray-900">{(lang === 'en' && program.title_en) ? program.title_en : program.title}</span>
                          {loading ? null : (
                            <span className="text-faint text-[13px]">{programLessons.length} {plural(programLessons.length, tr.grammar.lessonsCount)}</span>
                          )}
                        </div>
                        <div className="flex items-center gap-3">
                          <button
                            onClick={(e) => { e.stopPropagation(); handleUnenroll(program.id); }}
                            disabled={unenrolling}
                            className="text-[13px] text-destructive hover:opacity-70 transition-opacity disabled:opacity-50"
                            data-testid="unenroll-button"
                          >
                            {tr.grammar.unenrollBtn}
                          </button>
                          <svg
                            width="14" height="14" viewBox="0 0 12 12" fill="currentColor"
                            className={`text-gray-400 transition-transform duration-200 shrink-0 ${isOpen ? 'rotate-180' : ''}`}
                          >
                            <path d="M6 8L1 3h10L6 8z" />
                          </svg>
                        </div>
                      </button>

                      {isOpen && (
                        <div className="divide-y divide-line border-t border-line">
                          {loading ? (
                            <div className="flex justify-center py-10">
                              <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                            </div>
                          ) : subcategoryGroups.length === 0 ? (
                            <p className="text-gray-400 text-sm py-8 text-center">{tr.grammar.noLessons}</p>
                          ) : (
                            subcategoryGroups.map((group, gi) => (
                              <SubcategoryGroup key={`${group.title}-${gi}`} group={group} onStartLesson={startLesson} />
                            ))
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}

              <div className="mt-4 text-center">
                <Link
                  href="/dashboard/grammar/programs"
                  className="text-sm text-emerald-600 hover:text-emerald-700 transition-colors"
                >
                  {tr.grammar.browseProgramsLink} <TakChevron size={10} className="inline-block align-[-1px]" />
                </Link>
              </div>
            </>
          )}
      </PageShell>
    );
  }

  // ── Done screen ────────────────────────────────────────────────────────────
  if (done) {
    const total = tasks.length;
    const errors = total - correct;
    const scorePct = total > 0 ? correct / total : 0;
    const passed = scorePct > 0.75;

    const currentIdx = lessons.findIndex((l) => l.id === activeLesson.id);
    const nextLesson =
      currentIdx >= 0 && currentIdx + 1 < lessons.length ? lessons[currentIdx + 1] : null;

    return (
      <main className="min-h-screen text-gray-900 flex flex-col items-center justify-center px-6">
        <div className="relative z-10 text-center max-w-sm w-full">
          <div className="flex justify-center mb-6">
            <PageMascot phrase="Valio!" mood={passed ? Math.max(mood, 1) : mood} />
          </div>
          <h1 className="font-headline text-2xl font-bold mb-2">{tr.grammar.lessonDone}</h1>

          {/* Pass/fail banner */}
          {passed ? (
            <div className="flex items-center justify-center gap-2 mb-4 bg-emerald-50 border border-line rounded-xl px-4 py-2">
              <span className="text-emerald-600 text-sm font-semibold">{tr.grammar.passed}</span>
            </div>
          ) : (
            <div className="flex flex-col gap-1 mb-4 bg-amber-50 border border-line rounded-xl px-4 py-3">
              <span className="text-amber-600 text-sm font-semibold">{tr.grammar.failedScore}</span>
              <span className="text-gray-500 text-xs">{tr.grammar.failedHint}</span>
            </div>
          )}

          <p className="text-gray-400 mb-8">
            {tr.common.correctOf.replace('{correct}', String(correct)).replace('{total}', String(total))} · <span className={passed ? 'text-emerald-600' : 'text-amber-600'}>{Math.round(scorePct * 100)}%</span>
          </p>

          <div className="flex gap-4 justify-center mb-10">
            <div className="bg-white border border-line rounded-2xl px-6 sm:px-8 py-5 text-center">
              <div className="text-2xl sm:text-3xl font-bold text-emerald-600">{correct}</div>
              <div className="text-gray-400 text-sm mt-1">{tr.common.correctLabel}</div>
            </div>
            <div className="bg-white border border-line rounded-2xl px-6 sm:px-8 py-5 text-center">
              <div className="text-2xl sm:text-3xl font-bold text-amber-600">{errors}</div>
              <div className="text-gray-400 text-sm mt-1">{tr.common.errorsLabel}</div>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            {passed && nextLesson && (
              <button
                onClick={() => startLesson(nextLesson)}
                className="w-full py-3 bg-gray-900 hover:bg-gray-800 rounded-xl font-medium text-white transition-colors"
              >
                {tr.grammar.nextLesson} <TakChevron size={10} className="inline-block align-[-1px]" />
              </button>
            )}
            <button
              onClick={() => startLesson(activeLesson)}
              className={`w-full py-3 rounded-xl font-medium transition-colors ${
                passed
                  ? 'bg-gray-100 hover:bg-gray-100 text-gray-600'
                  : 'bg-emerald-600 hover:bg-emerald-500'
              }`}
            >
              {tr.common.repeat}
            </button>
            <button
              onClick={resetToLessons}
              className="w-full py-3 text-gray-400 hover:text-gray-900 text-sm transition-colors"
            >
              <TakChevron direction="left" size={10} className="inline-block align-[-1px] mr-1" />{tr.grammar.backToLessons}
            </button>
          </div>
        </div>
      </main>
    );
  }

  // ── Exercise screen ────────────────────────────────────────────────────────
  if (exerciseLoading || tasks.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <GrammarTaskRunner
      tasks={tasks}
      level={activeLesson.level}
      rules={activeLesson.rules}
      hint={activeLesson.hint}
      onExit={resetToLessons}
      onFinish={(score, total, finalMood) => {
        postResult(activeLesson.id, score, total);
        setCorrect(score);
        setMood(finalMood);
        setDone(true);
      }}
    />
  );
}
