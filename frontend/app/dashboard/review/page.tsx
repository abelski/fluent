'use client';

import { Suspense, useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { BACKEND_URL, getToken } from '../../../lib/api';
import { useT } from '../../../lib/useT';
import QuizSession, { type Word } from '../components/QuizSession';

function ReviewContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const mode = searchParams.get('mode') === 'mistakes' ? 'mistakes' : 'known';

  const { tr } = useT();
  const [words, setWords] = useState<Word[]>([]);
  const [loading, setLoading] = useState(true);
  const [limitReached, setLimitReached] = useState(false);
  const [empty, setEmpty] = useState(false);

  const loadWords = useCallback(() => {
    setLoading(true);
    setEmpty(false);
    setLimitReached(false);
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
        const ws = Array.isArray(data) ? data : [];
        if (ws.length === 0) { setEmpty(true); setLoading(false); return; }
        setWords(ws);
      })
      .finally(() => setLoading(false));
  }, [mode]);

  useEffect(() => {
    if (!getToken()) { router.replace('/login'); return; }
    loadWords();
  }, [loadWords, router]);

  const modeLabel = mode === 'mistakes' ? tr.review.mistakesLabel : tr.review.knownLabel;
  const headerLabel = mode === 'mistakes' ? tr.review.mistakesMode : tr.review.knownMode;

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

  return (
    <QuizSession
      words={words}
      sessionMode="review"
      headerLabel={headerLabel}
      clearMistakeOnSuccess={mode === 'mistakes'}
      backHref="/dashboard/lists"
      onRepeat={loadWords}
    />
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
