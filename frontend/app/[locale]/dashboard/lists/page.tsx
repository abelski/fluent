'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useParams } from 'next/navigation';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';

interface WordListSummary {
  id: number;
  title: string;
  description: string | null;
  word_count: number;
}

export default function ListsPage() {
  const t = useTranslations('lists');
  const tDash = useTranslations('dashboard');
  const { locale } = useParams<{ locale: string }>();
  const [lists, setLists] = useState<WordListSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${BACKEND_URL}/api/lists`)
      .then((r) => r.json())
      .then(setLists)
      .finally(() => setLoading(false));
  }, []);

  return (
    <main className="min-h-screen bg-[#07070f] text-white">
      <div className="pointer-events-none fixed inset-0 flex items-start justify-center">
        <div className="w-[600px] h-[400px] bg-violet-700/10 blur-[120px] rounded-full mt-[-100px]" />
      </div>

      <div className="relative z-10 max-w-4xl mx-auto px-6 py-8">
        <nav className="flex justify-between items-center mb-12">
          <Link href={`/${locale}/dashboard`} className="font-bold text-xl tracking-tight">
            fluent<span className="text-violet-400">.</span>
          </Link>
          <Link
            href={`/${locale}/dashboard`}
            className="text-white/40 hover:text-white text-sm transition-colors"
          >
            ← {t('backToDashboard')}
          </Link>
        </nav>

        <h1 className="text-3xl font-bold mb-2">{t('title')}</h1>
        <p className="text-white/40 mb-10">{t('subtitle')}</p>

        {loading ? (
          <div className="flex justify-center py-20">
            <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {lists.map((list) => (
              <div
                key={list.id}
                className="bg-white/[0.04] border border-white/[0.08] rounded-2xl p-6 flex flex-col gap-4 hover:border-violet-500/40 transition-colors"
              >
                <div>
                  <h2 className="text-lg font-semibold">{list.title}</h2>
                  {list.description && (
                    <p className="text-white/40 text-sm mt-1">{list.description}</p>
                  )}
                </div>
                <div className="flex items-center justify-between mt-auto">
                  <span className="text-white/30 text-sm">
                    {list.word_count} {tDash('words')}
                  </span>
                  <div className="flex gap-2">
                    <Link
                      href={`/${locale}/dashboard/lists/${list.id}`}
                      className="px-4 py-1.5 text-sm text-white/60 hover:text-white border border-white/10 hover:border-white/30 rounded-lg transition-colors"
                    >
                      Browse
                    </Link>
                    <Link
                      href={`/${locale}/dashboard/lists/${list.id}/study`}
                      className="px-4 py-1.5 text-sm bg-violet-600 hover:bg-violet-500 rounded-lg transition-colors font-medium"
                    >
                      {tDash('study')}
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
