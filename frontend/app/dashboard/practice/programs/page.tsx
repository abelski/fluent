'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { BACKEND_URL, getToken, enrollPracticeCategory, unenrollPracticeCategory } from '../../../../lib/api';
import { useT } from '../../../../lib/useT';

interface Category {
  id: number;
  name_ru: string;
  name_en: string | null;
  description_ru: string | null;
  test_count: number;
  enrolled: boolean;
}

export default function PracticeProgramsPage() {
  const { tr, lang } = useT();
  const t = tr.practice;
  const router = useRouter();

  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState<number | null>(null);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      router.replace('/login');
      return;
    }
    fetch(`${BACKEND_URL}/api/practice/categories`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => (r.ok ? r.json() : []))
      .then(setCategories)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [router]);

  async function toggleEnroll(cat: Category) {
    setToggling(cat.id);
    try {
      if (cat.enrolled) {
        await unenrollPracticeCategory(cat.id);
      } else {
        await enrollPracticeCategory(cat.id);
      }
      setCategories((prev) =>
        prev.map((c) => (c.id === cat.id ? { ...c, enrolled: !c.enrolled } : c))
      );
    } catch (err) {
      console.error(err);
    } finally {
      setToggling(null);
    }
  }

  return (
    <main className="bg-slate-50 text-gray-900 min-h-screen">
      <div className="max-w-4xl mx-auto px-6 py-8">
        <Link href="/dashboard/practice" className="text-sm text-gray-400 hover:text-gray-700 transition-colors">
          ← {t.backToCategories.replace('← ', '')}
        </Link>

        <div className="mt-4 mb-8">
          <h1 className="font-headline text-3xl font-bold">{t.allProgramsTitle}</h1>
          <p className="text-gray-400 mt-1">{t.allProgramsSubtitle}</p>
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : categories.length === 0 ? (
          <div className="border border-gray-900 rounded-2xl bg-white px-6 py-12 text-center text-gray-400">
            {t.noTests}
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {categories.map((cat) => {
              const name = lang === 'en' ? (cat.name_en ?? cat.name_ru) : cat.name_ru;
              const isToggling = toggling === cat.id;
              return (
                <div
                  key={cat.id}
                  className="border border-gray-900 rounded-2xl bg-white px-6 py-5"
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-gray-900">{name}</p>
                        {cat.enrolled && (
                          <span className="text-xs px-2 py-0.5 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-full font-medium">
                            {t.enrolledBadge}
                          </span>
                        )}
                      </div>
                      {cat.description_ru && lang !== 'en' && (
                        <p className="text-sm text-gray-400 mt-0.5">{cat.description_ru}</p>
                      )}
                      <p className="text-xs text-gray-400 mt-1">
                        {cat.test_count === 0
                          ? <span className="text-amber-600 font-medium">{t.noTests}</span>
                          : `${cat.test_count} тест${cat.test_count === 1 ? '' : cat.test_count < 5 ? 'а' : 'ов'}`}
                      </p>
                    </div>
                    <button
                      onClick={() => toggleEnroll(cat)}
                      disabled={isToggling}
                      className={`shrink-0 px-4 py-1.5 text-sm font-semibold rounded-xl border transition-colors disabled:opacity-50 ${
                        cat.enrolled
                          ? 'border-gray-300 text-gray-600 hover:border-red-300 hover:text-red-600 bg-white'
                          : 'bg-gray-900 text-white border-gray-900 hover:bg-gray-700'
                      }`}
                    >
                      {isToggling ? '...' : cat.enrolled ? t.unenrollBtn : t.enrollBtn}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
