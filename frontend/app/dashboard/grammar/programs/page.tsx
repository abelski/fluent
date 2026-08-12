'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  getToken,
  getGrammarPrograms,
  enrollGrammarProgram,
  type GrammarProgramSummary,
} from '../../../../lib/api';
import { useT } from '../../../../lib/useT';
import PageMascot from '../../../../components/PageMascot';
import TakChevron from '../../../../components/TakChevron';
import PageShell from '../../components/PageShell';

const DIFFICULTY_COLORS: Record<number, string> = {
  1: 'bg-emerald-100 text-emerald-700',
  2: 'bg-amber-100 text-amber-700',
  3: 'bg-red-100 text-red-700',
};

export default function GrammarProgramsPage() {
  const router = useRouter();
  const { tr } = useT();
  const [programs, setPrograms] = useState<GrammarProgramSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [enrolling, setEnrolling] = useState<Set<number>>(new Set());
  const difficultyLabels: Record<number, string> = {
    1: tr.admin.difficultyOptions['easy'],
    2: tr.admin.difficultyOptions['medium'],
    3: tr.admin.difficultyOptions['hard'],
  };

  useEffect(() => {
    if (!getToken()) {
      router.push('/login');
      return;
    }
    getGrammarPrograms()
      .then(setPrograms)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [router]);

  async function handleEnroll(programId: number) {
    if (!getToken()) { router.push('/login'); return; }
    setEnrolling((s) => new Set(s).add(programId));
    try {
      await enrollGrammarProgram(programId);
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
    <PageShell>
        <div className="flex items-center gap-3 mb-1">
          <Link
            href="/dashboard/grammar"
            className="text-gray-400 hover:text-gray-700 transition-colors text-sm"
          >
            <TakChevron direction="left" size={10} className="inline-block align-[-1px] mr-1" />{tr.grammar.programsBack}
          </Link>
        </div>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-[32px] font-bold mb-1.5">{tr.grammar.programsTitle}</h1>
            <p className="text-[15px] text-muted mb-4">{tr.grammar.programsSubtitle}</p>
          </div>
          <PageMascot phrase="Pasirinkime!" className="hidden sm:block shrink-0" />
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : programs.length === 0 ? (
          <p className="text-gray-400 text-center py-12">{tr.grammar.programsEmpty}</p>
        ) : (
          <div className="space-y-3">
            {programs.map((p) => (
              <div
                key={p.id}
                className="bg-white border border-line rounded-[14px] p-4"
                data-testid="grammar-program-card"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-headline font-semibold text-gray-900 truncate">
                        {p.title}
                      </h3>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${DIFFICULTY_COLORS[p.difficulty] ?? 'bg-gray-100 text-gray-500'}`}>
                        {difficultyLabels[p.difficulty] ?? ''}
                      </span>
                      {p.enrolled && (
                        <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-teal-50 text-teal-700 border border-teal-200" data-testid="enrolled-badge">
                          {tr.programs.enrolledBadge}
                        </span>
                      )}
                    </div>
                    {p.description && (
                      <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{p.description}</p>
                    )}
                    <p className="text-xs text-gray-400 mt-1">36 {tr.grammar.statsLessonsUnit}</p>
                  </div>

                  {!p.enrolled && (
                    <button
                      onClick={() => handleEnroll(p.id)}
                      disabled={enrolling.has(p.id)}
                      data-testid="enroll-button"
                      className="shrink-0 px-4 py-2 rounded-xl text-sm font-medium bg-gray-100 text-gray-700 hover:bg-teal-50 hover:text-teal-700 transition-colors disabled:opacity-50"
                    >
                      {enrolling.has(p.id) ? '...' : tr.programs.addBtn}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
    </PageShell>
  );
}
