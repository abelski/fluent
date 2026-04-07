'use client';

import { Suspense, useEffect, useState, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { BACKEND_URL, getToken } from '../../../lib/api';
import { useT } from '../../../lib/useT';
import type { Lang } from '../../../lib/useLang';

interface Word {
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
}

type AnswerState = 'unanswered' | 'correct' | 'wrong';

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
    .replace(/ž/g, 'z').replace(/ū/g, 'u').replace(/ę/g, 'e')
    .replace(/ė/g, 'e').replace(/ą/g, 'a');
}

function parseForms(lithuanian: string): string[] {
  const parts = lithuanian.split(/[,/]/).map((s) => s.trim()).filter(Boolean);
  return parts.length > 1 ? parts : [lithuanian.trim()];
}

function trans(word: Word, lang: Lang): string {
  return lang === 'en' ? word.translation_en : word.translation_ru;
}

function pickDistractors(word: Word, allWords: Word[], lang: Lang): string[] {
  const pool = allWords.filter((w) => w.id !== word.id);
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, 3).map((w) => trans(w, lang));
}

function buildOptions(word: Word, allWords: Word[], lang: Lang): { text: string; correct: boolean }[] {
  const distractors = pickDistractors(word, allWords, lang);
  return [
    { text: trans(word, lang), correct: true },
    ...distractors.map((d) => ({ text: d, correct: false })),
  ].sort(() => Math.random() - 0.5);
}

function ReviewContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const mode = searchParams.get('mode') === 'mistakes' ? 'mistakes' : 'known';

  const { tr, lang } = useT();
  const [allWords, setAllWords] = useState<Word[]>([]);
  const [queue, setQueue] = useState<StudyCard[]>([]);
  const [totalWords, setTotalWords] = useState(0);
  const [wordsDone, setWordsDone] = useState(0);
  const [correctWords, setCorrectWords] = useState(0);
  const [done, setDone] = useState(false);
  const [limitReached, setLimitReached] = useState(false);
  const [loading, setLoading] = useState(true);
  const [empty, setEmpty] = useState(false);

  const [answerState, setAnswerState] = useState<AnswerState>('unanswered');
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [options, setOptions] = useState<{ text: string; correct: boolean }[]>([]);
  const [typedAnswer, setTypedAnswer] = useState('');
  const [shownAnswer, setShownAnswer] = useState('');
  const [blankIndex, setBlankIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const blockUntilRef = useRef(0);

  // initialQualityRef maps wordId → quality chosen at Stage 1 (1=didn't know, 3=hard, 5=easy)
  const initialQualityRef = useRef<Record<number, number>>({});

  const saveProgress = useCallback((wordId: number, status: 'known' | 'learning', mistake = false, clearMistake = false, quality?: number) => {
    const token = getToken();
    if (!token) return;
    fetch(`${BACKEND_URL}/api/words/${wordId}/progress`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ status, mistake, clear_mistake: clearMistake, ...(quality !== undefined ? { quality } : {}) }),
    }).catch((err) => console.error('API error:', err));
  }, []);

  const loadWords = useCallback(() => {
    setLoading(true);
    setEmpty(false);
    const token = getToken();
    const endpoint = mode === 'mistakes' ? '/api/review/mistakes' : '/api/review/known';
    fetch(`${BACKEND_URL}${endpoint}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((r) => {
        if (r.status === 429) { setLimitReached(true); setLoading(false); return null; }
        return r.json();
      })
      .then((data: Word[] | null) => {
        if (!data) return;
        const words = Array.isArray(data) ? data : [];
        if (words.length === 0) { setEmpty(true); setLoading(false); return; }
        setAllWords(words);
        setQueue(words.map((w) => ({ word: w, stage: 1 })));
        setTotalWords(words.length);
        setWordsDone(0);
        setCorrectWords(0);
        setDone(false);
        setAnswerState('unanswered');
        setSelectedOption(null);
        setTypedAnswer('');
        setShownAnswer('');
      })
      .finally(() => setLoading(false));
  }, [mode]);

  useEffect(() => {
    if (!getToken()) { router.replace('/login'); return; }
    loadWords();
  }, [loadWords, router]);

  useEffect(() => {
    if (queue.length > 0 && queue[0].stage === 2) {
      setOptions(buildOptions(queue[0].word, allWords, lang));
    }
    if (queue.length > 0 && queue[0].stage === 3) {
      const forms = parseForms(queue[0].word.lithuanian);
      setBlankIndex(Math.floor(Math.random() * forms.length));
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [queue, allWords, lang]);

  function advance(card: StudyCard, correct: boolean, targetStage?: 2 | 3) {
    setQueue((prev) => {
      const rest = prev.slice(1);
      if (correct && card.stage < 3) {
        const next = targetStage ?? ((card.stage + 1) as 2 | 3);
        return [...rest, { word: card.word, stage: next }];
      }
      return rest;
    });
  }

  function handleStage1Quality(quality: 1 | 3 | 5) {
    if (Date.now() < blockUntilRef.current) return;
    const card = queue[0];
    initialQualityRef.current[card.word.id] = quality;

    if (quality === 1) {
      // Didn't know — record as learning, apply SM-2 quality=1, skip remaining stages
      setWordsDone((c) => c + 1);
      saveProgress(card.word.id, 'learning', true, false, 1);
      blockUntilRef.current = Date.now() + 200;
      advance(card, false);
    } else if (quality === 5) {
      // Easy — skip straight to Stage 3
      blockUntilRef.current = Date.now() + 200;
      advance(card, true, 3);
    } else {
      // Hard — normal flow through Stage 2
      blockUntilRef.current = Date.now() + 200;
      advance(card, true, 2);
    }
  }

  function handleStage2Select(index: number) {
    if (answerState !== 'unanswered') return;
    const card = queue[0];
    const isCorrect = options[index].correct;
    setSelectedOption(index);
    setAnswerState(isCorrect ? 'correct' : 'wrong');
    if (!isCorrect) {
      // Failed multiple choice — quality=1 regardless of initial choice
      saveProgress(card.word.id, 'learning', true, false, 1);
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
    setWordsDone((c) => c + 1);
    setAnswerState('unanswered');
    setSelectedOption(null);
    blockUntilRef.current = Date.now() + 200;
    advance(card, false);
  }

  function handleStage3Submit() {
    if (answerState !== 'unanswered') return;
    const card = queue[0];
    const forms = parseForms(card.word.lithuanian);
    const target = forms[blankIndex] ?? forms[0];
    const isCorrect = normalizeLt(typedAnswer.trim()) === normalizeLt(target);
    setAnswerState(isCorrect ? 'correct' : 'wrong');
    if (!isCorrect) setShownAnswer(target);
    const initQ = initialQualityRef.current[card.word.id] ?? 3;
    if (isCorrect) {
      // Easy+correct=5, Hard+correct=3 (initial quality preserved)
      const finalQuality = initQ;
      saveProgress(card.word.id, 'known', false, mode === 'mistakes', finalQuality);
      setTimeout(() => {
        setWordsDone((c) => c + 1);
        setCorrectWords((c) => c + 1);
        setAnswerState('unanswered');
        setTypedAnswer('');
        setShownAnswer('');
        blockUntilRef.current = Date.now() + 200;
        advance(card, true);
      }, 1200);
    } else {
      // Easy+wrong=3, Hard+wrong=2
      const finalQuality = initQ === 5 ? 3 : 2;
      saveProgress(card.word.id, 'learning', true, false, finalQuality);
    }
  }

  function handleStage3Dismiss() {
    const card = queue[0];
    setWordsDone((c) => c + 1);
    setAnswerState('unanswered');
    setTypedAnswer('');
    setShownAnswer('');
    blockUntilRef.current = Date.now() + 200;
    advance(card, false);
  }

  useEffect(() => {
    if (!loading && totalWords > 0 && queue.length === 0) {
      setDone(true);
      // Bust Next.js router cache so vocabulary/stats pages refetch on next visit
      router.refresh();
    }
  }, [queue, loading, totalWords, router]);

  // Enter / Space dismisses the "wrong answer" screen on stages 2 and 3
  useEffect(() => {
    if (answerState !== 'wrong' || queue.length === 0) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        if (queue[0].stage === 2) handleStage2Dismiss();
        else handleStage3Dismiss();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [answerState, queue]);

  const modeLabel = mode === 'mistakes' ? tr.review.mistakesLabel : tr.review.knownLabel;

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (limitReached) {
    return (
      <main className="min-h-screen bg-slate-50 text-gray-900 flex flex-col items-center justify-center px-6">
        <div className="pointer-events-none fixed inset-0 flex items-start justify-center">
          <div className="w-[600px] h-[400px] bg-emerald-100/40 blur-[120px] rounded-full mt-[-100px]" />
        </div>
        <div className="relative z-10 text-center max-w-sm w-full">
          <div className="text-5xl mb-6">⏳</div>
          <h2 className="text-2xl font-bold mb-2">{tr.common.limitTitle}</h2>
          <p className="text-gray-400 mb-8">{tr.common.limitBody}</p>
          <div className="flex flex-col gap-3">
            <Link href="/pricing" className="w-full py-3 bg-gray-900 hover:bg-gray-800 rounded-xl font-medium text-white transition-colors text-center">
              {tr.common.getPremium}
            </Link>
            <button
              onClick={() => router.push('/dashboard/lists')}
              className="w-full py-3 text-gray-400 hover:text-gray-900 text-sm transition-colors text-center"
            >
              {tr.common.backToLists}
            </button>
          </div>
        </div>
      </main>
    );
  }

  if (empty) {
    return (
      <main className="min-h-screen bg-slate-50 text-gray-900 flex flex-col items-center justify-center px-6">
        <div className="pointer-events-none fixed inset-0 flex items-start justify-center">
          <div className="w-[600px] h-[400px] bg-emerald-100/40 blur-[120px] rounded-full mt-[-100px]" />
        </div>
        <div className="relative z-10 text-center max-w-sm w-full">
          <div className="text-5xl mb-6">📭</div>
          <h2 className="text-2xl font-bold mb-2">{tr.review.nothingTitle}</h2>
          <p className="text-gray-400 mb-8">{tr.review.nothingBody.many.replace('{mode}', modeLabel)}</p>
          <Link href="/dashboard/lists" className="w-full block py-3 bg-gray-900 hover:bg-gray-800 rounded-xl font-medium text-white transition-colors text-center">
            {tr.common.backToLists}
          </Link>
        </div>
      </main>
    );
  }

  if (done) {
    return (
      <main className="min-h-screen bg-slate-50 text-gray-900 flex flex-col items-center justify-center px-6">
        <div className="pointer-events-none fixed inset-0 flex items-start justify-center">
          <div className="w-[600px] h-[400px] bg-emerald-100/40 blur-[120px] rounded-full mt-[-100px]" />
        </div>
        <div className="relative z-10 text-center max-w-sm w-full">
          <div className="text-5xl mb-6">🎉</div>
          <h2 className="text-2xl font-bold mb-2">{tr.common.sessionDone}</h2>
          <p className="text-gray-400 mb-8">{tr.common.correctOf.replace('{correct}', String(correctWords)).replace('{total}', String(totalWords))}</p>

          <div className="flex gap-4 justify-center mb-10">
            <div className="bg-white border border-gray-900 rounded-2xl px-6 sm:px-8 py-5 text-center">
              <div className="text-2xl sm:text-3xl font-bold text-emerald-600">{correctWords}</div>
              <div className="text-gray-400 text-sm mt-1">{tr.common.correctLabel}</div>
            </div>
            <div className="bg-white border border-gray-900 rounded-2xl px-6 sm:px-8 py-5 text-center">
              <div className="text-2xl sm:text-3xl font-bold text-amber-600">{totalWords - correctWords}</div>
              <div className="text-gray-400 text-sm mt-1">{tr.common.errorsLabel}</div>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <button
              onClick={loadWords}
              className="w-full py-3 bg-gray-900 hover:bg-gray-800 rounded-xl font-medium text-white transition-colors"
            >
              {tr.common.repeatMore}
            </button>
            <button
              onClick={() => router.push('/dashboard/lists')}
              className="w-full py-3 text-gray-400 hover:text-gray-900 text-sm transition-colors text-center"
            >
              {tr.common.backToLists}
            </button>
          </div>
        </div>
      </main>
    );
  }

  if (queue.length === 0) return null;

  const card = queue[0];
  const word = card.word;
  const stage = card.stage;
  const progressPct = totalWords > 0 ? (wordsDone / totalWords) * 100 : 0;
  const stageLabel = tr.study.stages[stage];
  const cloveForms = parseForms(word.lithuanian);
  const cloveIsCloze = cloveForms.length > 1;
  const cloveText = cloveForms.map((f, i) => i === blankIndex ? '______' : f).join(' / ');
  const digit = getDigit(word);
  const titleLabel = mode === 'mistakes' ? tr.review.mistakesMode : tr.review.knownMode;

  return (
    <main className="min-h-screen bg-slate-50 text-gray-900 flex flex-col px-6 py-8">
      <div className="pointer-events-none fixed inset-0 flex items-start justify-center overflow-hidden">
        <div className="w-full max-w-[600px] h-[400px] bg-emerald-100/40 blur-[120px] rounded-full mt-[-100px]" />
      </div>

      <div className="relative z-10 max-w-lg w-full mx-auto flex flex-col">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <Link href="/dashboard/lists" className="text-gray-400 hover:text-gray-900 text-sm transition-colors">
            {tr.common.backToLists}
          </Link>
          <div className="flex items-center gap-3">
            <span className="text-gray-300 text-xs uppercase tracking-wider">{titleLabel} · {stageLabel}</span>
            <span className="text-gray-400 text-sm">{wordsDone} / {totalWords}</span>
          </div>
        </div>

        {/* Progress bar */}
        <div className="w-full h-1 bg-gray-100 rounded-full mb-6">
          <div
            className="h-1 bg-emerald-500 rounded-full transition-all duration-300"
            style={{ width: `${progressPct}%` }}
          />
        </div>

        {/* Stage 1: Flashcard + quality self-assessment */}
        {stage === 1 && (
          <div className="flex flex-col items-center gap-8">
            <div className="w-full bg-white border border-gray-900 rounded-2xl p-5 sm:p-10 text-center">
              <p className="text-gray-400 text-xs uppercase tracking-wider mb-6">{tr.common.review}</p>
              <p className="text-3xl sm:text-5xl font-bold tracking-tight mb-4">{word.lithuanian}</p>
              {digit && <p className="text-5xl sm:text-7xl font-bold text-emerald-600 mb-4">{digit}</p>}
              {word.hint && !digit && <p className="text-gray-300 text-xs uppercase tracking-wider mb-4">{word.hint}</p>}
              <div className="h-px bg-gray-100 mb-4" />
              <p className="text-xl text-gray-500">{trans(word, lang)}</p>
            </div>
            <div className="w-full grid grid-cols-3 gap-3">
              <button
                onClick={() => handleStage1Quality(1)}
                tabIndex={-1}
                className="py-4 bg-red-50 hover:bg-red-100 border border-red-200 rounded-xl font-medium text-red-600 transition-colors"
              >
                {tr.study.didntKnow}
              </button>
              <button
                onClick={() => handleStage1Quality(3)}
                tabIndex={-1}
                className="py-4 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-xl font-medium text-amber-600 transition-colors"
              >
                {tr.study.hard}
              </button>
              <button
                onClick={() => handleStage1Quality(5)}
                tabIndex={-1}
                className="py-4 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-xl font-medium text-emerald-600 transition-colors"
              >
                {tr.study.easy}
              </button>
            </div>
          </div>
        )}

        {/* Stage 2: Multiple choice */}
        {stage === 2 && (
          <div className="flex flex-col items-center gap-8">
            <div className="text-center">
              <p className="text-gray-400 text-sm mb-3 uppercase tracking-wider">{tr.study.whatMeans}</p>
              <p className="text-2xl sm:text-4xl font-bold tracking-tight">{word.lithuanian}</p>
              {digit && <p className="text-4xl sm:text-6xl font-bold text-emerald-600 mt-2">{digit}</p>}
              {word.hint && !digit && <p className="text-gray-300 text-xs uppercase tracking-wider mt-2">{word.hint}</p>}
            </div>

            <div className="w-full grid grid-cols-1 gap-3">
              {options.map((opt, i) => {
                let cls = 'w-full py-4 px-5 rounded-xl font-medium text-left transition-all duration-200 border ';
                if (answerState === 'unanswered') {
                  cls += 'bg-white border-gray-900 hover:bg-gray-100 text-gray-900';
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
                <button
                  onClick={handleStage2Dismiss}
                  className="w-full py-4 bg-gray-100 hover:bg-gray-200 rounded-xl font-medium transition-colors"
                >
                  {tr.common.dismiss}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Stage 3: Type it */}
        {stage === 3 && (
          <div className="flex flex-col items-center gap-8">
            <div className="text-center">
              <p className="text-gray-400 text-sm mb-3 uppercase tracking-wider">
                {cloveIsCloze ? tr.study.fillMissing : tr.study.howInLithuanian}
              </p>
              {cloveIsCloze ? (
                <p className="text-xl sm:text-3xl font-bold tracking-tight font-mono">{cloveText}</p>
              ) : (
                <>
                  <p className="text-2xl sm:text-4xl font-bold tracking-tight">{trans(word, lang)}</p>
                  {digit && <p className="text-4xl sm:text-6xl font-bold text-emerald-600 mt-2">{digit}</p>}
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
                onChange={(e) => setTypedAnswer(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleStage3Submit(); }}
                disabled={answerState !== 'unanswered'}
                placeholder={tr.study.typePlaceholder}
                className={`w-full py-4 px-5 rounded-xl border bg-white text-base text-gray-900 placeholder-gray-400 outline-none transition-all duration-200
                  ${answerState === 'correct' ? 'border-gray-900 bg-emerald-50' :
                    answerState === 'wrong' ? 'border-gray-900 bg-red-50' :
                    'border-gray-900 focus:border-gray-900'}`}
              />

              {answerState === 'unanswered' && (
                <button onClick={handleStage3Submit} className="w-full py-4 bg-gray-900 hover:bg-gray-800 rounded-xl font-medium text-white transition-colors">
                  {tr.common.check}
                </button>
              )}
              {answerState === 'correct' && (
                <p className="text-emerald-600 text-sm font-medium text-center animate-in fade-in duration-150">{tr.common.correct}</p>
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
                    onClick={handleStage3Dismiss}
                    className="w-full py-4 bg-gray-100 hover:bg-gray-200 rounded-xl font-medium transition-colors"
                  >
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

export default function ReviewPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <ReviewContent />
    </Suspense>
  );
}
