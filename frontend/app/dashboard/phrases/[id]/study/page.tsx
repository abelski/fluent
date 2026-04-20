'use client';

import { Suspense, useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { getToken, getPhrasesStudy, resolvePhraseId, type PhraseStudyItem } from '../../../../../lib/api';
import PhraseSession from '../../../components/PhraseSession';

function PhrasesStudyContent() {
  const { id: _id } = useParams<{ id: string }>();
  const id = resolvePhraseId(_id);
  const router = useRouter();
  const searchParams = useSearchParams();
  const chapterParam = searchParams.get('chapter');
  const chapter = chapterParam !== null ? Number(chapterParam) : undefined;

  const [phrases, setPhrases] = useState<PhraseStudyItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadPhrases = useCallback(() => {
    setLoading(true);
    setError(null);
    getPhrasesStudy(Number(id), chapter)
      .then((data) => {
        if (data.phrases.length === 0) {
          setError('Нет фраз для повторения.');
        } else {
          setPhrases(data.phrases);
        }
      })
      .catch((e: Error) => {
        if (e.message === 'Not enrolled in this program') {
          router.replace('/dashboard/phrases');
        } else if (e.message === 'No phrases due for review') {
          setError('Нет фраз для повторения на сегодня. Возвращайтесь завтра!');
        } else {
          setError(e.message || 'Не удалось загрузить фразы.');
        }
      })
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, chapter, router]);

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
            ← Назад к программам
          </Link>
        </div>
      </main>
    );
  }

  const backHref = `/dashboard/phrases/${id}`;

  return (
    <PhraseSession
      phrases={phrases}
      backHref={backHref}
      onRepeat={loadPhrases}
    />
  );
}

export default function PhrasesStudyPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <PhrasesStudyContent />
    </Suspense>
  );
}
