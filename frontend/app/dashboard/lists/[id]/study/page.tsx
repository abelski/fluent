'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { BACKEND_URL, getToken, resolveListId } from '../../../../../lib/api';
import { useT } from '../../../../../lib/useT';
import { getStarLevel } from '../../../../../lib/starLevel';
import QuizSession, { type Word } from '../../../components/QuizSession';

export default function QuizPage() {
  const { id: _id } = useParams<{ id: string }>();
  const id = resolveListId(_id);
  const router = useRouter();
  const { tr } = useT();

  const [words, setWords] = useState<Word[]>([]);
  const [distractors, setDistractors] = useState<Word[]>([]);
  const [loading, setLoading] = useState(true);
  const [limitReached, setLimitReached] = useState(false);
  const [empty, setEmpty] = useState(false);

  const loadWords = useCallback(() => {
    setLoading(true);
    setLimitReached(false);
    setEmpty(false);
    const token = getToken();
    const starLevel = getStarLevel();
    fetch(`${BACKEND_URL}/api/lists/${id}/study?star_level=${starLevel}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((r) => {
        if (r.status === 429) { setLimitReached(true); setLoading(false); return null; }
        if (r.status === 404) { router.replace('/dashboard/lists'); return null; }
        return r.json();
      })
      .then((data: { words: Word[]; distractors: Word[] } | null) => {
        if (!data) return;
        const ws = Array.isArray(data) ? data : (data.words ?? []);
        const ds = Array.isArray(data) ? [] : (data.distractors ?? []);
        if (ws.length === 0) { setEmpty(true); setLoading(false); return; }
        setWords(ws);
        setDistractors(ds);
      })
      .finally(() => setLoading(false));
  }, [id, router]);

  useEffect(() => {
    if (!getToken()) { router.replace('/login'); return; }
    loadWords();
  }, [loadWords, router]);

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
          <h1 className="text-2xl font-bold mb-2">{tr.common.limitTitle}</h1>
          <p className="text-gray-400 mb-8">{tr.common.limitBody}</p>
          <div className="flex flex-col gap-3">
            <Link href="/pricing" className="w-full py-3 bg-gray-900 hover:bg-gray-800 rounded-xl font-medium text-white transition-colors text-center">
              {tr.common.getPremium}
            </Link>
            <button
              onClick={() => router.push('/dashboard/lists')}
              className="w-full py-3 text-gray-400 hover:text-gray-900 text-sm transition-colors text-center"
            >
              {tr.study.backToLists}
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
          <div className="text-5xl mb-6">★</div>
          <p className="text-gray-400 mb-8">{tr.lists.noWordsAtLevel}</p>
          <button
            onClick={() => router.push('/dashboard/lists')}
            className="w-full py-3 text-gray-400 hover:text-gray-900 text-sm transition-colors text-center"
          >
            {tr.study.backToLists}
          </button>
        </div>
      </main>
    );
  }

  return (
    <QuizSession
      words={words}
      distractors={distractors}
      sessionMode="study"
      backHref="/dashboard/lists"
      onRepeat={loadWords}
    />
  );
}
