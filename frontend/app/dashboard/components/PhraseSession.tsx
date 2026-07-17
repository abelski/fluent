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

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { recordPhraseProgress, getSettings, type PhraseStudyItem } from '../../../lib/api';
import { useT } from '../../../lib/useT';
import CharDiff from './CharDiff';
import MatchRound from './MatchRound';
import type { Word } from './QuizSession';
import { normalizeLt } from '../../../lib/normalizeLt';

// ── Types ─────────────────────────────────────────────────────────────────────

type Complexity = 'easy' | 'medium' | 'hard';

// ── Text validation ───────────────────────────────────────────────────────────


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

function checkPhrase(typed: string, target: string, complexity: Complexity, altTexts?: string | null): boolean {
  const clean = (s: string) =>
    normalizeLt(s.replace(/[.,!?;:'"/()]/g, '').replace(/\s+/g, ' ').trim());
  const t = clean(typed);
  const targets = [target, ...(altTexts ? altTexts.split('|').map(s => s.trim()).filter(Boolean) : [])];
  for (const ans of targets) {
    const r = clean(ans);
    if (t === r) return true;
    if (complexity === 'hard') continue;
    const threshold = Math.max(1, Math.floor(r.length * (complexity === 'easy' ? 0.25 : 0.15)));
    if (levenshtein(t, r) <= threshold) return true;
  }
  return false;
}

function checkWord(typed: string, target: string, complexity: Complexity): boolean {
  const clean = (s: string) => normalizeLt(s.replace(/[.,!?;:'"/()]/g, '').trim());
  const t = clean(typed);
  const r = clean(target);
  if (complexity === 'hard') return t === r;
  if (t === r) return true;
  if (complexity === 'easy') return levenshtein(t, r) <= 1;
  return false;
}

// ── Syllable helpers ──────────────────────────────────────────────────────────

const LT_DIPHTHONGS = new Set(['ie', 'uo', 'ai', 'ei', 'ui', 'au', 'ia', 'ua']);

function splitSyllables(word: string): string[] {
  const isVowel = (c: string) => /[aeiouąęėįųūy]/i.test(c);
  const vowelIdx: number[] = [];
  for (let i = 0; i < word.length; i++) if (isVowel(word[i])) vowelIdx.push(i);
  if (vowelIdx.length <= 1) return [word];
  const splits: number[] = [0];
  let i = 0;
  while (i < vowelIdx.length - 1) {
    const v1 = vowelIdx[i];
    const v2 = vowelIdx[i + 1];
    const gap = v2 - v1 - 1;
    if (gap === 0) {
      const pair = (word[v1] + word[v2]).toLowerCase().replace(/[ąęėįųū]/g, (c) =>
        ({ ą: 'a', ę: 'e', ė: 'e', į: 'i', ų: 'u', ū: 'u' }[c] ?? c));
      if (LT_DIPHTHONGS.has(pair)) { i++; continue; }
      splits.push(v2);
    } else if (gap === 1) {
      splits.push(v1 + 1);
    } else {
      splits.push(v1 + 1 + Math.floor(gap / 2));
    }
    i++;
  }
  splits.push(word.length);
  return splits.slice(0, -1).map((s, idx) => word.slice(s, splits[idx + 1])).filter(Boolean);
}

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

function findMistakeWordSyllable(typed: string, target: string): { syllable: string; word: string } {
  const strip = (s: string) => s.replace(/[.,!?;:'"()/]/g, '');
  const targetWords = target.trim().split(/\s+/);
  const typedWords = typed.trim().split(/\s+/);
  for (let i = 0; i < targetWords.length; i++) {
    const tw = strip(targetWords[i]);
    const tt = strip(typedWords[i] ?? '');
    if (normalizeLt(tt) !== normalizeLt(tw)) {
      return { syllable: findMistakeSyllable(tt, tw), word: tw };
    }
  }
  const lastWord = strip(targetWords[targetWords.length - 1]);
  return { syllable: splitSyllables(lastWord)[0] ?? lastWord, word: lastWord };
}

// ── Queue helpers ─────────────────────────────────────────────────────────────

type QueueMode = 'normal' | 'gap_retry' | 'full_retake';

interface QueueItem {
  phrase: PhraseStudyItem;
  retries: number;
  mode: QueueMode;
}

function buildQueue(phrases: PhraseStudyItem[]): QueueItem[] {
  return phrases.map((p) => ({ phrase: p, retries: 0, mode: 'normal' }));
}

// ── Sub-steps within stage 1 ──────────────────────────────────────────────────
type Stage1Step = 'mcq' | 'type';

// ── Sub-steps within stage 2 ──────────────────────────────────────────────────
// 'assemble' — click shuffled word tiles into order (only for >3-word phrases,
// server sends word_tiles); 'type' — the classic full typed recall.
type Stage2Step = 'assemble' | 'type';

function firstMisplacedWord(assembledWords: string[], target: string): string {
  const strip = (s: string) => s.replace(/[.,!?;:'"()/]/g, '');
  const targetWords = target.trim().split(/\s+/);
  for (let i = 0; i < targetWords.length; i++) {
    if (normalizeLt(strip(assembledWords[i] ?? '').toLowerCase()) !== normalizeLt(strip(targetWords[i]).toLowerCase())) {
      return strip(targetWords[i]);
    }
  }
  return strip(targetWords[0]);
}

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
  recordProgress = recordPhraseProgress,
}: {
  phrases: PhraseStudyItem[];
  backHref: string;
  onRepeat: () => void;
  recordProgress?: (
    phraseId: number,
    payload: { quality: number; stage_completed: number; mistake_word?: string },
  ) => Promise<{ lesson_stage: number; next_review: string | null; interval: number }>;
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
  const [stage2Step, setStage2Step] = useState<Stage2Step>(() => (phrases[0]?.word_tiles ? 'assemble' : 'type'));
  const [assembled, setAssembled] = useState<number[]>([]);
  const [assembleResult, setAssembleResult] = useState<'correct' | 'wrong' | null>(null);
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
  const [hardFeedback, setHardFeedback] = useState(false);

  const [syllableChallenge, setSyllableChallenge] = useState<{ syllable: string; word: string } | null>(null);
  const [syllableInput, setSyllableInput] = useState('');
  const [syllableResult, setSyllableResult] = useState<'correct' | 'wrong' | null>(null);

  const inputRef          = useRef<HTMLInputElement>(null);
  const textareaRef       = useRef<HTMLTextAreaElement>(null);
  const syllableInputRef  = useRef<HTMLInputElement>(null);
  const blockUntilRef     = useRef(0);
  const pendingAdvanceRef = useRef<(() => void) | null>(null);
  const donePhrasesRef     = useRef<Set<number>>(new Set());
  const mistakePhraseIdsRef = useRef<Set<number>>(new Set());

  // ── Timer ────────────────────────────────────────────────────────────────────
  const [timeLeft, setTimeLeft] = useState(timerSeconds);
  const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const current = queue[currentIdx];
  const stage   = current?.phrase.lesson_stage;

  // Memoize MCQ options so they don't reshuffle on every re-render (e.g. timer ticks)
  const mcqOptions = useMemo(() => {
    if (!current || current.phrase.lesson_stage !== 1) return [];
    return buildMcqOptions(current.phrase.blank_word, current.phrase.mcq_distractors);
  // Recompute only when the card changes, not on every render
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIdx]);

  // Timer: start/reset on each new card (skip stage 0 intro, same as QuizSession skipping stage 1)
  useEffect(() => {
    if (timerIntervalRef.current) { clearInterval(timerIntervalRef.current); timerIntervalRef.current = null; }
    if (!useTimer || stage === undefined || stage === 0) return;
    setTimeLeft(timerSeconds);
    timerIntervalRef.current = setInterval(() => setTimeLeft((t) => t - 1), 1000);
    return () => { if (timerIntervalRef.current) { clearInterval(timerIntervalRef.current); timerIntervalRef.current = null; } };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIdx, stage1Step, stage2Step, stage, useTimer, timerSeconds]);

  // Stop timer when answer is submitted
  useEffect(() => {
    const hasResult = mcqResult !== null || typeResult !== null || assembleResult !== null;
    if (hasResult && timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current); timerIntervalRef.current = null;
    }
  }, [mcqResult, typeResult, assembleResult]);

  // ── Reset card state on index change ────────────────────────────────────────
  useEffect(() => {
    const nextItem = queue[currentIdx];
    // gap_retry skips MCQ — go straight to typing sub-step
    setStage1Step(nextItem?.mode === 'gap_retry' ? 'type' : 'mcq');
    // full_retake skips assembly — go straight to typed recall
    setStage2Step(nextItem?.phrase.word_tiles && nextItem.mode !== 'full_retake' ? 'assemble' : 'type');
    setAssembled([]);
    setAssembleResult(null);
    setMcqSelected(null);
    setMcqResult(null);
    setTypeInput('');
    setTypeResult(null);
    setShowAnswer(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIdx]);

  useEffect(() => {
    if (stage1Step === 'type' && inputRef.current && window.innerWidth > 768) inputRef.current.focus();
  }, [stage1Step]);

  useEffect(() => {
    if (current?.phrase.lesson_stage === 2 && stage2Step === 'type' && textareaRef.current && window.innerWidth > 768) textareaRef.current.focus();
  }, [current, stage2Step]);

  useEffect(() => {
    if (syllableChallenge) setTimeout(() => syllableInputRef.current?.focus(), 50);
  }, [syllableChallenge]);

  // ── Timer timeout → mark wrong ───────────────────────────────────────────────
  useEffect(() => {
    if (!useTimer || timeLeft > 0 || stage === undefined || stage === 0) return;
    const hasResult = mcqResult !== null || typeResult !== null || assembleResult !== null;
    if (hasResult) return;
    if (timerIntervalRef.current) { clearInterval(timerIntervalRef.current); timerIntervalRef.current = null; }
    // Mark as wrong
    if (stage === 1) {
      if (stage1Step === 'mcq') {
        setMcqResult('wrong');
      } else {
        setTypeResult('wrong');
      }
    } else if (stage2Step === 'assemble') {
      setAssembleResult('wrong');
    } else {
      setTypeResult('wrong');
    }
    if (current && !mistakePhraseIdsRef.current.has(current.phrase.id)) {
      mistakePhraseIdsRef.current.add(current.phrase.id);
      setMistakeCount((c) => c + 1);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeLeft, useTimer, stage, stage1Step, stage2Step]);

  // ── Enter key: advance past shown results ────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      if (Date.now() < blockUntilRef.current) return;
      if (!current) return;
      const s = current.phrase.lesson_stage;

      // Syllable challenge active: only handle dismiss-wrong, block everything else
      if (syllableChallenge) {
        if (syllableResult === 'wrong') {
          e.preventDefault();
          blockUntilRef.current = Date.now() + 200;
          handleSyllableDismiss();
        }
        return;
      }

      // Stage 0: buttons only — no keyboard shortcut (prevents accidental skip on key-repeat)

      // Stage 1 MCQ wrong shown → advance directly (no syllable challenge — user clicked, didn't type)
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
        if (typeResult === 'correct') { advanceQueue(5); return; }
        const bw = current.phrase.blank_word;
        pendingAdvanceRef.current = () => advanceQueue(1, bw);
        setSyllableChallenge({ syllable: bw, word: bw });
        setSyllableInput('');
        setSyllableResult(null);
        return;
      }

      // Stage 2 assembly wrong shown → advance (re-queue; no typed mistake to drill)
      if (s === 2 && stage2Step === 'assemble' && assembleResult === 'wrong') {
        e.preventDefault();
        blockUntilRef.current = Date.now() + 200;
        const tiles = current.phrase.word_tiles ?? [];
        advanceQueue(1, firstMisplacedWord(assembled.map((i) => tiles[i]), current.phrase.text));
        return;
      }

      // Stage 2 type result shown → advance
      if (s === 2 && typeResult !== null) {
        e.preventDefault();
        blockUntilRef.current = Date.now() + 200;
        if (typeResult === 'correct') { advanceQueue(5); return; }
        if (!typeInput.trim()) { advanceQueue(1); return; }
        const { word: mw } = findMistakeWordSyllable(typeInput, current.phrase.text);
        pendingAdvanceRef.current = () => advanceQueue(1);
        setSyllableChallenge({ syllable: mw, word: mw });
        setSyllableInput('');
        setSyllableResult(null);
        return;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, stage1Step, stage2Step, mcqResult, typeResult, assembleResult, assembled, saving, syllableChallenge, syllableResult]);

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
      await recordProgress(phrase.id, {
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
      // full_retake and gap_retry always count as done regardless of quality
      if ((current.mode === 'full_retake' || current.mode === 'gap_retry') && !donePhrasesRef.current.has(phrase.id)) {
        // don't mark done yet — full_retake will do it
      }
    }

    const newQueue = (() => {
      const next = [...queue];
      if (current.mode === 'full_retake') {
        // Final attempt — always mark done, no re-queue
        if (!donePhrasesRef.current.has(phrase.id)) {
          donePhrasesRef.current.add(phrase.id);
          setPhrasesDone((c) => c + 1);
        }
      } else if (current.mode === 'gap_retry') {
        // gap_retry failures don't add more retries — full_retake is already queued
      } else if (quality < 3 && phrase.lesson_stage === 1) {
        // First mistake on a gap exercise → queue 2 gap retries + 1 full retake
        const insertAt = Math.min(currentIdx + 1, next.length);
        next.splice(insertAt, 0,
          { phrase, retries: 0, mode: 'gap_retry' },
          { phrase, retries: 0, mode: 'gap_retry' },
          { phrase, retries: 0, mode: 'full_retake' },
        );
      } else if (quality < 3 && current.retries < 2) {
        // Mistakes on other stages (0, 2) keep existing retry behaviour
        const insertAt = Math.min(currentIdx + 1, next.length);
        next.splice(insertAt, 0, { phrase, retries: current.retries + 1, mode: 'normal' });
      } else if (quality < 3 && current.retries >= 2) {
        // Retry cap hit — no more requeues, but still count the phrase as done
        // so progress accounting (phrasesDone / phrases.length) stays accurate.
        if (!donePhrasesRef.current.has(phrase.id)) {
          donePhrasesRef.current.add(phrase.id);
          setPhrasesDone((c) => c + 1);
        }
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
    const isDone = quality >= 3 || current.mode === 'full_retake' || (current.mode === 'normal' && current.retries >= 2);
    if (isLast && isDone) {
      setShowMatchRound(true);
    } else {
      blockUntilRef.current = Date.now() + 600;
      setCurrentIdx((i) => i + 1);
    }
  // We intentionally list specific deps; queue/current captured at call time
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, currentIdx, queue, lessonMode, phrases.length]);

  // ── Syllable challenge handlers ───────────────────────────────────────────────
  function handleSyllableSubmit() {
    if (!syllableChallenge || syllableResult !== null) return;
    const isCorrect = checkWord(syllableInput.trim(), syllableChallenge.syllable, complexity);
    setSyllableResult(isCorrect ? 'correct' : 'wrong');
    if (isCorrect) {
      setTimeout(() => {
        blockUntilRef.current = Date.now() + 600;
        // Reset answer state before unmounting challenge so the underlying card
        // doesn't flash its previous wrong result while advanceQueue is pending
        setTypeResult(null);
        setTypeInput('');
        setSyllableChallenge(null);
        setSyllableInput('');
        setSyllableResult(null);
        pendingAdvanceRef.current?.();
        pendingAdvanceRef.current = null;
      }, 1200);
    }
  }

  function handleSyllableDismiss() {
    setSyllableResult(null);
    setSyllableInput('');
    // Loop: show the syllable challenge again before the pending retry
  }

  // ── Done screen ───────────────────────────────────────────────────────────────
  if (done) {
    return (
      <main className="min-h-dvh bg-slate-50 text-gray-900 flex flex-col items-center justify-center px-6">
        <div className="pointer-events-none fixed inset-0 flex items-start justify-center">
          <div className="w-[600px] h-[400px] bg-emerald-100/40 blur-[120px] rounded-full mt-[-100px]" />
        </div>
        <div className="relative z-10 text-center max-w-sm w-full">
          <div className="text-5xl mb-4">🎉</div>
          <h2 className="text-2xl font-bold mb-2">{tr.phraseSession.sessionDone}</h2>
          <div className="flex gap-4 justify-center mb-6">
            <div className="bg-white border border-gray-900 rounded-2xl px-6 py-5 text-center">
              <div className="text-2xl font-bold text-emerald-600">{correctCount}</div>
              <div className="text-gray-400 text-sm mt-1">{tr.phraseSession.correctLabel}</div>
            </div>
            <div className="bg-white border border-gray-900 rounded-2xl px-6 py-5 text-center">
              <div className="text-2xl font-bold text-amber-600">{mistakeCount}</div>
              <div className="text-gray-400 text-sm mt-1">{tr.phraseSession.errorsLabel}</div>
            </div>
          </div>
          <div className="flex flex-col gap-3">
            <button
              onClick={onRepeat}
              className="w-full py-3 bg-emerald-600 text-white rounded-xl font-medium hover:bg-emerald-700 transition-colors"
            >
              {tr.phraseSession.repeatBtn}
            </button>
            <Link
              href={backHref}
              className="w-full py-3 text-gray-400 hover:text-gray-900 text-sm transition-colors text-center"
            >
              {tr.phraseSession.backToPrograms}
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

  // ── Syllable challenge interstitial ───────────────────────────────────────────
  if (syllableChallenge) {
    const { syllable, word } = syllableChallenge;
    const phraseText = current?.phrase.text ?? word;

    // Split phrase around the target word, then split word around the syllable
    const wordStart = phraseText.toLowerCase().indexOf(word.toLowerCase());
    const phraseBeforeWord = wordStart === -1 ? '' : phraseText.slice(0, wordStart);
    const phraseAfterWord = wordStart === -1 ? '' : phraseText.slice(wordStart + word.length);

    const sylIdx = word.toLowerCase().indexOf(syllable.toLowerCase());
    const wordBeforeSyl = sylIdx === -1 ? word : word.slice(0, sylIdx);
    const wordAfterSyl = sylIdx === -1 ? '' : word.slice(sylIdx + syllable.length);
    const inputW = `${Math.max(syllable.length * 1.1, 2)}ch`;

    return (
      <main className="min-h-dvh bg-slate-50 flex flex-col items-center px-4 pt-4 pb-6 sm:py-10">
        <div className="pointer-events-none fixed inset-0 flex items-start justify-center">
          <div className="w-[600px] h-[400px] bg-emerald-100/40 blur-[120px] rounded-full mt-[-100px]" />
        </div>
        <div className="relative z-10 w-full max-w-sm">
          <div className="flex justify-between items-center mb-4">
            <span className="text-sm text-gray-400 uppercase tracking-wider">{tr.phraseSession.practiceWord}</span>
            {mistakeCount > 0 && <span className="text-amber-500 text-sm">{mistakeCount} ✗</span>}
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 text-center mb-6">
            {/* Full phrase with syllable gap inline — use inline rendering to preserve spaces */}
            <p className="text-xl sm:text-2xl font-bold text-gray-900 leading-relaxed text-center">
              {phraseBeforeWord}
              {wordBeforeSyl}
              {syllableResult === 'correct' && (
                <span className="text-emerald-600 border-b-4 border-emerald-400 px-1 rounded-sm bg-emerald-50">{syllableInput}</span>
              )}
              {syllableResult === 'wrong' && (
                <span className="text-red-500 border-b-4 border-red-400 px-1 rounded-sm bg-red-50">{syllable}</span>
              )}
              {syllableResult === null && (
                <input
                  ref={syllableInputRef}
                  value={syllableInput}
                  onChange={(e) => setSyllableInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); handleSyllableSubmit(); } }}
                  style={{ width: inputW, minWidth: '2.5ch', display: 'inline' }}
                  className="border-b-4 rounded-sm bg-emerald-50 outline-none text-center font-bold text-emerald-600 px-1 border-emerald-400"
                />
              )}
              {wordAfterSyl}
              {phraseAfterWord}
            </p>
            <p className="text-sm text-gray-400 mt-4">{current ? getTranslation(current.phrase) : ''}</p>
          </div>

          {syllableResult === null && (
            <button
              onClick={handleSyllableSubmit}
              className="w-full py-3 rounded-xl bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 transition-colors"
            >
              {tr.phraseSession.checkBtn}
            </button>
          )}

          {syllableResult === 'correct' && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-center">
              <p className="text-emerald-700 font-semibold">{tr.phraseSession.correctNowWrite}</p>
            </div>
          )}

          {syllableResult === 'wrong' && (
            <div className="flex flex-col gap-3">
              <p className="text-red-600 text-sm text-center">{tr.phraseSession.notQuiteTryAgain}</p>
              <button
                onClick={() => { blockUntilRef.current = Date.now() + 800; handleSyllableDismiss(); }}
                className="w-full py-3 bg-gray-100 rounded-xl text-sm font-medium hover:bg-gray-200 transition-colors"
              >
                {tr.phraseSession.tryAgainBtn}
              </button>
            </div>
          )}
        </div>
      </main>
    );
  }

  const { phrase } = current;
  // full_retake renders as stage 2 (type full phrase); gap_retry renders as stage 1 (type gap)
  const s = current.mode === 'full_retake' ? 2 : phrase.lesson_stage;

  // ── Shared header ─────────────────────────────────────────────────────────────
  function Header() {
    return (
      <div className="flex justify-between items-center mb-4">
        <Link href={backHref} className="text-sm text-gray-400 hover:text-gray-700 transition-colors">
          {tr.phraseSession.backToPrograms}
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
            data-testid="phrase-progress-fill"
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
      <main className="min-h-dvh bg-slate-50 flex flex-col items-center px-4 pt-4 pb-6 sm:py-10" data-testid="phrase-session-stage0">
        <div className="pointer-events-none fixed inset-0 flex items-start justify-center">
          <div className="w-[600px] h-[400px] bg-emerald-100/40 blur-[120px] rounded-full mt-[-100px]" />
        </div>
        <div className="relative z-10 w-full max-w-sm">
          <Header />
          <ProgressBars />

          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 text-center mb-6">
            <p className="text-xs text-emerald-600 font-medium mb-4 uppercase tracking-wider">{tr.phraseSession.newPhrase}</p>
            <p className="text-2xl font-bold text-gray-900 mb-3">{phrase.text}</p>
            <p className="text-gray-500 text-lg">{getTranslation(phrase)}</p>
          </div>

          {hardFeedback ? (
            <div
              data-testid="hard-feedback"
              className="py-3 rounded-xl text-sm font-medium bg-amber-50 text-amber-700 border border-amber-200 text-center"
            >
              {tr.phraseSession.hardFeedback}
            </div>
          ) : (
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setHardFeedback(true);
                  blockUntilRef.current = Date.now() + 900;
                  setTimeout(() => {
                    setHardFeedback(false);
                    advanceQueue(2);
                  }, 700);
                }}
                disabled={saving}
                data-testid="hard-btn"
                className="flex-1 py-3 rounded-xl text-sm font-medium bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
              >
                {tr.phraseSession.hardBtn}
              </button>
              <button
                onClick={() => advanceQueue(5)}
                disabled={saving}
                data-testid="got-it-btn"
                className="flex-1 py-3 rounded-xl text-sm font-medium bg-emerald-600 text-white hover:bg-emerald-700 transition-colors"
              >
                {tr.phraseSession.gotItBtn}
              </button>
            </div>
          )}
        </div>
      </main>
    );
  }

  // ── Stage 1: Fill word ────────────────────────────────────────────────────────
  if (s === 1) {
    const { before, after } = buildBlankedPhrase(phrase.text, phrase.blank_word);

    // gap_retry skips MCQ — go straight to typing
    if (stage1Step === 'mcq' && current.mode !== 'gap_retry') {
      const options = mcqOptions;

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
        <main className="min-h-dvh bg-slate-50 flex flex-col items-center px-4 pt-4 pb-6 sm:py-10" data-testid="phrase-session-stage1-mcq">
          <div className="pointer-events-none fixed inset-0 flex items-start justify-center">
            <div className="w-[600px] h-[400px] bg-emerald-100/40 blur-[120px] rounded-full mt-[-100px]" />
          </div>
          <div className="relative z-10 w-full max-w-sm">
            <Header />
            <ProgressBars />

            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-6">
              <p className="text-xs text-amber-600 font-medium mb-4 uppercase tracking-wider">{tr.phraseSession.selectWordLabel}</p>
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
                <p className="text-sm text-red-600 mb-1">{tr.phraseSession.notQuite}</p>
                <p className="font-semibold text-red-700">{phrase.blank_word}</p>
                <button
                  onClick={() => {
                    blockUntilRef.current = Date.now() + 800;
                    advanceQueue(1, phrase.blank_word);
                  }}
                  disabled={saving}
                  className="mt-3 px-5 py-2 bg-red-500 text-white rounded-xl text-sm font-medium hover:bg-red-600 transition-colors"
                >
                  {tr.phraseSession.gotItNextBtn}
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
      if (!correct && current && !mistakePhraseIdsRef.current.has(current.phrase.id)) {
        mistakePhraseIdsRef.current.add(current.phrase.id);
        setMistakeCount((c) => c + 1);
      }
    };

    const handleForgotWord = () => {
      setTypeResult('wrong');
      if (current && !mistakePhraseIdsRef.current.has(current.phrase.id)) {
        mistakePhraseIdsRef.current.add(current.phrase.id);
        setMistakeCount((c) => c + 1);
      }
    };

    return (
      <main className="min-h-dvh bg-slate-50 flex flex-col items-center px-4 pt-4 pb-6 sm:py-10" data-testid="phrase-session-stage1-type">
        <div className="pointer-events-none fixed inset-0 flex items-start justify-center">
          <div className="w-[600px] h-[400px] bg-emerald-100/40 blur-[120px] rounded-full mt-[-100px]" />
        </div>
        <div className="relative z-10 w-full max-w-sm">
          <Header />
          <ProgressBars />

          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-4">
            <p className="text-xs text-amber-600 font-medium mb-4 uppercase tracking-wider">{tr.phraseSession.typeWordLabel}</p>
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
            <>
              <div className="flex gap-2">
                <input
                  ref={inputRef}
                  value={typeInput}
                  onChange={(e) => setTypeInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleWordSubmit(); }}
                  placeholder={tr.phraseSession.wordPlaceholder}
                  className="flex-1 px-4 py-4 rounded-xl border border-gray-200 text-base focus:outline-none focus:border-emerald-400"
                />
                <button
                  onClick={handleWordSubmit}
                  className="px-5 py-4 rounded-xl bg-emerald-600 text-white text-base font-medium hover:bg-emerald-700 transition-colors"
                >
                  →
                </button>
              </div>
              <button
                onClick={handleForgotWord}
                disabled={saving}
                data-testid="forgot-btn"
                className="mt-2 w-full py-2 rounded-xl text-sm text-gray-400 hover:text-gray-700 bg-gray-100 hover:bg-gray-200 transition-colors"
              >
                {tr.phraseSession.forgotBtn}
              </button>
            </>
          )}

          {typeResult === 'correct' && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-center">
              <p className="text-emerald-700 font-semibold mb-3">{tr.phraseSession.correctPhrase}</p>
              <button
                onClick={() => { blockUntilRef.current = Date.now() + 800; advanceQueue(5); }}
                disabled={saving}
                className="w-full py-4 bg-emerald-600 text-white rounded-xl text-sm font-medium hover:bg-emerald-700 transition-colors"
              >
                {tr.phraseSession.nextBtn}
              </button>
            </div>
          )}

          {typeResult === 'wrong' && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-center">
              <p className="text-sm text-red-600 mb-1">{typeInput.trim() ? tr.phraseSession.notQuite : tr.phraseSession.forgotAnswer}</p>
              <p className="font-semibold text-red-700 mb-3">{phrase.blank_word}</p>
              <button
                onClick={() => {
                  blockUntilRef.current = Date.now() + 800;
                  pendingAdvanceRef.current = () => advanceQueue(1, phrase.blank_word);
                  setSyllableChallenge({ syllable: phrase.blank_word, word: phrase.blank_word });
                  setSyllableInput(''); setSyllableResult(null);
                }}
                disabled={saving}
                className="w-full py-4 bg-red-500 text-white rounded-xl text-sm font-medium hover:bg-red-600 transition-colors"
              >
                {tr.phraseSession.gotItNextBtn}
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
    const correct = checkPhrase(typeInput.trim(), phrase.text, complexity, phrase.alt_texts);
    setTypeResult(correct ? 'correct' : 'wrong');
    if (!correct && current && !mistakePhraseIdsRef.current.has(current.phrase.id)) {
      mistakePhraseIdsRef.current.add(current.phrase.id);
      setMistakeCount((c) => c + 1);
    }
  };

  const handleForgotPhrase = () => {
    setTypeResult('wrong');
    if (current && !mistakePhraseIdsRef.current.has(current.phrase.id)) {
      mistakePhraseIdsRef.current.add(current.phrase.id);
      setMistakeCount((c) => c + 1);
    }
  };

  // ── Stage 2, sub-step 1: assemble the phrase from shuffled tiles ─────────────
  const tiles = phrase.word_tiles ?? [];

  const handleTileClick = (tileIdx: number) => {
    if (assembleResult) return;
    const next = [...assembled, tileIdx];
    setAssembled(next);
    if (next.length === tiles.length) {
      const attempt = next.map((i) => tiles[i]).join(' ');
      const correct = checkPhrase(attempt, phrase.text, 'hard', phrase.alt_texts);
      setAssembleResult(correct ? 'correct' : 'wrong');
      if (correct) {
        setTimeout(() => {
          blockUntilRef.current = Date.now() + 300;
          setAssembleResult(null);
          setStage2Step('type');
        }, 900);
      } else if (current && !mistakePhraseIdsRef.current.has(current.phrase.id)) {
        mistakePhraseIdsRef.current.add(current.phrase.id);
        setMistakeCount((c) => c + 1);
      }
    }
  };

  if (stage2Step === 'assemble' && tiles.length > 0) {
    return (
      <main className="min-h-dvh bg-slate-50 flex flex-col items-center px-4 pt-4 pb-6 sm:py-10" data-testid="phrase-session-stage2-assemble">
        <div className="pointer-events-none fixed inset-0 flex items-start justify-center">
          <div className="w-[600px] h-[400px] bg-emerald-100/40 blur-[120px] rounded-full mt-[-100px]" />
        </div>
        <div className="relative z-10 w-full max-w-sm">
          <Header />
          <ProgressBars />

          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 sm:p-8 text-center mb-4">
            <p className="text-xs text-purple-600 font-medium mb-3 uppercase tracking-wider">{tr.phraseSession.assembleLabel}</p>
            <p className="text-xl sm:text-2xl text-gray-500 mb-4">{getTranslation(phrase)}</p>
            <div className="min-h-[3.5rem] border-t border-gray-100 pt-3 flex flex-wrap gap-2 justify-center" data-testid="assembled-row">
              {assembled.map((tileIdx, pos) => (
                <button
                  key={pos}
                  onClick={() => { if (!assembleResult) setAssembled((a) => a.filter((_, j) => j !== pos)); }}
                  className="py-2 px-3 rounded-xl text-sm font-medium bg-emerald-50 border border-emerald-300 text-emerald-800 hover:bg-emerald-100 transition-colors"
                >
                  {tiles[tileIdx]}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap gap-2 justify-center" data-testid="tile-pool">
            {tiles.map((w, i) => {
              const used = assembled.includes(i);
              return (
                <button
                  key={i}
                  onClick={() => handleTileClick(i)}
                  disabled={used || !!assembleResult}
                  className={`py-2 px-3 rounded-xl text-sm font-medium border transition-colors ${
                    used
                      ? 'bg-gray-50 border-gray-100 text-gray-300'
                      : 'bg-white border-gray-200 text-gray-700 hover:border-emerald-400 hover:text-emerald-700 cursor-pointer'
                  }`}
                >
                  {w}
                </button>
              );
            })}
          </div>

          {assembleResult === 'correct' && (
            <div className="mt-4 bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-center">
              <p className="text-emerald-700 font-semibold">{tr.phraseSession.correctNowWrite}</p>
            </div>
          )}

          {assembleResult === 'wrong' && (
            <div className="mt-4 bg-red-50 border border-red-200 rounded-xl p-4 text-center">
              <p className="text-sm text-red-600 mb-1">{tr.phraseSession.notQuite}</p>
              <p className="font-semibold text-red-700 mb-3">{phrase.text}</p>
              <button
                onClick={() => {
                  blockUntilRef.current = Date.now() + 800;
                  advanceQueue(1, firstMisplacedWord(assembled.map((i) => tiles[i]), phrase.text));
                }}
                disabled={saving}
                className="w-full py-3 bg-red-500 text-white rounded-xl text-sm font-medium hover:bg-red-600 transition-colors"
              >
                {tr.phraseSession.gotItNextBtn}
              </button>
            </div>
          )}
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-dvh bg-slate-50 flex flex-col items-center px-4 pt-4 pb-6 sm:py-10" data-testid="phrase-session-stage2">
      <div className="pointer-events-none fixed inset-0 flex items-start justify-center">
        <div className="w-[600px] h-[400px] bg-emerald-100/40 blur-[120px] rounded-full mt-[-100px]" />
      </div>
      <div className="relative z-10 w-full max-w-sm">
        <Header />
        <ProgressBars />

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 sm:p-8 text-center mb-4">
          <p className="text-xs text-purple-600 font-medium mb-3 uppercase tracking-wider">{tr.phraseSession.typePhraseLabel}</p>
          <p className="text-xl sm:text-2xl text-gray-500 mb-2">{getTranslation(phrase)}</p>
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
              placeholder={tr.phraseSession.phrasePlaceholder}
              rows={3}
              className="w-full px-4 py-3 rounded-xl border border-gray-200 text-base focus:outline-none focus:border-emerald-400 resize-none mb-3"
            />
            <div className="flex gap-2">
              <button
                onClick={() => setShowAnswer((s) => !s)}
                className="flex-1 py-4 rounded-xl text-sm text-gray-400 hover:text-gray-700 bg-gray-100 hover:bg-gray-200 transition-colors"
              >
                {showAnswer ? tr.phraseSession.hideAnswer : tr.phraseSession.showAnswer}
              </button>
              <button
                onClick={handlePhraseSubmit}
                className="flex-1 py-4 rounded-xl bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 transition-colors"
              >
                {tr.phraseSession.checkPhraseBtn}
              </button>
            </div>
            <button
              onClick={handleForgotPhrase}
              disabled={saving}
              data-testid="forgot-btn"
              className="mt-2 w-full py-2 rounded-xl text-sm text-gray-400 hover:text-gray-700 bg-gray-100 hover:bg-gray-200 transition-colors"
            >
              {tr.phraseSession.forgotBtn}
            </button>
          </>
        )}

        {typeResult === 'correct' && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-center">
            <p className="text-emerald-700 font-semibold mb-1">{tr.phraseSession.correctPhrase}</p>
            <p className="text-sm text-gray-500 mb-3">{phrase.text}</p>
            <button
              onClick={() => { blockUntilRef.current = Date.now() + 800; advanceQueue(5); }}
              disabled={saving}
              className="w-full py-4 bg-emerald-600 text-white rounded-xl text-sm font-medium hover:bg-emerald-700 transition-colors"
            >
              {tr.phraseSession.nextBtn}
            </button>
          </div>
        )}

        {typeResult === 'wrong' && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-center">
            <div className="mb-3">
              {typeInput.trim() ? (
                <CharDiff
                  typed={typeInput}
                  target={phrase.text}
                  labelTyped={tr.common.youTyped}
                  labelCorrect={tr.common.correctAnswer}
                />
              ) : (
                <>
                  <p className="text-sm text-red-600 mb-1">{tr.phraseSession.forgotAnswer}</p>
                  <p className="font-semibold text-red-700">{phrase.text}</p>
                </>
              )}
            </div>
            <button
              onClick={() => {
                blockUntilRef.current = Date.now() + 800;
                // Forgot (no attempt typed): no specific mistake word to drill — just re-queue
                if (!typeInput.trim()) { advanceQueue(1); return; }
                const { word: mw } = findMistakeWordSyllable(typeInput, phrase.text);
                pendingAdvanceRef.current = () => advanceQueue(1);
                setSyllableChallenge({ syllable: mw, word: mw });
                setSyllableInput(''); setSyllableResult(null);
              }}
              disabled={saving}
              className="w-full py-4 bg-red-500 text-white rounded-xl text-sm font-medium hover:bg-red-600 transition-colors"
            >
              {tr.phraseSession.gotItNextBtn}
            </button>
          </div>
        )}
      </div>
    </main>
  );
}

// ── Syllable challenge overlay — rendered by caller if syllableChallenge is set
