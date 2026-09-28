'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { BACKEND_URL, getToken, getGrammarPrograms, enrollGrammarProgram, unenrollGrammarProgram, saveGrammarLessonResult, type GrammarProgramSummary } from '../../../lib/api';
import { useT } from '../../../lib/useT';
import PageMascot from '../../../components/PageMascot';
import TakChevron from '../../../components/TakChevron';
import { MOOD_NEUTRAL } from '../../../lib/mascotMood';
import PageShell from '../components/PageShell';
// The exercise screen itself lives in GrammarTaskRunner so the combined
// continue-session can reuse it; this page keeps the lesson list and done screen.
import GrammarTaskRunner, { type Task } from '../components/GrammarTaskRunner';
// #53 — the lesson list's hero / chips / bento / topic cards.
import {
  GrammarHero, ProgramChips, FeaturedCard, ProgramStack, TopicsSection,
  featuredFor, isPassed, programTitle, type Lesson, type LessonsByProgram,
} from '../components/GrammarOverview';

// «Напомни что я мог забыть» (#26) — a pseudo-lesson through the same startLesson
// flow. id=0 is the sentinel REMIND_LESSON_ID used server-side for the saved
// result; it never matches a real lesson id, so it can't collide with `lessons`.
const REMIND_LESSON: Lesson = {
  id: 0,
  title: '',
  level: 'practice',
  task_count: 10,
  is_locked: false,
  best_score_pct: null,
};

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
  const { tr, lang } = useT();
  const router = useRouter();
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [caseGroups, setCaseGroups] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(true);
  const [programs, setPrograms] = useState<GrammarProgramSummary[]>([]);
  const [programsLoading, setProgramsLoading] = useState(true);
  const [selected, setSelected] = useState<number | 'all'>('all');
  const [confirmId, setConfirmId] = useState<number | null>(null);
  // Enroll/unenroll failure line under the chips; cleared on the next action.
  const [actionError, setActionError] = useState(false);

  // Exercise state — the run itself lives in GrammarTaskRunner; the page only keeps
  // what its own done screen needs (final score and TAK's final mood).
  const [activeLesson, setActiveLesson] = useState<Lesson | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [correct, setCorrect] = useState(0);
  const [mood, setMood] = useState(MOOD_NEUTRAL);
  const [done, setDone] = useState(false);
  const [exerciseLoading, setExerciseLoading] = useState(false);
  // Why the lesson couldn't be started: 403 (still locked for a free user) or 429
  // (daily session limit). Without this the fetch failure left an endless spinner.
  const [blocked, setBlocked] = useState<'locked' | 'quota' | null>(null);

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
    // Public programs for guests too — the page previews them as onboarding.
    getGrammarPrograms()
      .then(setPrograms)
      .catch(console.error)
      .finally(() => setProgramsLoading(false));
  }, []);

  async function handleEnroll(programId: number) {
    // Guests go to sign in; OAuth always lands on /dashboard (no return here).
    if (!getToken()) { router.push('/login'); return; }
    setActionError(false);
    try {
      await enrollGrammarProgram(programId);
      setPrograms((prev) => prev.map((p) => p.id === programId ? { ...p, enrolled: true } : p));
      setSelected(programId);
      fetchLessons(); // locks change on enroll
    } catch (e) {
      console.error(e);
      setActionError(true);
    }
  }

  async function handleUnenroll(programId: number) {
    setActionError(false);
    try {
      await unenrollGrammarProgram(programId);
      setPrograms((prev) => prev.map((p) => p.id === programId ? { ...p, enrolled: false } : p));
    } catch (e) {
      console.error(e);
      setActionError(true);
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
    setBlocked(null);

    const base = isVerbLesson(lesson.id) ? 'verb-lessons' : 'lessons';
    const token = getToken();
    const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {};
    // The remind pseudo-lesson (id 0, #26) has its own endpoint — it isn't a real
    // LESSON_CONFIG entry, so /grammar/lessons/0/tasks would just 404.
    const url = lesson.id === REMIND_LESSON.id
      ? `${BACKEND_URL}/api/grammar/remind/tasks`
      : `${BACKEND_URL}/api/grammar/${base}/${lesson.id}/tasks`;
    // Without this header the request was anonymous, so the server-side lock/quota
    // checks below (403/429) never actually fired — see documentation/grammar-lesson-lock-and-premium.md.
    fetch(url, { headers })
      .then(async (r) => {
        // The response status used to be ignored entirely: any non-200 fell through
        // to an empty task list, which renders as an infinite spinner. 403 (lesson
        // still locked — free users only) and 429 (daily limit) now get a real screen;
        // anything else drops back to the lesson list instead of hanging.
        if (r.status === 403) { setTasks([]); setBlocked('locked'); return; }
        if (r.status === 429) { setTasks([]); setBlocked('quota'); return; }
        if (!r.ok) { setTasks([]); setActiveLesson(null); return; }
        const data: Task[] = await r.json();
        setTasks(Array.isArray(data) ? data : []);
      })
      .catch(() => { setTasks([]); setActiveLesson(null); })
      .finally(() => setExerciseLoading(false));
  }

  function resetToLessons() {
    setActiveLesson(null);
    setTasks([]);
    setDone(false);
    setBlocked(null);
  }

  // ── Lesson list ────────────────────────────────────────────────────────────
  if (activeLesson === null) {
    if (programsLoading || loading) {
      return (
        <PageShell>
          <div className="flex items-start justify-between gap-4">
            <h1 className="text-[32px] font-bold mb-1.5">{tr.grammar.title}</h1>
            {/* The mascot moves into the hero once it renders — exactly one on screen. */}
            <PageMascot phrase="Mokomės!" className="hidden sm:block shrink-0" />
          </div>
          <div className="flex justify-center py-20">
            <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          </div>
        </PageShell>
      );
    }

    const byProgram: LessonsByProgram = {};
    for (const p of programs) {
      byProgram[p.id] = filterLessonsForProgram(lessons, p.lesson_filter ?? null, caseGroups, p.program_type ?? 'cases');
    }
    const uniqueLessons = (ps: GrammarProgramSummary[]) =>
      Array.from(new Map(ps.flatMap((p) => byProgram[p.id]).map((l) => [l.id, l])).values());
    const enrolledPrograms = programs.filter((p) => p.enrolled);
    const none = enrolledPrograms.length === 0;
    const enrolledLessons = uniqueLessons(enrolledPrograms);
    // Remind is only offered once at least one «Повторение» lesson has been passed
    // in a program the user is actually enrolled in — same eligibility rule the
    // server enforces at GET /grammar/remind/tasks (404 otherwise).
    const canRemind = enrolledLessons.some((l) => l.level === 'practice' && isPassed(l));
    const casesProgram = programs.find((p) => (p.program_type ?? 'cases') === 'cases') ?? programs[0];
    const heroNext = featuredFor('all', programs, byProgram);
    const featured = featuredFor(selected, programs, byProgram);
    const counts: Record<number, number> = {};
    for (const p of programs) counts[p.id] = byProgram[p.id].length;
    const confirmProgram = programs.find((p) => p.id === confirmId);

    return (
      <PageShell className="pb-20 flex flex-col gap-5">
        <GrammarHero
          passed={enrolledLessons.filter(isPassed).length}
          total={enrolledLessons.length}
          none={none}
          onContinue={heroNext?.kind === 'next' ? () => startLesson(heroNext.lesson) : null}
          onStartCases={none && casesProgram ? () => handleEnroll(casesProgram.id) : null}
          remind={none ? null : {
            onClick: () => startLesson(REMIND_LESSON),
            disabled: !canRemind,
            hint: canRemind ? undefined : tr.grammar.remindHint,
          }}
        />

        <div>
          <ProgramChips
            programs={programs}
            counts={counts}
            allCount={(none ? uniqueLessons(programs) : enrolledLessons).length}
            selected={selected}
            onSelect={(id) => { setActionError(false); setSelected(id); }}
          />
          {actionError && (
            <p className="mt-2 text-[13px] text-destructive" role="alert" data-testid="grammar-action-error">
              {tr.grammar.actionFailed}
            </p>
          )}
        </div>

        {featured ? (
          <>
            <section className="grid gap-4 grid-cols-1 min-[860px]:grid-cols-[1.75fr_1fr]">
              <FeaturedCard
                featured={featured}
                lessons={byProgram[featured.program.id]}
                hideAddFor={none && casesProgram ? casesProgram.id : null}
                onStart={startLesson}
                onAdd={handleEnroll}
              />
              <ProgramStack
                programs={programs.filter((p) => p.id !== featured.program.id)}
                byProgram={byProgram}
                onOpen={(id) => { setActionError(false); setSelected(id); }}
                onAdd={handleEnroll}
              />
            </section>
            <TopicsSection
              program={featured.program}
              lessons={byProgram[featured.program.id]}
              onStart={startLesson}
              onUnenroll={() => setConfirmId(featured.program.id)}
            />
          </>
        ) : (
          <p className="text-faint text-sm py-8 text-center">{tr.grammar.programsEmpty}</p>
        )}

        {/* Confirm remove program — markup copied from lists/page.tsx (two uses, no shared component). */}
        {confirmProgram && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
            onClick={() => setConfirmId(null)}
          >
            <div
              role="dialog"
              aria-modal="true"
              data-testid="unenroll-confirm"
              className="bg-white rounded-2xl shadow-xl p-6 mx-4 w-full max-w-sm flex flex-col gap-4"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 className="text-[14.5px] font-semibold text-ink">
                {tr.lists.removeProgramTitle.replace('{label}', programTitle(confirmProgram, lang))}
              </h2>
              <p className="text-sm text-muted">{tr.lists.removeProgramBody}</p>
              <div className="flex gap-3 justify-end">
                <button
                  onClick={() => setConfirmId(null)}
                  className="px-4 py-2 text-sm text-muted hover:text-ink border border-line rounded-full transition-colors"
                >
                  {tr.common.cancel}
                </button>
                <button
                  onClick={() => { setConfirmId(null); handleUnenroll(confirmProgram.id); }}
                  data-testid="unenroll-confirm-button"
                  className="px-4 py-2 text-sm font-semibold text-white bg-destructive hover:opacity-90 rounded-full transition-opacity"
                >
                  {tr.lists.removeProgramConfirm}
                </button>
              </div>
            </div>
          </div>
        )}
      </PageShell>
    );
  }

  // ── Blocked screen (403 locked / 429 daily limit) ──────────────────────────
  if (blocked) {
    const isLocked = blocked === 'locked';
    return (
      <main className="min-h-screen text-gray-900 flex flex-col items-center justify-center px-6">
        <div
          className="relative z-10 text-center max-w-sm w-full"
          data-testid={`grammar-blocked-${blocked}`}
        >
          <div className="flex justify-center mb-6">
            <PageMascot phrase="Oi!" />
          </div>
          <h1 className="text-2xl font-bold mb-2">
            {isLocked ? tr.grammar.lockedTitle : tr.common.limitTitle}
          </h1>
          <p className="text-[15px] text-muted mb-8">
            {isLocked ? tr.grammar.lockedBody : tr.common.limitBody}
          </p>
          <div className="flex flex-col gap-3">
            <Link
              href="/pricing"
              className="block w-full py-3 text-center rounded-xl font-semibold bg-amber-100 text-amber-700 border border-amber-200 hover:bg-amber-200 transition-colors"
            >
              {tr.common.getPremium}
            </Link>
            <button
              onClick={resetToLessons}
              className="w-full py-3 text-muted hover:text-ink text-sm transition-colors"
            >
              <TakChevron direction="left" size={10} className="inline-block align-[-1px] mr-1" />
              {tr.grammar.backToLessons}
            </button>
          </div>
        </div>
      </main>
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

          {/* Pass/fail banner — its copy is about unlocking the next lesson, which
              doesn't apply to a remind run (no lesson list position, no lock). */}
          {activeLesson.id !== REMIND_LESSON.id && (
            passed ? (
              <div className="flex items-center justify-center gap-2 mb-4 bg-emerald-50 border border-line rounded-xl px-4 py-2">
                <span className="text-emerald-600 text-sm font-semibold">{tr.grammar.passed}</span>
              </div>
            ) : (
              <div className="flex flex-col gap-1 mb-4 bg-amber-50 border border-line rounded-xl px-4 py-3">
                <span className="text-amber-600 text-sm font-semibold">{tr.grammar.failedScore}</span>
                <span className="text-gray-500 text-xs">{tr.grammar.failedHint}</span>
              </div>
            )
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
      hint={(lang === 'en' && activeLesson.hint_en) ? activeLesson.hint_en : activeLesson.hint}
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
