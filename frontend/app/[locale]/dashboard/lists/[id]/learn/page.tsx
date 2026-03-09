'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useParams } from 'next/navigation';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';

interface WordListMeta {
  id: number;
  title: string;
  description: string | null;
  word_count: number;
}

export default function LearnPage() {
  const t = useTranslations('learn');
  const { locale, id } = useParams<{ locale: string; id: string }>();
  const [list, setList] = useState<WordListMeta | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${BACKEND_URL}/api/lists/${id}`)
      .then((r) => r.json())
      .then((data) => setList({ id: data.id, title: data.title, description: data.description, word_count: data.words?.length ?? 0 }))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#07070f] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-[#07070f] text-white">
      <div className="pointer-events-none fixed inset-0 flex items-start justify-center">
        <div className="w-[600px] h-[400px] bg-violet-700/10 blur-[120px] rounded-full mt-[-100px]" />
      </div>

      <div className="relative z-10 max-w-lg mx-auto px-6 py-8">
        <nav className="flex justify-between items-center mb-12">
          <Link href={`/${locale}/dashboard`} className="font-bold text-xl tracking-tight">
            fluent<span className="text-violet-400">.</span>
          </Link>
          <Link
            href={`/${locale}/dashboard/lists/${id}`}
            className="text-white/40 hover:text-white text-sm transition-colors"
          >
            ← {t('backToList')}
          </Link>
        </nav>

        <div className="mb-10">
          <h1 className="text-3xl font-bold">{list?.title}</h1>
          <p className="text-white/40 mt-1">{t('subtitle')}</p>
        </div>

        <div className="flex flex-col gap-4">
          <Link
            href={`/${locale}/dashboard/lists/${id}/learn/flashcard`}
            className="group bg-white/[0.04] border border-white/[0.08] hover:border-violet-500/40 hover:bg-white/[0.07] rounded-2xl px-6 py-5 transition-all duration-200"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold text-white">{t('flashcardTitle')}</p>
                <p className="text-white/40 text-sm mt-0.5">{t('flashcardDesc')}</p>
              </div>
              <span className="text-white/30 group-hover:text-violet-400 transition-colors text-xl">→</span>
            </div>
          </Link>
        </div>
      </div>
    </main>
  );
}
