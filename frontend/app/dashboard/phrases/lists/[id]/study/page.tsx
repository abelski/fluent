'use client';

import { Suspense, useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  getToken,
  getMyPhraseListStudy,
  recordMyPhraseProgress,
  resolvePhraseListId,
  type PhraseStudyItem,
} from '../../../../../../lib/api';
import PhraseSession from '../../../../components/PhraseSession';
import { useT } from '../../../../../../lib/useT';

function MyPhraseListStudyContent() {
  const { id: _id } = useParams<{ id: string }>();
  const id = resolvePhraseListId(_id);
  const router = useRouter();
  const { tr } = useT();
  const t = tr.phraseLists;

  const [phrases, setPhrases] = useState<PhraseStudyItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadPhrases = useCallback(() => {
    setLoading(true);
    setError(null);
    getMyPhraseListStudy(Number(id))
      .then((data) => {
        if (data.phrases.length === 0) {
          setError(t.noPhrasesToReview);
        } else {
          setPhrases(data.phrases);
        }
      })
      .catch((e: Error) => {
        if (e.message === 'No phrases due for review') {
          setError(t.noPhrasesToday);
        } else if (e.message === 'List not found') {
          router.replace('/dashboard/phrases');
        } else {
          setError(e.message || t.loadError);
        }
      })
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, router]);

  useEffect(() => {
    if (!getToken()) { router.replace('/login'); return; }
    loadPhrases();
  }, [loadPhrases, router]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <main className="min-h-screen bg-slate-50 text-gray-900 flex flex-col items-center justify-center px-6">
        <div className="pointer-events-none fixed inset-0 flex items-start justify-center">
          <div className="w-[600px] h-[400px] bg-emerald-100/40 blur-[120px] rounded-full mt-[-100px]" />
        </div>
        <div className="relative z-10 text-center max-w-sm w-full">
          <div className="text-5xl mb-6">💬</div>
          <p className="text-gray-500 mb-8">{error}</p>
          <Link href="/dashboard/phrases" className="text-sm text-gray-400 hover:text-gray-900 transition-colors">
            {t.backToLists}
          </Link>
        </div>
      </main>
    );
  }

  return (
    <PhraseSession
      phrases={phrases}
      backHref={`/dashboard/phrases/lists/${id}/edit`}
      onRepeat={loadPhrases}
      recordProgress={recordMyPhraseProgress}
    />
  );
}

export default function MyPhraseListStudyPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <MyPhraseListStudyContent />
    </Suspense>
  );
}
