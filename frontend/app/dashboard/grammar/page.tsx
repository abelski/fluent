'use client';

import { useCallback, useEffect, useState, useRef } from 'react';
import { BACKEND_URL, getToken } from '../../../lib/api';
import StatsBar from '../components/StatsBar';
import { useT } from '../../../lib/useT';

interface GrammarRule {
  question: string;
  name_ru: string;
  usage: string;
  endings_sg: string;
  endings_pl: string;
  transform?: string;
}

interface Lesson {
  id: number;
  title: string;
  level: 'basic' | 'advanced' | 'practice';
  cases: number[];
  task_count: number;
  rules: GrammarRule[];
  is_locked: boolean;
  best_score_pct: number | null;
  is_published?: boolean;
}

interface DeclensionTask {
  type: 'declension';
  prompt_lt: string;
  prompt_ru: string;
  case_name: string;
  number: string;
  answer: string;
}

interface SentenceTask {
  type: 'sentence';
  display: string;
  answer: string;
  full_answer: string;
  translation_ru: string;
  base_lt?: string;
}

type Task = DeclensionTask | SentenceTask;

type AnswerState = 'unanswered' | 'correct' | 'wrong';

const LEVEL_STYLES: Record<string, string> = {
  basic: 'bg-teal-50 border-gray-900 text-teal-600',
  advanced: 'bg-emerald-50 border-gray-900 text-emerald-600',
  practice: 'bg-amber-50 border-gray-900 text-amber-600',
};

interface Category {
  key: string;
  label: string;
}

function normalizeLt(text: string): string {
  return text
    .toLowerCase()
    .replace(/į/g, 'i')
    .replace(/č/g, 'c')
    .replace(/š/g, 's')
    .replace(/ž/g, 'z')
    .replace(/ū/g, 'u')
    .replace(/ų/g, 'u')
    .replace(/ę/g, 'e')
    .replace(/ė/g, 'e')
    .replace(/ą/g, 'a');
}

function GrammarRuleCard({ rules, collapsible }: { rules: GrammarRule[]; collapsible: boolean }) {
  const { tr } = useT();
  const [open, setOpen] = useState(!collapsible);

  if (rules.length === 0) return null;

  return (
    <div className="w-full border border-gray-900 rounded-2xl overflow-hidden bg-teal-50">
      {collapsible ? (
        <button
          onClick={() => setOpen((v) => !v)}
          className="w-full flex items-center justify-between px-5 py-3 text-left hover:bg-teal-50 transition-colors"
        >
          <span className="text-teal-600 text-sm font-medium">{tr.grammar.grammarHint}</span>
          <svg
            width="12" height="12" viewBox="0 0 12 12" fill="currentColor"
            className={`text-teal-500 transition-transform duration-200 shrink-0 ${open ? 'rotate-180' : ''}`}
          >
            <path d="M6 8L1 3h10L6 8z" />
          </svg>
        </button>
      ) : (
        <div className="px-5 py-3 border-b border-gray-900">
          <span className="text-teal-600 text-sm font-medium">{tr.grammar.grammarRule}</span>
        </div>
      )}

      {open && (
        <div className={`px-5 py-4 flex flex-col gap-4 ${collapsible ? 'border-t border-gray-900' : ''}`}>
          {rules.map((rule, i) => (
            <div key={i} className={rules.length > 1 ? 'pb-4 border-b border-gray-900 last:border-0 last:pb-0' : ''}>
              <p className="text-teal-700 text-sm font-semibold mb-1">{rule.name_ru}</p>
              <p className="text-gray-500 text-xs mb-2">{rule.question}</p>
              <p className="text-gray-600 text-sm mb-2 leading-relaxed">{rule.usage}</p>
              {rule.transform && (
                <p className="text-gray-500 text-xs mb-3 leading-relaxed font-mono bg-white/60 rounded px-2 py-1">{rule.transform}</p>
              )}
              {rule.endings_sg !== '—' && (
                <div className="flex flex-wrap gap-3 text-xs">
                  <div>
                    <span className="text-gray-400">{tr.grammar.singular} </span>
                    <span className="text-gray-500 font-mono">{rule.endings_sg}</span>
                  </div>
                  <div>
                    <span className="text-gray-400">{tr.grammar.plural} </span>
                    <span className="text-gray-500 font-mono">{rule.endings_pl}</span>
                  </div>
                </div>
              )}
              {rule.endings_sg === '—' && (
                <div className="text-xs">
                  <span className="text-gray-400">{tr.grammar.plural} </span>
                  <span className="text-gray-500 font-mono">{rule.endings_pl}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
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
  const { tr, plural } = useT();
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        data-testid="subcategory-toggle"
        className="w-full flex items-center justify-between px-5 py-3 bg-white hover:bg-gray-50 transition-colors text-left"
      >
        <span className="text-sm font-medium text-gray-700">{group.title}</span>
        <div className="flex items-center gap-2">
          <span className="text-gray-400 text-xs">{group.lessons.length} {plural(group.lessons.length, tr.grammar.levelsCount)}</span>
          <svg
            width="12" height="12" viewBox="0 0 12 12" fill="currentColor"
            className={`text-gray-400 transition-transform duration-200 shrink-0 ${open ? 'rotate-180' : ''}`}
          >
            <path d="M6 8L1 3h10L6 8z" />
          </svg>
        </div>
      </button>
      {open && (
        <div className="px-5 pb-4 bg-white">
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
                      ? 'border-gray-900 opacity-40 cursor-not-allowed'
                      : 'border-gray-900 hover:bg-white cursor-pointer'
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
                    {lesson.is_published === false && (
                      <span className="text-[10px] font-semibold uppercase tracking-wide bg-amber-50 text-amber-600 border border-amber-200 rounded px-1.5 py-px leading-tight">
                        В тестировании
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

export default function GrammarPage() {
  const { tr, plural } = useT();
  const CATEGORIES: Category[] = [
    { key: 'padezhi', label: tr.grammar.categories.padezhi },
  ];
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [loading, setLoading] = useState(true);
  const [openCategories, setOpenCategories] = useState<Set<string>>(new Set(['padezhi']));

  function toggleCategory(key: string) {
    setOpenCategories((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  // Exercise state
  const [activeLesson, setActiveLesson] = useState<Lesson | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [taskIndex, setTaskIndex] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [done, setDone] = useState(false);
  const [exerciseLoading, setExerciseLoading] = useState(false);

  // Per-task UI
  const [typed, setTyped] = useState('');
  const [answerState, setAnswerState] = useState<AnswerState>('unanswered');
  const [shownAnswer, setShownAnswer] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const dismissBtnRef = useRef<HTMLButtonElement>(null);

  // Focus dismiss button after a short delay so the Enter keypress that
  // triggered the wrong answer doesn't immediately activate it.
  useEffect(() => {
    if (answerState !== 'wrong') return;
    const id = setTimeout(() => dismissBtnRef.current?.focus(), 100);
    return () => clearTimeout(id);
  }, [answerState]);

  const fetchLessons = useCallback(() => {
    const token = getToken();
    const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {};
    fetch(`${BACKEND_URL}/api/grammar/lessons`, { headers })
      .then((r) => r.json())
      .then((data: Lesson[]) => setLessons(Array.isArray(data) ? data : []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchLessons();
  }, [fetchLessons]);

  function postResult(lessonId: number, score: number, total: number) {
    const token = getToken();
    if (!token) return;
    fetch(`${BACKEND_URL}/api/grammar/lessons/${lessonId}/results`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ score, total }),
    })
      .then(() => fetchLessons()) // refresh locked status in background
      .catch(() => {});
  }

  function startLesson(lesson: Lesson) {
    setExerciseLoading(true);
    setActiveLesson(lesson);
    setTaskIndex(0);
    setCorrect(0);
    setDone(false);
    setTyped('');
    setAnswerState('unanswered');
    setShownAnswer('');

    fetch(`${BACKEND_URL}/api/grammar/lessons/${lesson.id}/tasks`)
      .then((r) => r.json())
      .then((data: Task[]) => {
        setTasks(Array.isArray(data) ? data : []);
        setTimeout(() => inputRef.current?.focus(), 100);
      })
      .catch(() => setTasks([]))
      .finally(() => setExerciseLoading(false));
  }

  function advanceTask(isCorrect: boolean) {
    const next = taskIndex + 1;
    if (next >= tasks.length) {
      const finalCorrect = isCorrect ? correct + 1 : correct;
      if (activeLesson) postResult(activeLesson.id, finalCorrect, tasks.length);
      if (isCorrect) setCorrect((c) => c + 1);
      setDone(true);
    } else {
      if (isCorrect) setCorrect((c) => c + 1);
      setTaskIndex(next);
      setTyped('');
      setAnswerState('unanswered');
      setShownAnswer('');
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }

  function checkAnswer() {
    if (answerState !== 'unanswered') return;
    const task = tasks[taskIndex];
    const isCorrect = normalizeLt(typed.trim()) === normalizeLt(task.answer);
    setAnswerState(isCorrect ? 'correct' : 'wrong');
    if (!isCorrect) {
      setShownAnswer(task.type === 'sentence' ? task.full_answer : task.answer);
    }

    if (isCorrect) {
      // Correct: auto-advance after short delay
      setTimeout(() => advanceTask(true), 1000);
    }
    // Wrong: wait for user to click "Понятно, дальше"
  }

  function dismissWrongGrammar() {
    advanceTask(false);
  }

  function resetToLessons() {
    setActiveLesson(null);
    setTasks([]);
    setDone(false);
  }

  // ── Lesson list ────────────────────────────────────────────────────────────
  if (activeLesson === null) {
    return (
      <main className="bg-slate-50 text-gray-900">
        <div className="pointer-events-none fixed inset-0 flex items-start justify-center">
          <div className="w-[600px] h-[400px] bg-emerald-100/40 blur-[120px] rounded-full mt-[-100px]" />
        </div>

        <div className="relative z-10 max-w-4xl mx-auto px-6 py-8">
          <StatsBar />

          <h1 className="text-3xl font-bold mb-2">{tr.grammar.title}</h1>
          <p className="text-gray-400 mb-6">{tr.grammar.subtitle}</p>

          {loading ? (
            <div className="flex justify-center py-20">
              <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {CATEGORIES.map((cat) => {
                const isOpen = openCategories.has(cat.key);
                const categoryLessons = cat.key === 'padezhi' ? lessons : [];

                // Group lessons by consecutive title runs into subcategories
                const subcategoryGroups: { title: string; lessons: Lesson[] }[] = [];
                for (const lesson of categoryLessons) {
                  const last = subcategoryGroups[subcategoryGroups.length - 1];
                  if (last && last.title === lesson.title) {
                    last.lessons.push(lesson);
                  } else {
                    subcategoryGroups.push({ title: lesson.title, lessons: [lesson] });
                  }
                }

                return (
                  <div
                    key={cat.key}
                    className="border border-gray-900 rounded-2xl overflow-hidden"
                    data-testid={`category-${cat.key}`}
                  >
                    <button
                      onClick={() => toggleCategory(cat.key)}
                      aria-expanded={isOpen}
                      data-testid={`category-toggle-${cat.key}`}
                      className="w-full flex items-center justify-between px-5 py-4 bg-gray-50 hover:bg-gray-100 cursor-pointer transition-colors text-left"
                    >
                      <div className="flex items-center gap-3">
                        <span className="font-semibold text-gray-900">{cat.label}</span>
                        <span className="text-gray-400 text-sm">{categoryLessons.length} {plural(categoryLessons.length, tr.grammar.lessonsCount)}</span>
                      </div>
                      <svg
                        width="14" height="14" viewBox="0 0 12 12" fill="currentColor"
                        className={`text-gray-400 transition-transform duration-200 shrink-0 ${isOpen ? 'rotate-180' : ''}`}
                      >
                        <path d="M6 8L1 3h10L6 8z" />
                      </svg>
                    </button>

                    {isOpen && (
                      <div className="divide-y divide-gray-900 border-t border-gray-900">
                        {subcategoryGroups.map((group, gi) => (
                          <SubcategoryGroup key={`${group.title}-${gi}`} group={group} onStartLesson={startLesson} />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
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
      <main className="min-h-screen bg-slate-50 text-gray-900 flex flex-col items-center justify-center px-6">
        <div className="pointer-events-none fixed inset-0 flex items-start justify-center">
          <div className="w-[600px] h-[400px] bg-emerald-100/40 blur-[120px] rounded-full mt-[-100px]" />
        </div>
        <div className="relative z-10 text-center max-w-sm w-full">
          <div className="text-5xl mb-6">{passed ? '🎉' : '📚'}</div>
          <h1 className="text-2xl font-bold mb-2">{tr.grammar.lessonDone}</h1>

          {/* Pass/fail banner */}
          {passed ? (
            <div className="flex items-center justify-center gap-2 mb-4 bg-emerald-50 border border-gray-900 rounded-xl px-4 py-2">
              <span className="text-emerald-600 text-sm font-semibold">{tr.grammar.passed}</span>
            </div>
          ) : (
            <div className="flex flex-col gap-1 mb-4 bg-amber-50 border border-gray-900 rounded-xl px-4 py-3">
              <span className="text-amber-600 text-sm font-semibold">{tr.grammar.failedScore}</span>
              <span className="text-gray-500 text-xs">{tr.grammar.failedHint}</span>
            </div>
          )}

          <p className="text-gray-400 mb-8">
            {tr.common.correctOf.replace('{correct}', String(correct)).replace('{total}', String(total))} · <span className={passed ? 'text-emerald-600' : 'text-amber-600'}>{Math.round(scorePct * 100)}%</span>
          </p>

          <div className="flex gap-4 justify-center mb-10">
            <div className="bg-white border border-gray-900 rounded-2xl px-6 sm:px-8 py-5 text-center">
              <div className="text-2xl sm:text-3xl font-bold text-emerald-600">{correct}</div>
              <div className="text-gray-400 text-sm mt-1">{tr.common.correctLabel}</div>
            </div>
            <div className="bg-white border border-gray-900 rounded-2xl px-6 sm:px-8 py-5 text-center">
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
                {tr.grammar.nextLesson}
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
              {tr.grammar.backToLessons}
            </button>
          </div>
        </div>
      </main>
    );
  }

  // ── Exercise screen ────────────────────────────────────────────────────────
  if (exerciseLoading || tasks.length === 0) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const task = tasks[taskIndex];
  const progressPct = (taskIndex / tasks.length) * 100;
  const level = activeLesson.level;
  const showRule = level === 'basic' || level === 'advanced';
  const ruleCollapsible = level === 'advanced';

  return (
    <main className="min-h-screen bg-slate-50 text-gray-900 flex flex-col px-6 py-8">
      <div className="pointer-events-none fixed inset-0 flex items-start justify-center overflow-hidden">
        <div className="w-full max-w-[600px] h-[400px] bg-emerald-100/40 blur-[120px] rounded-full mt-[-100px]" />
      </div>

      <div className="relative z-10 max-w-lg w-full mx-auto flex flex-col flex-1">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <button
            onClick={resetToLessons}
            className="text-gray-400 hover:text-gray-900 text-sm transition-colors"
          >
            {tr.grammar.backToLessons}
          </button>
          <span className="text-gray-400 text-sm">{taskIndex + 1} / {tasks.length}</span>
        </div>

        {/* Progress bar */}
        <div className="w-full h-1 bg-gray-100 rounded-full mb-8">
          <div
            className="h-1 bg-emerald-500 rounded-full transition-all duration-300"
            style={{ width: `${progressPct}%` }}
          />
        </div>

        {/* Grammar rule — basic (always visible) or advanced (collapsible) */}
        {showRule && (
          <div className="mb-6">
            <GrammarRuleCard rules={activeLesson.rules} collapsible={ruleCollapsible} />
          </div>
        )}

        {/* Task card */}
        <div className="flex flex-col items-center justify-center flex-1 gap-8">
          {task.type === 'declension' ? (
            <div className="w-full bg-white border border-gray-900 rounded-2xl p-5 sm:p-8 text-center">
              <p className="text-gray-400 text-xs uppercase tracking-wider mb-1">
                {task.case_name} · {task.number}
              </p>
              <p className="text-2xl sm:text-4xl font-bold tracking-tight mt-4 mb-2">{task.prompt_lt}</p>
              <p className="text-gray-500 text-base sm:text-lg">{task.prompt_ru}</p>
            </div>
          ) : (
            <div className="w-full bg-white border border-gray-900 rounded-2xl p-5 sm:p-8 text-center">
              {/* Puzzle header: base form → sentence */}
              {task.base_lt ? (
                <>
                  <p className="text-gray-400 text-xs uppercase tracking-wider mb-3">{tr.grammar.buildForm}</p>
                  <div className="flex items-center justify-center gap-3 mb-5">
                    <span className="text-2xl font-bold text-gray-900">{task.base_lt}</span>
                    <span className="text-gray-400 text-xl">→</span>
                    <span className="text-gray-500 text-base font-mono">{task.display}</span>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-gray-400 text-xs uppercase tracking-wider mb-4">{tr.grammar.fillBlank}</p>
                  <p className="text-2xl font-mono tracking-tight mb-4">{task.display}</p>
                </>
              )}
              <p className="text-gray-500 text-base">{task.translation_ru}</p>
            </div>
          )}

          <div className="w-full flex flex-col gap-3">
            <input
              ref={inputRef}
              type="text"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && typed.trim()) checkAnswer(); }}
              disabled={answerState !== 'unanswered'}
              placeholder={task.type === 'declension' ? tr.grammar.typeDeclension : tr.grammar.typeEnding}
              className={`w-full py-4 px-5 rounded-xl border bg-white text-base text-gray-900 placeholder-gray-400 outline-none transition-all duration-200
                ${answerState === 'correct' ? 'border-gray-900 bg-emerald-50' :
                  answerState === 'wrong' ? 'border-gray-900 bg-red-50' :
                  'border-gray-900 focus:border-gray-900'}`}
            />

            {answerState === 'unanswered' && (
              <button
                onClick={checkAnswer}
                disabled={!typed.trim()}
                className="w-full py-4 bg-gray-900 hover:bg-gray-800 rounded-xl font-medium text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {tr.common.check}
              </button>
            )}

            {answerState === 'correct' && (
              <p className="text-emerald-600 text-sm font-medium text-center">{tr.common.correct}</p>
            )}

            {answerState === 'wrong' && (
              <div className="flex flex-col gap-3 animate-in fade-in duration-150">
                <div className="text-center">
                  <p className="text-red-600 text-sm font-medium">{tr.common.notQuite}</p>
                  <p className="text-gray-500 text-sm mt-1">
                    {tr.common.correctAnswer} <span className="text-gray-900 font-medium">{shownAnswer}</span>
                  </p>
                </div>
                <button
                  ref={dismissBtnRef}
                  data-testid="dismiss-wrong"
                  onClick={dismissWrongGrammar}
                  className="w-full py-4 bg-gray-100 hover:bg-gray-100 rounded-xl font-medium transition-colors"
                >
                  {tr.common.dismiss}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
