'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { BACKEND_URL, getToken } from '../../../lib/api';
import { useT } from '../../../lib/useT';

interface PracticeCategory {
  id: number;
  name_ru: string;
  name_en: string | null;
  description_ru: string | null;
  sort_order: number;
  test_count: number;
}

interface PracticeTest {
  id: number;
  title_ru: string;
  title_en: string | null;
  description_ru: string | null;
  description_en: string | null;
  question_count: number;
  pass_threshold: number;
  is_premium: boolean;
  active_question_count: number;
}

interface Question {
  id: number;
  question_ru: string;
  question_lt: string | null;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  correct_option: string;
  category: string | null;
}

interface ActiveTest {
  test: { id: number; title_ru: string; title_en: string | null; pass_threshold: number };
  questions: Question[];
}

type PageView = 'categories' | 'tests' | 'question' | 'result';
type Option = 'a' | 'b' | 'c' | 'd';

const OPTIONS: Option[] = ['a', 'b', 'c', 'd'];

function getOptionText(q: Question, opt: Option): string {
  return q[`option_${opt}` as keyof Question] as string;
}

export default function PracticePage() {
  const { tr, lang } = useT();
  const t = tr.practice;
  const router = useRouter();

  const [view, setView] = useState<PageView>('categories');
  const [isPremiumUser, setIsPremiumUser] = useState(false);

  // Category state
  const [categories, setCategories] = useState<PracticeCategory[]>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<PracticeCategory | null>(null);

  // Test list state
  const [tests, setTests] = useState<PracticeTest[]>([]);
  const [testsLoading, setTestsLoading] = useState(false);

  // Active exam state
  const [activeTest, setActiveTest] = useState<ActiveTest | null>(null);
  const [examLoading, setExamLoading] = useState(false);
  const [examError, setExamError] = useState('');

  // Question state
  const [current, setCurrent] = useState(0);
  const [selected, setSelected] = useState<Option | null>(null);
  const [answered, setAnswered] = useState(false);
  const [answers, setAnswers] = useState<(Option | null)[]>([]);

  useEffect(() => {
    const token = getToken();
    if (!token) { setCategoriesLoading(false); return; }
    const headers = { Authorization: `Bearer ${token}` };
    Promise.all([
      fetch(`${BACKEND_URL}/api/practice/categories`, { headers }),
      fetch(`${BACKEND_URL}/api/me/quota`, { headers }),
    ])
      .then(async ([catRes, quotaRes]) => {
        if (catRes.ok) setCategories(await catRes.json());
        if (quotaRes.ok) {
          const q = await quotaRes.json();
          setIsPremiumUser(!!q.premium_active);
        }
      })
      .catch((err) => console.error('API error:', err))
      .finally(() => setCategoriesLoading(false));
  }, []);

  async function loadTests(category: PracticeCategory) {
    setTestsLoading(true);
    setExamError('');
    const token = getToken();
    if (!token) { setTestsLoading(false); return; }
    const res = await fetch(`${BACKEND_URL}/api/practice/categories/${category.id}/tests`, {
      headers: { Authorization: `Bearer ${token}` },
    }).catch(() => null);
    setTestsLoading(false);
    if (res?.ok) setTests(await res.json());
  }

  function selectCategory(cat: PracticeCategory) {
    setSelectedCategory(cat);
    setView('tests');
    loadTests(cat);
  }

  async function startTest(test: PracticeTest) {
    if (test.is_premium && !isPremiumUser) {
      router.push('/dashboard/premium');
      return;
    }
    setExamLoading(true);
    setExamError('');
    const token = getToken();
    if (!token) { setExamError(t.constitution.noQuestions); setExamLoading(false); return; }
    const res = await fetch(`${BACKEND_URL}/api/practice/tests/${test.id}/exam`, {
      headers: { Authorization: `Bearer ${token}` },
    }).catch(() => null);
    setExamLoading(false);
    if (!res || !res.ok) { setExamError(t.constitution.noQuestions); return; }
    const data: ActiveTest = await res.json();
    if (!data.questions?.length) { setExamError(t.constitution.noQuestions); return; }
    setActiveTest(data);
    setAnswers(new Array(data.questions.length).fill(null));
    setCurrent(0);
    setSelected(null);
    setAnswered(false);
    setView('question');
  }

  function handleSubmit() {
    if (!selected || answered) return;
    const updated = [...answers];
    updated[current] = selected;
    setAnswers(updated);
    setAnswered(true);
  }

  async function handleNext() {
    if (!activeTest) return;
    if (current + 1 >= activeTest.questions.length) {
      const score = [...answers.slice(0, current), selected].filter(
        (a, i) => a === activeTest.questions[i]?.correct_option
      ).length;
      const total = activeTest.questions.length;
      const token = getToken();
      if (token) {
        await fetch(`${BACKEND_URL}/api/practice/tests/${activeTest.test.id}/results`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ score, total }),
        }).catch((err) => console.error('API error:', err));
      }
      setView('result');
    } else {
      setCurrent(current + 1);
      setSelected(null);
      setAnswered(false);
    }
  }

  function retry() {
    if (!activeTest) return;
    const test = tests.find((t) => t.id === activeTest.test.id);
    if (test) startTest(test);
  }

  function backToTests() {
    setView('tests');
    setActiveTest(null);
    setAnswers([]);
    setCurrent(0);
    setSelected(null);
    setAnswered(false);
    setExamError('');
  }

  function backToCategories() {
    setView('categories');
    setSelectedCategory(null);
    setTests([]);
    setExamError('');
  }

  const score = activeTest
    ? answers.filter((a, i) => a === activeTest.questions[i]?.correct_option).length
    : 0;

  const passThreshold = activeTest?.test.pass_threshold ?? 0.75;

  return (
    <main className="bg-slate-50 text-gray-900 min-h-screen">
      <div className="max-w-4xl mx-auto px-6 py-8">

        {/* Back navigation */}
        {view === 'categories' && (
          <Link href="/dashboard/lists" className="text-sm text-gray-400 hover:text-gray-700 transition-colors">
            ← На главную
          </Link>
        )}
        {view === 'tests' && (
          <button onClick={backToCategories} className="text-sm text-gray-400 hover:text-gray-700 transition-colors">
            {t.backToCategories}
          </button>
        )}
        {(view === 'question' || view === 'result') && (
          <button onClick={backToTests} className="text-sm text-gray-400 hover:text-gray-700 transition-colors">
            {t.backToTests}
          </button>
        )}

        {/* ── Categories view ─────────────────────────────────────────────── */}
        {view === 'categories' && (
          <>
            <div className="mt-4 mb-8">
              <h1 className="text-3xl font-bold">{t.title}</h1>
              <p className="text-gray-400 mt-1">{t.selectCategory}</p>
            </div>

            {categoriesLoading ? (
              <div className="flex justify-center py-16">
                <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : categories.length === 0 ? (
              <div className="border border-gray-900 rounded-2xl bg-white px-6 py-12 text-center text-gray-400">
                {t.constitution.noQuestions}
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {categories.map((cat) => {
                  const name = lang === 'en' ? (cat.name_en ?? cat.name_ru) : cat.name_ru;
                  return (
                    <button
                      key={cat.id}
                      onClick={() => selectCategory(cat)}
                      className="border border-gray-900 rounded-2xl bg-white px-6 py-5 text-left hover:bg-gray-50 transition-colors w-full"
                    >
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-gray-900">{name}</p>
                          {cat.description_ru && lang !== 'en' && (
                            <p className="text-sm text-gray-400 mt-0.5">{cat.description_ru}</p>
                          )}
                          <p className="text-xs text-gray-400 mt-1">
                            {cat.test_count === 0
                              ? <span className="text-amber-600 font-medium">{t.constitution.noQuestions}</span>
                              : `${cat.test_count} ${t.noTests.replace('пока нет.', '').replace('No ', '')}`}
                          </p>
                        </div>
                        <span className="text-gray-300 text-lg shrink-0">→</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* ── Tests view ──────────────────────────────────────────────────── */}
        {view === 'tests' && (
          <>
            <div className="mt-4 mb-8">
              <h1 className="text-3xl font-bold">
                {lang === 'en' ? (selectedCategory?.name_en ?? selectedCategory?.name_ru) : selectedCategory?.name_ru}
              </h1>
              <p className="text-gray-400 mt-1">Выберите тест для прохождения</p>
            </div>

            {testsLoading ? (
              <div className="flex justify-center py-16">
                <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : tests.length === 0 ? (
              <div className="border border-gray-900 rounded-2xl bg-white px-6 py-12 text-center">
                <p className="text-gray-400">{t.constitution.noQuestions}</p>
              </div>
            ) : (
              <div className="border border-gray-900 rounded-2xl overflow-hidden bg-white divide-y divide-gray-100">
                {tests.map((test) => {
                  const title = lang === 'en' ? (test.title_en ?? test.title_ru) : test.title_ru;
                  const desc = lang !== 'en' ? test.description_ru : null;
                  return (
                    <div key={test.id} className="px-6 py-4 flex items-center justify-between gap-4 hover:bg-gray-50 transition-colors">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-semibold text-gray-900">{title}</p>
                          {test.is_premium && (
                            <span className="text-[10px] px-2 py-0.5 bg-amber-50 border border-amber-300 text-amber-700 rounded-full font-semibold">
                              {t.premiumBadge}
                            </span>
                          )}
                        </div>
                        {desc && <p className="text-sm text-gray-400 mt-0.5 truncate">{desc}</p>}
                        <p className="text-xs text-gray-400 mt-1">
                          {test.active_question_count} {tr.adminPractice.questionsCount} · {Math.round(test.pass_threshold * 100)}% для сдачи
                        </p>
                        {examError && <p className="text-red-500 text-xs mt-1">{examError}</p>}
                      </div>
                      <button
                        onClick={() => startTest(test)}
                        disabled={examLoading}
                        className="shrink-0 px-5 py-2 bg-gray-900 text-white text-sm font-semibold rounded-xl hover:bg-gray-700 transition-colors disabled:opacity-50"
                      >
                        {examLoading ? '...' : test.is_premium && !isPremiumUser ? t.premiumLocked : t.startBtn}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* ── Question screen ──────────────────────────────────────────────── */}
        {view === 'question' && activeTest && activeTest.questions.length > 0 && (() => {
          const q = activeTest.questions[current];
          const correct = q.correct_option as Option;
          const title = lang === 'en' ? (activeTest.test.title_en ?? activeTest.test.title_ru) : activeTest.test.title_ru;

          return (
            <div className="flex flex-col gap-4 mt-6">
              {/* Progress card */}
              <div className="border border-gray-900 rounded-2xl overflow-hidden bg-white">
                <div className="px-6 py-3 border-b border-gray-100 flex items-center justify-between gap-4">
                  <span className="text-sm font-medium text-gray-700">{title}</span>
                  <div className="flex items-center gap-3">
                    {q.category && (
                      <span className="text-xs px-2 py-0.5 bg-amber-50 border border-amber-200 rounded-full text-amber-700">
                        {t.constitution.categoryLabels[q.category] ?? q.category}
                      </span>
                    )}
                    <span className="text-sm text-gray-400">
                      {t.constitution.questionOf.replace('{current}', String(current + 1)).replace('{total}', String(activeTest.questions.length))}
                    </span>
                  </div>
                </div>
                <div className="h-1 bg-gray-100">
                  <div
                    className="h-full bg-gray-900 transition-all duration-300"
                    style={{ width: `${((current + 1) / activeTest.questions.length) * 100}%` }}
                  />
                </div>
                <div className="px-6 py-5">
                  <p className="text-base font-semibold text-gray-900 leading-snug">{q.question_lt ?? q.question_ru}</p>
                </div>
              </div>

              {/* Options */}
              <div className="border border-gray-900 rounded-2xl overflow-hidden bg-white divide-y divide-gray-100">
                {OPTIONS.map((opt) => {
                  const text = getOptionText(q, opt);
                  let rowStyle = 'hover:bg-gray-50';
                  let labelStyle = 'border-gray-200 bg-gray-50 text-gray-500';
                  let textStyle = 'text-gray-900';

                  if (answered) {
                    if (opt === correct) {
                      rowStyle = 'bg-emerald-50';
                      labelStyle = 'border-emerald-400 bg-emerald-100 text-emerald-700';
                      textStyle = 'text-emerald-800 font-medium';
                    } else if (opt === selected) {
                      rowStyle = 'bg-red-50';
                      labelStyle = 'border-red-300 bg-red-100 text-red-600';
                      textStyle = 'text-red-700';
                    } else {
                      textStyle = 'text-gray-400';
                      labelStyle = 'border-gray-100 bg-gray-50 text-gray-300';
                    }
                  } else if (opt === selected) {
                    rowStyle = 'bg-gray-900';
                    labelStyle = 'border-gray-600 bg-gray-700 text-white';
                    textStyle = 'text-white';
                  }

                  return (
                    <button
                      key={opt}
                      onClick={() => !answered && setSelected(opt)}
                      disabled={answered}
                      className={`w-full flex items-center gap-4 px-6 py-4 text-left transition-colors ${rowStyle} disabled:cursor-default`}
                    >
                      <span className={`w-7 h-7 shrink-0 rounded-lg border flex items-center justify-center text-xs font-bold transition-colors ${labelStyle}`}>
                        {opt.toUpperCase()}
                      </span>
                      <span className={`text-sm transition-colors ${textStyle}`}>{text}</span>
                    </button>
                  );
                })}
              </div>

              {/* Action */}
              <div className="flex justify-end">
                {!answered ? (
                  <button
                    onClick={handleSubmit}
                    disabled={!selected}
                    className="px-6 py-2.5 bg-gray-900 text-white font-semibold rounded-xl hover:bg-gray-700 transition-colors disabled:opacity-40"
                  >
                    {t.constitution.submitBtn}
                  </button>
                ) : (
                  <button
                    onClick={handleNext}
                    className="px-6 py-2.5 bg-gray-900 text-white font-semibold rounded-xl hover:bg-gray-700 transition-colors"
                  >
                    {current + 1 >= activeTest.questions.length ? 'Завершить' : t.constitution.nextBtn}
                  </button>
                )}
              </div>
            </div>
          );
        })()}

        {/* ── Result screen ────────────────────────────────────────────────── */}
        {view === 'result' && activeTest && (
          <div className="flex flex-col gap-4 mt-6">
            {/* Score summary */}
            <div className="border border-gray-900 rounded-2xl overflow-hidden bg-white">
              <div className="px-6 py-5 flex flex-col sm:flex-row sm:items-center gap-4">
                <div className="flex-1">
                  <h2 className="text-xl font-bold text-gray-900">{t.constitution.resultTitle}</h2>
                  <p className="text-gray-500 mt-1 text-sm">
                    {t.constitution.resultScore.replace('{score}', String(score)).replace('{total}', String(activeTest.questions.length))}
                    {' '}— {Math.round((score / activeTest.questions.length) * 100)}%
                  </p>
                </div>
                <div className="flex items-center gap-3 flex-wrap">
                  <span className={`px-3 py-1 rounded-full text-sm font-semibold border border-gray-900 ${score / activeTest.questions.length >= passThreshold ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}>
                    {score / activeTest.questions.length >= passThreshold
                      ? `✓ Пройден (≥${Math.round(passThreshold * 100)}%)`
                      : `✗ Не пройден (<${Math.round(passThreshold * 100)}%)`}
                  </span>
                  <button
                    onClick={retry}
                    className="px-4 py-1.5 bg-gray-900 text-white text-sm font-semibold rounded-xl hover:bg-gray-700 transition-colors"
                  >
                    {t.constitution.retryBtn}
                  </button>
                </div>
              </div>
            </div>

            {/* Breakdown */}
            <div className="border border-gray-900 rounded-2xl overflow-hidden bg-white">
              <div className="px-6 py-3 bg-gray-50 border-b border-gray-900">
                <p className="text-sm font-semibold text-gray-700">Разбор ответов</p>
              </div>
              <div className="divide-y divide-gray-100">
                {activeTest.questions.map((q, i) => {
                  const userAns = answers[i];
                  const correct = q.correct_option as Option;
                  const isCorrect = userAns === correct;
                  return (
                    <div key={q.id} className={`px-6 py-4 ${isCorrect ? '' : 'bg-red-50/40'}`}>
                      <div className="flex items-start gap-3">
                        <span className={`mt-0.5 text-xs font-bold w-4 shrink-0 ${isCorrect ? 'text-emerald-600' : 'text-red-500'}`}>
                          {isCorrect ? '✓' : '✗'}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900">{q.question_lt ?? q.question_ru}</p>
                          {!isCorrect && (
                            <div className="mt-1.5 flex flex-col gap-0.5">
                              <p className="text-xs text-red-600">
                                {t.constitution.yourAnswer}{' '}
                                <span className="font-medium">
                                  {userAns ? `${userAns.toUpperCase()}. ${getOptionText(q, userAns)}` : '—'}
                                </span>
                              </p>
                              <p className="text-xs text-emerald-700">
                                {t.constitution.correctAnswer}{' '}
                                <span className="font-medium">{correct.toUpperCase()}. {getOptionText(q, correct)}</span>
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

      </div>
    </main>
  );
}
