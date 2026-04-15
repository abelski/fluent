'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  BACKEND_URL,
  getToken,
  getCommunityProgram,
  getCommunityProgramWordSets,
  enrollCustomProgram,
  unenrollCustomProgram,
  getCustomProgramEnrollments,
  type CustomProgramSummary,
  type WordSetWithId,
} from '../../../../lib/api';

function resolveToken(): string | null {
  if (typeof window === 'undefined') return null;
  const parts = window.location.pathname.split('/');
  const idx = parts.indexOf('custom');
  if (idx === -1) return null;
  return parts[idx + 1] || null;
}

export default function CustomProgramPage() {
  const router = useRouter();
  const [program, setProgram] = useState<CustomProgramSummary | null>(null);
  const [wordSets, setWordSets] = useState<WordSetWithId[]>([]);
  const [isEnrolled, setIsEnrolled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [enrolling, setEnrolling] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const token = getToken();
    if (!token) {
      window.location.href = `${BACKEND_URL}/api/auth/google`;
      return;
    }

    const shareToken = resolveToken();
    if (!shareToken || shareToken === '_') {
      router.replace('/programs?tab=community');
      return;
    }

    Promise.all([
      getCommunityProgram(shareToken),
      getCommunityProgramWordSets(shareToken),
      getCustomProgramEnrollments(),
    ]).then(([prog, sets, enrollments]) => {
      setProgram(prog);
      setWordSets(sets);
      setIsEnrolled(enrollments.some((e) => e.id === prog.id));
    }).catch(() => {
      setError('Программа не найдена или недоступна');
    }).finally(() => setLoading(false));
  }, [router]);

  async function handleToggle() {
    if (!program) return;
    setEnrolling(true);
    try {
      if (isEnrolled) {
        await unenrollCustomProgram(program.id);
        setIsEnrolled(false);
      } else {
        await enrollCustomProgram(program.share_token);
        setIsEnrolled(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка');
    } finally {
      setEnrolling(false);
    }
  }

  if (loading) {
    return (
      <main className="bg-[#F5F5F7] min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </main>
    );
  }

  if (error || !program) {
    return (
      <main className="bg-[#F5F5F7] min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-500 mb-4">{error || 'Программа не найдена'}</p>
          <Link href="/programs?tab=community" className="text-emerald-600 hover:underline text-sm">
            ← Все программы
          </Link>
        </div>
      </main>
    );
  }

  const totalWords = wordSets.reduce((sum, ws) => sum + ws.words.length, 0);

  return (
    <main className="bg-[#F5F5F7] min-h-screen text-gray-900">
      <div className="max-w-2xl mx-auto px-6 py-8">
        <div className="mb-6">
          <Link href="/programs?tab=community" className="text-sm text-gray-400 hover:text-gray-700 transition-colors">
            ← Сообщество
          </Link>
        </div>

        {/* Program header */}
        <div className="bg-white rounded-2xl p-6 border border-gray-100 mb-4">
          <div className="flex items-start justify-between gap-4 mb-3">
            <div>
              <h1 className="text-2xl font-bold mb-1">{program.title}</h1>
              <p className="text-sm text-gray-400">
                Автор: <span className="text-gray-600">{program.author_name ?? 'Участник сообщества'}</span>
              </p>
            </div>
            {isEnrolled && (
              <span className="shrink-0 text-xs font-semibold px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                В плане
              </span>
            )}
          </div>

          {program.description && (
            <p className="text-sm text-gray-600 mb-4 leading-relaxed">{program.description}</p>
          )}

          <div className="flex items-center gap-4 text-sm text-gray-400 mb-5">
            <span>{wordSets.length} {wordSets.length === 1 ? 'набор' : wordSets.length < 5 ? 'набора' : 'наборов'}</span>
            <span className="text-gray-200">·</span>
            <span>{totalWords} {totalWords === 1 ? 'слово' : totalWords < 5 ? 'слова' : 'слов'}</span>
            {program.enrollment_count > 0 && (
              <>
                <span className="text-gray-200">·</span>
                <span>
                  {program.enrollment_count} {program.enrollment_count === 1 ? 'участник' : program.enrollment_count < 5 ? 'участника' : 'участников'}
                </span>
              </>
            )}
          </div>

          <button
            onClick={handleToggle}
            disabled={enrolling}
            className={`w-full text-sm font-semibold py-3 rounded-xl transition-all active:scale-[0.99] disabled:opacity-50 ${
              isEnrolled
                ? 'border border-gray-300 text-gray-500 hover:border-red-400 hover:text-red-600'
                : 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm'
            }`}
          >
            {enrolling ? '...' : isEnrolled ? 'Убрать из плана' : 'Добавить в план обучения'}
          </button>

          {isEnrolled && (
            <p className="text-xs text-center text-gray-400 mt-3">
              Наборы слов появятся в{' '}
              <Link href="/dashboard/lists" className="text-emerald-600 hover:underline">
                вашем списке
              </Link>
            </p>
          )}
        </div>

        {/* Word sets */}
        {wordSets.length > 0 && (
          <div className="flex flex-col gap-3">
            {wordSets.map((ws) => (
              <div key={ws.id} className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                {/* Set header */}
                <div className="px-4 py-3 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                  <span className="text-sm font-semibold text-gray-800">{ws.title}</span>
                  <span className="text-xs text-gray-400">{ws.words.length} сл.</span>
                </div>

                {/* Word table */}
                {ws.words.length > 0 ? (
                  <div className="divide-y divide-gray-50">
                    {/* Column headers */}
                    <div className="grid grid-cols-2 gap-2 px-4 py-2">
                      <span className="text-xs text-gray-400 font-medium">Литовский</span>
                      <span className="text-xs text-gray-400 font-medium">Перевод</span>
                    </div>
                    {ws.words.map((wp, i) => (
                      <div key={i} className="grid grid-cols-2 gap-2 px-4 py-2.5">
                        <span className="text-sm text-gray-900">{wp.front}</span>
                        <span className="text-sm text-gray-600">{wp.back_ru || wp.back_en}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-400 px-4 py-4 text-center">Нет слов</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
