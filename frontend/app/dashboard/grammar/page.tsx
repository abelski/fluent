'use client';

import { useEffect, useState, useRef } from 'react';
import { BACKEND_URL } from '../../../lib/api';
import StatsBar from '../components/StatsBar';

interface Lesson {
  id: number;
  title: string;
  level: 'basic' | 'advanced' | 'practice';
  cases: number[];
  task_count: number;
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
  practice: 'Практика',
};

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

export default function GrammarPage() {
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [loading, setLoading] = useState(true);

  // Exercise state
  const [activeLessonId, setActiveLessonId] = useState<number | null>(null);
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

  function startLesson(id: number) {
    setExerciseLoading(true);
    setActiveLessonId(id);
    setTaskIndex(0);
    setCorrect(0);
    setDone(false);
    setTyped('');
    setAnswerState('unanswered');
    setShownAnswer('');

    fetch(`${BACKEND_URL}/api/grammar/lessons/${id}/tasks`)
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
    setActiveLessonId(null);
    setTasks([]);
    setDone(false);
  }

  // ── Lesson list ────────────────────────────────────────────────────────────
  if (activeLessonId === null) {
    return (
      <main className="bg-[#07070f] text-white">
        <div className="pointer-events-none fixed inset-0 flex items-start justify-center">
          <div className="w-[600px] h-[400px] bg-violet-700/10 blur-[120px] rounded-full mt-[-100px]" />
        </div>

        <div className="relative z-10 max-w-4xl mx-auto px-6 py-8">
          <StatsBar />

          <h1 className="text-3xl font-bold mb-2">Грамматика</h1>
          <p className="text-white/40 mb-10">Выбери урок для тренировки склонений</p>

          {loading ? (
            <div className="flex justify-center py-20">
              <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {lessons.map((lesson) => (
                <button
                  key={lesson.id}
                  onClick={() => startLesson(lesson.id)}
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
              onClick={() => startLesson(activeLessonId)}
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
        <div className="w-full h-1 bg-white/[0.06] rounded-full mb-10">
          <div
            className="h-1 bg-violet-500 rounded-full transition-all duration-300"
            style={{ width: `${progressPct}%` }}
          />
        </div>

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
              <p className="text-white/30 text-xs uppercase tracking-wider mb-4">Заполните пропуск</p>
              <p className="text-2xl font-mono tracking-tight mb-4">{task.display}</p>
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
              placeholder={task.type === 'declension' ? 'Введите форму слова...' : 'Введите пропущенную часть...'}
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
