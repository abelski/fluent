'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { BACKEND_URL, resolveListId } from '../../../../lib/api';

interface Word {
  id: number;
  lithuanian: string;
  translation_en: string;
  translation_ru: string;
  hint: string | null;
}

interface WordListDetail {
  id: number;
  title: string;
  description: string | null;
  words: Word[];
}

export default function ListDetailPage() {
  const { id: _id } = useParams<{ id: string }>();
  const id = resolveListId(_id);
  const [list, setList] = useState<WordListDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${BACKEND_URL}/api/lists/${id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then(setList)
      .catch(() => setList(null))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#07070f] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!list) return null;

  return (
    <main className="min-h-screen bg-[#07070f] text-white">
      <div className="pointer-events-none fixed inset-0 flex items-start justify-center">
        <div className="w-[600px] h-[400px] bg-violet-700/10 blur-[120px] rounded-full mt-[-100px]" />
      </div>

      <div className="relative z-10 max-w-4xl mx-auto px-6 py-8">
        <nav className="flex justify-between items-center mb-12">
          <Link href="/dashboard/lists" className="font-bold text-xl tracking-tight">
            fluent<span className="text-violet-400">.</span>
          </Link>
          <Link
            href="/dashboard/lists"
            className="text-white/40 hover:text-white text-sm transition-colors"
          >
            ← На главную
          </Link>
        </nav>

        <div className="flex items-start justify-between gap-4 mb-10">
          <div>
            <h1 className="text-3xl font-bold">{list.title}</h1>
            {list.description && (
              <p className="text-white/40 mt-1">{list.description}</p>
            )}
            <p className="text-white/30 text-sm mt-2">{list.words.length} слов</p>
          </div>
          <Link
            href={`/dashboard/lists/${id}/study`}
            className="shrink-0 px-6 py-2.5 bg-violet-600 hover:bg-violet-500 rounded-xl transition-colors font-medium text-sm"
          >
            Учить →
          </Link>
        </div>

        <div className="bg-white/[0.04] border border-white/[0.08] rounded-2xl overflow-hidden">
          <div className="grid grid-cols-[1fr_1fr_auto] text-xs text-white/30 uppercase tracking-wider px-6 py-3 border-b border-white/[0.06]">
            <span>Литовский</span>
            <span>Перевод</span>
            <span>Заметка</span>
          </div>
          {list.words.map((word, i) => (
            <div
              key={word.id}
              className={`grid grid-cols-[1fr_1fr_auto] px-6 py-3.5 gap-4 items-center ${
                i < list.words.length - 1 ? 'border-b border-white/[0.04]' : ''
              }`}
            >
              <span className="font-medium text-white">{word.lithuanian}</span>
              <span className="text-white/60 text-sm">{word.translation_ru}</span>
              <span className="text-white/25 text-xs">{word.hint ?? ''}</span>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
