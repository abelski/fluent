'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { BACKEND_URL, getToken } from '../../../lib/api';
import { useT } from '../../../lib/useT';

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
  const { tr, lang } = useT();
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

  return (
    <main className="bg-slate-50 text-gray-900 min-h-screen">
      <div className="max-w-4xl mx-auto px-6 py-8">
        <Link href="/dashboard/lists" className="text-sm text-gray-400 hover:text-gray-700 transition-colors">
          ← На главную
        </Link>

        <div className="mt-4 mb-8">
          <h1 className="text-3xl font-bold">{t.title}</h1>
          <p className="text-gray-400 mt-1">{t.selectCategory}</p>
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : categories.length === 0 ? (
          <div className="border border-gray-900 rounded-2xl bg-white px-6 py-12 text-center">
            <p className="text-gray-400 mb-4">{t.emptyTitle}</p>
            <Link
              href="/dashboard/practice/programs"
              className="inline-block px-5 py-2 bg-gray-900 text-white text-sm font-semibold rounded-xl hover:bg-gray-700 transition-colors"
            >
              {t.emptyLink}
            </Link>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {categories.map((cat) => {
              const name = lang === 'en' ? (cat.name_en ?? cat.name_ru) : cat.name_ru;
              const progressPct = cat.tests_total > 0 ? (cat.tests_passed / cat.tests_total) * 100 : 0;
              const allPassed = cat.tests_total > 0 && cat.tests_passed === cat.tests_total;
              return (
                <button
                  key={cat.id}
                  onClick={() => router.push(`/dashboard/practice/${cat.id}`)}
                  className="border border-gray-900 rounded-2xl bg-white px-6 py-5 text-left hover:bg-gray-50 transition-colors w-full"
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-900">{name}</p>
                      {cat.description_ru && lang !== 'en' && (
                        <p className="text-sm text-gray-400 mt-0.5">{cat.description_ru}</p>
                      )}
                      <p className="text-xs text-gray-400 mt-1">
                        {cat.tests_total === 0
                          ? <span className="text-amber-600 font-medium">{t.noTests}</span>
                          : <span className={allPassed ? 'text-emerald-600 font-medium' : ''}>
                              {cat.tests_passed}/{cat.tests_total} тест{cat.tests_total === 1 ? '' : cat.tests_total < 5 ? 'а' : 'ов'} пройдено
                            </span>}
                      </p>
                      {cat.tests_total > 0 && (
                        <div className="mt-2 h-1 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${allPassed ? 'bg-emerald-500' : 'bg-amber-400'}`}
                            style={{ width: `${progressPct}%` }}
                          />
                        </div>
                      )}
                    </div>
                    <span className="text-gray-300 text-lg shrink-0">→</span>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* See all programs button */}
        <div className="mt-8 text-center">
          <Link
            href="/dashboard/practice/programs"
            className="text-sm text-gray-500 hover:text-gray-900 transition-colors"
          >
            {t.browseProgramsLink}
          </Link>
        </div>
      </div>
    </main>
  );
}
