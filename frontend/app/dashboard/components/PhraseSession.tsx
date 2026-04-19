'use client';

/**
 * PhraseSession — 3-stage phrase learning component.
 *
 * Stage 0 (intro):   Show full phrase + translation. User taps "Got it" or "Hard".
 * Stage 1 (fill):    Phrase with one word blanked as ___. First MCQ (4 options),
 *                    then type the blanked word. Mistake → re-queue, record mistake_word.
 * Stage 2 (type):    Show translation only. User types the full phrase.
 *                    Validation: complexity-aware, diacritic-tolerant.
 *
 * Parity features with QuizSession:
 *  - Enter/Space key advances past correct/wrong feedback
 *  - Configurable answer timer (from user settings)
 *  - MatchRound pairs game after session completes
 *  - Visual progress bar
 *  - Char-level diff on wrong phrase answers (stage 2)
 *  - Complexity setting (easy/medium/hard) from localStorage
 *  - Lesson mode (thorough/quick) — quick mode stops early on high mistake rate
 *  - Live mistake counter in header
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { recordPhraseProgress, getSettings, type PhraseStudyItem } from '../../../lib/api';
import { useT } from '../../../lib/useT';
import CharDiff from './CharDiff';
import MatchRound from './MatchRound';
import type { Word } from './QuizSession';

// ── Types ─────────────────────────────────────────────────────────────────────

type Complexity = 'easy' | 'medium' | 'hard';

// ── Text validation ───────────────────────────────────────────────────────────

function normalizeLt(text: string): string {
  return text
    .toLowerCase()
    .replace(/į/g, 'i').replace(/č/g, 'c').replace(/š/g, 's')
    .replace(/ž/g, 'z').replace(/ę/g, 'e').replace(/ė/g, 'e').replace(/ą/g, 'a')
    .replace(/ū/g, 'u').replace(/uo/g, 'u');
}

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

function checkPhrase(typed: string, target: string, complexity: Complexity): boolean {
  const clean = (s: string) =>
    normalizeLt(s.replace(/[.,!?;:'"/()]/g, '').replace(/\s+/g, ' ').trim());
  const t = clean(typed);
  const r = clean(target);
  if (t === r) return true;
  if (complexity === 'hard') return false;
  const threshold = Math.max(1, Math.floor(r.length * (complexity === 'easy' ? 0.25 : 0.15)));
  return levenshtein(t, r) <= threshold;
}

function checkWord(typed: string, target: string, complexity: Complexity): boolean {
  const clean = (s: string) => normalizeLt(s.replace(/[.,!?;:'"/()]/g, '').trim());
  if (complexity === 'hard') return typed.trim().toLowerCase() === target.trim().toLowerCase();
  const t = clean(typed);
  const r = clean(target);
  if (t === r) return true;
  if (complexity === 'easy') return levenshtein(t, r) <= 1;
  return false;
}

// ── Queue helpers ─────────────────────────────────────────────────────────────

interface QueueItem {
  phrase: PhraseStudyItem;
  retries: number;
}

function buildQueue(phrases: PhraseStudyItem[]): QueueItem[] {
  return phrases.map((p) => ({ phrase: p, retries: 0 }));
}

// ── Sub-steps within stage 1 ──────────────────────────────────────────────────
type Stage1Step = 'mcq' | 'type';

// ── Phrase → Word adapter for MatchRound ─────────────────────────────────────
function phrasesToWords(phrases: PhraseStudyItem[]): Word[] {
  const seen = new Set<number>();
  return phrases.filter((p) => { if (seen.has(p.id)) return false; seen.add(p.id); return true; })
    .map((p) => ({
      id: p.id,
      lithuanian: p.text,
      translation_en: p.translation_en ?? p.translation,
      translation_ru: p.translation,
      hint: null,
    }));
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function PhraseSession({
  phrases,
  backHref,
  onRepeat,
}: {
  phrases: PhraseStudyItem[];
  backHref: string;
  onRepeat: () => void;
}) {
  const { tr, lang } = useT();
  const getTranslation = (p: PhraseStudyItem) =>
    (lang === 'en' && p.translation_en) ? p.translation_en : p.translation;

  // ── Settings ────────────────────────────────────────────────────────────────
  const [complexity, setComplexity] = useState<Complexity>('medium');
  const [lessonMode, setLessonMode] = useState<'thorough' | 'quick'>('thorough');
  const [useTimer, setUseTimer] = useState(false);
  const [timerSeconds, setTimerSeconds] = useState(5);

  useEffect(() => {
    const stored = localStorage.getItem('fluent_complexity') as Complexity | null;
    if (stored === 'easy' || stored === 'medium' || stored === 'hard') setComplexity(stored);
    getSettings().then((s) => {
      setLessonMode(s.lesson_mode);
      setUseTimer(s.use_question_timer);
      setTimerSeconds(s.question_timer_seconds);
    }).catch(() => {/* use defaults */});
  }, []);

  // ── Core state ───────────────────────────────────────────────────────────────
  const [queue, setQueue] = useState<QueueItem[]>(() => buildQueue(phrases));
  const [currentIdx, setCurrentIdx] = useState(0);
  const [stage1Step, setStage1Step] = useState<Stage1Step>('mcq');
  const [mcqSelected, setMcqSelected] = useState<string | null>(null);
  const [mcqResult, setMcqResult] = useState<'correct' | 'wrong' | null>(null);
  const [typeInput, setTypeInput] = useState('');
  const [typeResult, setTypeResult] = useState<'correct' | 'wrong' | null>(null);
  const [showAnswer, setShowAnswer] = useState(false);
  const [done, setDone] = useState(false);
  const [showMatchRound, setShowMatchRound] = useState(false);
  const [correctCount, setCorrectCount] = useState(0);
  const [mistakeCount, setMistakeCount] = useState(0);
  const [phrasesDone, setPhrasesDone] = useState(0);
  const [saving, setSaving] = useState(false);

  const inputRef     = useRef<HTMLInputElement>(null);
  const textareaRef  = useRef<HTMLTextAreaElement>(null);
  const blockUntilRef = useRef(0);
  const donePhrasesRef     = useRef<Set<number>>(new Set());
  const mistakePhraseIdsRef = useRef<Set<number>>(new Set());

  // ── Timer ────────────────────────────────────────────────────────────────────
  const [timeLeft, setTimeLeft] = useState(timerSeconds);
  const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const current = queue[currentIdx];
  const stage   = current?.phrase.lesson_stage;

  // Timer: start/reset on each new card (skip stage 0 intro, same as QuizSession skipping stage 1)
  useEffect(() => {
    if (timerIntervalRef.current) { clearInterval(timerIntervalRef.current); timerIntervalRef.current = null; }
    if (!useTimer || stage === undefined || stage === 0) return;
    setTimeLeft(timerSeconds);
    timerIntervalRef.current = setInterval(() => setTimeLeft((t) => t - 1), 1000);
    return () => { if (timerIntervalRef.current) { clearInterval(timerIntervalRef.current); timerIntervalRef.current = null; } };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIdx, stage1Step, stage, useTimer, timerSeconds]);

  // Stop timer when answer is submitted
  useEffect(() => {
    const hasResult = mcqResult !== null || typeResult !== null;
    if (hasResult && timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current); timerIntervalRef.current = null;
    }
  }, [mcqResult, typeResult]);

  // ── Reset card state on index change ────────────────────────────────────────
  useEffect(() => {
    setStage1Step('mcq');
    setMcqSelected(null);
    setMcqResult(null);
    setTypeInput('');
    setTypeResult(null);
    setShowAnswer(false);
  }, [currentIdx]);

  useEffect(() => {
    if (stage1Step === 'type' && inputRef.current) inputRef.current.focus();
  }, [stage1Step]);

  useEffect(() => {
    if (current?.phrase.lesson_stage === 2 && textareaRef.current) textareaRef.current.focus();
  }, [current]);

  // ── Timer timeout → mark wrong ───────────────────────────────────────────────
  useEffect(() => {
    if (!useTimer || timeLeft > 0 || stage === undefined || stage === 0) return;
    const hasResult = mcqResult !== null || typeResult !== null;
    if (hasResult) return;
    if (timerIntervalRef.current) { clearInterval(timerIntervalRef.current); timerIntervalRef.current = null; }
    // Mark as wrong
    if (stage === 1) {
      if (stage1Step === 'mcq') {
        setMcqResult('wrong');
      } else {
        setTypeResult('wrong');
      }
    } else {
      setTypeResult('wrong');
    }
    if (current && !mistakePhraseIdsRef.current.has(current.phrase.id)) {
      mistakePhraseIdsRef.current.add(current.phrase.id);
      setMistakeCount((c) => c + 1);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeLeft, useTimer, stage, stage1Step]);

  // ── Enter key: advance past shown results ────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      if (Date.now() < blockUntilRef.current) return;
      if (!current) return;
      const s = current.phrase.lesson_stage;

      // Stage 0: Enter triggers "Got it"
      if (s === 0 && !saving) {
        e.preventDefault();
        blockUntilRef.current = Date.now() + 200;
        advanceQueue(5);
        return;
      }

      // Stage 1 MCQ wrong shown → advance
      if (s === 1 && stage1Step === 'mcq' && mcqResult === 'wrong') {
        e.preventDefault();
        blockUntilRef.current = Date.now() + 200;
        advanceQueue(1, current.phrase.blank_word);
        return;
      }

      // Stage 1 type result shown → advance
      if (s === 1 && stage1Step === 'type' && typeResult !== null) {
        e.preventDefault();
        blockUntilRef.current = Date.now() + 200;
        if (typeResult === 'correct') advanceQueue(5);
        else advanceQueue(1, current.phrase.blank_word);
        return;
      }

      // Stage 2 type result shown → advance
      if (s === 2 && typeResult !== null) {
        e.preventDefault();
        blockUntilRef.current = Date.now() + 200;
        if (typeResult === 'correct') advanceQueue(5);
        else advanceQueue(1);
        return;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, stage1Step, mcqResult, typeResult, saving]);

  // ── Progress ──────────────────────────────────────────────────────────────────
  const progressPct = phrases.length > 0 ? (phrasesDone / phrases.length) * 100 : 0;

  // ── advanceQueue ──────────────────────────────────────────────────────────────
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const advanceQueue = useCallback(async (quality: number, mistakeWord?: string) => {
    if (!current) return;
    const { phrase } = current;
    const s = phrase.lesson_stage;

    setSaving(true);
    try {
      await recordPhraseProgress(phrase.id, {
        quality,
        stage_completed: s,
        ...(mistakeWord ? { mistake_word: mistakeWord } : {}),
      });
    } catch (e) {
      console.error('Failed to record progress', e);
    } finally {
      setSaving(false);
    }

    if (quality >= 3) {
      setCorrectCount((c) => c + 1);
      if (!donePhrasesRef.current.has(phrase.id)) {
        donePhrasesRef.current.add(phrase.id);
        setPhrasesDone((c) => c + 1);
      }
    } else {
      if (!mistakePhraseIdsRef.current.has(phrase.id)) {
        mistakePhraseIdsRef.current.add(phrase.id);
        setMistakeCount((c) => c + 1);
      }
      if (current.retries >= 2 && !donePhrasesRef.current.has(phrase.id)) {
        donePhrasesRef.current.add(phrase.id);
        setPhrasesDone((c) => c + 1);
      }
    }

    const newQueue = (() => {
      const next = [...queue];
      if (quality < 3 && current.retries < 2) {
        const insertAt = Math.min(currentIdx + 2, next.length);
        next.splice(insertAt, 0, { phrase, retries: current.retries + 1 });
      }
      return next;
    })();
    setQueue(newQueue);

    // Quick mode: stop early if too many unique mistakes (≥25%)
    const uniqueMistakes = mistakePhraseIdsRef.current.size;
    if (lessonMode === 'quick' && uniqueMistakes / phrases.length >= 0.25) {
      setShowMatchRound(true);
      return;
    }

    const isLast = currentIdx + 1 >= newQueue.length;
    const isDone = quality >= 3 || current.retries >= 2;
    if (isLast && isDone) {
      setShowMatchRound(true);
    } else {
      setCurrentIdx((i) => i + 1);
    }
  // We intentionally list specific deps; queue/current captured at call time
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, currentIdx, queue, lessonMode, phrases.length]);

  // ── Done screen ───────────────────────────────────────────────────────────────
  if (done) {
    return (
      <main className="min-h-screen bg-slate-50 text-gray-900 flex flex-col items-center justify-center px-6">
        <div className="pointer-events-none fixed inset-0 flex items-start justify-center">
          <div className="w-[600px] h-[400px] bg-emerald-100/40 blur-[120px] rounded-full mt-[-100px]" />
        </div>
        <div className="relative z-10 text-center max-w-sm w-full">
          <div className="text-5xl mb-4">🎉</div>
          <h2 className="text-2xl font-bold mb-2">Сессия завершена!</h2>
          <div className="flex gap-4 justify-center mb-6">
            <div className="bg-white border border-gray-900 rounded-2xl px-6 py-5 text-center">
              <div className="text-2xl font-bold text-emerald-600">{correctCount}</div>
              <div className="text-gray-400 text-sm mt-1">Правильно</div>
            </div>
            <div className="bg-white border border-gray-900 rounded-2xl px-6 py-5 text-center">
              <div className="text-2xl font-bold text-amber-600">{mistakeCount}</div>
              <div className="text-gray-400 text-sm mt-1">Ошибки</div>
            </div>
          </div>
          <div className="flex flex-col gap-3">
            <button
              onClick={onRepeat}
              className="w-full py-3 bg-emerald-600 text-white rounded-xl font-medium hover:bg-emerald-700 transition-colors"
            >
              Ещё раз
            </button>
            <Link
              href={backHref}
              className="w-full py-3 text-gray-400 hover:text-gray-900 text-sm transition-colors text-center"
            >
              ← Назад к программам
            </Link>
          </div>
        </div>
      </main>
    );
  }

  // ── Match round ───────────────────────────────────────────────────────────────
  if (showMatchRound) {
    return (
      <MatchRound
        words={phrasesToWords(phrases)}
        lang={lang}
        onDone={() => { setShowMatchRound(false); setDone(true); }}
        backHref={backHref}
      />
    );
  }

  if (!current) return null;

  const { phrase } = current;
  const s = phrase.lesson_stage;

  // ── Shared header ─────────────────────────────────────────────────────────────
  function Header() {
    return (
      <div className="flex justify-between items-center mb-4">
        <Link href={backHref} className="text-sm text-gray-400 hover:text-gray-700 transition-colors">
          ← Назад к программам
        </Link>
        <div className="flex items-center gap-3">
          <span className="text-gray-400 text-sm">{currentIdx + 1} / {queue.length}</span>
          {mistakeCount > 0 && (
            <span className="text-amber-500 text-sm">{mistakeCount} ✗</span>
          )}
        </div>
      </div>
    );
  }

  // ── Shared progress + timer bars ──────────────────────────────────────────────
  function ProgressBars() {
    return (
      <>
        <div className="w-full h-1 bg-gray-100 rounded-full mb-1">
          <div
            className="h-1 bg-emerald-500 rounded-full transition-all duration-300"
            style={{ width: `${progressPct}%` }}
          />
        </div>
        <div className={`w-full h-1 rounded-full mb-4 ${useTimer && s !== 0 ? 'bg-gray-100' : 'bg-transparent'}`}>
          {useTimer && s !== 0 && (
            <div
              data-testid="timer-bar"
              className={`h-1 rounded-full transition-all duration-1000 ${timeLeft <= 1 ? 'bg-red-400' : 'bg-amber-400'}`}
              style={{ width: `${(timeLeft / timerSeconds) * 100}%` }}
            />
          )}
        </div>
      </>
    );
  }

  // Build phrase text with blanked word for stage 1
  function buildBlankedPhrase(text: string, blankWord: string): { before: string; after: string } {
    const idx = text.toLowerCase().indexOf(blankWord.toLowerCase());
    if (idx === -1) return { before: text, after: '' };
    return { before: text.slice(0, idx), after: text.slice(idx + blankWord.length) };
  }

  function buildMcqOptions(blankWord: string, distractors: string[]): string[] {
    const options = [blankWord, ...distractors.slice(0, 3)];
    for (let i = options.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [options[i], options[j]] = [options[j], options[i]];
    }
    return options;
  }

  // ── Stage 0: Intro card ───────────────────────────────────────────────────────
  if (s === 0) {
    return (
      <main className="min-h-screen bg-slate-50 flex flex-col items-center px-4 py-10" data-testid="phrase-session-stage0">
        <div className="pointer-events-none fixed inset-0 flex items-start justify-center">
          <div className="w-[600px] h-[400px] bg-emerald-100/40 blur-[120px] rounded-full mt-[-100px]" />
        </div>
        <div className="relative z-10 w-full max-w-sm">
          <Header />
          <ProgressBars />

          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 text-center mb-6">
            <p className="text-xs text-emerald-600 font-medium mb-4 uppercase tracking-wider">Новая фраза</p>
            <p className="text-2xl font-bold text-gray-900 mb-3">{phrase.text}</p>
            <p className="text-gray-500 text-lg">{getTranslation(phrase)}</p>
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => advanceQueue(2)}
              disabled={saving}
              className="flex-1 py-3 rounded-xl text-sm font-medium bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
            >
              Сложно
            </button>
            <button
              onClick={() => advanceQueue(5)}
              disabled={saving}
              data-testid="got-it-btn"
              className="flex-1 py-3 rounded-xl text-sm font-medium bg-emerald-600 text-white hover:bg-emerald-700 transition-colors"
            >
              Запомнил →
            </button>
          </div>
        </div>
      </main>
    );
  }

  // ── Stage 1: Fill word ────────────────────────────────────────────────────────
  if (s === 1) {
    const { before, after } = buildBlankedPhrase(phrase.text, phrase.blank_word);

    if (stage1Step === 'mcq') {
      const options = buildMcqOptions(phrase.blank_word, phrase.mcq_distractors);

      const handleMcqSelect = (word: string) => {
        if (mcqResult) return;
        setMcqSelected(word);
        const correct = word.toLowerCase() === phrase.blank_word.toLowerCase();
        setMcqResult(correct ? 'correct' : 'wrong');
        if (correct) {
          setTimeout(() => setStage1Step('type'), 700);
        }
      };

      return (
        <main className="min-h-screen bg-slate-50 flex flex-col items-center px-4 py-10" data-testid="phrase-session-stage1-mcq">
          <div className="pointer-events-none fixed inset-0 flex items-start justify-center">
            <div className="w-[600px] h-[400px] bg-emerald-100/40 blur-[120px] rounded-full mt-[-100px]" />
          </div>
          <div className="relative z-10 w-full max-w-sm">
            <Header />
            <ProgressBars />

            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-6">
              <p className="text-xs text-amber-600 font-medium mb-4 uppercase tracking-wider">Выберите слово</p>
              <p className="text-lg text-gray-900 text-center leading-relaxed">
                {before}
                <span className="inline-block bg-amber-100 text-amber-800 font-bold px-2 py-0.5 rounded mx-1 min-w-[60px] text-center">
                  {mcqResult === 'correct' ? phrase.blank_word : '___'}
                </span>
                {after}
              </p>
              <p className="text-sm text-gray-400 text-center mt-3">{getTranslation(phrase)}</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {options.map((opt) => {
                const isSelected = mcqSelected === opt;
                const isCorrectWord = opt.toLowerCase() === phrase.blank_word.toLowerCase();
                let cls = 'py-3 px-4 rounded-xl text-sm font-medium border transition-colors text-center ';
                if (!mcqResult) {
                  cls += 'bg-white border-gray-200 text-gray-700 hover:border-emerald-400 hover:text-emerald-700 cursor-pointer';
                } else if (isCorrectWord) {
                  cls += 'bg-emerald-50 border-emerald-400 text-emerald-700';
                } else if (isSelected && !isCorrectWord) {
                  cls += 'bg-red-50 border-red-300 text-red-600';
                } else {
                  cls += 'bg-white border-gray-200 text-gray-400';
                }
                return (
                  <button key={opt} onClick={() => handleMcqSelect(opt)} className={cls} disabled={!!mcqResult}>
                    {opt}
                  </button>
                );
              })}
            </div>

            {mcqResult === 'wrong' && (
              <div className="mt-4 bg-red-50 border border-red-200 rounded-xl p-4 text-center">
                <p className="text-sm text-red-600 mb-1">Не совсем. Правильный ответ:</p>
                <p className="font-semibold text-red-700">{phrase.blank_word}</p>
                <button
                  onClick={() => { blockUntilRef.current = Date.now() + 200; advanceQueue(1, phrase.blank_word); }}
                  disabled={saving}
                  className="mt-3 px-5 py-2 bg-red-500 text-white rounded-xl text-sm font-medium hover:bg-red-600 transition-colors"
                >
                  Понял, дальше →
                </button>
              </div>
            )}
          </div>
        </main>
      );
    }

    // Stage 1, step 2: type the word
    const handleWordSubmit = () => {
      if (!typeInput.trim()) return;
      const correct = checkWord(typeInput.trim(), phrase.blank_word, complexity);
      setTypeResult(correct ? 'correct' : 'wrong');
    };

    return (
      <main className="min-h-screen bg-slate-50 flex flex-col items-center px-4 py-10" data-testid="phrase-session-stage1-type">
        <div className="pointer-events-none fixed inset-0 flex items-start justify-center">
          <div className="w-[600px] h-[400px] bg-emerald-100/40 blur-[120px] rounded-full mt-[-100px]" />
        </div>
        <div className="relative z-10 w-full max-w-sm">
          <Header />
          <ProgressBars />

          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-6">
            <p className="text-xs text-amber-600 font-medium mb-4 uppercase tracking-wider">Напишите слово</p>
            <p className="text-lg text-gray-900 text-center leading-relaxed">
              {before}
              <span className="inline-block bg-amber-100 text-amber-800 font-bold px-2 py-0.5 rounded mx-1 min-w-[60px] text-center">
                {typeResult === 'correct' ? phrase.blank_word : '___'}
              </span>
              {after}
            </p>
            <p className="text-sm text-gray-400 text-center mt-3">{getTranslation(phrase)}</p>
          </div>

          {!typeResult && (
            <div className="flex gap-2">
              <input
                ref={inputRef}
                value={typeInput}
                onChange={(e) => setTypeInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleWordSubmit(); }}
                placeholder="Введите пропущенное слово..."
                className="flex-1 px-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-emerald-400"
              />
              <button
                onClick={handleWordSubmit}
                className="px-4 py-3 rounded-xl bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 transition-colors"
              >
                →
              </button>
            </div>
          )}

          {typeResult === 'correct' && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-center">
              <p className="text-emerald-700 font-semibold mb-3">Правильно! ✓</p>
              <button
                onClick={() => { blockUntilRef.current = Date.now() + 200; advanceQueue(5); }}
                disabled={saving}
                className="px-5 py-2 bg-emerald-600 text-white rounded-xl text-sm font-medium hover:bg-emerald-700 transition-colors"
              >
                Дальше →
              </button>
            </div>
          )}

          {typeResult === 'wrong' && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-center">
              <p className="text-sm text-red-600 mb-1">Не совсем. Правильный ответ:</p>
              <p className="font-semibold text-red-700 mb-3">{phrase.blank_word}</p>
              <button
                onClick={() => { blockUntilRef.current = Date.now() + 200; advanceQueue(1, phrase.blank_word); }}
                disabled={saving}
                className="px-5 py-2 bg-red-500 text-white rounded-xl text-sm font-medium hover:bg-red-600 transition-colors"
              >
                Понял, дальше →
              </button>
            </div>
          )}
        </div>
      </main>
    );
  }

  // ── Stage 2: Type full phrase ─────────────────────────────────────────────────

  const handlePhraseSubmit = () => {
    if (!typeInput.trim()) return;
    const correct = checkPhrase(typeInput.trim(), phrase.text, complexity);
    setTypeResult(correct ? 'correct' : 'wrong');
  };

  return (
    <main className="min-h-screen bg-slate-50 flex flex-col items-center px-4 py-10" data-testid="phrase-session-stage2">
      <div className="pointer-events-none fixed inset-0 flex items-start justify-center">
        <div className="w-[600px] h-[400px] bg-emerald-100/40 blur-[120px] rounded-full mt-[-100px]" />
      </div>
      <div className="relative z-10 w-full max-w-sm">
        <Header />
        <ProgressBars />

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 text-center mb-6">
          <p className="text-xs text-purple-600 font-medium mb-4 uppercase tracking-wider">Напишите фразу</p>
          <p className="text-2xl text-gray-500 mb-2">{getTranslation(phrase)}</p>
          {showAnswer && (
            <p className="text-base text-emerald-700 font-medium mt-3 border-t border-gray-100 pt-3">{phrase.text}</p>
          )}
        </div>

        {!typeResult && (
          <>
            <textarea
              ref={textareaRef}
              value={typeInput}
              onChange={(e) => setTypeInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handlePhraseSubmit(); } }}
              placeholder="Напишите фразу по-литовски..."
              rows={2}
              className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-emerald-400 resize-none mb-3"
            />
            <div className="flex gap-2">
              <button
                onClick={() => setShowAnswer((s) => !s)}
                className="flex-1 py-3 rounded-xl text-sm text-gray-400 hover:text-gray-700 bg-gray-100 hover:bg-gray-200 transition-colors"
              >
                {showAnswer ? 'Скрыть' : 'Показать ответ'}
              </button>
              <button
                onClick={handlePhraseSubmit}
                className="flex-1 py-3 rounded-xl bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 transition-colors"
              >
                Проверить →
              </button>
            </div>
          </>
        )}

        {typeResult === 'correct' && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-center">
            <p className="text-emerald-700 font-semibold mb-1">Правильно! ✓</p>
            <p className="text-sm text-gray-500 mb-3">{phrase.text}</p>
            <button
              onClick={() => { blockUntilRef.current = Date.now() + 200; advanceQueue(5); }}
              disabled={saving}
              className="px-5 py-2 bg-emerald-600 text-white rounded-xl text-sm font-medium hover:bg-emerald-700 transition-colors"
            >
              Дальше →
            </button>
          </div>
        )}

        {typeResult === 'wrong' && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-center">
            <div className="mb-3">
              <CharDiff
                typed={typeInput}
                target={phrase.text}
                labelTyped={tr.common.youTyped}
                labelCorrect={tr.common.correctAnswer}
              />
            </div>
            <button
              onClick={() => { blockUntilRef.current = Date.now() + 200; advanceQueue(1); }}
              disabled={saving}
              className="px-5 py-2 bg-red-500 text-white rounded-xl text-sm font-medium hover:bg-red-600 transition-colors"
            >
              Понял, дальше →
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
