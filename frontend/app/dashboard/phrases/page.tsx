'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  BACKEND_URL,
  getToken,
  getPhrasePrograms,
  enrollPhraseProgram,
  unenrollPhraseProgram,
  type PhraseProgramSummary,
} from '../../../lib/api';

interface Quota {
  premium_active: boolean;
  sessions_today: number;
  daily_limit: number | null;
}

const DIFFICULTY_LABELS: Record<number, string> = { 1: 'Лёгкий', 2: 'Средний', 3: 'Сложный' };
const DIFFICULTY_COLORS: Record<number, string> = {
  1: 'bg-emerald-100 text-emerald-700',
  2: 'bg-amber-100 text-amber-700',
  3: 'bg-red-100 text-red-700',
};

export default function PhrasesPage() {
  const router = useRouter();
  const [programs, setPrograms] = useState<PhraseProgramSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [quota, setQuota] = useState<Quota | null>(null);
  const [enrolling, setEnrolling] = useState<Set<number>>(new Set());
  const [confirmUnenroll, setConfirmUnenroll] = useState<number | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState<boolean | null>(null);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      setIsLoggedIn(false);
      setLoading(false);
      return;
    }
    setIsLoggedIn(true);

    getPhrasePrograms()
      .then(setPrograms)
      .catch(console.error)
      .finally(() => setLoading(false));

    fetch(`${BACKEND_URL}/api/me/quota`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then(setQuota)
      .catch(console.error);
  }, []);

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

  async function handleUnenroll(programId: number) {
    setEnrolling((s) => new Set(s).add(programId));
    try {
      await unenrollPhraseProgram(programId);
      setPrograms((prev) =>
        prev.map((p) => (p.id === programId ? { ...p, enrolled: false, stage_distribution: null } : p))
      );
    } catch (e) {
      console.error(e);
    } finally {
      setEnrolling((s) => { const n = new Set(s); n.delete(programId); return n; });
      setConfirmUnenroll(null);
    }
  }

  const limitReached = quota && !quota.premium_active && quota.daily_limit !== null && quota.sessions_today >= quota.daily_limit;

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!isLoggedIn) {
    return (
      <main className="min-h-screen bg-slate-50 flex flex-col items-center justify-center px-6 py-12">
        <p className="text-gray-600 mb-4">Войдите, чтобы изучать фразы.</p>
        <Link href="/login" className="bg-emerald-600 text-white px-5 py-2.5 rounded-xl text-sm font-medium hover:bg-emerald-700 transition-colors">
          Войти
        </Link>
      </main>
    );
  }

  const enrolledPrograms = programs.filter((p) => p.enrolled);
  const availablePrograms = programs.filter((p) => !p.enrolled);

  return (
    <main className="min-h-screen bg-slate-50 text-gray-900 flex flex-col items-center px-4 py-10" data-testid="phrases-page">
      <div className="pointer-events-none fixed inset-0 flex items-start justify-center overflow-hidden">
        <div className="w-full max-w-[600px] h-[400px] bg-emerald-100/40 blur-[120px] rounded-full mt-[-100px]" />
      </div>

      <div className="relative z-10 w-full max-w-xl">
        <h1 className="text-2xl font-bold mb-1">Фразы</h1>
        <p className="text-gray-500 text-sm mb-6">Изучайте литовские фразы шаг за шагом</p>

        {/* Quota banner */}
        {quota && (
          <div className={`mb-6 px-4 py-3 rounded-xl text-sm flex items-center justify-between gap-3 ${limitReached ? 'bg-amber-50 border border-amber-200 text-amber-800' : 'bg-white border border-gray-100 text-gray-600'}`}>
            <span>
              {limitReached
                ? `Дневной лимит достигнут (${quota.sessions_today}/${quota.daily_limit}). Попробуйте завтра или перейдите на Premium.`
                : `Сессий сегодня: ${quota.sessions_today}${quota.daily_limit ? `/${quota.daily_limit}` : ''}`}
            </span>
            {limitReached && (
              <Link href="/pricing" className="shrink-0 text-xs font-medium text-amber-700 hover:underline">
                Premium →
              </Link>
            )}
          </div>
        )}

        {/* Enrolled programs */}
        {enrolledPrograms.length > 0 && (
          <section className="mb-8">
            <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">Мои программы</h2>
            <div className="space-y-3">
              {enrolledPrograms.map((p) => (
                <ProgramCard
                  key={p.id}
                  program={p}
                  limitReached={!!limitReached}
                  enrolling={enrolling.has(p.id)}
                  onUnenroll={() => setConfirmUnenroll(p.id)}
                />
              ))}
            </div>
          </section>
        )}

        {/* Available programs */}
        {availablePrograms.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
              {enrolledPrograms.length > 0 ? 'Другие программы' : 'Доступные программы'}
            </h2>
            <div className="space-y-3">
              {availablePrograms.map((p) => (
                <ProgramCard
                  key={p.id}
                  program={p}
                  limitReached={!!limitReached}
                  enrolling={enrolling.has(p.id)}
                  onEnroll={() => handleEnroll(p.id)}
                />
              ))}
            </div>
          </section>
        )}

        {programs.length === 0 && (
          <p className="text-gray-400 text-center py-12">Программы фраз скоро появятся.</p>
        )}
      </div>

      {/* Unenroll confirm dialog */}
      {confirmUnenroll !== null && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center px-4">
          <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full">
            <h3 className="font-semibold text-gray-900 mb-2">Убрать программу?</h3>
            <p className="text-sm text-gray-500 mb-5">Программа исчезнет из списка. Ваш прогресс сохранится.</p>
            <div className="flex gap-3">
              <button
                onClick={() => handleUnenroll(confirmUnenroll)}
                className="flex-1 bg-red-500 text-white py-2.5 rounded-xl text-sm font-medium hover:bg-red-600 transition-colors"
              >
                Убрать
              </button>
              <button
                onClick={() => setConfirmUnenroll(null)}
                className="flex-1 bg-gray-100 text-gray-700 py-2.5 rounded-xl text-sm font-medium hover:bg-gray-200 transition-colors"
              >
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function StageBar({ dist, total }: { dist: { stage0: number; stage1: number; stage2: number } | null; total: number }) {
  if (!dist || total === 0) return null;
  const mastered = dist.stage2;
  const learning = dist.stage1;
  const newCount = dist.stage0;
  return (
    <div className="mt-3">
      <div className="flex h-1.5 rounded-full overflow-hidden gap-0.5">
        <div className="bg-emerald-500 transition-all" style={{ width: `${(mastered / total) * 100}%` }} />
        <div className="bg-amber-400 transition-all" style={{ width: `${(learning / total) * 100}%` }} />
        <div className="bg-gray-200 transition-all" style={{ width: `${(newCount / total) * 100}%` }} />
      </div>
      <div className="flex gap-4 mt-1.5 text-xs text-gray-400">
        <span><span className="text-emerald-600 font-medium">{mastered}</span> освоено</span>
        <span><span className="text-amber-500 font-medium">{learning}</span> изучается</span>
        <span><span className="font-medium">{newCount}</span> новых</span>
      </div>
    </div>
  );
}

function ProgramCard({
  program,
  limitReached,
  enrolling,
  onEnroll,
  onUnenroll,
}: {
  program: PhraseProgramSummary;
  limitReached: boolean;
  enrolling: boolean;
  onEnroll?: () => void;
  onUnenroll?: () => void;
}) {
  const DIFFICULTY_LABELS: Record<number, string> = { 1: 'Лёгкий', 2: 'Средний', 3: 'Сложный' };
  const DIFFICULTY_COLORS: Record<number, string> = {
    1: 'bg-emerald-100 text-emerald-700',
    2: 'bg-amber-100 text-amber-700',
    3: 'bg-red-100 text-red-700',
  };

  return (
    <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm" data-testid="phrase-program-card">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-gray-900 truncate">{program.title}</h3>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${DIFFICULTY_COLORS[program.difficulty] ?? 'bg-gray-100 text-gray-500'}`}>
              {DIFFICULTY_LABELS[program.difficulty] ?? ''}
            </span>
          </div>
          {program.description && (
            <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{program.description}</p>
          )}
          <p className="text-xs text-gray-400 mt-1">{program.phrase_count} фраз</p>
          {program.enrolled && (
            <StageBar dist={program.stage_distribution} total={program.phrase_count} />
          )}
        </div>

        <div className="flex flex-col gap-2 shrink-0">
          {program.enrolled ? (
            <>
              <Link
                href={`/dashboard/phrases/${program.id}/study`}
                data-testid="study-button"
                className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                  limitReached
                    ? 'bg-gray-100 text-gray-400 pointer-events-none'
                    : 'bg-emerald-600 text-white hover:bg-emerald-700'
                }`}
                title={limitReached ? 'Дневной лимит сессий достигнут' : undefined}
              >
                Учить
              </Link>
              <button
                onClick={onUnenroll}
                className="px-4 py-2 rounded-xl text-xs text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
              >
                Убрать
              </button>
            </>
          ) : (
            <button
              onClick={onEnroll}
              disabled={enrolling}
              data-testid="enroll-button"
              className="px-4 py-2 rounded-xl text-sm font-medium bg-gray-100 text-gray-700 hover:bg-emerald-50 hover:text-emerald-700 transition-colors disabled:opacity-50"
            >
              {enrolling ? '...' : 'Добавить'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
