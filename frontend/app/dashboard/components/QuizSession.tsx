'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { BACKEND_URL, getToken, getSettings } from '../../../lib/api';
import { useT } from '../../../lib/useT';
import type { Lang } from '../../../lib/useLang';
import MatchRound from './MatchRound';
import CharDiff from './CharDiff';
import { normalizeLt, collapseWs } from '../../../lib/normalizeLt';
import { buildAssemblyTiles, parseForms, splitSyllables, type AssemblyTiles } from '../../../lib/assembleTiles';
import { scheduleCards } from '../../../lib/scheduleCards';
import { renderAccented } from '../../../lib/renderAccented';
import PageMascot from '../../../components/PageMascot';
import TakChevron from '../../../components/TakChevron';
import { useMascotMood } from '../../../lib/mascotMood';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface Word {
  id: number;
  lithuanian: string;
  accented?: string | null;
  translation_en: string;
  translation_ru: string;
  hint: string | null;
  status?: string;
  /**
   * Server-decided: this word is retained well enough to be asked to type it first,
   * with no answer-revealing flashcard. Never derived on the client — see
   * `_is_mature` in backend/routers/words.py.
   */
  mature?: boolean;
}

interface StudyCard {
  word: Word;
  // '2a' = assemble the entry from shuffled fragments — whole words, syllables or
  // letters depending on the entry (lib/assembleTiles.ts). Sits between the select
  // stage and typing for every entry type. Distinct from '2r' (reverse MCQ) and
  // '3s' (mistake syllable gap-fill).
  stage: 1 | 2 | '2r' | '2a' | 3 | '3s';
  failCount: number;
  /** A reminder card inside an already-queued chain: answering it queues nothing new. */
  standalone?: boolean;
  easyChosen?: boolean;
  targetSyllable?: string;
  /** Opening TYPE card of a mature word — a miss here drops it into the learning flow. */
  matureStart?: boolean;
  /** This word already spent its once-per-session +assemble/+type penalty. */
  penaltyApplied?: boolean;
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
  /**
   * When set, this phase belongs to a multi-phase session (see /dashboard/continue)
   * and is not the last one: the match round hands off straight to the next phase
   * instead of showing this phase's own done screen. Callers that omit it keep the
   * plain single-session behaviour (match round → done screen → onRepeat/backHref).
   */
  onAdvance?: () => void;
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
  const normTyped = normalizeLt(typed);
  const normTarget = normalizeLt(target);
  if (complexity === 'hard') return normTyped === normTarget;
  if (complexity === 'easy') {
    const threshold = Math.max(1, Math.floor(normTarget.length * 0.15));
    return levenshtein(normTyped, normTarget) <= threshold;
  }
  return normTyped === normTarget;
}

function trans(word: Word, lang: Lang): string {
  return lang === 'en' ? (word.translation_en || word.translation_ru) : word.translation_ru;
}

function optionText(word: Word, lang: Lang): string {
  return getDigit(word) ?? trans(word, lang);
}

function pickDistractors(word: Word, allWords: Word[], distractorPool: Word[], lang: Lang): Word[] {
  // Filter on translation_ru *and* on the translation actually displayed for this
  // language: an EN session must not offer two options meaning the same thing just
  // because their Russian translations happen to differ (feature #5, R6.2).
  const combined = [...allWords, ...distractorPool].filter(
    (w) => w.id !== word.id
      && w.translation_ru !== word.translation_ru
      && trans(w, lang) !== trans(word, lang),
  );
  const seen = new Set<number>();
  const pool = combined.filter((w) => { if (seen.has(w.id)) return false; seen.add(w.id); return true; });
  return [...pool].sort(() => Math.random() - 0.5).slice(0, 3);
}

function buildOptions(word: Word, allWords: Word[], distractorPool: Word[], lang: Lang) {
  const distractors = pickDistractors(word, allWords, distractorPool, lang);
  const correctText = optionText(word, lang);
  // Drop distractors whose displayed text collides with another option. Two synonyms
  // (same translation) would otherwise render as identical buttons now that the backend
  // no longer disambiguates them with a parenthetical.
  const seen = new Set([correctText]);
  const opts = [{ text: correctText, correct: true }];
  for (const d of distractors) {
    const t = optionText(d, lang);
    if (seen.has(t)) continue;
    seen.add(t);
    opts.push({ text: t, correct: false });
  }
  return opts.sort(() => Math.random() - 0.5);
}

function buildOptions2r(word: Word, allWords: Word[], distractorPool: Word[], lang: Lang) {
  const distractors = pickDistractors(word, allWords, distractorPool, lang);
  // Drop distractors whose Lithuanian text collides with another option — the same
  // dedup buildOptions does for translations. Duplicate word rows share a lemma but
  // may carry different translations, so pickDistractors' same-translation filter
  // does not catch them and two identical buttons would render, one scored wrong.
  // Also drop an option that *means* the same as another one: the prompt is a single
  // translation, so two options sharing it would both be right, only one scored so
  // (feature #5, R6.2).
  const seen = new Set([normalizeLt(word.lithuanian)]);
  const seenMeaning = new Set([normalizeLt(trans(word, lang))]);
  const opts = [{ text: word.lithuanian, correct: true }];
  for (const d of distractors) {
    const key = normalizeLt(d.lithuanian);
    const meaning = normalizeLt(trans(d, lang));
    if (seen.has(key) || seenMeaning.has(meaning)) continue;
    seen.add(key);
    seenMeaning.add(meaning);
    opts.push({ text: d.lithuanian, correct: false });
  }
  return opts.sort(() => Math.random() - 0.5);
}

// The near-miss syllable drill keeps its deliberate near-the-front placement (max 2
// cards away, so it feels immediate) — the one insertion feature #5 does NOT route
// through `scheduleCards`. Everything that follows it is scheduled normally, but into
// the tail *after* the drill so the drill always comes first.
function insertDrillThenSchedule(rest: StudyCard[], drill: StudyCard, cards: StudyCard[]): StudyCard[] {
  const pos = Math.min(2, rest.length);
  return [...rest.slice(0, pos), drill, ...scheduleCards(rest.slice(pos), cards)];
}

// ── Syllable helpers ──────────────────────────────────────────────────────────
// splitSyllables / shuffleSyllables / parseForms live in lib/assembleTiles.ts so the
// quiz and the tile builder share one implementation.

function findMistakeSyllable(typed: string, target: string): string {
  let pos = target.length;
  for (let i = 0; i < target.length; i++) {
    if (i >= typed.length || normalizeLt(typed[i]) !== normalizeLt(target[i])) { pos = i; break; }
  }
  const syllables = splitSyllables(target);
  let cur = 0;
  for (const syl of syllables) {
    cur += syl.length;
    if (pos < cur) return syl;
  }
  return syllables[syllables.length - 1] ?? target;
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
  onAdvance,
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
  // Quick mode can abort a lesson mid-queue; without this the done screen would
  // look identical to a lesson the user actually finished (issue #147).
  const [endedEarly, setEndedEarly] = useState(false);
  const [showMatchRound, setShowMatchRound] = useState(false);
  const [matchRoundWords, setMatchRoundWords] = useState<Word[]>([]);

  const learnedWordIdsRef   = useRef<Set<number>>(new Set());
  const mistakeWordIdsRef   = useRef<Set<number>>(new Set());
  const doneWordIdsRef      = useRef<Set<number>>(new Set());
  const correctWordIdsRef   = useRef<Set<number>>(new Set());
  const initialQualityRef   = useRef<Record<number, number>>({});
  // Words whose once-per-session "+2 assemble / +2 type" penalty has already fired.
  const penaltyWordIdsRef   = useRef<Set<number>>(new Set());
  // Form a multi-form entry was assembled as, so the type card that follows asks for
  // exactly that form (R4). Set at the '2a' stage, read at stage 3.
  const formIndexRef        = useRef<Record<number, number>>({});
  const [mistakeWordCount, setMistakeWordCount] = useState(0);

  // TAK's mood for this session — neutral at the start, one step per answer.
  const { mood, recordAnswer, reset: resetMood } = useMascotMood();

  const [answerState, setAnswerState] = useState<AnswerState>('unanswered');
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [options, setOptions] = useState<{ text: string; correct: boolean }[]>([]);
  const [typedAnswer, setTypedAnswer] = useState('');
  const [shownAnswer, setShownAnswer] = useState('');
  const [nearMiss, setNearMiss] = useState<string | null>(null);
  const [blankIndex, setBlankIndex] = useState(0);
  const [syllableTyped, setSyllableTyped] = useState('');
  const [assembly, setAssembly] = useState<AssemblyTiles>({ target: '', tiles: [], separator: '', mode: 'syllable' });
  const [assembledSyllables, setAssembledSyllables] = useState<number[]>([]);
  const inputRef         = useRef<HTMLInputElement>(null);
  const syllableInputRef = useRef<HTMLInputElement>(null);
  const dismissBtnRef    = useRef<HTMLButtonElement>(null);
  const blockUntilRef    = useRef(0);

  // ── saveProgress ────────────────────────────────────────────────────────────
  const saveProgress = useCallback((
    wordId: number,
    status: 'known' | 'learning',
    mistake = false,
    clearMistake = false,
    quality?: number,
  ): Promise<void> => {
    const token = getToken();
    if (!token) return Promise.resolve();
    return fetch(`${BACKEND_URL}/api/words/${wordId}/progress`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ status, mistake, clear_mistake: clearMistake, ...(quality !== undefined ? { quality } : {}) }),
    }).then(() => undefined).catch((err) => console.error('Failed to save word progress:', err));
  }, []);

  // ── Initialise queue when words change ──────────────────────────────────────
  useEffect(() => {
    if (words.length === 0) return;
    learnedWordIdsRef.current   = new Set();
    mistakeWordIdsRef.current   = new Set();
    doneWordIdsRef.current      = new Set();
    correctWordIdsRef.current   = new Set();
    initialQualityRef.current   = {};
    penaltyWordIdsRef.current   = new Set();
    formIndexRef.current        = {};
    resetMood();
    setMistakeWordCount(0);
    // A mature word is asked to type straight away — no answer-revealing flashcard.
    setQueue(words.map((w) => (
      w.mature
        ? { word: w, stage: 3 as const, failCount: 0, matureStart: true }
        : { word: w, stage: 1 as const, failCount: 0 }
    )));
    setTotalWords(words.length);
    setWordsDone(0);
    setCorrectWords(0);
    setDone(false);
    setEndedEarly(false);
    setAnswerState('unanswered');
    setSelectedOption(null);
    setTypedAnswer('');
    setShownAnswer('');
  }, [words, resetMood]);

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
    if (queue.length > 0 && queue[0].stage === '2r') {
      setOptions(buildOptions2r(queue[0].word, words, distractors, lang));
    }
    if (queue.length > 0 && queue[0].stage === '2a') {
      const w = queue[0].word;
      const forms = parseForms(w.lithuanian);
      // Pick the form once per word and remember it, so the type card that follows
      // asks for the same form the learner just assembled.
      const idx = formIndexRef.current[w.id] ?? Math.floor(Math.random() * forms.length);
      formIndexRef.current[w.id] = idx;
      setAssembly(buildAssemblyTiles(w.lithuanian, idx));
      setAssembledSyllables([]);
    }
    if (queue.length > 0 && queue[0].stage === 3) {
      const w = queue[0].word;
      const forms = parseForms(w.lithuanian);
      setBlankIndex(formIndexRef.current[w.id] ?? Math.floor(Math.random() * forms.length));
      setTimeout(() => inputRef.current?.focus(), 50);
    }
    if (queue.length > 0 && queue[0].stage === '3s') {
      setSyllableTyped('');
      setTimeout(() => syllableInputRef.current?.focus(), 50);
    }
  // words/distractors are static per session; new session always changes frontWordId.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frontWordId, frontStage, lang]);

  // ── finishSession ───────────────────────────────────────────────────────────
  const finishSession = useCallback(async (early = false) => {
    if (early) setEndedEarly(true);
    // Only show words the user successfully typed (stage 3 correct) in the match round.
    // Fall back to all session words if fewer than 2 were completed correctly.
    const completed = words.filter((w) => correctWordIdsRef.current.has(w.id));
    setMatchRoundWords(completed.length >= 2 ? completed : words);
    setShowMatchRound(true);
  }, [words]);

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
        else if (queue[0].stage === '2r') handleStage2rDismiss();
        else if (queue[0].stage === '2a') handleStage2aDismiss();
        else if (queue[0].stage === '3s') handleStage3sDismiss();
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
    if (!useTimer || frontCardStage === undefined || frontCardStage === 1) return;
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
    if (!useTimer || timeLeft > 0 || frontCardStage === undefined || frontCardStage === 1 || answerState !== 'unanswered') return;
    if (timerIntervalRef.current) { clearInterval(timerIntervalRef.current); timerIntervalRef.current = null; }
    if (frontCardId !== undefined && !mistakeWordIdsRef.current.has(frontCardId)) {
      mistakeWordIdsRef.current.add(frontCardId);
      setMistakeWordCount((c) => c + 1);
    }
    // Only update backend on timeout in study mode
    if (frontCardId !== undefined && sessionMode === 'study') saveProgress(frontCardId, 'learning', true);
    setAnswerState('wrong');
    recordAnswer(false);
    if (frontCard) setShownAnswer(parseForms(frontCard.word.lithuanian)[blankIndex] ?? frontCard.word.lithuanian);
  }, [timeLeft, useTimer, frontCardId, frontCardStage, answerState, sessionMode, saveProgress, blankIndex, recordAnswer]);

  // ── Queue helpers ────────────────────────────────────────────────────────────
  //
  // The stage graph (feature #5 — documentation/review-flow-stage-graph.md):
  //
  //   mature word     → TYPE ──miss/«Забыл»──→ learning chain
  //   non-mature word → CARD ─«Легко»→ TYPE ──miss──→ difficult chain
  //                          └«С трудом»────────────→ difficult chain
  //   difficult chain = SELECT → ASSEMBLE → TYPE
  //   learning chain  = CARD → SELECT → ASSEMBLE → TYPE
  //   a miss anywhere in a chain → once per word: +2 ASSEMBLE +2 TYPE (+1/+1 quick)
  //
  // Chains are queued whole and interleaved by `scheduleCards`, so a correct answer
  // only retires the current card — the next stage is already further down the queue.

  // SELECT is a coin flip between the two multiple-choice directions; that variation
  // is itself part of not repeating the same exercise.
  function selectStage(): 2 | '2r' {
    return Math.random() < 0.5 ? 2 : '2r';
  }

  function buildDifficultChain(word: Word, penaltyApplied?: boolean): StudyCard[] {
    return [
      { word, stage: selectStage(), failCount: 0, penaltyApplied },
      { word, stage: '2a', failCount: 0, penaltyApplied },
      { word, stage: 3, failCount: 0, penaltyApplied },
    ];
  }

  // The full flow, opened by a reminder flashcard. Used by the «Забыл» button and by a
  // mature word's first miss — the single constructor that replaces the old dead
  // handleStage1Quality(1) branch. The flashcard is `standalone`: the rest of the
  // chain is already queued, so answering it must not queue anything new.
  function buildLearningChain(word: Word, penaltyApplied?: boolean): StudyCard[] {
    return [
      { word, stage: 1, failCount: 0, standalone: true, penaltyApplied },
      ...buildDifficultChain(word, penaltyApplied),
    ];
  }

  // Cost of the first mistake anywhere in a chain. Quick mode keeps its lighter
  // contract with half the drill.
  function buildPenaltyCards(word: Word): StudyCard[] {
    const reps = lessonMode === 'quick' ? 1 : 2;
    const cards: StudyCard[] = [];
    for (let i = 0; i < reps; i++) cards.push({ word, stage: '2a', failCount: 0, penaltyApplied: true });
    for (let i = 0; i < reps; i++) cards.push({ word, stage: 3, failCount: 0, penaltyApplied: true });
    return cards;
  }

  function buildRetryCards(card: StudyCard): StudyCard[] {
    // A mature word missed the card it opened on → drop it into the full learning flow.
    if (card.matureStart) return buildLearningChain(card.word, card.penaltyApplied);
    // «Легко» and then a typing miss → demote to the difficult path.
    if (card.stage === 3 && card.easyChosen) return buildDifficultChain(card.word, card.penaltyApplied);
    // First mistake for this word → the once-per-session penalty drill.
    if (!card.penaltyApplied && !penaltyWordIdsRef.current.has(card.word.id)) {
      penaltyWordIdsRef.current.add(card.word.id);
      return buildPenaltyCards(card.word);
    }
    // Later mistakes re-queue only the failed card, bounded so a session terminates.
    if (card.failCount === 0) return [{ ...card, failCount: 1 }];
    return [];
  }

  function advance(correct: boolean, retryCards: StudyCard[] = []) {
    setQueue((prev) => {
      const rest = prev.slice(1);
      if (correct) return rest;
      if (retryCards.length > 0) return scheduleCards(rest, retryCards);
      return rest;
    });
  }

  // ── Handlers ─────────────────────────────────────────────────────────────────

  function handleStage1Quality(quality: 3 | 5) {
    if (Date.now() < blockUntilRef.current) return;
    const card = queue[0];
    blockUntilRef.current = Date.now() + 200;

    // A reminder flashcard inside an already-queued learning chain: the rest of the
    // flow is in the queue already, so this card only dismisses.
    if (card.standalone) {
      setQueue((prev) => prev.slice(1));
      return;
    }

    initialQualityRef.current[card.word.id] = quality;
    // Stage 1 is self-assessment — no saveProgress, no mistake counter.
    const next = quality === 5
      // Easy — straight to typing. easyChosen marks the card so a typing miss
      // demotes the word to the difficult path.
      ? [{ word: card.word, stage: 3 as const, failCount: 0, easyChosen: true }]
      // Hard — the full difficult path: select → assemble → type.
      : buildDifficultChain(card.word);
    setQueue((prev) => scheduleCards(prev.slice(1), next));
  }

  function handleStage2Select(index: number) {
    if (answerState !== 'unanswered') return;
    const card = queue[0];
    const isCorrect = options[index].correct;
    setSelectedOption(index);
    setAnswerState(isCorrect ? 'correct' : 'wrong');
    recordAnswer(isCorrect);

    if (!isCorrect) {
      if (!mistakeWordIdsRef.current.has(card.word.id)) {
        mistakeWordIdsRef.current.add(card.word.id);
        setMistakeWordCount((c) => c + 1);
      }
      // Only update backend in study mode
      if (sessionMode === 'study') saveProgress(card.word.id, 'learning', true);
    } else {
      if (sessionMode === 'study' && !mistakeWordIdsRef.current.has(card.word.id)) saveProgress(card.word.id, 'known', false);
    }

    if (isCorrect) {
      setTimeout(() => {
        setAnswerState('unanswered');
        setSelectedOption(null);
        blockUntilRef.current = Date.now() + 200;
        advance(true);
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
    advance(false, retryCards);
    if (lessonMode === 'quick' && mistakeWordIdsRef.current.size / totalWords >= 0.25) finishSession(true);
  }

  function handleStage2rSelect(index: number) {
    if (answerState !== 'unanswered') return;
    const card = queue[0];
    const isCorrect = options[index].correct;
    setSelectedOption(index);
    setAnswerState(isCorrect ? 'correct' : 'wrong');
    recordAnswer(isCorrect);

    if (!isCorrect) {
      if (!mistakeWordIdsRef.current.has(card.word.id)) {
        mistakeWordIdsRef.current.add(card.word.id);
        setMistakeWordCount((c) => c + 1);
      }
      if (sessionMode === 'study') saveProgress(card.word.id, 'learning', true);
    } else {
      if (sessionMode === 'study' && !mistakeWordIdsRef.current.has(card.word.id)) saveProgress(card.word.id, 'known', false);
    }

    if (isCorrect) {
      setTimeout(() => {
        setAnswerState('unanswered');
        setSelectedOption(null);
        blockUntilRef.current = Date.now() + 200;
        advance(true);
      }, 1200);
    }
  }

  function handleStage2rDismiss() {
    const card = queue[0];
    const retryCards = buildRetryCards(card);
    if (!card.standalone && retryCards.length === 0 && !doneWordIdsRef.current.has(card.word.id)) {
      doneWordIdsRef.current.add(card.word.id);
      setWordsDone((c) => c + 1);
    }
    setAnswerState('unanswered');
    setSelectedOption(null);
    blockUntilRef.current = Date.now() + 200;
    advance(false, retryCards);
    if (lessonMode === 'quick' && mistakeWordIdsRef.current.size / totalWords >= 0.25) finishSession(true);
  }

  function handleStage2aTileClick(tileIdx: number) {
    if (answerState !== 'unanswered') return;
    const card = queue[0];
    const next = [...assembledSyllables, tileIdx];
    setAssembledSyllables(next);
    if (next.length !== assembly.tiles.length) return;

    const attempt = next.map((i) => assembly.tiles[i]).join(assembly.separator);
    const isCorrect = normalizeLt(attempt) === normalizeLt(assembly.target);
    setAnswerState(isCorrect ? 'correct' : 'wrong');
    recordAnswer(isCorrect);

    if (!isCorrect) {
      if (!mistakeWordIdsRef.current.has(card.word.id)) {
        mistakeWordIdsRef.current.add(card.word.id);
        setMistakeWordCount((c) => c + 1);
      }
      if (sessionMode === 'study') saveProgress(card.word.id, 'learning', true);
    } else {
      if (sessionMode === 'study' && !mistakeWordIdsRef.current.has(card.word.id)) saveProgress(card.word.id, 'known', false);
      setTimeout(() => {
        setAnswerState('unanswered');
        setAssembledSyllables([]);
        blockUntilRef.current = Date.now() + 200;
        advance(true);
      }, 1200);
    }
  }

  function handleStage2aDismiss() {
    const card = queue[0];
    const retryCards = buildRetryCards(card);
    if (!card.standalone && retryCards.length === 0 && !doneWordIdsRef.current.has(card.word.id)) {
      doneWordIdsRef.current.add(card.word.id);
      setWordsDone((c) => c + 1);
    }
    setAnswerState('unanswered');
    setAssembledSyllables([]);
    blockUntilRef.current = Date.now() + 200;
    advance(false, retryCards);
    if (lessonMode === 'quick' && mistakeWordIdsRef.current.size / totalWords >= 0.25) finishSession(true);
  }

  function handleStage3Submit() {
    if (answerState !== 'unanswered') return;
    if (typedAnswer.trim() === '') { setAnswerState('empty'); return; }

    const card = queue[0];
    const forms = parseForms(card.word.lithuanian);
    const target = forms[blankIndex] ?? forms[0];
    // Accept any session synonym (same translation_ru) as a valid answer. Since the
    // prompt no longer reveals which Lithuanian word is expected, either synonym is
    // fair. Cloze prompts (multi-form words) already show letters, so keep them strict.
    const isCloze = forms.length > 1;
    const siblingForms = isCloze
      ? []
      : words
          .filter((w) => w.id !== card.word.id && trans(w, lang) === trans(card.word, lang))
          .flatMap((w) => parseForms(w.lithuanian));
    const matched = [target, ...siblingForms].find((t) => checkAnswer(typedAnswer.trim(), t, complexity));
    const isCorrect = matched !== undefined;

    setAnswerState(isCorrect ? 'correct' : 'wrong');
    recordAnswer(isCorrect);
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
      if (!mistakeWordIdsRef.current.has(card.word.id)) saveProgress(card.word.id, 'known', false, clearMistakeOnSuccess, initQ);
      learnedWordIdsRef.current.add(card.word.id);
      const matchedForm = matched ?? target;
      const isExact = collapseWs(typedAnswer).toLowerCase() === collapseWs(matchedForm).toLowerCase();
      if (!isExact) setNearMiss(matchedForm);
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
        advance(true);
      }, delay);
    } else {
      // Only update backend in study mode on failure
      if (sessionMode === 'study') saveProgress(card.word.id, 'learning', true, false, initQ === 5 ? 3 : 2);
    }
  }

  // «Забыл» — reveal the answer through the *existing* wrong-answer path, so the
  // mistake is counted and the word re-queued exactly as a wrong answer would be.
  // No new scoring path (issue #144's pattern, mirrored from PhraseSession).
  function handleStage3Forgot() {
    if (answerState !== 'unanswered' && answerState !== 'empty') return;
    const card = queue[0];
    const forms = parseForms(card.word.lithuanian);
    const target = forms[blankIndex] ?? forms[0];

    blockUntilRef.current = Date.now() + 300;
    setShownAnswer(target);
    setAnswerState('wrong');
    recordAnswer(false);
    if (!mistakeWordIdsRef.current.has(card.word.id)) {
      mistakeWordIdsRef.current.add(card.word.id);
      setMistakeWordCount((c) => c + 1);
    }
    const initQ = initialQualityRef.current[card.word.id] ?? 3;
    if (sessionMode === 'study') saveProgress(card.word.id, 'learning', true, false, initQ === 5 ? 3 : 2);
  }

  function handleStage3Dismiss() {
    const card = queue[0];
    const retryCards = buildRetryCards(card);
    const syllable = shownAnswer ? findMistakeSyllable(typedAnswer, shownAnswer) : undefined;
    if (!card.standalone && retryCards.length === 0 && !doneWordIdsRef.current.has(card.word.id)) {
      doneWordIdsRef.current.add(card.word.id);
      setWordsDone((c) => c + 1);
    }
    setAnswerState('unanswered');
    setTypedAnswer('');
    setShownAnswer('');
    setNearMiss(null);
    blockUntilRef.current = Date.now() + 200;
    setQueue((prev) => {
      const rest = prev.slice(1);
      if (!syllable || retryCards.length === 0) return scheduleCards(rest, retryCards);
      return insertDrillThenSchedule(
        rest,
        { word: card.word, stage: '3s', failCount: 0, targetSyllable: syllable, penaltyApplied: card.penaltyApplied },
        retryCards,
      );
    });
    if (lessonMode === 'quick' && mistakeWordIdsRef.current.size / totalWords >= 0.25) finishSession(true);
  }

  function handleStage3sSubmit() {
    if (answerState !== 'unanswered') return;
    const card = queue[0];
    const syllable = card.targetSyllable ?? '';
    if (syllableTyped.trim() === '') { setAnswerState('empty'); return; }
    const isCorrect =
      normalizeLt(syllableTyped.trim()) === normalizeLt(syllable.trim()) ||
      syllableTyped.trim().toLowerCase() === syllable.trim().toLowerCase();
    setAnswerState(isCorrect ? 'correct' : 'wrong');
    recordAnswer(isCorrect);
    if (!isCorrect) {
      blockUntilRef.current = Date.now() + 300;
      setShownAnswer(syllable);
    } else {
      setTimeout(() => {
        setAnswerState('unanswered');
        setSyllableTyped('');
        setShownAnswer('');
        blockUntilRef.current = Date.now() + 200;
        advance(true);
      }, 1200);
    }
  }

  function handleStage3sDismiss() {
    const card = queue[0];
    setQueue((prev) => insertDrillThenSchedule(
      prev.slice(1),
      { word: card.word, stage: '3s', failCount: card.failCount + 1, targetSyllable: card.targetSyllable, penaltyApplied: card.penaltyApplied },
      [{ word: card.word, stage: 3, failCount: 0, penaltyApplied: card.penaltyApplied }],
    ));
    setAnswerState('unanswered');
    setSyllableTyped('');
    setShownAnswer('');
    blockUntilRef.current = Date.now() + 200;
  }

  // ── Match round ───────────────────────────────────────────────────────────────
  if (showMatchRound && !done) {
    return (
      <MatchRound
        words={matchRoundWords}
        lang={lang}
        onDone={() => {
          setShowMatchRound(false);
          // Mid-flow phase (continue-session): skip this phase's own done screen
          // entirely and hand off straight to the next one — only the last phase
          // in the sequence should show "session complete".
          if (onAdvance) { onAdvance(); return; }
          setDone(true);
        }}
        backHref={backHref}
      />
    );
  }

  // ── Done screen ───────────────────────────────────────────────────────────────
  if (done) {
    // One outcome model, so every number on this screen reconciles (issue #147).
    // Invariant: firstTry + stumbled + notMastered === totalWords.
    const mastered    = correctWordIdsRef.current.size;
    const stumbled    = Array.from(correctWordIdsRef.current).filter((id) => mistakeWordIdsRef.current.has(id)).length;
    const firstTry    = mastered - stumbled;
    const notMastered = Math.max(0, totalWords - mastered);
    // Review mode has no fail state — it is a repetition drill, not a lesson to pass.
    const isStudy     = sessionMode === 'study';
    const passed      = notMastered === 0 && !endedEarly;

    return (
      <main className="flex-1 text-gray-900 flex flex-col items-center justify-center px-8 pt-5 pb-20">
        <div className="relative z-10 text-center max-w-sm w-full">
          <div className="flex justify-center mb-6" data-testid="result-emoji">
            {/* A passed lesson never shows a sad TAK, even if the mood dipped mid-session. */}
            <PageMascot phrase="Valio!" mood={passed ? Math.max(mood, 1) : mood} />
          </div>
          <h1 className="text-[26px] font-bold mb-2">{tr.common.sessionDone}</h1>
          {isStudy && (
            <p
              className={`text-base font-semibold mb-2 ${passed ? 'text-emerald-700' : 'text-amber-700'}`}
              data-testid="result-verdict"
              data-passed={passed ? 'true' : 'false'}
            >
              {passed ? tr.common.lessonPassed : tr.common.lessonNotPassed}
            </p>
          )}
          <p className="text-[15px] text-muted mb-8" data-testid="result-headline" data-total={totalWords}>
            {tr.common.correctOf.replace('{correct}', String(mastered)).replace('{total}', String(totalWords))}
          </p>
          <div className="flex gap-4 justify-center mb-8">
            <div className="bg-white border border-line rounded-[14px] px-5 sm:px-6 py-5 text-center">
              <div className="text-2xl sm:text-3xl font-bold text-emerald-600" data-testid="tile-first-try">{firstTry}</div>
              <div className="text-muted text-[13px] mt-1">{tr.common.firstTryLabel}</div>
            </div>
            <div className="bg-white border border-line rounded-[14px] px-5 sm:px-6 py-5 text-center">
              <div className="text-2xl sm:text-3xl font-bold text-amber-600" data-testid="tile-stumbled">{stumbled}</div>
              <div className="text-muted text-[13px] mt-1">{tr.common.stumbledLabel}</div>
            </div>
            {notMastered > 0 && (
              <div className="bg-white border border-line rounded-[14px] px-5 sm:px-6 py-5 text-center">
                <div className="text-2xl sm:text-3xl font-bold text-rose-600" data-testid="tile-not-mastered">{notMastered}</div>
                <div className="text-muted text-[13px] mt-1">{tr.common.notMasteredLabel}</div>
              </div>
            )}
          </div>
          {endedEarly && (
            <p className="text-amber-700 text-sm mb-3 px-2" data-testid="result-ended-early">{tr.common.endedEarly}</p>
          )}
          {isStudy && (
            <p className="text-gray-500 text-sm mb-6 px-2" data-testid="result-message">
              {!passed
                ? (endedEarly ? tr.common.relearnSuggestion : tr.common.lessonNotPassedHint)
                : stumbled > 0
                  ? tr.common.masteredWithMistakes.replace('{count}', String(stumbled))
                  : tr.common.perfectSession}
            </p>
          )}
          <div className="flex flex-col gap-3">
            <button
              onClick={() => { router.refresh(); onRepeat(); }}
              className="w-full py-3.5 bg-ink hover:bg-[#25282d] rounded-[10px] text-[15px] font-semibold text-white transition-colors"
              data-testid="done-primary"
            >
              {!isStudy
                ? tr.common.repeatMore
                : passed ? tr.common.oneLessonMore : tr.common.restartLesson}
            </button>
            <button
              onClick={() => router.push(backHref)}
              className="w-full py-3 text-[13.5px] text-muted hover:text-gray-900 transition-colors text-center"
            >
              <TakChevron direction="left" size={10} className="inline-block align-[-1px] mr-1" />{tr.study.backToLists}
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
  const stageLabel  = tr.study.stages[stage === '2r' || stage === '3s' || stage === '2a' ? 3 : stage];
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
            <TakChevron direction="left" size={10} className="inline-block align-[-1px] mr-1" />{tr.study.backToLists}
          </Link>
          <div className="flex items-center gap-3">
            <span className="text-[#5b6067] text-xs uppercase tracking-wider">
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
        <div className={`w-full h-1 rounded-full ${useTimer && stage !== 1 ? 'bg-gray-100' : 'bg-transparent'}`}>
          {useTimer && stage !== 1 && (
            <div
              data-testid="timer-bar"
              className={`h-1 rounded-full transition-all duration-1000 ${timeLeft <= 1 ? 'bg-red-400' : 'bg-amber-400'}`}
              style={{ width: `${(timeLeft / timerSeconds) * 100}%` }}
            />
          )}
        </div>

        {/* One mascot for the whole session — sits above every stage so his mood
            stays visible while answering, not just on the stage-1 flashcard. */}
        <div className="flex justify-center pt-6 sm:pt-10">
          <PageMascot phrase={stage === 1 ? 'Prisimeni?' : 'Pagalvok!'} mood={mood} />
        </div>

        {/* ── Stage 1: Flashcard + self-evaluation ── */}
        {stage === 1 && (
          <div className="flex flex-col items-center flex-1 gap-4 sm:gap-6 pt-4 sm:pt-6">
            <div className="w-full max-w-[420px] bg-white border border-gray-100 rounded-2xl p-5 sm:py-9 sm:px-12 text-center">
              <p className="text-gray-400 text-xs uppercase tracking-wider mb-4 sm:mb-6">
                {(sessionMode === 'review' || word.status === 'known' || word.status === 'learning') ? tr.common.review : tr.common.newWord}
              </p>
              <p className="text-3xl sm:text-5xl font-bold tracking-tight mb-4">{renderAccented(word.accented || word.lithuanian)}</p>
              {digit && <p className="text-5xl sm:text-7xl font-bold text-emerald-600 mb-4" data-testid="number-digit">{digit}</p>}
              {word.hint && !digit && <p className="text-[#5b6067] text-xs uppercase tracking-wider mb-4">{word.hint}</p>}
              <div className="h-px bg-gray-100 mb-4" />
              <p className="text-xl text-gray-500">{trans(word, lang)}</p>
            </div>
            <div className="w-full max-w-[420px] grid grid-cols-2 gap-4">
              <button onClick={() => handleStage1Quality(3)} tabIndex={-1} className="p-3.5 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-[10px] font-semibold text-amber-600 transition-colors">
                {tr.study.hard}
              </button>
              <button onClick={() => handleStage1Quality(5)} tabIndex={-1} className="p-3.5 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-[10px] font-semibold text-emerald-600 transition-colors">
                {tr.study.easy}
              </button>
            </div>
          </div>
        )}

        {/* ── Stage 2: Multiple choice ── */}
        {stage === 2 && (
          <div className="flex flex-col items-center flex-1 gap-4 sm:gap-8 pt-4 sm:pt-6">
            <div className="text-center">
              <p className="text-gray-400 text-sm mb-3 uppercase tracking-wider">{tr.study.whatMeans}</p>
              <p className="text-2xl sm:text-4xl font-bold tracking-tight">{renderAccented(word.accented || word.lithuanian)}</p>
              {digit && <p className="text-4xl sm:text-6xl font-bold text-emerald-600 mt-2" data-testid="number-digit">{digit}</p>}
              {word.hint && !digit && <p className="text-[#5b6067] text-xs uppercase tracking-wider mt-2">{word.hint}</p>}
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
                  {tr.common.dismiss} <TakChevron size={10} className="inline-block align-[-1px]" />
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── Stage 2r: Reverse multiple choice (show translation, select Lithuanian) ── */}
        {stage === '2r' && (
          <div className="flex flex-col items-center flex-1 gap-4 sm:gap-8 pt-4 sm:pt-6">
            <div className="text-center">
              <p className="text-gray-400 text-sm mb-3 uppercase tracking-wider">{tr.study.selectLithuanian}</p>
              <p className="text-2xl sm:text-4xl font-bold tracking-tight">{trans(word, lang)}</p>
              {digit && <p className="text-4xl sm:text-6xl font-bold text-emerald-600 mt-2" data-testid="number-digit">{digit}</p>}
              {word.hint && !digit && <p className="text-[#5b6067] text-xs uppercase tracking-wider mt-2">{word.hint}</p>}
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
                return <button key={i} onClick={() => handleStage2rSelect(i)} className={cls}>{opt.text}</button>;
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
                <button ref={dismissBtnRef} data-testid="dismiss-wrong" onClick={handleStage2rDismiss} className="w-full py-4 bg-gray-100 hover:bg-gray-100 rounded-xl font-medium transition-colors">
                  {tr.common.dismiss} <TakChevron size={10} className="inline-block align-[-1px]" />
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── Stage 2a: Assemble the entry from shuffled tiles (word / syllable / letter) ── */}
        {stage === '2a' && (
          <div className="flex flex-col items-center flex-1 gap-4 sm:gap-8 pt-4 sm:pt-6">
            <div className="text-center">
              <p className="text-gray-400 text-sm mb-3 uppercase tracking-wider">
                {assembly.mode === 'word'
                  ? tr.study.assemblePhrase
                  : assembly.mode === 'letter' ? tr.study.assembleLetters : tr.study.assembleWord}
              </p>
              <p className="text-2xl sm:text-4xl font-bold tracking-tight">{trans(word, lang)}</p>
              {digit && <p className="text-4xl sm:text-6xl font-bold text-emerald-600 mt-2" data-testid="number-digit">{digit}</p>}
              {word.hint && !digit && <p className="text-[#5b6067] text-xs uppercase tracking-wider mt-2">{word.hint}</p>}
            </div>

            <div className="w-full min-h-[3.5rem] border-b border-gray-200 pb-3 flex flex-wrap gap-2 justify-center" data-testid="assembled-row">
              {assembledSyllables.map((tileIdx, pos) => (
                <button
                  key={pos}
                  onClick={() => { if (answerState === 'unanswered') setAssembledSyllables((a) => a.filter((_, j) => j !== pos)); }}
                  className="py-2 px-3 rounded-xl text-sm font-medium bg-emerald-100 border border-gray-900 text-emerald-700"
                >
                  {assembly.tiles[tileIdx]}
                </button>
              ))}
            </div>

            <div className="w-full flex flex-wrap gap-2 justify-center" data-testid="syllable-tile-pool" data-tile-mode={assembly.mode}>
              {assembly.tiles.map((syl, i) => {
                const used = assembledSyllables.includes(i);
                return (
                  <button
                    key={i}
                    onClick={() => handleStage2aTileClick(i)}
                    disabled={used || answerState !== 'unanswered'}
                    className={`py-2 px-3 rounded-xl text-sm font-medium border transition-colors ${
                      used
                        ? 'bg-gray-50 border-gray-100 text-[#5b6067]'
                        : 'bg-white border-gray-900 text-gray-900 hover:bg-gray-100'
                    }`}
                  >
                    {syl}
                  </button>
                );
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
                    {tr.common.correctAnswer} <span className="text-gray-900 font-medium">{assembly.target}</span>
                  </p>
                </div>
                <button ref={dismissBtnRef} data-testid="dismiss-wrong" onClick={handleStage2aDismiss} className="w-full py-4 bg-gray-100 hover:bg-gray-100 rounded-xl font-medium transition-colors">
                  {tr.common.dismiss} <TakChevron size={10} className="inline-block align-[-1px]" />
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── Stage 3: Type it ── */}
        {stage === 3 && (
          <div className="flex flex-col items-center flex-1 gap-4 sm:gap-8 pt-4 sm:pt-6">
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
              {word.hint && !digit && <p className="text-[#5b6067] text-xs uppercase tracking-wider mt-2">{word.hint}</p>}
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
                <>
                  <button onClick={handleStage3Submit} className="w-full py-4 bg-gray-900 hover:bg-gray-800 rounded-xl font-medium text-white transition-colors">
                    {tr.common.check}
                  </button>
                  {/* Routed through the wrong-answer path — mistake counted, word
                      re-queued — so there is no second scoring path to keep in sync. */}
                  <button
                    onClick={handleStage3Forgot}
                    data-testid="forgot-btn"
                    className="w-full py-2 text-[13.5px] text-muted hover:text-ink transition-colors text-center"
                  >
                    {tr.study.didntKnow}
                  </button>
                </>
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
                    {tr.common.dismiss} <TakChevron size={10} className="inline-block align-[-1px]" />
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Stage 3s: Syllable drill ── */}
        {stage === '3s' && (() => {
          const syllable = (card.targetSyllable ?? '').trim();
          const text = word.lithuanian;
          const idx = text.toLowerCase().indexOf(syllable.toLowerCase());
          const before = idx === -1 ? text : text.slice(0, idx);
          const after = idx === -1 ? '' : text.slice(idx + syllable.length);
          const inputW = `${Math.max(syllable.length * 1.1, 1.5)}ch`;
          return (
            <div className="flex flex-col items-center flex-1 gap-4 sm:gap-8 pt-4 sm:pt-6">
              <div className="text-center">
                <p className="text-gray-400 text-sm mb-6 uppercase tracking-wider">Отработайте слог</p>
                {/* Inline gap input inside the word — use <p> to preserve spacing */}
                <p className="text-2xl sm:text-4xl font-bold tracking-tight">
                  {before}
                  {answerState === 'correct' && (
                    <span className="text-emerald-600 border-b-4 border-emerald-400 px-0.5 rounded-sm bg-emerald-50">{syllableTyped}</span>
                  )}
                  {answerState === 'wrong' && (
                    <span className="text-red-500 border-b-4 border-red-400 px-0.5 rounded-sm bg-red-50">{syllable}</span>
                  )}
                  {(answerState === 'unanswered' || answerState === 'empty') && (
                    <input
                      ref={syllableInputRef}
                      type="text"
                      value={syllableTyped}
                      onChange={(e) => { setSyllableTyped(e.target.value); if (answerState === 'empty') setAnswerState('unanswered'); }}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleStage3sSubmit(); }}
                      style={{ width: inputW, minWidth: '2.5ch', display: 'inline' }}
                      className={`border-b-4 rounded-sm bg-emerald-50 outline-none text-center font-bold text-emerald-600 px-1
                        ${answerState === 'empty' ? 'border-amber-400 bg-amber-50' : 'border-emerald-400'}`}
                    />
                  )}
                  {after}
                </p>
                {word.hint && <p className="text-[#5b6067] text-xs uppercase tracking-wider mt-3">{word.hint}</p>}
                <p className="text-gray-400 text-sm mt-3">{trans(word, lang)}</p>
              </div>
              <div className="w-full flex flex-col gap-3">
                {answerState === 'empty' && (
                  <p className="text-amber-600 text-sm text-center animate-in fade-in duration-150">{tr.study.typeEmptyHint}</p>
                )}
                {(answerState === 'unanswered' || answerState === 'empty') && (
                  <button onClick={handleStage3sSubmit} className="w-full py-4 bg-gray-900 hover:bg-gray-800 rounded-xl font-medium text-white transition-colors">
                    {tr.common.check}
                  </button>
                )}
                {answerState === 'correct' && (
                  <p className="text-emerald-600 text-sm font-medium text-center animate-in fade-in duration-150">
                    {tr.common.correct} Теперь напишите слово целиком.
                  </p>
                )}
                {answerState === 'wrong' && (
                  <div className="flex flex-col gap-3 animate-in fade-in duration-150">
                    <p className="text-red-600 text-sm font-medium text-center">{tr.common.notQuite}</p>
                    <button ref={dismissBtnRef} data-testid="dismiss-wrong" onClick={handleStage3sDismiss} className="w-full py-4 bg-gray-100 hover:bg-gray-100 rounded-xl font-medium transition-colors">
                      {tr.common.dismiss} <TakChevron size={10} className="inline-block align-[-1px]" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })()}
      </div>
    </main>
  );
}
