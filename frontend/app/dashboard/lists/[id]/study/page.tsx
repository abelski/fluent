'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { BACKEND_URL, getToken, resolveListId } from '../../../../../lib/api';
import { useLang, type Lang } from '../../../../../lib/useLang';

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

// Maps English number word → digit string so we can display "11" alongside "vienuolika".
// Number words are identified by hint === 'skaitvardis'.
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
    .replace(/į/g, 'i')
    .replace(/č/g, 'c')
    .replace(/š/g, 's')
    .replace(/ž/g, 'z')
    .replace(/ū/g, 'u')
    .replace(/ę/g, 'e')
    .replace(/ė/g, 'e')
    .replace(/ą/g, 'a');
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

export default function QuizPage() {
  const { id: _id } = useParams<{ id: string }>();
  const id = resolveListId(_id);
  const router = useRouter();

  const [lang] = useLang();
  const [allWords, setAllWords] = useState<Word[]>([]);
  const [queue, setQueue] = useState<StudyCard[]>([]);
  const [totalWords, setTotalWords] = useState(0);
  const [wordsDone, setWordsDone] = useState(0);   // words that exited the queue
  const [correctWords, setCorrectWords] = useState(0); // words correctly finished at stage 3
  const [done, setDone] = useState(false);
  const [limitReached, setLimitReached] = useState(false);
  const [loading, setLoading] = useState(true);

  // Per-card UI state
  const [answerState, setAnswerState] = useState<AnswerState>('unanswered');
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [options, setOptions] = useState<{ text: string; correct: boolean }[]>([]);
  const [typedAnswer, setTypedAnswer] = useState('');
  const [shownAnswer, setShownAnswer] = useState('');
  const [blankIndex, setBlankIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Prevents rapid Enter-key presses from auto-firing the stage-1 button
  // after a card transition (e.g. user hammers Enter on stage-3 input).
  const blockUntilRef = useRef(0);

  const saveProgress = useCallback((wordId: number, status: 'known' | 'learning') => {
    const token = getToken();
    if (!token) return;
    fetch(`${BACKEND_URL}/api/words/${wordId}/progress`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ status }),
    }).catch(() => {});
  }, []);

  const loadWords = useCallback(() => {
    setLoading(true);
    const token = getToken();
    fetch(`${BACKEND_URL}/api/lists/${id}/study`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((r) => {
        if (r.status === 429) {
          setLimitReached(true);
          setLoading(false);
          return null;
        }
        return r.json();
      })
      .then((data: Word[] | null) => {
        if (!data) return;
        const words = Array.isArray(data) ? data : [];
        setAllWords(words);

        // Always start every word at stage 1 (flashcard read) regardless of status.
        const initialQueue: StudyCard[] = words.map((w) => ({
          word: w,
          stage: 1,
        }));

        setQueue(initialQueue);
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
  }, [id]);

  useEffect(() => {
    if (!getToken()) {
      router.replace('/login');
      return;
    }
    loadWords();
  }, [loadWords, router]);

  // Recompute options whenever the front card changes (stage 2 only)
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

  function advance(card: StudyCard, correct: boolean) {
    setQueue((prev) => {
      const rest = prev.slice(1);
      if (correct && card.stage < 3) {
        // Advance to next stage, push to end of queue
        return [...rest, { word: card.word, stage: (card.stage + 1) as 2 | 3 }];
      }
      // Stage 3 correct → word fully done.
      // Wrong at any stage → word removed without retry (already saved as 'learning').
      return rest;
    });
  }

  function handleStage1Confirm() {
    if (Date.now() < blockUntilRef.current) return; // block rapid-fire after transitions
    const card = queue[0];
    advance(card, true);
  }

  function handleStage2Select(index: number) {
    if (answerState !== 'unanswered') return;
    const card = queue[0];
    const isCorrect = options[index].correct;
    setSelectedOption(index);
    setAnswerState(isCorrect ? 'correct' : 'wrong');
    saveProgress(card.word.id, isCorrect ? 'known' : 'learning');

    if (isCorrect) {
      // Correct: auto-advance after short delay
      setTimeout(() => {
        setAnswerState('unanswered');
        setSelectedOption(null);
        blockUntilRef.current = Date.now() + 200;
        advance(card, true);
      }, 1200);
    }
    // Wrong: stay on screen until user clicks "Понятно, дальше"
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
    saveProgress(card.word.id, isCorrect ? 'known' : 'learning');

    if (isCorrect) {
      // Correct: auto-advance after short delay
      setTimeout(() => {
        setWordsDone((c) => c + 1);
        setCorrectWords((c) => c + 1);
        setAnswerState('unanswered');
        setTypedAnswer('');
        setShownAnswer('');
        blockUntilRef.current = Date.now() + 200;
        advance(card, true);
      }, 1200);
    }
    // Wrong: stay on screen until user clicks "Понятно, дальше"
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

  // Check if session is done after queue empties
  useEffect(() => {
    if (!loading && totalWords > 0 && queue.length === 0) {
      setDone(true);
    }
  }, [queue, loading, totalWords]);

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
          <h1 className="text-2xl font-bold mb-2">Лимит на сегодня исчерпан</h1>
          <p className="text-gray-400 mb-8">Вы использовали все 10 бесплатных сессий на сегодня. Возвращайтесь завтра или переходите на Premium.</p>
          <div className="flex flex-col gap-3">
            <Link href="/pricing" className="w-full py-3 bg-gray-900 hover:bg-gray-800 rounded-xl font-medium text-white transition-colors text-center">
              Получить Premium
            </Link>
            <button
              onClick={() => { window.location.href = '/dashboard/lists'; }}
              className="w-full py-3 text-gray-400 hover:text-gray-900 text-sm transition-colors text-center"
            >
              ← На главную
            </button>
          </div>
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
          <h1 className="text-2xl font-bold mb-2">Сессия завершена!</h1>
          <p className="text-gray-400 mb-8">Верно {correctWords} из {totalWords}</p>

          <div className="flex gap-4 justify-center mb-10">
            <div className="bg-white border border-gray-900 rounded-2xl px-6 sm:px-8 py-5 text-center">
              <div className="text-2xl sm:text-3xl font-bold text-emerald-600">{correctWords}</div>
              <div className="text-gray-400 text-sm mt-1">Верно</div>
            </div>
            <div className="bg-white border border-gray-900 rounded-2xl px-6 sm:px-8 py-5 text-center">
              <div className="text-2xl sm:text-3xl font-bold text-amber-600">{totalWords - correctWords}</div>
              <div className="text-gray-400 text-sm mt-1">Ошибок</div>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <button
              onClick={loadWords}
              className="w-full py-3 bg-gray-900 hover:bg-gray-800 rounded-xl font-medium text-white transition-colors"
            >
              Повторить
            </button>
            <button
              onClick={() => { window.location.href = '/dashboard/lists'; }}
              className="w-full py-3 text-gray-400 hover:text-gray-900 text-sm transition-colors text-center"
            >
              ← На главную
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

  const stageLabel = ['', 'Читаю', 'Выбор', 'Пишу'][stage];

  const cloveForms = parseForms(word.lithuanian);
  const cloveIsCloze = cloveForms.length > 1;
  const cloveText = cloveForms.map((f, i) => i === blankIndex ? '______' : f).join(' / ');
  const digit = getDigit(word);

  return (
    <main className="min-h-screen bg-slate-50 text-gray-900 flex flex-col px-6 py-8">
      <div className="pointer-events-none fixed inset-0 flex items-start justify-center overflow-hidden">
        <div className="w-full max-w-[600px] h-[400px] bg-emerald-100/40 blur-[120px] rounded-full mt-[-100px]" />
      </div>

      <div className="relative z-10 max-w-lg w-full mx-auto flex flex-col flex-1">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <Link
            href="/dashboard/lists"
            className="text-gray-400 hover:text-gray-900 text-sm transition-colors"
          >
            ← На главную
          </Link>
          <div className="flex items-center gap-3">
            <span className="text-gray-300 text-xs uppercase tracking-wider">{stageLabel}</span>
            <span className="text-gray-400 text-sm">
              {wordsDone} / {totalWords}
            </span>
          </div>
        </div>

        {/* Progress bar */}
        <div className="w-full h-1 bg-gray-100 rounded-full mb-10">
          <div
            className="h-1 bg-emerald-500 rounded-full transition-all duration-300"
            style={{ width: `${progressPct}%` }}
          />
        </div>

        {/* ── Stage 1: Flashcard ── */}
        {stage === 1 && (
          <div className="flex flex-col items-center justify-center flex-1 gap-8">
            <div className="w-full bg-white border border-gray-900 rounded-2xl p-5 sm:p-10 text-center">
              <p className="text-gray-400 text-xs uppercase tracking-wider mb-6">Новое слово</p>
              <p className="text-3xl sm:text-5xl font-bold tracking-tight mb-4">{word.lithuanian}</p>
              {digit && (
                <p className="text-5xl sm:text-7xl font-bold text-emerald-600 mb-4" data-testid="number-digit">{digit}</p>
              )}
              {word.hint && !digit && (
                <p className="text-gray-300 text-xs uppercase tracking-wider mb-4">{word.hint}</p>
              )}
              <div className="h-px bg-gray-100 mb-4" />
              <p className="text-xl text-gray-500">{trans(word, lang)}</p>
            </div>
            <button
              onClick={handleStage1Confirm}
              tabIndex={-1}
              className="w-full py-4 bg-gray-900 hover:bg-gray-800 rounded-xl font-medium text-white transition-colors text-lg"
            >
              Понял →
            </button>
          </div>
        )}

        {/* ── Stage 2: Multiple choice ── */}
        {stage === 2 && (
          <div className="flex flex-col items-center justify-center flex-1 gap-8">
            <div className="text-center">
              <p className="text-gray-400 text-sm mb-3 uppercase tracking-wider">Что это означает?</p>
              <p className="text-2xl sm:text-4xl font-bold tracking-tight">{word.lithuanian}</p>
              {digit && (
                <p className="text-4xl sm:text-6xl font-bold text-emerald-600 mt-2" data-testid="number-digit">{digit}</p>
              )}
              {word.hint && !digit && (
                <p className="text-gray-300 text-xs uppercase tracking-wider mt-2">{word.hint}</p>
              )}
            </div>

            <div className="w-full grid grid-cols-1 gap-3">
              {options.map((opt, i) => {
                let cls =
                  'w-full py-4 px-5 rounded-xl font-medium text-left transition-all duration-200 border ';
                if (answerState === 'unanswered') {
                  cls += 'bg-white border-gray-900 hover:bg-gray-100 hover:border-gray-900 text-gray-900';
                } else if (opt.correct) {
                  cls += 'bg-emerald-100 border-gray-900 text-emerald-600';
                } else if (i === selectedOption) {
                  cls += 'bg-red-100 border-gray-900 text-red-600';
                } else {
                  cls += 'bg-gray-50 border-gray-900 text-gray-400';
                }
                return (
                  <button key={i} onClick={() => handleStage2Select(i)} className={cls}>
                    {opt.text}
                  </button>
                );
              })}
            </div>

            {answerState === 'correct' && (
              <p className="text-emerald-600 text-sm font-medium animate-in fade-in duration-150">Правильно!</p>
            )}

            {answerState === 'wrong' && (
              <div className="w-full flex flex-col gap-3 animate-in fade-in duration-150">
                <div className="text-center">
                  <p className="text-red-600 text-sm font-medium">Не совсем</p>
                  <p className="text-gray-500 text-sm mt-1">
                    Правильно: <span className="text-gray-900 font-medium">
                      {options.find((o) => o.correct)?.text}
                    </span>
                  </p>
                </div>
                <button
                  data-testid="dismiss-wrong"
                  onClick={handleStage2Dismiss}
                  className="w-full py-4 bg-gray-100 hover:bg-gray-100 rounded-xl font-medium transition-colors"
                >
                  Понятно, дальше →
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── Stage 3: Type it ── */}
        {stage === 3 && (
          <div className="flex flex-col items-center justify-center flex-1 gap-8">
            <div className="text-center">
              <p className="text-gray-400 text-sm mb-3 uppercase tracking-wider">
                {cloveIsCloze ? 'Вставьте пропущенную форму' : 'Как будет по-литовски?'}
              </p>
              {cloveIsCloze ? (
                <p className="text-xl sm:text-3xl font-bold tracking-tight font-mono">{cloveText}</p>
              ) : (
                <>
                  <p className="text-2xl sm:text-4xl font-bold tracking-tight">{trans(word, lang)}</p>
                  {digit && (
                    <p className="text-4xl sm:text-6xl font-bold text-emerald-600 mt-2" data-testid="number-digit">{digit}</p>
                  )}
                </>
              )}
              {word.hint && !digit && (
                <p className="text-gray-300 text-xs uppercase tracking-wider mt-2">{word.hint}</p>
              )}
              {cloveIsCloze && (
                <p className="text-gray-400 text-sm mt-3">{trans(word, lang)}</p>
              )}
            </div>

            <div className="w-full flex flex-col gap-3">
              <input
                ref={inputRef}
                type="text"
                value={typedAnswer}
                onChange={(e) => setTypedAnswer(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleStage3Submit();
                }}
                disabled={answerState !== 'unanswered'}
                placeholder="Напишите пропущенное слово..."
                className={`w-full py-4 px-5 rounded-xl border bg-white text-base text-gray-900 placeholder-gray-400 outline-none transition-all duration-200
                  ${answerState === 'correct' ? 'border-gray-900 bg-emerald-50' :
                    answerState === 'wrong' ? 'border-gray-900 bg-red-50' :
                    'border-gray-900 focus:border-gray-900'}`}
              />

              {answerState === 'unanswered' && (
                <button
                  onClick={handleStage3Submit}
                  className="w-full py-4 bg-gray-900 hover:bg-gray-800 rounded-xl font-medium text-white transition-colors"
                >
                  Проверить
                </button>
              )}

              {answerState === 'correct' && (
                <p className="text-emerald-600 text-sm font-medium text-center animate-in fade-in duration-150">
                  Правильно!
                </p>
              )}

              {answerState === 'wrong' && (
                <div className="flex flex-col gap-3 animate-in fade-in duration-150">
                  <div className="text-center">
                    <p className="text-red-600 text-sm font-medium">Не совсем</p>
                    <p className="text-gray-500 text-sm mt-1">
                      Правильно: <span className="text-gray-900 font-medium">{shownAnswer}</span>
                    </p>
                  </div>
                  <button
                    data-testid="dismiss-wrong"
                    onClick={handleStage3Dismiss}
                    className="w-full py-4 bg-gray-100 hover:bg-gray-100 rounded-xl font-medium transition-colors"
                  >
                    Понятно, дальше →
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
