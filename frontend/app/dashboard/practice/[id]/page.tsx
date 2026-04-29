'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { BACKEND_URL, getToken, resolvePracticeId } from '../../../../lib/api';
import { useT } from '../../../../lib/useT';

// --- Dialogue rendering helpers ---

function speakerColor(name: string): string {
  const palette = [
    'bg-indigo-100 text-indigo-700',
    'bg-emerald-100 text-emerald-700',
    'bg-rose-100 text-rose-700',
    'bg-amber-100 text-amber-700',
    'bg-violet-100 text-violet-700',
  ];
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) % palette.length;
  return palette[h];
}

const ANON_COLORS = [
  'bg-blue-50 border-blue-200 text-blue-900',
  'bg-slate-50 border-slate-200 text-slate-800',
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const InlineOnly = ({ children }: any) => <>{children}</>;

function DialogueText({ text }: { text: string }) {
  const lines = text.split('\n');
  let turn = -1;
  const lineData = lines.map((line) => {
    const dashMatch = line.match(/^—\s?(.*)/);
    const nameMatch = line.match(/^\*\*([^*]+):\*\*\s*(.*)/);
    const isDialogue = !!(dashMatch || nameMatch);
    if (isDialogue) turn++;
    return { line, dashMatch, nameMatch, turn };
  });

  return (
    <div className="flex flex-col gap-1.5">
      {lineData.map(({ line, dashMatch, nameMatch, turn: t }, i) => {
        if (line.trim() === '') return <div key={i} className="h-2" />;

        if (dashMatch) {
          const badge = t % 2 === 0
            ? 'bg-blue-200 text-blue-800'
            : 'bg-slate-200 text-slate-700';
          return (
            <div key={i} className={`px-3 py-2 rounded-lg border text-sm flex gap-2 items-start ${ANON_COLORS[t % 2]}`}>
              <span className={`shrink-0 mt-0.5 text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center ${badge}`}>
                {t % 2 === 0 ? 'A' : 'B'}
              </span>
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ p: InlineOnly }}>
                {dashMatch[1]}
              </ReactMarkdown>
            </div>
          );
        }

        if (nameMatch) {
          const colorCls = speakerColor(nameMatch[1]);
          return (
            <div key={i} className="flex items-start gap-2 px-3 py-2 text-sm text-gray-900">
              <span className={`shrink-0 mt-0.5 text-xs font-bold px-2 py-0.5 rounded-full ${colorCls}`}>
                {nameMatch[1]}
              </span>
              <span className="leading-relaxed">
                <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ p: InlineOnly }}>
                  {nameMatch[2]}
                </ReactMarkdown>
              </span>
            </div>
          );
        }

        return (
          <ReactMarkdown key={i} remarkPlugins={[remarkGfm]} components={{
            p: ({ children }) => <p className="text-sm text-gray-600 leading-relaxed">{children}</p>,
            strong: ({ children }) => <strong className="font-semibold text-gray-800">{children}</strong>,
          }}>
            {line}
          </ReactMarkdown>
        );
      })}
    </div>
  );
}

interface PracticeTest {
  id: number;
  title_ru: string;
  title_en: string | null;
  description_ru: string | null;
  description_en: string | null;
  lesson_text_lt: string | null;
  question_count: number;
  pass_threshold: number;
  is_premium: boolean;
  active_question_count: number;
  is_locked: boolean;
  best_score_pct: number | null;
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
  test: { id: number; title_ru: string; title_en: string | null; pass_threshold: number; lesson_text_lt: string | null };
  questions: Question[];
}

type PageView = 'tests' | 'reading' | 'question' | 'result';
type Option = 'a' | 'b' | 'c' | 'd';

const OPTIONS: Option[] = ['a', 'b', 'c', 'd'];

function getOptionText(q: Question, opt: Option): string {
  return q[`option_${opt}` as keyof Question] as string;
}

export default function PracticeCategoryPage() {
  const { id: _id } = useParams<{ id: string }>();
  const categoryId = resolvePracticeId(_id);
  const { tr, lang } = useT();
  const t = tr.practice;
  const router = useRouter();

  const [isPremiumUser, setIsPremiumUser] = useState(false);
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);

  // Tests list state
  const [tests, setTests] = useState<PracticeTest[]>([]);
  const [testsLoading, setTestsLoading] = useState(true);
  const [categoryName, setCategoryName] = useState('');
  const [categoryDescription, setCategoryDescription] = useState<string | null>(null);

  // Active exam state
  const [view, setView] = useState<PageView>('tests');
  const [activeTest, setActiveTest] = useState<ActiveTest | null>(null);
  const [pendingTest, setPendingTest] = useState<PracticeTest | null>(null);
  const [examLoading, setExamLoading] = useState(false);
  const [examError, setExamError] = useState('');

  // Question state
  const [current, setCurrent] = useState(0);
  const [selected, setSelected] = useState<Option | null>(null);
  const [answered, setAnswered] = useState(false);
  const [answers, setAnswers] = useState<(Option | null)[]>([]);

  const fetchTests = useCallback(() => {
    const token = getToken();
    if (!token) return;
    fetch(`${BACKEND_URL}/api/practice/categories/${categoryId}/tests`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { if (data) setTests(data); })
      .catch(console.error);
  }, [categoryId]);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      router.replace('/login');
      return;
    }
    const headers = { Authorization: `Bearer ${token}` };
    Promise.all([
      fetch(`${BACKEND_URL}/api/practice/categories/${categoryId}/tests`, { headers }),
      fetch(`${BACKEND_URL}/api/me/quota`, { headers }),
    ])
      .then(async ([testsRes, quotaRes]) => {
        if (testsRes.ok) {
          const data = await testsRes.json();
          setTests(data);
        }
        if (quotaRes.ok) {
          const q = await quotaRes.json();
          setIsPremiumUser(!!q.premium_active);
        }
      })
      .catch(console.error)
      .finally(() => setTestsLoading(false));

    // Fetch category name and source_url for the heading
    fetch(`${BACKEND_URL}/api/practice/categories`, { headers })
      .then((r) => (r.ok ? r.json() : []))
      .then((cats: { id: number; name_ru: string; name_en: string | null; description_ru: string | null; source_url: string | null }[]) => {
        const cat = cats.find((c) => String(c.id) === categoryId);
        if (cat) {
          setCategoryName(lang === 'en' ? (cat.name_en ?? cat.name_ru) : cat.name_ru);
          setSourceUrl(cat.source_url ?? null);
          setCategoryDescription(cat.description_ru ?? null);
        }
      })
      .catch(console.error);
  }, [categoryId, router, lang]);

  async function startExam(test: PracticeTest) {
    setExamLoading(true);
    setExamError('');
    const token = getToken();
    if (!token) {
      setExamError(t.constitution.noQuestions);
      setExamLoading(false);
      return;
    }
    const res = await fetch(`${BACKEND_URL}/api/practice/tests/${test.id}/exam`, {
      headers: { Authorization: `Bearer ${token}` },
    }).catch(() => null);
    setExamLoading(false);
    if (!res || !res.ok) {
      setExamError(t.constitution.noQuestions);
      return;
    }
    const data: ActiveTest = await res.json();
    if (!data.questions?.length) {
      setExamError(t.constitution.noQuestions);
      return;
    }
    setActiveTest(data);
    setAnswers(new Array(data.questions.length).fill(null));
    setCurrent(0);
    setSelected(null);
    setAnswered(false);
    setView('question');
  }

  function startTest(test: PracticeTest) {
    if (test.is_locked) return;
    if (test.is_premium && !isPremiumUser) {
      router.push('/dashboard/premium');
      return;
    }
    if (test.lesson_text_lt) {
      setPendingTest(test);
      setView('reading');
    } else {
      startExam(test);
    }
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
        }).catch(console.error);
        fetchTests(); // refresh lock state for next test
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
    setPendingTest(null);
    setAnswers([]);
    setCurrent(0);
    setSelected(null);
    setAnswered(false);
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
        {view === 'tests' && (
          <Link href="/dashboard/practice" className="text-sm text-gray-400 hover:text-gray-700 transition-colors">
            {t.backToCategories}
          </Link>
        )}
        {(view === 'reading' || view === 'question' || view === 'result') && (
          <button onClick={backToTests} className="text-sm text-gray-400 hover:text-gray-700 transition-colors">
            {t.backToTests}
          </button>
        )}

        {/* ── Tests view ──────────────────────────────────────────────────── */}
        {view === 'tests' && (
          <>
            <div className="mt-4 mb-6">
              <h1 className="text-3xl font-bold">{categoryName}</h1>
              {categoryDescription
                ? <p className="text-gray-600 mt-1">{categoryDescription}</p>
                : <p className="text-gray-400 mt-1">Выберите тест для прохождения</p>
              }
            </div>

            {/* Source URL callout (e.g. constitution link) */}
            {sourceUrl && (
              <div className="mb-6 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
                <span className="text-amber-600 text-base mt-0.5">📖</span>
                <p className="text-sm text-amber-800">
                  Перед прохождением тестов рекомендуем прочитать{' '}
                  <a
                    href={sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline font-semibold hover:text-amber-900"
                  >
                    Конституцию Литвы
                  </a>
                  .
                </p>
              </div>
            )}

            {testsLoading ? (
              <div className="flex justify-center py-16">
                <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : tests.length === 0 ? (
              <div className="border border-gray-900 rounded-2xl bg-white px-6 py-12 text-center">
                <p className="text-gray-400">{t.noTests}</p>
              </div>
            ) : (
              <div className="border border-gray-900 rounded-2xl overflow-hidden bg-white divide-y divide-gray-100">
                {tests.map((test) => {
                  const title = lang === 'en' ? (test.title_en ?? test.title_ru) : test.title_ru;
                  const desc = lang !== 'en' ? test.description_ru : null;
                  const locked = test.is_locked;
                  const scorePct = test.best_score_pct;
                  return (
                    <div
                      key={test.id}
                      className={`px-6 py-4 flex items-center justify-between gap-4 transition-colors ${locked ? 'opacity-40 bg-gray-50' : 'hover:bg-gray-50'}`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          {locked && (
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" className="text-gray-400 shrink-0">
                              <path d="M18 8h-1V6A5 5 0 007 6v2H6a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V10a2 2 0 00-2-2zm-6 9a2 2 0 110-4 2 2 0 010 4zm3.1-9H8.9V6a3.1 3.1 0 016.2 0v2z"/>
                            </svg>
                          )}
                          <p className="font-semibold text-gray-900">{title}</p>
                          {test.is_premium && (
                            <span className="text-[10px] px-2 py-0.5 bg-amber-50 border border-amber-300 text-amber-700 rounded-full font-semibold">
                              {t.premiumBadge}
                            </span>
                          )}
                          {test.lesson_text_lt && (
                            <span className="text-[10px] px-2 py-0.5 bg-blue-50 border border-blue-200 text-blue-700 rounded-full font-semibold">
                              📄 Текст
                            </span>
                          )}
                          {scorePct !== null && scorePct !== undefined && (
                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold border ${
                              scorePct >= test.pass_threshold
                                ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                                : 'bg-amber-50 border-amber-200 text-amber-700'
                            }`}>
                              {Math.round(scorePct * 100)}%
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
                        disabled={examLoading || locked}
                        className="shrink-0 px-5 py-2 bg-gray-900 text-white text-sm font-semibold rounded-xl hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {examLoading && !locked ? '...' : locked ? '🔒' : test.is_premium && !isPremiumUser ? t.premiumLocked : t.startBtn}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* ── Reading view ─────────────────────────────────────────────────── */}
        {view === 'reading' && pendingTest && (
          <div className="flex flex-col gap-4 mt-6">
            <div className="border border-gray-900 rounded-2xl overflow-hidden bg-white">
              <div className="px-6 py-3 border-b border-gray-100 flex items-center justify-between gap-4">
                <span className="text-sm font-medium text-gray-700">
                  {lang === 'en' ? (pendingTest.title_en ?? pendingTest.title_ru) : pendingTest.title_ru}
                </span>
                <span className="text-xs px-2 py-0.5 bg-blue-50 border border-blue-200 text-blue-700 rounded-full font-semibold">
                  Текст
                </span>
              </div>
              <div className="px-6 py-5 text-gray-800 leading-relaxed">
                <DialogueText text={pendingTest.lesson_text_lt ?? ''} />
              </div>
            </div>
            <div className="flex justify-end">
              <button
                onClick={() => startExam(pendingTest)}
                disabled={examLoading}
                className="px-6 py-2.5 bg-gray-900 text-white font-semibold rounded-xl hover:bg-gray-700 transition-colors disabled:opacity-40"
              >
                {examLoading ? '...' : 'Перейти к тесту →'}
              </button>
            </div>
          </div>
        )}

        {/* ── Question screen ──────────────────────────────────────────────── */}
        {view === 'question' && activeTest && activeTest.questions.length > 0 && (() => {
          const q = activeTest.questions[current];
          const correct = q.correct_option as Option;
          const title = lang === 'en' ? (activeTest.test.title_en ?? activeTest.test.title_ru) : activeTest.test.title_ru;

          return (
            <div className="flex flex-col gap-4 mt-6">
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

              <div className="border border-gray-900 rounded-2xl overflow-hidden bg-white divide-y divide-gray-100">
                {OPTIONS.filter((opt) => getOptionText(q, opt).trim() !== '').map((opt) => {
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
        {view === 'result' && activeTest && (() => {
          const passed = score / activeTest.questions.length >= passThreshold;
          const currentIdx = tests.findIndex((t) => t.id === activeTest.test.id);
          const nextTest = passed && currentIdx >= 0 && currentIdx + 1 < tests.length
            ? tests[currentIdx + 1]
            : null;
          return (
          <div className="flex flex-col gap-4 mt-6">
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
                  <span className={`px-3 py-1 rounded-full text-sm font-semibold border border-gray-900 ${passed ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}>
                    {passed
                      ? `✓ Пройден (≥${Math.round(passThreshold * 100)}%)`
                      : `✗ Не пройден (<${Math.round(passThreshold * 100)}%)`}
                  </span>
                  {nextTest && (
                    <button
                      onClick={() => startTest(nextTest)}
                      className="px-4 py-1.5 bg-emerald-600 text-white text-sm font-semibold rounded-xl hover:bg-emerald-500 transition-colors"
                    >
                      Следующий тест →
                    </button>
                  )}
                  <button
                    onClick={retry}
                    className="px-4 py-1.5 bg-gray-900 text-white text-sm font-semibold rounded-xl hover:bg-gray-700 transition-colors"
                  >
                    {t.constitution.retryBtn}
                  </button>
                </div>
              </div>
            </div>

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
        );
        })()}

      </div>
    </main>
  );
}
