'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { BACKEND_URL, getToken, resolveListId } from '../../../../../lib/api';
import { useT } from '../../../../../lib/useT';
import { getStarLevel, setStarLevel } from '../../../../../lib/starLevel';
import QuizSession, { type Word } from '../../../components/QuizSession';
import PageMascot from '../../../../../components/PageMascot';

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
  const [allKnown, setAllKnown] = useState(false);

  const loadWords = useCallback((includeKnown = false) => {
    setLoading(true);
    setLimitReached(false);
    setEmpty(false);
    setAllKnown(false);
    const token = getToken();
    const starLevel = getStarLevel();
    const params = `star_level=${starLevel}${includeKnown ? '&include_known=true' : ''}`;
    fetch(`${BACKEND_URL}/api/lists/${id}/study?${params}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((r) => {
        if (r.status === 429) { setLimitReached(true); setLoading(false); return null; }
        if (r.status === 404) { router.replace('/dashboard/lists'); return null; }
        return r.json();
      })
      .then((data: { words: Word[]; distractors: Word[]; all_known?: boolean } | null) => {
        if (!data) return;
        const ws = Array.isArray(data) ? data : (data.words ?? []);
        const ds = Array.isArray(data) ? [] : (data.distractors ?? []);
        if (ws.length === 0) {
          if ((data as { all_known?: boolean }).all_known) setAllKnown(true);
          else setEmpty(true);
          setLoading(false);
          return;
        }
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
      <main className="flex-1 text-gray-900 flex flex-col items-center justify-center px-8 pt-5 pb-20">
        <div className="relative z-10 text-center max-w-sm w-full">
          <div className="text-5xl mb-6">⏳</div>
          <h1 className="font-headline text-2xl font-bold mb-2">{tr.common.limitTitle}</h1>
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
      <main className="flex-1 text-gray-900 flex flex-col items-center justify-center px-8 pt-5 pb-20">
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

  if (allKnown) {
    const currentLevel = getStarLevel();
    const nextLevel = currentLevel < 3 ? currentLevel + 1 : null;
    return (
      <main className="flex-1 text-gray-900 flex flex-col items-center justify-center px-8 pt-5 pb-20">
        <div className="relative z-10 flex flex-col items-center text-center max-w-sm w-full gap-5">
          <PageMascot phrase="Valio!" mood={1} />
          <h1 className="text-[26px] font-bold">{'★'.repeat(currentLevel)} {tr.study.levelComplete}</h1>
          <p className="text-[15px] text-muted mb-2">{tr.study.levelCompleteBody}</p>
          <div className="flex flex-col gap-3 w-full">
            {nextLevel && (
              <button
                onClick={() => { setStarLevel(nextLevel); router.push('/dashboard/lists'); }}
                className="w-full py-3.5 bg-ink hover:bg-[#25282d] rounded-[10px] text-[15px] font-semibold text-white transition-colors"
              >
                {tr.study.advanceToLevel.replace('{stars}', '★'.repeat(nextLevel))}
              </button>
            )}
            <button
              onClick={() => loadWords(true)}
              className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-700 rounded-[10px] text-[15px] font-semibold text-white transition-colors"
            >
              {tr.study.studyAgain}
            </button>
          </div>
          <button
            onClick={() => router.push('/dashboard/lists')}
            className="text-[13.5px] text-muted hover:text-gray-900 transition-colors mt-2"
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
