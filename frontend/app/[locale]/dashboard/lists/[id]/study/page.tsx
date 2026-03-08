'use client';

import { useEffect, useState, useCallback } from 'react';
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

type Result = 'known' | 'learning';

export default function StudyPage() {
  const t = useTranslations('study');
  const { locale, id } = useParams<{ locale: string; id: string }>();

  const [words, setWords] = useState<Word[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [results, setResults] = useState<Record<number, Result>>({});
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadWords = useCallback(() => {
    setLoading(true);
    fetch(`${BACKEND_URL}/api/lists/${id}/study`)
      .then((r) => r.json())
      .then((data) => {
        setWords(data);
        setCurrentIndex(0);
        setFlipped(false);
        setResults({});
        setDone(false);
      })
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    loadWords();
  }, [loadWords]);

  function getToken() {
    return typeof window !== 'undefined' ? localStorage.getItem('fluent_token') : null;
  }

  function saveProgress(wordId: number, status: Result) {
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

  function handleResult(status: Result) {
    const word = words[currentIndex];
    setResults((prev) => ({ ...prev, [word.id]: status }));
    saveProgress(word.id, status);

    if (currentIndex + 1 >= words.length) {
      setDone(true);
    } else {
      setCurrentIndex((i) => i + 1);
      setFlipped(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#07070f] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const word = words[currentIndex];
  const known = Object.values(results).filter((r) => r === 'known').length;
  const learning = Object.values(results).filter((r) => r === 'learning').length;

  if (done) {
    return (
      <main className="min-h-screen bg-[#07070f] text-white flex flex-col items-center justify-center px-6">
        <div className="pointer-events-none fixed inset-0 flex items-start justify-center">
          <div className="w-[600px] h-[400px] bg-violet-700/10 blur-[120px] rounded-full mt-[-100px]" />
        </div>
        <div className="relative z-10 text-center max-w-sm w-full">
          <div className="text-5xl mb-6">🎉</div>
          <h1 className="text-2xl font-bold mb-8">{t('doneTitle')}</h1>

          <div className="flex gap-4 justify-center mb-10">
            <div className="bg-white/[0.04] border border-white/[0.08] rounded-2xl px-8 py-5 text-center">
              <div className="text-3xl font-bold text-violet-400">{known}</div>
              <div className="text-white/40 text-sm mt-1">{t('doneKnown')}</div>
            </div>
            <div className="bg-white/[0.04] border border-white/[0.08] rounded-2xl px-8 py-5 text-center">
              <div className="text-3xl font-bold text-amber-400">{learning}</div>
              <div className="text-white/40 text-sm mt-1">{t('doneLearning')}</div>
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
            style={{ width: `${((currentIndex) / words.length) * 100}%` }}
          />
        </div>

        {/* Card */}
        <div className="flex-1 flex flex-col items-center justify-center">
          <div
            className="w-full cursor-pointer select-none"
            onClick={() => !flipped && setFlipped(true)}
          >
            <div className="bg-white/[0.04] border border-white/[0.08] rounded-3xl p-10 text-center min-h-[260px] flex flex-col items-center justify-center gap-4 hover:border-violet-500/30 transition-colors">
              <p className="text-3xl font-bold tracking-tight">{word.lithuanian}</p>

              {word.hint && !flipped && (
                <span className="text-xs text-white/20 uppercase tracking-wider">
                  {word.hint}
                </span>
              )}

              {!flipped && (
                <p className="text-white/20 text-sm mt-2">{t('tapToReveal')}</p>
              )}

              {flipped && (
                <div className="mt-2 space-y-2 animate-in fade-in duration-200">
                  <p className="text-xl text-violet-300 font-medium">{word.translation_en}</p>
                  <p className="text-white/40 text-base">{word.translation_ru}</p>
                  {word.hint && (
                    <p className="text-white/20 text-xs uppercase tracking-wider">{word.hint}</p>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Action buttons — only show after flip */}
          {flipped && (
            <div className="flex gap-4 mt-8 w-full animate-in slide-in-from-bottom-2 duration-200">
              <button
                onClick={() => handleResult('learning')}
                className="flex-1 py-3.5 bg-white/[0.06] hover:bg-white/[0.10] border border-white/[0.08] rounded-xl font-medium transition-colors text-white/70"
              >
                ↩ {t('keepPracticing')}
              </button>
              <button
                onClick={() => handleResult('known')}
                className="flex-1 py-3.5 bg-violet-600 hover:bg-violet-500 rounded-xl font-medium transition-colors"
              >
                {t('gotIt')} ✓
              </button>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
