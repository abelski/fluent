'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { BACKEND_URL, getToken } from '../../../lib/api';
import { useT } from '../../../lib/useT';

interface KnownWord {
  id: number;
  lithuanian: string;
  translation_ru: string | null;
  translation_en: string | null;
  hint: string | null;
  last_seen: string | null;
  list_title: string | null;
  list_title_en: string | null;
  list_id: number | null;
}

export default function VocabularyPage() {
  const { tr, lang } = useT();
  const router = useRouter();
  const [words, setWords] = useState<KnownWord[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');

  useEffect(() => {
    const token = getToken();
    if (!token) {
      router.replace('/login');
      return;
    }
    fetch(`${BACKEND_URL}/api/me/known-words`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => (r.ok ? r.json() : []))
      .then((data: KnownWord[]) => setWords(Array.isArray(data) ? data : []))
      .catch((err) => console.error('Failed to fetch vocabulary:', err))
      .finally(() => setLoading(false));
  }, [router]);

  const filtered = useMemo(() => {
    if (!query.trim()) return words;
    const q = query.toLowerCase();
    return words.filter(
      (w) =>
        w.lithuanian.toLowerCase().includes(q) ||
        (w.translation_ru ?? '').toLowerCase().includes(q) ||
        (w.translation_en ?? '').toLowerCase().includes(q),
    );
  }, [words, query]);

  function formatDate(iso: string | null): string {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString(lang === 'ru' ? 'ru-RU' : 'en-GB', {
      day: 'numeric',
      month: 'short',
    });
  }

  return (
    <main className="bg-slate-50 text-gray-900">
      <div className="relative z-10 max-w-4xl mx-auto px-6 py-8">
        <Link href="/dashboard/lists" className="text-sm text-gray-400 hover:text-gray-700 transition-colors">
          {tr.vocabulary.backToLists}
        </Link>

        <div className="mt-4 mb-8 flex flex-col sm:flex-row sm:items-end gap-4">
          <div className="flex-1">
            <h1 className="text-3xl font-bold">{tr.vocabulary.title}</h1>
            <p className="text-gray-400 mt-1">
              {tr.vocabulary.subtitle}
              {!loading && words.length > 0 && (
                <span className="ml-2 text-gray-500 font-medium">— {words.length}</span>
              )}
            </p>
          </div>
          {!loading && words.length > 0 && (
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={tr.vocabulary.searchPlaceholder}
              className="w-full sm:w-72 px-4 py-2.5 text-sm border border-gray-900 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          )}
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : words.length === 0 ? (
          <div className="text-center py-20 text-gray-400">{tr.vocabulary.empty}</div>
        ) : (
          <div className="border border-gray-900 rounded-2xl overflow-hidden bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-900 bg-gray-50">
                  <th className="text-left px-5 py-3 font-semibold text-gray-700">{tr.vocabulary.columnLithuanian}</th>
                  <th className="text-left px-5 py-3 font-semibold text-gray-700">{tr.vocabulary.columnTranslation}</th>
                  <th className="text-left px-5 py-3 font-semibold text-gray-700 hidden sm:table-cell">{tr.vocabulary.columnList}</th>
                  <th className="text-left px-5 py-3 font-semibold text-gray-700 hidden md:table-cell">{tr.vocabulary.columnDate}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((w, i) => {
                  const listTitle = lang === 'en' ? (w.list_title_en ?? w.list_title) : w.list_title;
                  const translation = lang === 'en' ? (w.translation_en ?? w.translation_ru) : w.translation_ru;
                  return (
                    <tr
                      key={w.id}
                      className={`border-b border-gray-100 last:border-0 ${i % 2 === 0 ? '' : 'bg-gray-50/50'}`}
                    >
                      <td className="px-5 py-3 font-medium text-gray-900">
                        {w.lithuanian}
                        {w.hint && <span className="ml-2 text-gray-400 text-xs font-normal">({w.hint})</span>}
                      </td>
                      <td className="px-5 py-3 text-gray-600">{translation ?? '—'}</td>
                      <td className="px-5 py-3 text-gray-400 hidden sm:table-cell">
                        {w.list_id ? (
                          <Link
                            href={`/dashboard/lists/${w.list_id}`}
                            className="hover:text-emerald-600 transition-colors"
                          >
                            {listTitle ?? '—'}
                          </Link>
                        ) : (
                          listTitle ?? '—'
                        )}
                      </td>
                      <td className="px-5 py-3 text-gray-400 hidden md:table-cell whitespace-nowrap">
                        {formatDate(w.last_seen)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {filtered.length === 0 && (
              <p className="text-center py-10 text-gray-400 text-sm">{tr.vocabulary.empty}</p>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
