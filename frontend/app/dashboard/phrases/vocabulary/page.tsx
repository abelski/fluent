'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { BACKEND_URL, getToken } from '../../../../lib/api';

interface LearnedPhrase {
  id: number;
  text: string;
  translation: string;
  translation_en: string | null;
  chapter: number | null;
  chapter_title: string | null;
  program_id: number;
  program_title: string | null;
  lesson_stage: number;
  next_review: string | null;
}

const STAGE_LABEL: Record<number, { label: string; cls: string }> = {
  2: { label: 'Выучено', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
};

export default function PhrasesVocabularyPage() {
  const router = useRouter();
  const [phrases, setPhrases] = useState<LearnedPhrase[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');

  useEffect(() => {
    const token = getToken();
    if (!token) { router.replace('/login'); return; }
    fetch(`${BACKEND_URL}/api/me/learned-phrases`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    })
      .then((r) => (r.ok ? r.json() : []))
      .then((data: LearnedPhrase[]) => setPhrases(Array.isArray(data) ? data : []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [router]);

  const filtered = useMemo(() => {
    if (!query.trim()) return phrases;
    const q = query.toLowerCase();
    return phrases.filter(
      (p) =>
        p.text.toLowerCase().includes(q) ||
        p.translation.toLowerCase().includes(q) ||
        (p.translation_en ?? '').toLowerCase().includes(q),
    );
  }, [phrases, query]);

  const mastered = phrases.length;

  return (
    <main className="min-h-screen bg-[#F5F5F7] text-gray-900">
      <div className="max-w-4xl mx-auto px-6 py-8">
        <div className="flex items-center gap-3 mb-1">
          <Link href="/dashboard/phrases" className="text-gray-400 hover:text-gray-600 transition-colors text-sm">
            ← Фразы
          </Link>
        </div>
        <h1 className="text-3xl font-bold mb-1">Мои фразы</h1>
        <p className="text-gray-400 mb-6">Все фразы, которые вы начали изучать</p>

        {/* Summary chips */}
        {!loading && phrases.length > 0 && (
          <div className="flex gap-3 mb-6">
            <span className="text-sm px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-medium">
              {mastered} выучено
            </span>
          </div>
        )}

        {/* Search */}
        {!loading && phrases.length > 0 && (
          <div className="relative mb-6">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
            </svg>
            <input
              type="text"
              placeholder="Поиск по фразам..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 text-sm border border-gray-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400"
            />
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-20">
            <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : phrases.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-gray-500 mb-4">Вы ещё не выучили ни одной фразы</p>
            <Link
              href="/dashboard/phrases"
              className="inline-block px-5 py-2.5 bg-purple-600 text-white text-sm font-semibold rounded-full hover:bg-purple-700 transition-colors"
            >
              Начать учить фразы
            </Link>
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-gray-400 text-center py-12">Ничего не найдено</p>
        ) : (
          <div className="flex flex-col gap-2">
            {filtered.map((phrase) => {
              const stage = STAGE_LABEL[phrase.lesson_stage];
              return (
                <div
                  key={phrase.id}
                  className="bg-white border border-gray-100 rounded-2xl px-5 py-4 flex items-start justify-between gap-4 hover:shadow-sm transition-shadow"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-gray-900">{phrase.text}</p>
                    {phrase.translation && (
                      <p className="text-sm text-gray-500 mt-0.5">{phrase.translation}</p>
                    )}
                    <div className="flex items-center gap-3 mt-1">
                      {phrase.program_title && (
                        <p className="text-xs text-gray-400">{phrase.program_title}{phrase.chapter_title ? ` · ${phrase.chapter_title}` : ''}</p>
                      )}
                      {phrase.next_review && (
                        <p className="text-xs text-gray-400">
                          повтор {new Date(phrase.next_review) <= new Date()
                            ? <span className="text-amber-500 font-medium">сегодня</span>
                            : new Date(phrase.next_review).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}
                        </p>
                      )}
                    </div>
                  </div>
                  {stage && (
                    <span className={`shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full border ${stage.cls}`}>
                      {stage.label}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
