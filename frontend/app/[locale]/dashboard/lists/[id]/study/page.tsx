'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useParams } from 'next/navigation';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';

interface Word {
  id: number;
  lithuanian: string;
  translation_en: string;
  translation_ru: string;
  hint: string | null;
}

interface Option {
  text: string;
  correct: boolean;
}

type AnswerState = 'unanswered' | 'correct' | 'wrong';

export default function StudyPage() {
  const t = useTranslations('study');
  const { locale, id: _id } = useParams<{ locale: string; id: string }>();
  const id = (typeof window !== 'undefined' && !/^\d+$/.test(_id))
    ? (window.location.pathname.split('/').find((s, i, a) => a[i - 1] === 'lists' && /^\d+$/.test(s)) ?? _id)
    : _id;

  const [words, setWords] = useState<Word[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [answerState, setAnswerState] = useState<AnswerState>('unanswered');
  const [correctCount, setCorrectCount] = useState(0);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(true);

  function getToken() {
    return typeof window !== 'undefined' ? localStorage.getItem('fluent_token') : null;
  }

  const loadWords = useCallback(() => {
    setLoading(true);
    const token = getToken();
    fetch(`${BACKEND_URL}/api/lists/${id}/study`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((r) => r.json())
      .then((data) => {
        setWords(Array.isArray(data) ? data : []);
        setCurrentIndex(0);
        setSelected(null);
        setAnswerState('unanswered');
        setCorrectCount(0);
        setDone(false);
      })
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    loadWords();
  }, [loadWords]);

  function saveProgress(wordId: number, status: 'known' | 'learning') {
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
  }

  // Generate shuffled options for current question
  const options: Option[] = useMemo(() => {
    if (!words.length || currentIndex >= words.length) return [];
    const current = words[currentIndex];
    const correctText = locale === 'ru' ? current.translation_ru : current.translation_en;

    // Pick 3 distractors from the other words
    const pool = words.filter((_: Word, i: number) => i !== currentIndex);
    const shuffledPool = [...pool].sort(() => Math.random() - 0.5);
    const distractors = shuffledPool.slice(0, 3).map((w) =>
      locale === 'ru' ? w.translation_ru : w.translation_en
    );

    const opts: Option[] = [
      { text: correctText, correct: true },
      ...distractors.map((d) => ({ text: d, correct: false })),
    ].sort(() => Math.random() - 0.5);

    return opts;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex, words, locale]);

  function handleSelect(index: number) {
    if (answerState !== 'unanswered') return;

    const isCorrect = options[index].correct;
    setSelected(index);
    setAnswerState(isCorrect ? 'correct' : 'wrong');

    const word = words[currentIndex];
    if (isCorrect) {
      setCorrectCount((c: number) => c + 1);
      saveProgress(word.id, 'known');
    } else {
      saveProgress(word.id, 'learning');
    }

    // Advance after delay
    setTimeout(() => {
      if (currentIndex + 1 >= words.length) {
        setDone(true);
      } else {
        setCurrentIndex((i: number) => i + 1);
        setSelected(null);
        setAnswerState('unanswered');
      }
    }, 1200);
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#07070f] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (done) {
    const total = words.length;
    return (
      <main className="min-h-screen bg-[#07070f] text-white flex flex-col items-center justify-center px-6">
        <div className="pointer-events-none fixed inset-0 flex items-start justify-center">
          <div className="w-[600px] h-[400px] bg-violet-700/10 blur-[120px] rounded-full mt-[-100px]" />
        </div>
        <div className="relative z-10 text-center max-w-sm w-full">
          <div className="text-5xl mb-6">🎉</div>
          <h1 className="text-2xl font-bold mb-2">{t('doneTitle')}</h1>
          <p className="text-white/40 mb-8">{t('doneScore', { score: correctCount, total })}</p>

          <div className="flex gap-4 justify-center mb-10">
            <div className="bg-white/[0.04] border border-white/[0.08] rounded-2xl px-8 py-5 text-center">
              <div className="text-3xl font-bold text-violet-400">{correctCount}</div>
              <div className="text-white/40 text-sm mt-1">{t('doneCorrect')}</div>
            </div>
            <div className="bg-white/[0.04] border border-white/[0.08] rounded-2xl px-8 py-5 text-center">
              <div className="text-3xl font-bold text-amber-400">{total - correctCount}</div>
              <div className="text-white/40 text-sm mt-1">{t('doneWrong')}</div>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <button
              onClick={loadWords}
              className="w-full py-3 bg-violet-600 hover:bg-violet-500 rounded-xl font-medium transition-colors"
            >
              {t('studyAgain')}
            </button>
            <Link
              href={`/${locale}/dashboard/lists/${id}`}
              className="w-full py-3 text-white/40 hover:text-white text-sm transition-colors text-center"
            >
              {t('backToList')}
            </Link>
          </div>
        </div>
      </main>
    );
  }

  const word = words[currentIndex];

  return (
    <main className="min-h-screen bg-[#07070f] text-white flex flex-col px-6 py-8">
      <div className="pointer-events-none fixed inset-0 flex items-start justify-center">
        <div className="w-[600px] h-[400px] bg-violet-700/10 blur-[120px] rounded-full mt-[-100px]" />
      </div>

      <div className="relative z-10 max-w-lg w-full mx-auto flex flex-col flex-1">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <Link
            href={`/${locale}/dashboard/lists/${id}`}
            className="text-white/40 hover:text-white text-sm transition-colors"
          >
            ← {t('backToList')}
          </Link>
          <span className="text-white/30 text-sm">
            {currentIndex + 1} / {words.length}
          </span>
        </div>

        {/* Progress bar */}
        <div className="w-full h-1 bg-white/[0.06] rounded-full mb-10">
          <div
            className="h-1 bg-violet-500 rounded-full transition-all duration-300"
            style={{ width: `${(currentIndex / words.length) * 100}%` }}
          />
        </div>

        {/* Question */}
        <div className="flex flex-col items-center justify-center flex-1 gap-8">
          <div className="text-center">
            <p className="text-white/30 text-sm mb-3 uppercase tracking-wider">{t('questionLabel')}</p>
            <p className="text-4xl font-bold tracking-tight">{word.lithuanian}</p>
            {word.hint && (
              <p className="text-white/20 text-xs uppercase tracking-wider mt-2">{word.hint}</p>
            )}
          </div>

          {/* Options */}
          <div className="w-full grid grid-cols-1 gap-3">
            {options.map((opt, i) => {
              let btnClass =
                'w-full py-4 px-5 rounded-xl font-medium text-left transition-all duration-200 border ';

              if (answerState === 'unanswered') {
                btnClass +=
                  'bg-white/[0.04] border-white/[0.08] hover:bg-white/[0.08] hover:border-violet-500/40 text-white';
              } else if (opt.correct) {
                btnClass += 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300';
              } else if (i === selected) {
                btnClass += 'bg-red-500/20 border-red-500/50 text-red-300';
              } else {
                btnClass += 'bg-white/[0.02] border-white/[0.04] text-white/30';
              }

              return (
                <button key={i} onClick={() => handleSelect(i)} className={btnClass}>
                  {opt.text}
                </button>
              );
            })}
          </div>

          {/* Feedback message */}
          {answerState !== 'unanswered' && (
            <p
              className={`text-sm font-medium animate-in fade-in duration-150 ${
                answerState === 'correct' ? 'text-emerald-400' : 'text-red-400'
              }`}
            >
              {answerState === 'correct' ? t('feedbackCorrect') : t('feedbackWrong')}
            </p>
          )}
        </div>
      </div>
    </main>
  );
}
