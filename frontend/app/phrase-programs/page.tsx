'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  getToken,
  getPhrasePrograms,
  enrollPhraseProgram,
  type PhraseProgramSummary,
} from '../../lib/api';

const DIFFICULTY_LABELS: Record<number, string> = { 1: 'Лёгкий', 2: 'Средний', 3: 'Сложный' };
const DIFFICULTY_COLORS: Record<number, string> = {
  1: 'bg-emerald-100 text-emerald-700',
  2: 'bg-amber-100 text-amber-700',
  3: 'bg-red-100 text-red-700',
};

export default function PhraseProgramsPage() {
  const router = useRouter();
  const [programs, setPrograms] = useState<PhraseProgramSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [enrolling, setEnrolling] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (!getToken()) {
      router.push('/login');
      return;
    }
    getPhrasePrograms()
      .then(setPrograms)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [router]);

  async function handleEnroll(programId: number) {
    if (!getToken()) { router.push('/login'); return; }
    setEnrolling((s) => new Set(s).add(programId));
    try {
      await enrollPhraseProgram(programId);
      setPrograms((prev) =>
        prev.map((p) => (p.id === programId ? { ...p, enrolled: true } : p))
      );
    } catch (e) {
      console.error(e);
    } finally {
      setEnrolling((s) => { const n = new Set(s); n.delete(programId); return n; });
    }
  }

  return (
    <main className="min-h-screen bg-[#F5F5F7] text-gray-900">
      <div className="max-w-4xl mx-auto px-6 py-8">
        <div className="flex items-center gap-3 mb-1">
          <Link
            href="/dashboard/phrases"
            className="text-gray-400 hover:text-gray-700 transition-colors text-sm"
          >
            ← Фразы
          </Link>
        </div>
        <h1 className="text-3xl font-bold mb-1">Программы фраз</h1>
        <p className="text-gray-400 mb-8">Выберите программы для изучения литовских фраз</p>

        {loading ? (
          <div className="flex justify-center py-20">
            <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : programs.length === 0 ? (
          <p className="text-gray-400 text-center py-12">Программы фраз скоро появятся.</p>
        ) : (
          <div className="space-y-3">
            {programs.map((p) => (
              <div
                key={p.id}
                className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm"
                data-testid="phrase-program-card"
              >
                <div className="flex items-start justify-between gap-3">
                  <Link href={`/dashboard/phrases/${p.id}`} className="min-w-0 flex-1 group">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold text-gray-900 truncate group-hover:text-emerald-700 transition-colors">
                        {p.title}
                      </h3>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${DIFFICULTY_COLORS[p.difficulty] ?? 'bg-gray-100 text-gray-500'}`}>
                        {DIFFICULTY_LABELS[p.difficulty] ?? ''}
                      </span>
                      {p.enrolled && (
                        <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                          Добавлено
                        </span>
                      )}
                    </div>
                    {p.description && (
                      <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{p.description}</p>
                    )}
                    <p className="text-xs text-gray-400 mt-1">{p.phrase_count} фраз</p>
                  </Link>

                  {!p.enrolled && (
                    <button
                      onClick={() => handleEnroll(p.id)}
                      disabled={enrolling.has(p.id)}
                      data-testid="enroll-button"
                      className="shrink-0 px-4 py-2 rounded-xl text-sm font-medium bg-gray-100 text-gray-700 hover:bg-emerald-50 hover:text-emerald-700 transition-colors disabled:opacity-50"
                    >
                      {enrolling.has(p.id) ? '...' : 'Добавить'}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
