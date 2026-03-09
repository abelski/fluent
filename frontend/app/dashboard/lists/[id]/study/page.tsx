'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { BACKEND_URL, getToken, resolveListId } from '../../../../../lib/api';

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

function pickDistractors(word: Word, allWords: Word[]): string[] {
  const pool = allWords.filter((w) => w.id !== word.id);
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, 3).map((w) => w.translation_ru);
}

function buildOptions(word: Word, allWords: Word[]): { text: string; correct: boolean }[] {
  const distractors = pickDistractors(word, allWords);
  return [
    { text: word.translation_ru, correct: true },
    ...distractors.map((d) => ({ text: d, correct: false })),
  ].sort(() => Math.random() - 0.5);
}

export default function QuizPage() {
  const { id: _id } = useParams<{ id: string }>();
  const id = resolveListId(_id);

  const [allWords, setAllWords] = useState<Word[]>([]);
  const [queue, setQueue] = useState<StudyCard[]>([]);
  const [totalWords, setTotalWords] = useState(0);
  const [wordsDone, setWordsDone] = useState(0);   // words that exited the queue
  const [correctWords, setCorrectWords] = useState(0); // words correctly finished at stage 3
  const [done, setDone] = useState(false);
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
      .then((r) => r.json())
      .then((data: Word[]) => {
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
    loadWords();
  }, [loadWords]);

  // Recompute options whenever the front card changes (stage 2 only)
  useEffect(() => {
    if (queue.length > 0 && queue[0].stage === 2) {
      setOptions(buildOptions(queue[0].word, allWords));
    }
    if (queue.length > 0 && queue[0].stage === 3) {
      const forms = parseForms(queue[0].word.lithuanian);
      setBlankIndex(Math.floor(Math.random() * forms.length));
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [queue, allWords]);

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

    setTimeout(() => {
      if (!isCorrect) {
        // Word exits queue on wrong answer (no retry)
        setWordsDone((c) => c + 1);
      }
      setAnswerState('unanswered');
      setSelectedOption(null);
      blockUntilRef.current = Date.now() + 200;
      advance(card, isCorrect);
    }, 1200);
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

    const delay = isCorrect ? 1200 : 2000;
    setTimeout(() => {
      // Word always exits queue at stage 3 (correct or wrong)
      setWordsDone((c) => c + 1);
      if (isCorrect) setCorrectWords((c) => c + 1);
      setAnswerState('unanswered');
      setTypedAnswer('');
      setShownAnswer('');
      blockUntilRef.current = Date.now() + 200;
      advance(card, isCorrect);
    }, delay);
  }

  // Check if session is done after queue empties
  useEffect(() => {
    if (!loading && totalWords > 0 && queue.length === 0) {
      setDone(true);
    }
  }, [queue, loading, totalWords]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#07070f] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (done) {
    return (
      <main className="min-h-screen bg-[#07070f] text-white flex flex-col items-center justify-center px-6">
        <div className="pointer-events-none fixed inset-0 flex items-start justify-center">
          <div className="w-[600px] h-[400px] bg-violet-700/10 blur-[120px] rounded-full mt-[-100px]" />
        </div>
        <div className="relative z-10 text-center max-w-sm w-full">
          <div className="text-5xl mb-6">🎉</div>
          <h1 className="text-2xl font-bold mb-2">Сессия завершена!</h1>
          <p className="text-white/40 mb-8">Верно {correctWords} из {totalWords}</p>

          <div className="flex gap-4 justify-center mb-10">
            <div className="bg-white/[0.04] border border-white/[0.08] rounded-2xl px-8 py-5 text-center">
              <div className="text-3xl font-bold text-violet-400">{correctWords}</div>
              <div className="text-white/40 text-sm mt-1">Верно</div>
            </div>
            <div className="bg-white/[0.04] border border-white/[0.08] rounded-2xl px-8 py-5 text-center">
              <div className="text-3xl font-bold text-amber-400">{totalWords - correctWords}</div>
              <div className="text-white/40 text-sm mt-1">Ошибок</div>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <button
              onClick={loadWords}
              className="w-full py-3 bg-violet-600 hover:bg-violet-500 rounded-xl font-medium transition-colors"
            >
              Повторить
            </button>
            <button
              onClick={() => { window.location.href = '/dashboard/lists'; }}
              className="w-full py-3 text-white/40 hover:text-white text-sm transition-colors text-center"
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

  return (
    <main className="min-h-screen bg-[#07070f] text-white flex flex-col px-6 py-8">
      <div className="pointer-events-none fixed inset-0 flex items-start justify-center">
        <div className="w-[600px] h-[400px] bg-violet-700/10 blur-[120px] rounded-full mt-[-100px]" />
      </div>

      <div className="relative z-10 max-w-lg w-full mx-auto flex flex-col flex-1">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <Link
            href="/dashboard/lists"
            className="text-white/40 hover:text-white text-sm transition-colors"
          >
            ← На главную
          </Link>
          <div className="flex items-center gap-3">
            <span className="text-white/20 text-xs uppercase tracking-wider">{stageLabel}</span>
            <span className="text-white/30 text-sm">
              {wordsDone} / {totalWords}
            </span>
          </div>
        </div>

        {/* Progress bar */}
        <div className="w-full h-1 bg-white/[0.06] rounded-full mb-10">
          <div
            className="h-1 bg-violet-500 rounded-full transition-all duration-300"
            style={{ width: `${progressPct}%` }}
          />
        </div>

        {/* ── Stage 1: Flashcard ── */}
        {stage === 1 && (
          <div className="flex flex-col items-center justify-center flex-1 gap-8">
            <div className="w-full bg-white/[0.04] border border-white/[0.08] rounded-2xl p-10 text-center">
              <p className="text-white/30 text-xs uppercase tracking-wider mb-6">Новое слово</p>
              <p className="text-5xl font-bold tracking-tight mb-4">{word.lithuanian}</p>
              {word.hint && (
                <p className="text-white/20 text-xs uppercase tracking-wider mb-4">{word.hint}</p>
              )}
              <div className="h-px bg-white/[0.06] mb-4" />
              <p className="text-xl text-white/60">{word.translation_ru}</p>
            </div>
            <button
              onClick={handleStage1Confirm}
              tabIndex={-1}
              className="w-full py-4 bg-violet-600 hover:bg-violet-500 rounded-xl font-medium transition-colors text-lg"
            >
              Понял →
            </button>
          </div>
        )}

        {/* ── Stage 2: Multiple choice ── */}
        {stage === 2 && (
          <div className="flex flex-col items-center justify-center flex-1 gap-8">
            <div className="text-center">
              <p className="text-white/30 text-sm mb-3 uppercase tracking-wider">Что это означает?</p>
              <p className="text-4xl font-bold tracking-tight">{word.lithuanian}</p>
              {word.hint && (
                <p className="text-white/20 text-xs uppercase tracking-wider mt-2">{word.hint}</p>
              )}
            </div>

            <div className="w-full grid grid-cols-1 gap-3">
              {options.map((opt, i) => {
                let cls =
                  'w-full py-4 px-5 rounded-xl font-medium text-left transition-all duration-200 border ';
                if (answerState === 'unanswered') {
                  cls += 'bg-white/[0.04] border-white/[0.08] hover:bg-white/[0.08] hover:border-violet-500/40 text-white';
                } else if (opt.correct) {
                  cls += 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300';
                } else if (i === selectedOption) {
                  cls += 'bg-red-500/20 border-red-500/50 text-red-300';
                } else {
                  cls += 'bg-white/[0.02] border-white/[0.04] text-white/30';
                }
                return (
                  <button key={i} onClick={() => handleStage2Select(i)} className={cls}>
                    {opt.text}
                  </button>
                );
              })}
            </div>

            {answerState !== 'unanswered' && (
              <p className={`text-sm font-medium animate-in fade-in duration-150 ${answerState === 'correct' ? 'text-emerald-400' : 'text-red-400'}`}>
                {answerState === 'correct' ? 'Правильно!' : 'Не совсем'}
              </p>
            )}
          </div>
        )}

        {/* ── Stage 3: Type it ── */}
        {stage === 3 && (
          <div className="flex flex-col items-center justify-center flex-1 gap-8">
            <div className="text-center">
              <p className="text-white/30 text-sm mb-3 uppercase tracking-wider">
                {cloveIsCloze ? 'Вставьте пропущенную форму' : 'Как будет по-литовски?'}
              </p>
              {cloveIsCloze ? (
                <p className="text-3xl font-bold tracking-tight font-mono">{cloveText}</p>
              ) : (
                <p className="text-4xl font-bold tracking-tight">{word.translation_ru}</p>
              )}
              {word.hint && (
                <p className="text-white/20 text-xs uppercase tracking-wider mt-2">{word.hint}</p>
              )}
              {cloveIsCloze && (
                <p className="text-white/30 text-sm mt-3">{word.translation_ru}</p>
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
                className={`w-full py-4 px-5 rounded-xl border bg-white/[0.04] text-white placeholder-white/20 outline-none transition-all duration-200
                  ${answerState === 'correct' ? 'border-emerald-500/50 bg-emerald-500/10' :
                    answerState === 'wrong' ? 'border-red-500/50 bg-red-500/10' :
                    'border-white/[0.08] focus:border-violet-500/50'}`}
              />

              {answerState === 'unanswered' && (
                <button
                  onClick={handleStage3Submit}
                  className="w-full py-4 bg-violet-600 hover:bg-violet-500 rounded-xl font-medium transition-colors"
                >
                  Проверить
                </button>
              )}

              {answerState === 'correct' && (
                <p className="text-emerald-400 text-sm font-medium text-center animate-in fade-in duration-150">
                  Правильно!
                </p>
              )}

              {answerState === 'wrong' && (
                <div className="text-center animate-in fade-in duration-150">
                  <p className="text-red-400 text-sm font-medium">Не совсем</p>
                  <p className="text-white/50 text-sm mt-1">
                    Правильно: <span className="text-white font-medium">{shownAnswer}</span>
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
