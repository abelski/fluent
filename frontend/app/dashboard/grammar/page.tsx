'use client';

import { useEffect, useState, useRef } from 'react';
import { BACKEND_URL } from '../../../lib/api';
import StatsBar from '../components/StatsBar';

interface GrammarRule {
  question: string;
  name_ru: string;
  usage: string;
  endings_sg: string;
  endings_pl: string;
}

interface Lesson {
  id: number;
  title: string;
  level: 'basic' | 'advanced' | 'practice';
  cases: number[];
  task_count: number;
  rules: GrammarRule[];
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
  basic: 'bg-sky-500/10 border-sky-500/30 text-sky-400',
  advanced: 'bg-violet-500/10 border-violet-500/30 text-violet-400',
  practice: 'bg-amber-500/10 border-amber-500/30 text-amber-400',
};

const LEVEL_LABELS: Record<string, string> = {
  basic: 'Базовый',
  advanced: 'Продвинутый',
  practice: 'Повторение',
};

interface Category {
  key: string;
  label: string;
  comingSoon: boolean;
}

const CATEGORIES: Category[] = [
  { key: 'padezhi', label: 'Падежи', comingSoon: false },
  { key: 'vremena', label: 'Времена', comingSoon: true },
];

function normalizeLt(text: string): string {
  return text
    .toLowerCase()
    .replace(/į/g, 'i')
    .replace(/č/g, 'c')
    .replace(/š/g, 's')
    .replace(/ž/g, 'z')
    .replace(/ū/g, 'u')
    .replace(/ę/g, 'e')
    .replace(/ė/g, 'e')
    .replace(/ą/g, 'a');
}

function GrammarRuleCard({ rules, collapsible }: { rules: GrammarRule[]; collapsible: boolean }) {
  const [open, setOpen] = useState(!collapsible);

  if (rules.length === 0) return null;

  return (
    <div className="w-full border border-sky-500/20 rounded-2xl overflow-hidden bg-sky-500/[0.04]">
      {collapsible ? (
        <button
          onClick={() => setOpen((v) => !v)}
          className="w-full flex items-center justify-between px-5 py-3 text-left hover:bg-sky-500/[0.06] transition-colors"
        >
          <span className="text-sky-400 text-sm font-medium">Грамматическая подсказка</span>
          <svg
            width="12" height="12" viewBox="0 0 12 12" fill="currentColor"
            className={`text-sky-400/60 transition-transform duration-200 shrink-0 ${open ? 'rotate-180' : ''}`}
          >
            <path d="M6 8L1 3h10L6 8z" />
          </svg>
        </button>
      ) : (
        <div className="px-5 py-3 border-b border-sky-500/10">
          <span className="text-sky-400 text-sm font-medium">Грамматическое правило</span>
        </div>
      )}

      {open && (
        <div className={`px-5 py-4 flex flex-col gap-4 ${collapsible ? 'border-t border-sky-500/10' : ''}`}>
          {rules.map((rule, i) => (
            <div key={i} className={rules.length > 1 ? 'pb-4 border-b border-sky-500/10 last:border-0 last:pb-0' : ''}>
              <p className="text-sky-300 text-sm font-semibold mb-1">{rule.name_ru}</p>
              <p className="text-white/50 text-xs mb-2">{rule.question}</p>
              <p className="text-white/70 text-sm mb-3 leading-relaxed">{rule.usage}</p>
              {rule.endings_sg !== '—' && (
                <div className="flex flex-wrap gap-3 text-xs">
                  <div>
                    <span className="text-white/30">Ед.ч.: </span>
                    <span className="text-white/60 font-mono">{rule.endings_sg}</span>
                  </div>
                  <div>
                    <span className="text-white/30">Мн.ч.: </span>
                    <span className="text-white/60 font-mono">{rule.endings_pl}</span>
                  </div>
                </div>
              )}
              {rule.endings_sg === '—' && (
                <div className="text-xs">
                  <span className="text-white/30">Мн.ч.: </span>
                  <span className="text-white/60 font-mono">{rule.endings_pl}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function GrammarPage() {
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

  useEffect(() => {
    fetch(`${BACKEND_URL}/api/grammar/lessons`)
      .then((r) => r.json())
      .then((data: Lesson[]) => setLessons(Array.isArray(data) ? data : []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

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

  function checkAnswer() {
    if (answerState !== 'unanswered') return;
    const task = tasks[taskIndex];
    const isCorrect = normalizeLt(typed.trim()) === normalizeLt(task.answer);
    setAnswerState(isCorrect ? 'correct' : 'wrong');
    if (!isCorrect) {
      setShownAnswer(
        task.type === 'sentence' ? task.full_answer : task.answer
      );
    }

    const delay = isCorrect ? 1000 : 2000;
    setTimeout(() => {
      if (isCorrect) setCorrect((c) => c + 1);
      const next = taskIndex + 1;
      if (next >= tasks.length) {
        setDone(true);
      } else {
        setTaskIndex(next);
        setTyped('');
        setAnswerState('unanswered');
        setShownAnswer('');
        setTimeout(() => inputRef.current?.focus(), 50);
      }
    }, delay);
  }

  function resetToLessons() {
    setActiveLesson(null);
    setTasks([]);
    setDone(false);
  }

  // ── Lesson list ────────────────────────────────────────────────────────────
  if (activeLesson === null) {
    return (
      <main className="bg-[#07070f] text-white">
        <div className="pointer-events-none fixed inset-0 flex items-start justify-center">
          <div className="w-[600px] h-[400px] bg-violet-700/10 blur-[120px] rounded-full mt-[-100px]" />
        </div>

        <div className="relative z-10 max-w-4xl mx-auto px-6 py-8">
          <StatsBar />

          <h1 className="text-3xl font-bold mb-2">Грамматика</h1>
          <p className="text-white/40 mb-6">Выбери урок для тренировки склонений</p>

          <div className="flex items-start gap-3 bg-amber-500/[0.07] border border-amber-500/25 rounded-2xl px-5 py-4 mb-8">
            <span className="text-amber-400 text-lg shrink-0 mt-0.5">⚠</span>
            <p className="text-white/60 text-sm leading-relaxed">
              Раздел «Грамматика» находится в стадии тестирования. Задания и оценка ответов могут содержать неточности.
              Пожалуйста, используйте с осторожностью — мы будем рады вашим отзывам.
            </p>
          </div>

          {loading ? (
            <div className="flex justify-center py-20">
              <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {CATEGORIES.map((cat) => {
                const isOpen = openCategories.has(cat.key);
                const categoryLessons = cat.key === 'padezhi' ? lessons : [];
                return (
                  <div
                    key={cat.key}
                    className="border border-white/[0.08] rounded-2xl overflow-hidden"
                    data-testid={`category-${cat.key}`}
                  >
                    <button
                      onClick={() => !cat.comingSoon && toggleCategory(cat.key)}
                      disabled={cat.comingSoon}
                      aria-expanded={isOpen}
                      data-testid={`category-toggle-${cat.key}`}
                      className={`w-full flex items-center justify-between px-5 py-4 bg-white/[0.03] transition-colors text-left ${
                        cat.comingSoon ? 'cursor-default opacity-70' : 'hover:bg-white/[0.06] cursor-pointer'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span className="font-semibold text-white">{cat.label}</span>
                        {cat.comingSoon ? (
                          <span className="text-[10px] font-semibold uppercase tracking-wide bg-white/[0.06] text-white/40 border border-white/10 rounded px-1.5 py-px leading-tight">
                            Скоро
                          </span>
                        ) : (
                          <span className="text-white/30 text-sm">{categoryLessons.length} уроков</span>
                        )}
                      </div>
                      {!cat.comingSoon && (
                        <svg
                          width="14" height="14" viewBox="0 0 12 12" fill="currentColor"
                          className={`text-white/30 transition-transform duration-200 shrink-0 ${isOpen ? 'rotate-180' : ''}`}
                        >
                          <path d="M6 8L1 3h10L6 8z" />
                        </svg>
                      )}
                    </button>

                    {isOpen && !cat.comingSoon && (
                      <div className="px-5 py-4 border-t border-white/[0.06]">
                        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                          {categoryLessons.map((lesson) => (
                            <button
                              key={lesson.id}
                              onClick={() => startLesson(lesson)}
                              className="bg-white/[0.04] border border-white/[0.08] rounded-2xl p-5 text-left hover:border-violet-500/40 transition-colors flex flex-col gap-3"
                            >
                              <div className="flex items-start justify-between gap-2">
                                <span className="text-sm font-semibold leading-snug">{lesson.title}</span>
                                <span className={`text-xs px-2 py-0.5 rounded-full border shrink-0 ${LEVEL_STYLES[lesson.level] ?? ''}`}>
                                  {LEVEL_LABELS[lesson.level] ?? lesson.level}
                                </span>
                              </div>
                              <div className="text-white/30 text-xs">{lesson.task_count} заданий</div>
                            </button>
                          ))}
                        </div>
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
    return (
      <main className="min-h-screen bg-[#07070f] text-white flex flex-col items-center justify-center px-6">
        <div className="pointer-events-none fixed inset-0 flex items-start justify-center">
          <div className="w-[600px] h-[400px] bg-violet-700/10 blur-[120px] rounded-full mt-[-100px]" />
        </div>
        <div className="relative z-10 text-center max-w-sm w-full">
          <div className="text-5xl mb-6">🎉</div>
          <h1 className="text-2xl font-bold mb-2">Урок завершён!</h1>
          <p className="text-white/40 mb-8">Верно {correct} из {total}</p>

          <div className="flex gap-4 justify-center mb-10">
            <div className="bg-white/[0.04] border border-white/[0.08] rounded-2xl px-8 py-5 text-center">
              <div className="text-3xl font-bold text-violet-400">{correct}</div>
              <div className="text-white/40 text-sm mt-1">Верно</div>
            </div>
            <div className="bg-white/[0.04] border border-white/[0.08] rounded-2xl px-8 py-5 text-center">
              <div className="text-3xl font-bold text-amber-400">{errors}</div>
              <div className="text-white/40 text-sm mt-1">Ошибок</div>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <button
              onClick={() => startLesson(activeLesson)}
              className="w-full py-3 bg-violet-600 hover:bg-violet-500 rounded-xl font-medium transition-colors"
            >
              Повторить
            </button>
            <button
              onClick={resetToLessons}
              className="w-full py-3 text-white/40 hover:text-white text-sm transition-colors"
            >
              ← К урокам
            </button>
          </div>
        </div>
      </main>
    );
  }

  // ── Exercise screen ────────────────────────────────────────────────────────
  if (exerciseLoading || tasks.length === 0) {
    return (
      <div className="min-h-screen bg-[#07070f] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const task = tasks[taskIndex];
  const progressPct = (taskIndex / tasks.length) * 100;
  const level = activeLesson.level;
  const showRule = level === 'basic' || level === 'advanced';
  const ruleCollapsible = level === 'advanced';

  return (
    <main className="min-h-screen bg-[#07070f] text-white flex flex-col px-6 py-8">
      <div className="pointer-events-none fixed inset-0 flex items-start justify-center">
        <div className="w-[600px] h-[400px] bg-violet-700/10 blur-[120px] rounded-full mt-[-100px]" />
      </div>

      <div className="relative z-10 max-w-lg w-full mx-auto flex flex-col flex-1">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <button
            onClick={resetToLessons}
            className="text-white/40 hover:text-white text-sm transition-colors"
          >
            ← К урокам
          </button>
          <span className="text-white/30 text-sm">{taskIndex + 1} / {tasks.length}</span>
        </div>

        {/* Progress bar */}
        <div className="w-full h-1 bg-white/[0.06] rounded-full mb-8">
          <div
            className="h-1 bg-violet-500 rounded-full transition-all duration-300"
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
            <div className="w-full bg-white/[0.04] border border-white/[0.08] rounded-2xl p-8 text-center">
              <p className="text-white/30 text-xs uppercase tracking-wider mb-1">
                {task.case_name} · {task.number}
              </p>
              <p className="text-4xl font-bold tracking-tight mt-4 mb-2">{task.prompt_lt}</p>
              <p className="text-white/50 text-lg">{task.prompt_ru}</p>
            </div>
          ) : (
            <div className="w-full bg-white/[0.04] border border-white/[0.08] rounded-2xl p-8 text-center">
              {/* Puzzle header: base form → sentence */}
              {task.base_lt ? (
                <>
                  <p className="text-white/30 text-xs uppercase tracking-wider mb-3">Составьте форму</p>
                  <div className="flex items-center justify-center gap-3 mb-5">
                    <span className="text-2xl font-bold text-white">{task.base_lt}</span>
                    <span className="text-white/30 text-xl">→</span>
                    <span className="text-white/50 text-base font-mono">{task.display}</span>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-white/30 text-xs uppercase tracking-wider mb-4">Заполните пропуск</p>
                  <p className="text-2xl font-mono tracking-tight mb-4">{task.display}</p>
                </>
              )}
              <p className="text-white/50 text-base">{task.translation_ru}</p>
            </div>
          )}

          <div className="w-full flex flex-col gap-3">
            <input
              ref={inputRef}
              type="text"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') checkAnswer(); }}
              disabled={answerState !== 'unanswered'}
              placeholder={task.type === 'declension' ? 'Введите форму слова...' : 'Введите окончание...'}
              className={`w-full py-4 px-5 rounded-xl border bg-white/[0.04] text-white placeholder-white/20 outline-none transition-all duration-200
                ${answerState === 'correct' ? 'border-emerald-500/50 bg-emerald-500/10' :
                  answerState === 'wrong' ? 'border-red-500/50 bg-red-500/10' :
                  'border-white/[0.08] focus:border-violet-500/50'}`}
            />

            {answerState === 'unanswered' && (
              <button
                onClick={checkAnswer}
                className="w-full py-4 bg-violet-600 hover:bg-violet-500 rounded-xl font-medium transition-colors"
              >
                Проверить
              </button>
            )}

            {answerState === 'correct' && (
              <p className="text-emerald-400 text-sm font-medium text-center">Правильно!</p>
            )}

            {answerState === 'wrong' && (
              <div className="text-center">
                <p className="text-red-400 text-sm font-medium">Не совсем</p>
                <p className="text-white/50 text-sm mt-1">
                  Правильно: <span className="text-white font-medium">{shownAnswer}</span>
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
