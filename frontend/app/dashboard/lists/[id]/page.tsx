'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { BACKEND_URL, resolveListId, getToken } from '../../../../lib/api';
import { useT } from '../../../../lib/useT';

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
  const { tr, plural, lang } = useT();

  const [list, setList] = useState<WordListDetail | null>(null);
  const [loading, setLoading] = useState(true);

  function handleStudyClick() {
    if (!getToken()) {
      window.location.href = '/login';
    } else {
      window.location.href = `/dashboard/lists/${id}/study`;
    }
  }

  useEffect(() => {
    fetch(`${BACKEND_URL}/api/lists/${id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then(setList)
      .catch(() => setList(null))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!list) return null;

  return (
    <main className="bg-slate-50 text-gray-900">
      <div className="pointer-events-none fixed inset-0 flex items-start justify-center overflow-hidden">
        <div className="w-full max-w-[600px] h-[400px] bg-emerald-100/40 blur-[120px] rounded-full mt-[-100px]" />
      </div>

      <div className="relative z-10 max-w-4xl mx-auto px-6 py-8">
        <div className="mb-4">
          <Link href="/dashboard/lists" className="text-gray-400 hover:text-gray-900 text-sm transition-colors">
            {tr.detail.backToLists}
          </Link>
        </div>

        <div className="flex items-start justify-between gap-4 mb-10">
          <div>
            <h1 className="text-3xl font-bold">{list.title}</h1>
            {list.description && (
              <p className="text-gray-400 mt-1">{list.description}</p>
            )}
            <p className="text-gray-400 text-sm mt-2">{list.words.length} {plural(list.words.length, tr.detail.wordsCount)}</p>
          </div>
          <button
            onClick={handleStudyClick}
            className="shrink-0 px-6 py-3 bg-gray-900 hover:bg-gray-800 rounded-xl transition-colors font-medium text-sm text-white"
          >
            {tr.detail.studyBtn}
          </button>
        </div>

        <div className="bg-white border border-gray-900 rounded-2xl overflow-hidden">
          <div className="grid grid-cols-[1fr_1fr] sm:grid-cols-[1fr_1fr_auto] text-xs text-gray-400 uppercase tracking-wider px-4 sm:px-6 py-3 border-b border-gray-900">
            <span>{tr.detail.columnLithuanian}</span>
            <span>{tr.detail.columnTranslation}</span>
            <span className="hidden sm:block">{tr.detail.columnNote}</span>
          </div>
          {list.words.map((word, i) => (
            <div
              key={word.id}
              className={`grid grid-cols-[1fr_1fr] sm:grid-cols-[1fr_1fr_auto] px-4 sm:px-6 py-3.5 gap-4 items-center ${
                i < list.words.length - 1 ? 'border-b border-gray-900' : ''
              }`}
            >
              <span className="font-medium text-gray-900">{word.lithuanian}</span>
              <span className="text-gray-500 text-sm">{lang === 'en' ? word.translation_en : word.translation_ru}</span>
              <span className="text-gray-300 text-xs hidden sm:block">{word.hint ?? ''}</span>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
