'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { BACKEND_URL, getToken, getSettings } from '../../../lib/api';
import { useT } from '../../../lib/useT';
import type { Lang } from '../../../lib/useLang';
import MatchRound from './MatchRound';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface Word {
  id: number;
  lithuanian: string;
  translation_en: string;
  translation_ru: string;
  hint: string | null;
  status?: string;
}

interface StudyCard {
  word: Word;
  stage: 1 | 2 | 3;
  failCount: number;
  standalone?: boolean;
}

type AnswerState = 'unanswered' | 'correct' | 'wrong' | 'empty';
type Complexity = 'easy' | 'medium' | 'hard';

export interface QuizSessionProps {
  words: Word[];
  distractors?: Word[];
  sessionMode: 'study' | 'review';
  backHref: string;
  /** Extra label shown before the stage label in the header (e.g. "Повторение") */
  headerLabel?: string;
  /** True when the correct answer at stage 3 should also clear the mistake flag in the DB */
  clearMistakeOnSuccess?: boolean;
  /** Called when the user clicks the "repeat / another lesson" button on the done screen */
  onRepeat: () => void;
}

// ── Pure helpers ──────────────────────────────────────────────────────────────

const ENGLISH_TO_DIGIT: Record<string, string> = {
  zero: '0', one: '1', two: '2', three: '3', four: '4',
  five: '5', six: '6', seven: '7', eight: '8', nine: '9',
  ten: '10', eleven: '11', twelve: '12', thirteen: '13',
  fourteen: '14', fifteen: '15', sixteen: '16', seventeen: '17',
  eighteen: '18', nineteen: '19', twenty: '20', thirty: '30',
  forty: '40', fifty: '50', sixty: '60', seventy: '70',
  eighty: '80', ninety: '90', 'one hundred': '100',
};

function getDigit(word: Word): string | null {
  if (word.hint !== 'skaitvardis') return null;
  return ENGLISH_TO_DIGIT[word.translation_en] ?? null;
}

function normalizeLt(text: string): string {
  return text
    .toLowerCase()
    .replace(/į/g, 'i').replace(/č/g, 'c').replace(/š/g, 's')
    .replace(/ž/g, 'z').replace(/ū/g, 'u').replace(/ų/g, 'u')
    .replace(/ę/g, 'e').replace(/ė/g, 'e').replace(/ą/g, 'a');
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

function checkAnswer(typed: string, target: string, complexity: Complexity): boolean {
  if (complexity === 'hard') return typed.toLowerCase() === target.toLowerCase();
  const normTyped = normalizeLt(typed);
  const normTarget = normalizeLt(target);
  if (complexity === 'easy') {
    const threshold = Math.max(1, Math.floor(normTarget.length * 0.15));
    return levenshtein(normTyped, normTarget) <= threshold;
  }
  return normTyped === normTarget;
}

function parseForms(lithuanian: string): string[] {
  const parts = lithuanian.split(/[,/]/).map((s) => s.trim()).filter(Boolean);
  return parts.length > 1 ? parts : [lithuanian.trim()];
}

function trans(word: Word, lang: Lang): string {
  return lang === 'en' ? word.translation_en : word.translation_ru;
}

function optionText(word: Word, lang: Lang): string {
  return getDigit(word) ?? trans(word, lang);
}

function pickDistractors(word: Word, allWords: Word[], distractorPool: Word[]): Word[] {
  const combined = [...allWords, ...distractorPool].filter((w) => w.id !== word.id);
  const seen = new Set<number>();
  const pool = combined.filter((w) => { if (seen.has(w.id)) return false; seen.add(w.id); return true; });
  return [...pool].sort(() => Math.random() - 0.5).slice(0, 3);
}

function buildOptions(word: Word, allWords: Word[], distractorPool: Word[], lang: Lang) {
  const distractors = pickDistractors(word, allWords, distractorPool);
  return [
    { text: optionText(word, lang), correct: true },
    ...distractors.map((d) => ({ text: optionText(d, lang), correct: false })),
  ].sort(() => Math.random() - 0.5);
}

// ── Char-level diff helpers ───────────────────────────────────────────────────

type CharOp = { char: string; ok: boolean };

function diffChars(typed: string, target: string): CharOp[] {
  const a = typed.toLowerCase();
  const b = target.toLowerCase();
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) => {
    const row = Array(n + 1).fill(0);
    row[0] = i;
    return row;
  });
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);

  // Backtrack to get alignment of the typed string
  const ops: CharOp[] = [];
  let i = m, j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
      ops.unshift({ char: typed[i - 1], ok: true });
      i--; j--;
    } else if (i > 0 && j > 0 && dp[i][j] === dp[i - 1][j - 1] + 1) {
      ops.unshift({ char: typed[i - 1], ok: false }); // substitution
      i--; j--;
    } else if (i > 0 && dp[i][j] === dp[i - 1][j] + 1) {
      ops.unshift({ char: typed[i - 1], ok: false }); // extra char
      i--;
    } else {
      ops.unshift({ char: '_', ok: false }); // missing char
      j--;
    }
  }
  return ops;
}

function CharDiff({ typed, target, labelTyped, labelCorrect }: {
  typed: string; target: string; labelTyped: string; labelCorrect: string;
}) {
  const ops = diffChars(typed, target);
  return (
    <div data-testid="char-diff" className="text-sm font-mono space-y-1 text-center">
      <div>
        <span className="text-gray-400 text-xs mr-1">{labelTyped}</span>
        {ops.map((op, i) => (
          <span key={i} className={op.ok ? 'text-gray-700' : 'text-red-500 font-semibold'}>{op.char}</span>
        ))}
      </div>
      <div>
        <span className="text-gray-400 text-xs mr-1">{labelCorrect}</span>
        <span className="font-bold text-gray-900">{target}</span>
      </div>
    </div>
  );
}

function insertRandom(rest: StudyCard[], newCards: StudyCard[]): StudyCard[] {
  if (rest.length === 0) return newCards;
  const minPos = Math.min(1, rest.length);
  const pos = minPos + Math.floor(Math.random() * (rest.length - minPos + 1));
  return [...rest.slice(0, pos), ...newCards, ...rest.slice(pos)];
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function QuizSession({
  words,
  distractors = [],
  sessionMode,
  backHref,
  headerLabel,
  clearMistakeOnSuccess = false,
  onRepeat,
}: QuizSessionProps) {
  const router = useRouter();
  const { tr, lang } = useT();

  const [complexity, setComplexity] = useState<Complexity>('medium');
  const [lessonMode, setLessonMode] = useState<'thorough' | 'quick'>('thorough');
  const [useTimer, setUseTimer] = useState(false);
  const [timerSeconds, setTimerSeconds] = useState(5);
  const [timeLeft, setTimeLeft] = useState(5);
  const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [queue, setQueue] = useState<StudyCard[]>([]);
  const [totalWords, setTotalWords] = useState(0);
  const [wordsDone, setWordsDone] = useState(0);
  const [correctWords, setCorrectWords] = useState(0);
  const [done, setDone] = useState(false);
  const [showMatchRound, setShowMatchRound] = useState(false);

  const learnedWordIdsRef   = useRef<Set<number>>(new Set());
  const mistakeWordIdsRef   = useRef<Set<number>>(new Set());
  const doneWordIdsRef      = useRef<Set<number>>(new Set());
  const correctWordIdsRef   = useRef<Set<number>>(new Set());
  const initialQualityRef   = useRef<Record<number, number>>({});
  const [mistakeWordCount, setMistakeWordCount] = useState(0);

  const [answerState, setAnswerState] = useState<AnswerState>('unanswered');
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [options, setOptions] = useState<{ text: string; correct: boolean }[]>([]);
  const [typedAnswer, setTypedAnswer] = useState('');
  const [shownAnswer, setShownAnswer] = useState('');
  const [nearMiss, setNearMiss] = useState<string | null>(null);
  const [blankIndex, setBlankIndex] = useState(0);
  const inputRef     = useRef<HTMLInputElement>(null);
  const dismissBtnRef = useRef<HTMLButtonElement>(null);
  const blockUntilRef = useRef(0);

  // ── saveProgress ────────────────────────────────────────────────────────────
  const saveProgress = useCallback((
    wordId: number,
    status: 'known' | 'learning',
    mistake = false,
    clearMistake = false,
    quality?: number,
  ) => {
    const token = getToken();
    if (!token) return;
    fetch(`${BACKEND_URL}/api/words/${wordId}/progress`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ status, mistake, clear_mistake: clearMistake, ...(quality !== undefined ? { quality } : {}) }),
    }).catch((err) => console.error('Failed to save word progress:', err));
  }, []);

  // ── Initialise queue when words change ──────────────────────────────────────
  useEffect(() => {
    if (words.length === 0) return;
    learnedWordIdsRef.current   = new Set();
    mistakeWordIdsRef.current   = new Set();
    doneWordIdsRef.current      = new Set();
    correctWordIdsRef.current   = new Set();
    initialQualityRef.current   = {};
    setMistakeWordCount(0);
    setQueue(words.map((w) => ({ word: w, stage: 1, failCount: 0 })));
    setTotalWords(words.length);
    setWordsDone(0);
    setCorrectWords(0);
    setDone(false);
    setAnswerState('unanswered');
    setSelectedOption(null);
    setTypedAnswer('');
    setShownAnswer('');
  }, [words]);

  // ── Load settings once ──────────────────────────────────────────────────────
  useEffect(() => {
    const stored = localStorage.getItem('fluent_complexity') as Complexity | null;
    if (stored === 'easy' || stored === 'medium' || stored === 'hard') setComplexity(stored);
    getSettings().then((s: Awaited<ReturnType<typeof getSettings>>) => {
      setLessonMode(s.lesson_mode);
      setUseTimer(s.use_question_timer);
      setTimerSeconds(s.question_timer_seconds);
    }).catch(() => {/* use defaults */});
  }, []);

  // ── Recompute options/blank when front card changes ─────────────────────────
  // Depend only on the front card's identity so that queue insertions (retry cards,
  // shuffling) do NOT re-randomize the blank while the user is mid-answer.
  const frontWordId = queue[0]?.word.id;
  const frontStage  = queue[0]?.stage;

  useEffect(() => {
    if (queue.length > 0 && queue[0].stage === 2) {
      setOptions(buildOptions(queue[0].word, words, distractors, lang));
    }
    if (queue.length > 0 && queue[0].stage === 3) {
      const forms = parseForms(queue[0].word.lithuanian);
      setBlankIndex(Math.floor(Math.random() * forms.length));
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  // words/distractors are static per session; new session always changes frontWordId.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frontWordId, frontStage, lang]);

  // ── finishSession ───────────────────────────────────────────────────────────
  const finishSession = useCallback(() => {
    // In study mode only: if >30% mistakes, demote all learned words back to learning.
    if (sessionMode === 'study' && mistakeWordIdsRef.current.size / totalWords > 0.3) {
      learnedWordIdsRef.current.forEach((wordId) => saveProgress(wordId, 'learning'));
    }
    setShowMatchRound(true);
  }, [sessionMode, totalWords, saveProgress]);

  useEffect(() => {
    if (totalWords > 0 && queue.length === 0 && !done && !showMatchRound) finishSession();
  }, [queue, totalWords, done, showMatchRound, finishSession]);

  // ── Focus dismiss button after wrong answer ─────────────────────────────────
  useEffect(() => {
    if (answerState !== 'wrong') return;
    const id = setTimeout(() => dismissBtnRef.current?.focus(), 100);
    return () => clearTimeout(id);
  }, [answerState]);

  // ── Keyboard dismiss wrong answer ───────────────────────────────────────────
  useEffect(() => {
    if (answerState !== 'wrong' || queue.length === 0) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        if (Date.now() < blockUntilRef.current) return;
        e.preventDefault();
        if (queue[0].stage === 2) handleStage2Dismiss();
        else handleStage3Dismiss();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answerState, queue]);

  // ── Timer ───────────────────────────────────────────────────────────────────
  const frontCard      = queue[0];
  const frontCardId    = frontCard?.word.id;
  const frontCardStage = frontCard?.stage;

  useEffect(() => {
    if (timerIntervalRef.current) { clearInterval(timerIntervalRef.current); timerIntervalRef.current = null; }
    if (!useTimer || frontCardStage === undefined || frontCardStage < 2) return;
    setTimeLeft(timerSeconds);
    timerIntervalRef.current = setInterval(() => setTimeLeft((t) => t - 1), 1000);
    return () => { if (timerIntervalRef.current) { clearInterval(timerIntervalRef.current); timerIntervalRef.current = null; } };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frontCardId, frontCardStage, useTimer, timerSeconds]);

  useEffect(() => {
    if (answerState !== 'unanswered' && timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current); timerIntervalRef.current = null;
    }
  }, [answerState]);

  useEffect(() => {
    if (!useTimer || timeLeft > 0 || frontCardStage === undefined || frontCardStage < 2 || answerState !== 'unanswered') return;
    if (timerIntervalRef.current) { clearInterval(timerIntervalRef.current); timerIntervalRef.current = null; }
    if (frontCardId !== undefined && !mistakeWordIdsRef.current.has(frontCardId)) {
      mistakeWordIdsRef.current.add(frontCardId);
      setMistakeWordCount((c) => c + 1);
    }
    // Only update backend on timeout in study mode
    if (frontCardId !== undefined && sessionMode === 'study') saveProgress(frontCardId, 'learning', true);
    setAnswerState('wrong');
    if (frontCard) setShownAnswer(parseForms(frontCard.word.lithuanian)[blankIndex] ?? frontCard.word.lithuanian);
  }, [timeLeft, useTimer, frontCardId, frontCardStage, answerState, sessionMode, saveProgress, blankIndex]);

  // ── Queue helpers ────────────────────────────────────────────────────────────
  function buildRetryCards(card: StudyCard): StudyCard[] {
    if (lessonMode === 'thorough') {
      if (card.stage === 2 || card.stage === 3) {
        return [
          { word: card.word, stage: card.stage, failCount: card.failCount + 1 },
          { word: card.word, stage: card.stage, failCount: card.failCount + 1 },
        ];
      }
      return [];
    }
    if (card.stage === 2) {
      if (card.failCount === 0) return [{ word: card.word, stage: 2, failCount: 1 }];
      if (card.failCount === 1) return [
        { word: card.word, stage: 1, failCount: 0, standalone: true },
        { word: card.word, stage: 2, failCount: 2 },
      ];
      return [];
    }
    if (card.stage === 3) {
      if (card.failCount === 0) return [{ word: card.word, stage: 3, failCount: 1 }];
      if (card.failCount === 1) return [
        { word: card.word, stage: 2, failCount: 0, standalone: true },
        { word: card.word, stage: 3, failCount: 2 },
      ];
      return [];
    }
    return [];
  }

  function advance(card: StudyCard, correct: boolean, retryCards: StudyCard[] = []) {
    setQueue((prev) => {
      const rest = prev.slice(1);
      if (correct && card.standalone) return rest;
      if (correct && card.stage < 3) {
        return insertRandom(rest, [{ word: card.word, stage: (card.stage + 1) as 2 | 3, failCount: 0 }]);
      }
      if (retryCards.length > 0) return insertRandom(rest, retryCards);
      return rest;
    });
  }

  // ── Handlers ─────────────────────────────────────────────────────────────────

  function handleStage1Quality(quality: 1 | 3 | 5) {
    if (Date.now() < blockUntilRef.current) return;
    const card = queue[0];
    initialQualityRef.current[card.word.id] = quality;
    blockUntilRef.current = Date.now() + 200;

    // Stage 1 is self-assessment — no saveProgress, no mistake counter.
    if (quality === 1) {
      // Didn't know — re-queue full 3-stage cycle (flashcard → MC → type), no mistake recorded
      setQueue((prev) => {
        const rest = prev.slice(1);
        const s1: StudyCard = { word: card.word, stage: 1, failCount: 0 };
        const s2: StudyCard = { word: card.word, stage: 2, failCount: 0 };
        const s3: StudyCard = { word: card.word, stage: 3, failCount: 0 };
        // Insert the triplet together so they stay in order (1→2→3) at a random gap position
        return insertRandom(rest, [s1, s2, s3]);
      });
    } else if (quality === 5) {
      // Easy — write-only round
      setQueue((prev) => insertRandom(prev.slice(1), [{ word: card.word, stage: 3, failCount: 0 }]));
    } else {
      // Medium — one full round (MC → write)
      setQueue((prev) => insertRandom(prev.slice(1), [{ word: card.word, stage: 2, failCount: 0 }]));
    }
  }

  function handleStage2Select(index: number) {
    if (answerState !== 'unanswered') return;
    const card = queue[0];
    const isCorrect = options[index].correct;
    setSelectedOption(index);
    setAnswerState(isCorrect ? 'correct' : 'wrong');

    if (!isCorrect) {
      if (!mistakeWordIdsRef.current.has(card.word.id)) {
        mistakeWordIdsRef.current.add(card.word.id);
        setMistakeWordCount((c) => c + 1);
      }
      // Only update backend in study mode
      if (sessionMode === 'study') saveProgress(card.word.id, 'learning', true);
    } else {
      if (sessionMode === 'study') saveProgress(card.word.id, 'known', false);
    }

    if (isCorrect) {
      setTimeout(() => {
        setAnswerState('unanswered');
        setSelectedOption(null);
        blockUntilRef.current = Date.now() + 200;
        advance(card, true);
      }, 1200);
    }
  }

  function handleStage2Dismiss() {
    const card = queue[0];
    const retryCards = buildRetryCards(card);
    if (!card.standalone && retryCards.length === 0 && !doneWordIdsRef.current.has(card.word.id)) {
      doneWordIdsRef.current.add(card.word.id);
      setWordsDone((c) => c + 1);
    }
    setAnswerState('unanswered');
    setSelectedOption(null);
    blockUntilRef.current = Date.now() + 200;
    advance(card, false, retryCards);
    if (lessonMode === 'quick' && mistakeWordIdsRef.current.size / totalWords >= 0.25) finishSession();
  }

  function handleStage3Submit() {
    if (answerState !== 'unanswered') return;
    if (typedAnswer.trim() === '') { setAnswerState('empty'); return; }

    const card = queue[0];
    const forms = parseForms(card.word.lithuanian);
    const target = forms[blankIndex] ?? forms[0];
    const isCorrect = checkAnswer(typedAnswer.trim(), target, complexity);

    setAnswerState(isCorrect ? 'correct' : 'wrong');
    if (!isCorrect) {
      // Block the window keydown dismiss listener from firing on the same Enter event
      blockUntilRef.current = Date.now() + 300;
      setShownAnswer(target);
      if (!mistakeWordIdsRef.current.has(card.word.id)) {
        mistakeWordIdsRef.current.add(card.word.id);
        setMistakeWordCount((c) => c + 1);
      }
    }

    const initQ = initialQualityRef.current[card.word.id] ?? 3;
    if (isCorrect) {
      saveProgress(card.word.id, 'known', false, clearMistakeOnSuccess, initQ);
      learnedWordIdsRef.current.add(card.word.id);
      const isExact = typedAnswer.trim().toLowerCase() === target.toLowerCase();
      if (!isExact) setNearMiss(target);
      const delay = isExact ? 1200 : 2000;
      setTimeout(() => {
        if (!doneWordIdsRef.current.has(card.word.id)) {
          doneWordIdsRef.current.add(card.word.id);
          setWordsDone((c) => c + 1);
        }
        if (!correctWordIdsRef.current.has(card.word.id)) {
          correctWordIdsRef.current.add(card.word.id);
          setCorrectWords((c) => c + 1);
        }
        setAnswerState('unanswered');
        setTypedAnswer('');
        setShownAnswer('');
        setNearMiss(null);
        blockUntilRef.current = Date.now() + 200;
        advance(card, true);
      }, delay);
    } else {
      // Only update backend in study mode on failure
      if (sessionMode === 'study') saveProgress(card.word.id, 'learning', true, false, initQ === 5 ? 3 : 2);
    }
  }

  function handleStage3Dismiss() {
    const card = queue[0];
    const retryCards = buildRetryCards(card);
    if (!card.standalone && retryCards.length === 0 && !doneWordIdsRef.current.has(card.word.id)) {
      doneWordIdsRef.current.add(card.word.id);
      setWordsDone((c) => c + 1);
    }
    setAnswerState('unanswered');
    setTypedAnswer('');
    setShownAnswer('');
    setNearMiss(null);
    blockUntilRef.current = Date.now() + 200;
    advance(card, false, retryCards);
    if (lessonMode === 'quick' && mistakeWordIdsRef.current.size / totalWords >= 0.25) finishSession();
  }

  // ── Match round ───────────────────────────────────────────────────────────────
  if (showMatchRound && !done) {
    return (
      <MatchRound
        words={words}
        lang={lang}
        onDone={() => { setShowMatchRound(false); setDone(true); router.refresh(); }}
        backHref={backHref}
      />
    );
  }

  // ── Done screen ───────────────────────────────────────────────────────────────
  if (done) {
    const highMistakes = sessionMode === 'study' && totalWords > 0 && mistakeWordCount / totalWords > 0.3;
    return (
      <main className="min-h-screen bg-slate-50 text-gray-900 flex flex-col items-center justify-center px-6">
        <div className="pointer-events-none fixed inset-0 flex items-start justify-center">
          <div className="w-[600px] h-[400px] bg-emerald-100/40 blur-[120px] rounded-full mt-[-100px]" />
        </div>
        <div className="relative z-10 text-center max-w-sm w-full">
          <div className="text-5xl mb-6">🎉</div>
          <h1 className="text-2xl font-bold mb-2">{tr.common.sessionDone}</h1>
          <p className="text-gray-400 mb-8">
            {tr.common.correctOf.replace('{correct}', String(correctWords)).replace('{total}', String(totalWords))}
          </p>
          <div className="flex gap-4 justify-center mb-8">
            <div className="bg-white border border-gray-900 rounded-2xl px-6 sm:px-8 py-5 text-center">
              <div className="text-2xl sm:text-3xl font-bold text-emerald-600">{correctWords}</div>
              <div className="text-gray-400 text-sm mt-1">{tr.common.correctLabel}</div>
            </div>
            <div className="bg-white border border-gray-900 rounded-2xl px-6 sm:px-8 py-5 text-center">
              <div className="text-2xl sm:text-3xl font-bold text-amber-600">{mistakeWordCount}</div>
              <div className="text-gray-400 text-sm mt-1">{tr.common.errorsLabel}</div>
            </div>
          </div>
          {highMistakes && (
            <p className="text-gray-500 text-sm mb-6 px-2">{tr.common.relearnSuggestion}</p>
          )}
          <div className="flex flex-col gap-3">
            <button
              onClick={onRepeat}
              className="w-full py-3 bg-gray-900 hover:bg-gray-800 rounded-xl font-medium text-white transition-colors"
            >
              {sessionMode === 'study' ? tr.common.oneLessonMore : tr.common.repeatMore}
            </button>
            <button
              onClick={() => router.push(backHref)}
              className="w-full py-3 text-gray-400 hover:text-gray-900 text-sm transition-colors text-center"
            >
              {tr.study.backToLists}
            </button>
          </div>
        </div>
      </main>
    );
  }

  if (queue.length === 0) return null;

  // ── Quiz render ───────────────────────────────────────────────────────────────
  const card       = queue[0];
  const word       = card.word;
  const stage      = card.stage;
  const progressPct = totalWords > 0 ? (wordsDone / totalWords) * 100 : 0;
  const stageLabel  = tr.study.stages[stage];
  const cloveForms  = parseForms(word.lithuanian);
  const cloveIsCloze = cloveForms.length > 1;
  const cloveText   = cloveForms.map((f, i) => i === blankIndex ? '______' : f).join(' / ');
  const digit       = getDigit(word);

  return (
    <main className="min-h-screen bg-slate-50 text-gray-900 flex flex-col px-6 py-4 sm:py-8">
      <div className="pointer-events-none fixed inset-0 flex items-start justify-center overflow-hidden">
        <div className="w-full max-w-[600px] h-[400px] bg-emerald-100/40 blur-[120px] rounded-full mt-[-100px]" />
      </div>

      <div className="relative z-10 max-w-lg w-full mx-auto flex flex-col flex-1">
        {/* Header */}
        <div className="flex justify-between items-center mb-4 sm:mb-8">
          <Link href={backHref} className="text-gray-400 hover:text-gray-900 text-sm transition-colors">
            {tr.study.backToLists}
          </Link>
          <div className="flex items-center gap-3">
            <span className="text-gray-300 text-xs uppercase tracking-wider">
              {headerLabel ? `${headerLabel} · ${stageLabel}` : stageLabel}
            </span>
            <span className="text-gray-400 text-sm">{wordsDone} / {totalWords}</span>
            {mistakeWordCount > 0 && (
              <span className="text-amber-500 text-sm">{mistakeWordCount} ✗</span>
            )}
          </div>
        </div>

        {/* Progress bar */}
        <div className="w-full h-1 bg-gray-100 rounded-full mb-2 sm:mb-4">
          <div className="h-1 bg-emerald-500 rounded-full transition-all duration-300" style={{ width: `${progressPct}%` }} />
        </div>

        {/* Timer bar */}
        <div className={`w-full h-1 rounded-full ${useTimer && stage >= 2 ? 'bg-gray-100' : 'bg-transparent'}`}>
          {useTimer && stage >= 2 && (
            <div
              data-testid="timer-bar"
              className={`h-1 rounded-full transition-all duration-1000 ${timeLeft <= 1 ? 'bg-red-400' : 'bg-amber-400'}`}
              style={{ width: `${(timeLeft / timerSeconds) * 100}%` }}
            />
          )}
        </div>

        {/* ── Stage 1: Flashcard + self-evaluation ── */}
        {stage === 1 && (
          <div className="flex flex-col items-center flex-1 gap-4 sm:gap-8 pt-6 sm:pt-10">
            <div className="w-full bg-white border border-gray-900 rounded-2xl p-5 sm:p-10 text-center">
              <p className="text-gray-400 text-xs uppercase tracking-wider mb-4 sm:mb-6">
                {sessionMode === 'review' ? tr.common.review : tr.common.newWord}
              </p>
              <p className="text-3xl sm:text-5xl font-bold tracking-tight mb-4">{word.lithuanian}</p>
              {digit && <p className="text-5xl sm:text-7xl font-bold text-emerald-600 mb-4" data-testid="number-digit">{digit}</p>}
              {word.hint && !digit && <p className="text-gray-300 text-xs uppercase tracking-wider mb-4">{word.hint}</p>}
              <div className="h-px bg-gray-100 mb-4" />
              <p className="text-xl text-gray-500">{trans(word, lang)}</p>
            </div>
            <div className="w-full grid grid-cols-3 gap-3">
              <button onClick={() => handleStage1Quality(1)} tabIndex={-1} className="py-4 bg-red-50 hover:bg-red-100 border border-red-200 rounded-xl font-medium text-red-600 transition-colors">
                {tr.study.didntKnow}
              </button>
              <button onClick={() => handleStage1Quality(3)} tabIndex={-1} className="py-4 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-xl font-medium text-amber-600 transition-colors">
                {tr.study.hard}
              </button>
              <button onClick={() => handleStage1Quality(5)} tabIndex={-1} className="py-4 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-xl font-medium text-emerald-600 transition-colors">
                {tr.study.easy}
              </button>
            </div>
          </div>
        )}

        {/* ── Stage 2: Multiple choice ── */}
        {stage === 2 && (
          <div className="flex flex-col items-center flex-1 gap-4 sm:gap-8 pt-6 sm:pt-10">
            <div className="text-center">
              <p className="text-gray-400 text-sm mb-3 uppercase tracking-wider">{tr.study.whatMeans}</p>
              <p className="text-2xl sm:text-4xl font-bold tracking-tight">{word.lithuanian}</p>
              {digit && <p className="text-4xl sm:text-6xl font-bold text-emerald-600 mt-2" data-testid="number-digit">{digit}</p>}
              {word.hint && !digit && <p className="text-gray-300 text-xs uppercase tracking-wider mt-2">{word.hint}</p>}
            </div>
            <div className="w-full grid grid-cols-1 gap-3">
              {options.map((opt, i) => {
                let cls = 'w-full py-4 px-5 rounded-xl font-medium text-left transition-all duration-200 border ';
                if (answerState === 'unanswered') {
                  cls += 'bg-white border-gray-900 hover:bg-gray-100 hover:border-gray-900 text-gray-900';
                } else if (opt.correct) {
                  cls += 'bg-emerald-100 border-gray-900 text-emerald-600';
                } else if (i === selectedOption) {
                  cls += 'bg-red-100 border-gray-900 text-red-600';
                } else {
                  cls += 'bg-gray-50 border-gray-900 text-gray-400';
                }
                return <button key={i} onClick={() => handleStage2Select(i)} className={cls}>{opt.text}</button>;
              })}
            </div>
            {answerState === 'correct' && (
              <p className="text-emerald-600 text-sm font-medium animate-in fade-in duration-150">{tr.common.correct}</p>
            )}
            {answerState === 'wrong' && (
              <div className="w-full flex flex-col gap-3 animate-in fade-in duration-150">
                <div className="text-center">
                  <p className="text-red-600 text-sm font-medium">{tr.common.notQuite}</p>
                  <p className="text-gray-500 text-sm mt-1">
                    {tr.common.correctAnswer} <span className="text-gray-900 font-medium">{options.find((o) => o.correct)?.text}</span>
                  </p>
                </div>
                <button ref={dismissBtnRef} data-testid="dismiss-wrong" onClick={handleStage2Dismiss} className="w-full py-4 bg-gray-100 hover:bg-gray-100 rounded-xl font-medium transition-colors">
                  {tr.common.dismiss}
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── Stage 3: Type it ── */}
        {stage === 3 && (
          <div className="flex flex-col items-center flex-1 gap-4 sm:gap-8 pt-6 sm:pt-10">
            <div className="text-center">
              <p className="text-gray-400 text-sm mb-3 uppercase tracking-wider">
                {cloveIsCloze ? tr.study.fillMissing : tr.study.howInLithuanian}
              </p>
              {cloveIsCloze ? (
                <p className="text-xl sm:text-3xl font-bold tracking-tight font-mono">{cloveText}</p>
              ) : (
                <>
                  <p className="text-2xl sm:text-4xl font-bold tracking-tight">{trans(word, lang)}</p>
                  {digit && <p className="text-4xl sm:text-6xl font-bold text-emerald-600 mt-2" data-testid="number-digit">{digit}</p>}
                </>
              )}
              {word.hint && !digit && <p className="text-gray-300 text-xs uppercase tracking-wider mt-2">{word.hint}</p>}
              {cloveIsCloze && <p className="text-gray-400 text-sm mt-3">{trans(word, lang)}</p>}
            </div>
            <div className="w-full flex flex-col gap-3">
              <input
                ref={inputRef}
                type="text"
                value={typedAnswer}
                onChange={(e) => { setTypedAnswer(e.target.value); if (answerState === 'empty') setAnswerState('unanswered'); }}
                onKeyDown={(e) => { if (e.key === 'Enter') handleStage3Submit(); }}
                disabled={answerState === 'correct' || answerState === 'wrong'}
                placeholder={tr.study.typePlaceholder}
                className={`w-full py-4 px-5 rounded-xl border bg-white text-base text-gray-900 placeholder-gray-400 outline-none transition-all duration-200
                  ${answerState === 'correct' ? 'border-gray-900 bg-emerald-50' :
                    answerState === 'wrong' ? 'border-gray-900 bg-red-50' :
                    answerState === 'empty' ? 'border-amber-400' :
                    'border-gray-900 focus:border-gray-900'}`}
              />
              {answerState === 'empty' && (
                <p className="text-amber-600 text-sm text-center animate-in fade-in duration-150" data-testid="empty-hint">
                  {tr.study.typeEmptyHint}
                </p>
              )}
              {(answerState === 'unanswered' || answerState === 'empty') && (
                <button onClick={handleStage3Submit} className="w-full py-4 bg-gray-900 hover:bg-gray-800 rounded-xl font-medium text-white transition-colors">
                  {tr.common.check}
                </button>
              )}
              {answerState === 'correct' && (
                <div className="flex flex-col gap-2 items-center animate-in fade-in duration-150">
                  <p className="text-emerald-600 text-sm font-medium text-center">{tr.common.correct}</p>
                  {nearMiss && (
                    <CharDiff
                      typed={typedAnswer}
                      target={nearMiss}
                      labelTyped={tr.common.youTyped}
                      labelCorrect={tr.common.correctAnswer}
                    />
                  )}
                </div>
              )}
              {answerState === 'wrong' && (
                <div className="flex flex-col gap-3 animate-in fade-in duration-150">
                  <div className="text-center">
                    <p className="text-red-600 text-sm font-medium">{tr.common.notQuite}</p>
                    <div className="mt-2">
                      <CharDiff
                        typed={typedAnswer}
                        target={shownAnswer}
                        labelTyped={tr.common.youTyped}
                        labelCorrect={tr.common.correctAnswer}
                      />
                    </div>
                  </div>
                  <button ref={dismissBtnRef} data-testid="dismiss-wrong" onClick={handleStage3Dismiss} className="w-full py-4 bg-gray-100 hover:bg-gray-100 rounded-xl font-medium transition-colors">
                    {tr.common.dismiss}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
