'use client';

/**
 * GrammarTaskRunner — the grammar exercise-taking screen, extracted verbatim from
 * `app/dashboard/grammar/page.tsx` so it can be reused by the combined
 * "Продолжить занятие" session (`/dashboard/continue`).
 *
 * Deliberately dumb: it runs the tasks it is handed and reports the final score.
 * It never fetches, never charges quota and never saves a result — the caller owns
 * loading the tasks, its own done screen and persisting the result. That is what
 * lets the same component serve both the standalone lesson flow (which posts a
 * GrammarLessonResult) and one phase of the combined session.
 */

import { useEffect, useRef, useState } from 'react';
import { useT } from '../../../lib/useT';
import { isAnswerMatch } from '../../../lib/normalizeLt';
import PageMascot from '../../../components/PageMascot';
import TakChevron from '../../../components/TakChevron';
import { useMascotMood } from '../../../lib/mascotMood';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface GrammarRule {
  question: string;
  name_ru: string;
  usage: string;
  endings_sg: string;
  endings_pl: string;
  transform?: string;
  article_slug?: string;
  article_title_ru?: string;
  article_title_en?: string;
}

export interface VerbHint {
  description: string;
  rows: [string, string][];
}

export interface DeclensionTask {
  type: 'declension';
  prompt_lt: string;
  prompt_ru: string;
  case_name: string;
  number: string;
  answer: string;
}

export interface SentenceTask {
  type: 'sentence';
  display: string;
  answer: string;
  full_answer: string;
  translation_ru: string;
  base_lt?: string;
}

export interface VerbConjugationTask {
  type: 'verb_conjugation';
  verb_infinitive: string;
  translation_ru: string;
  tense_label: string;
  person_label: string;
  answer: string;
}

export interface VerbCaseTask {
  type: 'verb_case';
  verb_infinitive: string;
  translation_ru: string;
  example_lt: string;
  example_ru: string;
  answer: string;
}

export type Task = DeclensionTask | SentenceTask | VerbConjugationTask | VerbCaseTask;

export type AnswerState = 'unanswered' | 'correct' | 'wrong';

export type GrammarLevel = 'basic' | 'advanced' | 'practice';

// ── Sub-components ────────────────────────────────────────────────────────────

export function InlineSentenceInput({
  display,
  value,
  onChange,
  onKeyDown,
  disabled,
  answerState,
  inputRef,
  placeholder,
}: {
  display: string;
  value: string;
  onChange: (v: string) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  disabled: boolean;
  answerState: AnswerState;
  inputRef: React.RefObject<HTMLInputElement>;
  placeholder?: string;
}) {
  const [before, after] = display.split('___');
  const mirrorRef = useRef<HTMLSpanElement>(null);
  const [inputWidth, setInputWidth] = useState('2ch');

  useEffect(() => {
    if (mirrorRef.current) {
      const w = mirrorRef.current.offsetWidth;
      setInputWidth(`${Math.max(w + 4, 24)}px`);
    }
  }, [value]);

  const inputColor =
    answerState === 'correct'
      ? 'text-emerald-700 border-emerald-500 bg-emerald-50'
      : answerState === 'wrong'
      ? 'text-red-700 border-red-400 bg-red-50'
      : 'text-gray-900 border-line bg-transparent';

  return (
    <p className="text-lg sm:text-2xl md:text-3xl font-mono tracking-tight leading-relaxed text-center break-words" style={{ overflowWrap: 'break-word' }}>
      <span>{before}</span>
      <span className="relative inline-block">
        {/* hidden mirror to measure text width */}
        <span
          ref={mirrorRef}
          aria-hidden
          className="absolute invisible whitespace-pre text-lg sm:text-2xl md:text-3xl font-mono tracking-tight"
        >
          {value || ' '}
        </span>
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          disabled={disabled}
          autoCapitalize="none"
          autoCorrect="off"
          autoComplete="off"
          spellCheck={false}
          placeholder={placeholder}
          style={{ width: inputWidth, maxWidth: '100%' }}
          className={`inline-block border-b-2 outline-none text-lg sm:text-2xl md:text-3xl font-mono tracking-tight text-center transition-colors duration-200 ${inputColor}`}
        />
      </span>
      <span>{after}</span>
    </p>
  );
}

export function GrammarRuleCard({ rules, collapsible }: { rules: GrammarRule[]; collapsible: boolean }) {
  const { tr } = useT();
  const [open, setOpen] = useState(!collapsible);

  if (rules.length === 0) return null;

  return (
    <div className="w-full border border-line rounded-2xl overflow-hidden bg-teal-50">
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
        <div className="px-5 py-3 border-b border-line">
          <span className="text-teal-600 text-sm font-medium">{tr.grammar.grammarRule}</span>
        </div>
      )}

      {open && (
        <div className={`px-5 py-4 flex flex-col gap-4 ${collapsible ? 'border-t border-line' : ''}`}>
          {rules.map((rule, i) => (
            <div key={i} className={rules.length > 1 ? 'pb-4 border-b border-line last:border-0 last:pb-0' : ''}>
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

export function VerbHintCard({ hint, collapsible }: { hint: VerbHint; collapsible: boolean }) {
  const { tr } = useT();
  const [open, setOpen] = useState(!collapsible);

  return (
    <div className="w-full border border-line rounded-2xl overflow-hidden bg-teal-50">
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
        <div className="px-5 py-3 border-b border-line">
          <span className="text-teal-600 text-sm font-medium">{tr.grammar.grammarRule}</span>
        </div>
      )}

      {open && (
        <div className={`px-5 py-4 ${collapsible ? 'border-t border-line' : ''}`}>
          <p className="text-gray-600 text-sm mb-3">{hint.description}</p>
          <table className="w-full text-xs">
            <tbody>
              {hint.rows.map(([person, ending], i) => (
                <tr key={i} className={i % 2 === 0 ? 'bg-white/40 rounded' : ''}>
                  <td className="py-1.5 pr-4 text-gray-500 font-medium w-1/2">{person}</td>
                  <td className="py-1.5 text-gray-900 font-mono">{ending}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export interface GrammarTaskRunnerProps {
  tasks: Task[];
  level: GrammarLevel;
  /** Case rules shown above the task on basic/advanced lessons. */
  rules?: GrammarRule[];
  /** Conjugation hint table — verb lessons only; takes precedence over `rules`. */
  hint?: VerbHint;
  /** "Back" in the header — the caller decides where that goes. */
  onExit: () => void;
  /**
   * Called once, after the last task is answered. `mood` is TAK's final mood so the
   * caller's done screen can carry it over unchanged.
   */
  onFinish: (score: number, total: number, mood: number) => void;
}

export default function GrammarTaskRunner({
  tasks,
  level,
  rules,
  hint,
  onExit,
  onFinish,
}: GrammarTaskRunnerProps) {
  const { tr } = useT();

  const [taskIndex, setTaskIndex] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [typed, setTyped] = useState('');
  const [answerState, setAnswerState] = useState<AnswerState>('unanswered');
  const [shownAnswer, setShownAnswer] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const dismissBtnRef = useRef<HTMLButtonElement>(null);

  // TAK's mood for this run — neutral at the start, one step per answer.
  const { mood, recordAnswer } = useMascotMood();
  // onFinish fires from a timeout/click callback, so read the mood through a ref to
  // report the value that includes the answer that just ended the run.
  const moodRef = useRef(mood);
  useEffect(() => { moodRef.current = mood; }, [mood]);

  // Focus the answer field when the run starts (same 100ms delay as before).
  useEffect(() => {
    const id = setTimeout(() => inputRef.current?.focus(), 100);
    return () => clearTimeout(id);
  }, []);

  // Focus dismiss button after a short delay so the Enter keypress that
  // triggered the wrong answer doesn't immediately activate it.
  useEffect(() => {
    if (answerState !== 'wrong') return;
    const id = setTimeout(() => dismissBtnRef.current?.focus(), 100);
    return () => clearTimeout(id);
  }, [answerState]);

  function advanceTask(isCorrect: boolean) {
    const next = taskIndex + 1;
    if (next >= tasks.length) {
      const finalCorrect = isCorrect ? correct + 1 : correct;
      onFinish(finalCorrect, tasks.length, moodRef.current);
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
    const isCorrect = isAnswerMatch(typed.trim(), task.answer);
    setAnswerState(isCorrect ? 'correct' : 'wrong');
    recordAnswer(isCorrect);
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

  if (tasks.length === 0) return null;

  const task = tasks[taskIndex];
  const progressPct = (taskIndex / tasks.length) * 100;
  const showRule = level === 'basic' || level === 'advanced';
  const ruleCollapsible = level === 'advanced';

  return (
    <main className="min-h-screen text-gray-900 flex flex-col px-6 py-8">

      <div className="relative z-10 max-w-lg w-full mx-auto flex flex-col flex-1">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <button
            onClick={onExit}
            className="text-gray-400 hover:text-gray-900 text-sm transition-colors"
          >
            <TakChevron direction="left" size={10} className="inline-block align-[-1px] mr-1" />{tr.grammar.backToLessons}
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
            {hint ? (
              <VerbHintCard hint={hint} collapsible={ruleCollapsible} />
            ) : (
              <GrammarRuleCard rules={rules ?? []} collapsible={ruleCollapsible} />
            )}
          </div>
        )}

        {/* Task card */}
        <div className="flex flex-col items-center justify-center flex-1 gap-12">
          <PageMascot phrase="Pagalvok!" mood={mood} />
          {task.type === 'declension' && (
            <div className="w-full bg-white border border-line rounded-2xl p-5 sm:p-8 text-center">
              <p className="text-gray-400 text-xs uppercase tracking-wider mb-1">
                {task.case_name} · {task.number}
              </p>
              <p className="text-2xl sm:text-4xl font-bold tracking-tight mt-4 mb-4 break-words">{task.prompt_lt}</p>
              <p className="text-gray-500 text-base sm:text-lg mb-5">{task.prompt_ru}</p>
              <input
                ref={inputRef}
                type="text"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && typed.trim()) checkAnswer(); }}
                disabled={answerState !== 'unanswered'}
                autoCapitalize="none" autoCorrect="off" autoComplete="off" spellCheck={false}
                placeholder={tr.grammar.typeDeclension}
                className={`w-full py-3 px-4 rounded-xl border text-base text-gray-900 placeholder-gray-400 focus:outline-none transition-colors duration-200
                  ${answerState === 'correct' ? 'border-emerald-300 bg-emerald-50 text-emerald-700' :
                    answerState === 'wrong'   ? 'border-red-300 bg-red-50 text-red-600 line-through' :
                    'border-gray-200 bg-gray-50 focus:border-emerald-400 focus:bg-white'}`}
              />
            </div>
          )}

          {task.type === 'sentence' && (
            <div className="w-full bg-white border border-line rounded-2xl p-5 sm:p-8 text-center overflow-hidden">
              {task.base_lt && (
                <p className="text-gray-400 text-xs mb-4">{tr.grammar.sentenceFrom}<span className="font-medium text-gray-500">{task.base_lt}</span></p>
              )}
              <div className="mb-4">
                <InlineSentenceInput
                  display={task.display}
                  value={typed}
                  onChange={setTyped}
                  onKeyDown={(e) => { if (e.key === 'Enter' && typed.trim()) checkAnswer(); }}
                  disabled={answerState !== 'unanswered'}
                  answerState={answerState}
                  inputRef={inputRef}
                />
              </div>
              <p className="text-gray-500 text-base">{task.translation_ru}</p>
            </div>
          )}

          {task.type === 'verb_conjugation' && (
            <div className="w-full bg-white border border-line rounded-2xl p-5 sm:p-8 text-center overflow-hidden">
              <p className="text-gray-400 text-xs mb-4">{task.tense_label}</p>
              <div className="mb-4">
                <InlineSentenceInput
                  display={`${task.verb_infinitive} — ${task.person_label} ___`}
                  value={typed}
                  onChange={setTyped}
                  onKeyDown={(e) => { if (e.key === 'Enter' && typed.trim()) checkAnswer(); }}
                  disabled={answerState !== 'unanswered'}
                  answerState={answerState}
                  inputRef={inputRef}
                  placeholder={tr.grammar.verbConjugationPlaceholder}
                />
              </div>
              <p className="text-gray-500 text-base">{task.translation_ru}</p>
            </div>
          )}

          {task.type === 'verb_case' && (
            <div className="w-full bg-white border border-line rounded-2xl p-5 sm:p-8 text-center">
              <p className="text-gray-400 text-xs uppercase tracking-wider mb-3">
                {task.verb_infinitive} — {task.translation_ru}
              </p>
              <p className="text-lg sm:text-xl font-medium text-gray-900 mb-2">{task.example_lt}</p>
              <p className="text-gray-500 text-base mb-5">{task.example_ru}</p>
              <p className="text-gray-400 text-xs mb-3">{tr.grammar.verbCaseGovernancePrompt}</p>
              <input
                ref={inputRef}
                type="text"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && typed.trim()) checkAnswer(); }}
                disabled={answerState !== 'unanswered'}
                autoCapitalize="none" autoCorrect="off" autoComplete="off" spellCheck={false}
                placeholder={tr.grammar.verbCasePlaceholder}
                className={`w-full py-3 px-4 rounded-xl border text-base text-gray-900 placeholder-gray-400 focus:outline-none transition-colors duration-200
                  ${answerState === 'correct' ? 'border-emerald-300 bg-emerald-50 text-emerald-700' :
                    answerState === 'wrong'   ? 'border-red-300 bg-red-50 text-red-600 line-through' :
                    'border-gray-200 bg-gray-50 focus:border-emerald-400 focus:bg-white'}`}
              />
            </div>
          )}

          <div className="w-full flex flex-col gap-3">
            {answerState === 'unanswered' && (
              <button
                onClick={checkAnswer}
                disabled={!typed.trim()}
                className="w-full py-4 bg-gray-900 hover:bg-gray-800 rounded-xl font-medium text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {tr.common.check}
              </button>
            )}

            {answerState === 'correct' && (task.type === 'sentence' || task.type === 'verb_conjugation') && (
              <p className="text-emerald-600 text-sm font-medium text-center">{tr.common.correct}</p>
            )}

            {answerState === 'wrong' && (
              <div className="flex flex-col gap-3 animate-in fade-in duration-150">
                <div className="text-center">
                  <p className="text-gray-500 text-sm">
                    {tr.common.correctAnswer} <span className="text-gray-900 font-semibold">{shownAnswer}</span>
                  </p>
                </div>
                <button
                  ref={dismissBtnRef}
                  data-testid="dismiss-wrong"
                  onClick={dismissWrongGrammar}
                  className="w-full py-4 bg-gray-100 hover:bg-gray-200 rounded-xl font-medium transition-colors"
                >
                  {tr.common.dismiss} <TakChevron size={10} className="inline-block align-[-1px]" />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
