'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { BACKEND_URL, getToken } from '../../../lib/api';
import { useT } from '../../../lib/useT';
import PageMascot from '../../../components/PageMascot';
import PageShell from '../components/PageShell';
import ProgressStatCard from '../components/ProgressStatCard';

interface EnrolledCategory {
  id: number;
  name_ru: string;
  name_en: string | null;
  description_ru: string | null;
  test_count: number;
  tests_passed: number;
  tests_total: number;
}

export default function PracticePage() {
  const { tr, lang, plural } = useT();
  const t = tr.practice;
  const router = useRouter();

  const [categories, setCategories] = useState<EnrolledCategory[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      router.replace('/login');
      return;
    }
    fetch(`${BACKEND_URL}/api/me/practice-categories`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => (r.ok ? r.json() : []))
      .then(setCategories)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [router]);

  const hasCategories = categories.length > 0;
  const totalPassed = categories.reduce((s, c) => s + c.tests_passed, 0);
  const totalTests = categories.reduce((s, c) => s + c.tests_total, 0);

  return (
    <PageShell>
        {/* Stats card — rendered above the title, matching /dashboard/lists and
            /dashboard/phrases (see tests/stats-card-alignment.spec.ts). */}
        {!loading && hasCategories && (
          <div className="mb-10">
            <ProgressStatCard
              theme="emerald"
              icon={<PageMascot phrase="Pasirinkime!" className="shrink-0" />}
              count={totalPassed}
              label={t.statsPassed}
              countBadge={`${t.statsOf} ${totalTests}`}
              milestone={{
                pct: totalTests > 0 ? (totalPassed / totalTests) * 100 : 0,
                caption: `${categories.length} ${plural(categories.length, t.categoriesPlural)}`,
              }}
              testId="stats-card-practice"
            />
          </div>
        )}

        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-[32px] font-bold mb-1.5">{t.title}</h1>
            <p className="text-[15px] text-muted mb-4">{t.selectCategory}</p>
          </div>
          {/* The mascot lives in the hero card once it renders (has enrolled
              categories); loading/empty states have no hero, so it stays beside
              the title to keep exactly one mascot on screen at all times. */}
          {(loading || !hasCategories) && (
            <PageMascot phrase="Pasirinkime!" className="hidden sm:block shrink-0" />
          )}
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : !hasCategories ? (
          <div className="border border-line rounded-[14px] bg-white px-6 py-12 text-center">
            <p className="text-gray-400 mb-4">{t.emptyTitle}</p>
            <Link
              href="/dashboard/practice/programs"
              className="inline-block px-5 py-2.5 bg-emerald-600 text-white text-sm font-semibold rounded-full hover:bg-emerald-700 transition-colors shadow-sm shadow-emerald-600/20"
            >
              {t.emptyLink}
            </Link>
          </div>
        ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {categories.map((cat) => {
                const name = lang === 'en' ? (cat.name_en ?? cat.name_ru) : cat.name_ru;
                const progressPct = cat.tests_total > 0 ? (cat.tests_passed / cat.tests_total) * 100 : 0;
                const allPassed = cat.tests_total > 0 && cat.tests_passed === cat.tests_total;
                return (
                  <Link
                    key={cat.id}
                    href={`/dashboard/practice/${cat.id}`}
                    className="relative bg-white border border-line rounded-xl p-5 flex flex-col gap-4 hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-gray-900">{name}</p>
                        {cat.description_ru && lang !== 'en' && (
                          <p className="text-sm text-gray-400 mt-0.5">{cat.description_ru}</p>
                        )}
                      </div>
                      <span className="text-gray-300 text-lg shrink-0">→</span>
                    </div>

                    {cat.tests_total > 0 ? (
                      <div className="flex flex-col gap-1.5 mt-auto">
                        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${allPassed ? 'bg-emerald-500' : 'bg-amber-400'}`}
                            style={{ width: `${progressPct}%` }}
                          />
                        </div>
                        <p className={`text-xs ${allPassed ? 'text-emerald-600 font-medium' : 'text-gray-400'}`}>
                          {cat.tests_passed}/{cat.tests_total} тест{cat.tests_total === 1 ? '' : cat.tests_total < 5 ? 'а' : 'ов'} пройдено
                        </p>
                      </div>
                    ) : (
                      <p className="text-xs text-amber-600 font-medium mt-auto">{t.noTests}</p>
                    )}
                  </Link>
                );
              })}
            </div>
        )}

        {/* See all programs link */}
        <div className="mt-8 text-center">
          <Link
            href="/dashboard/practice/programs"
            className="text-sm text-emerald-600 hover:text-emerald-700 transition-colors"
          >
            {t.browseProgramsLink}
          </Link>
        </div>
    </PageShell>
  );
}
