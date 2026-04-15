'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import {
  BACKEND_URL,
  getToken,
  enrollProgram,
  unenrollProgram,
  getCommunityPrograms,
  enrollCustomProgram,
  unenrollCustomProgram,
  deleteCustomProgram,
  getCustomProgramEnrollments,
  type CustomProgramSummary,
  type CustomProgramEnrollment,
} from '../../lib/api';
import { useT } from '../../lib/useT';

interface WordListSummary {
  id: number;
  subcategory: string | null;
  word_count: number;
}

interface SubcategoryMeta {
  cefr_level: string | null;
  difficulty: string | null;
  name_ru: string | null;
  name_en: string | null;
  article_url: string | null;
  article_name_ru: string | null;
  article_name_en: string | null;
  enrollment_count?: number;
}

interface ProgramCard {
  key: string;
  name: string;
  meta: SubcategoryMeta;
  wordCount: number;
  listCount: number;
  enrollmentCount: number;
}

type Tab = 'catalog' | 'community';

function BookIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 12c2.7 0 5-2.3 5-5s-2.3-5-5-5-5 2.3-5 5 2.3 5 5 5zm0 2c-3.3 0-10 1.7-10 5v2h20v-2c0-3.3-6.7-5-10-5z"/>
    </svg>
  );
}

function PencilIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14H6L5 6" />
      <path d="M10 11v6M14 11v6" />
      <path d="M9 6V4h6v2" />
    </svg>
  );
}

function ShareIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
      <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
      <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
    </svg>
  );
}

export default function ProgramsPage() {
  const { tr, plural, lang } = useT();

  // ── tab state (read from URL) ──────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<Tab>('catalog');
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('tab') === 'community') setActiveTab('community');
    }
  }, []);

  // ── catalog (official programs) ───────────────────────────────────────────
  const [programs, setPrograms] = useState<ProgramCard[]>([]);
  const [enrolledKeys, setEnrolledKeys] = useState<Set<string>>(new Set());
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogPending, setCatalogPending] = useState<Set<string>>(new Set());

  // ── community (custom programs) ───────────────────────────────────────────
  const [communityPrograms, setCommunityPrograms] = useState<CustomProgramSummary[]>([]);
  const [communityEnrollments, setCommunityEnrollments] = useState<Set<number>>(new Set());
  const [communityLoading, setCommunityLoading] = useState(true);
  const [communityPending, setCommunityPending] = useState<Set<number>>(new Set());
  const [isRedactor, setIsRedactor] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [shareTarget, setShareTarget] = useState<CustomProgramSummary | null>(null);

  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<CustomProgramSummary | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  // ── load catalog data ─────────────────────────────────────────────────────
  useEffect(() => {
    const token = getToken();
    setIsLoggedIn(!!token);
    const authHeaders: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {};

    Promise.all([
      fetch(`${BACKEND_URL}/api/lists`, { headers: authHeaders })
        .then((r) => (r.ok ? r.json() : []))
        .catch(() => []),
      fetch(`${BACKEND_URL}/api/subcategory-meta`, { headers: authHeaders })
        .then((r) => (r.ok ? r.json() : {}))
        .catch(() => ({})),
      token
        ? fetch(`${BACKEND_URL}/api/me/programs`, { headers: { Authorization: `Bearer ${token}` } })
            .then((r) => (r.ok ? r.json() : []))
            .catch(() => [])
        : Promise.resolve([]),
    ]).then(([listsData, metaData, enrolledData]: [WordListSummary[], Record<string, SubcategoryMeta>, string[]]) => {
      const enrolled = new Set<string>(Array.isArray(enrolledData) ? enrolledData : []);
      setEnrolledKeys(enrolled);

      const countMap: Record<string, { wordCount: number; listCount: number }> = {};
      for (const list of (Array.isArray(listsData) ? listsData : [])) {
        const key = list.subcategory ?? '';
        if (!key) continue;
        if (!countMap[key]) countMap[key] = { wordCount: 0, listCount: 0 };
        countMap[key].wordCount += list.word_count;
        countMap[key].listCount += 1;
      }

      const cards: ProgramCard[] = Object.entries(metaData)
        .filter(([key]) => countMap[key])
        .map(([key, meta]) => ({
          key,
          name: (lang === 'en' ? meta.name_en : meta.name_ru) ?? key,
          meta,
          wordCount: countMap[key]?.wordCount ?? 0,
          listCount: countMap[key]?.listCount ?? 0,
          enrollmentCount: meta.enrollment_count ?? 0,
        }))
        .sort((a, b) => b.enrollmentCount - a.enrollmentCount);

      setPrograms(cards);
    }).finally(() => setCatalogLoading(false));
  }, []);

  // ── load community data ───────────────────────────────────────────────────
  const loadCommunity = useCallback(async () => {
    setCommunityLoading(true);
    const token = getToken();
    try {
      const [communityData, enrollmentsData] = await Promise.all([
        getCommunityPrograms(),
        token ? getCustomProgramEnrollments() : Promise.resolve([] as CustomProgramEnrollment[]),
      ]);
      setCommunityPrograms(communityData);
      setCommunityEnrollments(new Set((enrollmentsData as CustomProgramEnrollment[]).map((e) => e.id)));

      if (token) {
        fetch(`${BACKEND_URL}/api/me/quota`, { headers: { Authorization: `Bearer ${token}` } })
          .then((r) => r.ok ? r.json() : {})
          .then((data: { is_redactor?: boolean; is_admin?: boolean; is_superadmin?: boolean; user_id?: string }) => {
            setIsRedactor(!!data.is_redactor);
            setIsAdmin(!!(data.is_admin || data.is_superadmin));
            if (data.user_id) setCurrentUserId(data.user_id);
          })
          .catch(() => {});
      }
    } finally {
      setCommunityLoading(false);
    }
  }, []);

  useEffect(() => { loadCommunity(); }, [loadCommunity]);

  // ── handlers ──────────────────────────────────────────────────────────────
  async function handleCatalogToggle(key: string) {
    setCatalogPending((p) => new Set(p).add(key));
    try {
      if (enrolledKeys.has(key)) {
        await unenrollProgram(key);
        setEnrolledKeys((prev) => { const next = new Set(prev); next.delete(key); return next; });
      } else {
        await enrollProgram(key);
        setEnrolledKeys((prev) => new Set(prev).add(key));
      }
    } catch (err) {
      console.error(err);
    } finally {
      setCatalogPending((p) => { const next = new Set(p); next.delete(key); return next; });
    }
  }

  async function handleCommunityToggle(prog: CustomProgramSummary) {
    if (!isLoggedIn) { window.location.href = `${BACKEND_URL}/api/auth/google`; return; }
    setCommunityPending((p) => new Set(p).add(prog.id));
    try {
      if (communityEnrollments.has(prog.id)) {
        await unenrollCustomProgram(prog.id);
        setCommunityEnrollments((prev) => { const next = new Set(prev); next.delete(prog.id); return next; });
        setCommunityPrograms((prev) => prev.map((p) => p.id === prog.id ? { ...p, enrollment_count: Math.max(0, p.enrollment_count - 1) } : p));
      } else {
        await enrollCustomProgram(prog.share_token);
        setCommunityEnrollments((prev) => new Set(prev).add(prog.id));
        setCommunityPrograms((prev) => prev.map((p) => p.id === prog.id ? { ...p, enrollment_count: p.enrollment_count + 1 } : p));
      }
    } catch (err) {
      console.error(err);
    } finally {
      setCommunityPending((p) => { const next = new Set(p); next.delete(prog.id); return next; });
    }
  }

  async function handleDeleteProgram() {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError('');
    try {
      await deleteCustomProgram(deleteTarget.id);
      setCommunityPrograms((prev) => prev.filter((p) => p.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Ошибка удаления');
    } finally {
      setDeleting(false);
    }
  }

  function handleCopyShare(prog: CustomProgramSummary) {
    setShareTarget(prog);
    setCopiedToken(null);
  }

  async function handleCopyShareUrl(url: string, token: string) {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(url);
      } else {
        const ta = document.createElement('textarea');
        ta.value = url;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setCopiedToken(token);
      setTimeout(() => setCopiedToken(null), 2000);
    } catch {
      // clipboard unavailable — user can manually copy from the input
    }
  }

  const difficultyColors: Record<string, string> = {
    easy: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    medium: 'bg-amber-50 text-amber-700 border-amber-200',
    hard: 'bg-red-50 text-red-700 border-red-200',
  };

  return (
    <>
    <main className="bg-[#F5F5F7] min-h-screen text-gray-900">
      <div className="max-w-4xl mx-auto px-6 py-8">
        <div className="mb-6">
          <Link href="/dashboard/lists" className="text-sm text-gray-400 hover:text-gray-700 transition-colors">
            ← {tr.common.backToLists}
          </Link>
        </div>

        <h1 className="text-3xl font-bold mb-2">{tr.programs.title}</h1>
        <p className="text-gray-500 mb-6 text-sm">{tr.programs.subtitle}</p>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 bg-white rounded-xl p-1 w-fit border border-gray-100">
          <button
            onClick={() => setActiveTab('catalog')}
            className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all ${
              activeTab === 'catalog'
                ? 'bg-gray-900 text-white shadow-sm'
                : 'text-gray-500 hover:text-gray-800'
            }`}
          >
            Каталог
          </button>
          <button
            onClick={() => setActiveTab('community')}
            className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all ${
              activeTab === 'community'
                ? 'bg-gray-900 text-white shadow-sm'
                : 'text-gray-500 hover:text-gray-800'
            }`}
          >
            Сообщество
          </button>
        </div>

        {/* ── Catalog tab ────────────────────────────────────────────────── */}
        {activeTab === 'catalog' && (
          <>
            {catalogLoading ? (
              <div className="flex justify-center py-20">
                <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : programs.length === 0 ? (
              <p className="text-gray-400 text-center py-20">Нет доступных программ</p>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {programs.map((prog) => {
                  const isEnrolled = enrolledKeys.has(prog.key);
                  const isPending = catalogPending.has(prog.key);
                  const displayName = (lang === 'en' ? prog.meta.name_en : prog.meta.name_ru) ?? prog.key;
                  return (
                    <div
                      key={prog.key}
                      className="bg-white rounded-2xl p-5 hover:shadow-md transition-all active:scale-[0.98] border border-gray-100 flex flex-col gap-4"
                    >
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 bg-emerald-50 rounded-xl flex items-center justify-center text-emerald-600 shadow-sm shrink-0">
                          <BookIcon />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <h2 className="font-semibold text-gray-900 leading-tight">{displayName}</h2>
                            {isEnrolled && (
                              <span className="shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                                {tr.programs.enrolledBadge}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                            {prog.meta.cefr_level && (
                              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                                {prog.meta.cefr_level}
                              </span>
                            )}
                            {prog.meta.difficulty && (
                              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${difficultyColors[prog.meta.difficulty] ?? 'bg-gray-50 text-gray-500 border-gray-200'}`}>
                                {tr.admin.difficultyOptions[prog.meta.difficulty] ?? prog.meta.difficulty}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 text-sm text-gray-400 flex-wrap">
                        <span>{prog.wordCount} {plural(prog.wordCount, tr.programs.wordsCount)}</span>
                        <span className="text-gray-200">·</span>
                        <span>{prog.listCount} {prog.listCount === 1 ? 'набор' : prog.listCount < 5 ? 'набора' : 'наборов'}</span>
                        {prog.enrollmentCount > 0 && (
                          <>
                            <span className="text-gray-200">·</span>
                            <span className="flex items-center gap-1">
                              <UserIcon />
                              {tr.programs.enrolledCount.replace('{n}', String(prog.enrollmentCount))}
                            </span>
                          </>
                        )}
                      </div>

                      {prog.meta.article_url && (
                        <a
                          href={prog.meta.article_url}
                          target={prog.meta.article_url.startsWith('http') ? '_blank' : undefined}
                          rel={prog.meta.article_url.startsWith('http') ? 'noopener noreferrer' : undefined}
                          className="text-xs text-emerald-600 hover:text-emerald-800 hover:underline truncate"
                          onClick={(e) => e.stopPropagation()}
                        >
                          📖 {(lang === 'en' ? prog.meta.article_name_en : prog.meta.article_name_ru) ?? prog.meta.article_url}
                        </a>
                      )}

                      <div className="flex items-center justify-between mt-1">
                        <Link
                          href={`/programs/${prog.key}`}
                          className="text-sm text-gray-400 hover:text-emerald-600 transition-colors font-medium"
                        >
                          {tr.programs.details} →
                        </Link>
                        <button
                          onClick={() => {
                            if (!isLoggedIn) { window.location.href = `${BACKEND_URL}/api/auth/google`; return; }
                            handleCatalogToggle(prog.key);
                          }}
                          disabled={isPending}
                          className={`text-sm font-semibold px-5 py-2 rounded-full transition-all active:scale-95 disabled:opacity-50 ${
                            isEnrolled
                              ? 'border border-gray-300 text-gray-500 hover:border-red-400 hover:text-red-600'
                              : 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm shadow-emerald-600/20'
                          }`}
                        >
                          {isPending ? '...' : isEnrolled ? tr.programs.removeBtn : tr.programs.addBtn}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* ── Community tab ──────────────────────────────────────────────── */}
        {activeTab === 'community' && (
          <>
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm text-gray-400">
                Программы, созданные участниками сообщества
              </p>
              {isRedactor && (
                <Link
                  href="/dashboard/programs/new"
                  className="text-sm font-semibold px-5 py-2 rounded-full bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm shadow-emerald-600/20 transition-all active:scale-95"
                >
                  + Создать программу
                </Link>
              )}
            </div>

            {communityLoading ? (
              <div className="flex justify-center py-20">
                <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : communityPrograms.length === 0 ? (
              <div className="text-center py-20">
                <p className="text-gray-400 mb-4">Пока нет программ от сообщества</p>
                {isRedactor && (
                  <Link
                    href="/dashboard/programs/new"
                    className="text-sm font-semibold px-6 py-2.5 rounded-full bg-emerald-600 text-white hover:bg-emerald-700 transition-all"
                  >
                    Создать первую программу
                  </Link>
                )}
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {communityPrograms.map((prog) => {
                  const isEnrolled = communityEnrollments.has(prog.id);
                  const isPending = communityPending.has(prog.id);
                  const isOwner = currentUserId === prog.created_by || isAdmin;
                  return (
                    <div
                      key={prog.id}
                      className="bg-white rounded-2xl p-5 hover:shadow-md transition-all border border-gray-100 flex flex-col gap-4"
                    >
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 bg-purple-50 rounded-xl flex items-center justify-center text-purple-600 shadow-sm shrink-0">
                          <BookIcon />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <Link
                              href={`/programs/custom/${prog.share_token}`}
                              className="font-semibold text-gray-900 leading-tight hover:text-emerald-700 transition-colors"
                            >
                              {prog.title}
                            </Link>
                            <div className="flex items-center gap-1 shrink-0">
                              {isEnrolled && (
                                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                                  В плане
                                </span>
                              )}
                              {isOwner && (
                                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 border border-purple-200">
                                  Моя
                                </span>
                              )}
                            </div>
                          </div>
                          {prog.description && (
                            <p className="text-xs text-gray-500 mt-1 line-clamp-2">{prog.description}</p>
                          )}
                          <p className="text-xs text-gray-400 mt-1 flex items-center gap-1">
                            <UserIcon /> {prog.author_name ?? 'Автор'}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 text-sm text-gray-400 flex-wrap">
                        <span>{prog.list_ids.length} {prog.list_ids.length === 1 ? 'набор' : prog.list_ids.length < 5 ? 'набора' : 'наборов'}</span>
                        {prog.enrollment_count > 0 && (
                          <>
                            <span className="text-gray-200">·</span>
                            <span className="flex items-center gap-1">
                              <UserIcon />
                              {prog.enrollment_count} {prog.enrollment_count === 1 ? 'участник' : prog.enrollment_count < 5 ? 'участника' : 'участников'}
                            </span>
                          </>
                        )}
                      </div>

                      <div className="flex items-center justify-between mt-1 gap-2">
                        <div className="flex items-center gap-2">
                          {/* View link */}
                          <Link
                            href={`/programs/custom/${prog.share_token}`}
                            className="text-sm text-gray-400 hover:text-emerald-600 transition-colors font-medium"
                          >
                            Посмотреть →
                          </Link>
                          {/* Share link button */}
                          <button
                            onClick={() => handleCopyShare(prog)}
                            title="Скопировать ссылку"
                            className="p-2 rounded-full border border-gray-200 text-gray-400 hover:text-emerald-600 hover:border-emerald-300 transition-all"
                          >
                            {copiedToken === prog.share_token ? (
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="20 6 9 17 4 12" />
                              </svg>
                            ) : (
                              <ShareIcon />
                            )}
                          </button>
                          {/* Author / admin controls */}
                          {isOwner && (
                            <>
                              {currentUserId === prog.created_by && (
                                <Link
                                  href={`/dashboard/programs/${prog.id}/edit`}
                                  className="p-2 rounded-full border border-gray-200 text-gray-400 hover:text-blue-600 hover:border-blue-300 transition-all"
                                  title="Редактировать"
                                >
                                  <PencilIcon />
                                </Link>
                              )}
                              <button
                                onClick={() => setDeleteTarget(prog)}
                                className="p-2 rounded-full border border-gray-200 text-gray-400 hover:text-red-600 hover:border-red-300 transition-all"
                                title="Удалить"
                              >
                                <TrashIcon />
                              </button>
                            </>
                          )}
                        </div>

                        <button
                          onClick={() => handleCommunityToggle(prog)}
                          disabled={isPending}
                          className={`text-sm font-semibold px-5 py-2 rounded-full transition-all active:scale-95 disabled:opacity-50 ${
                            isEnrolled
                              ? 'border border-gray-300 text-gray-500 hover:border-red-400 hover:text-red-600'
                              : 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm shadow-emerald-600/20'
                          }`}
                        >
                          {isPending ? '...' : isEnrolled ? 'Убрать' : 'Добавить'}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </main>

    {/* Delete confirmation modal */}

    {deleteTarget && (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
        onClick={() => { if (!deleting) { setDeleteTarget(null); setDeleteError(''); } }}
      >
        <div
          className="bg-white rounded-2xl p-6 shadow-xl w-full max-w-sm mx-4 flex flex-col gap-4"
          onClick={(e) => e.stopPropagation()}
        >
          <div>
            <h2 className="text-lg font-bold text-gray-900 mb-1">Удалить программу?</h2>
            <p className="text-sm text-gray-500 leading-relaxed">
              «{deleteTarget.title}» будет удалена безвозвратно. Все участники потеряют доступ.
            </p>
            {deleteError && (
              <p className="text-sm text-red-600 mt-2">{deleteError}</p>
            )}
          </div>
          <div className="flex gap-3 justify-end">
            <button
              onClick={() => { setDeleteTarget(null); setDeleteError(''); }}
              disabled={deleting}
              className="px-4 py-2 text-sm font-semibold text-gray-600 border border-gray-200 rounded-xl hover:border-gray-400 transition-colors disabled:opacity-50"
            >
              Отмена
            </button>
            <button
              onClick={handleDeleteProgram}
              disabled={deleting}
              className="px-4 py-2 text-sm font-semibold text-white bg-red-600 rounded-xl hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {deleting && <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />}
              {deleting ? 'Удаление...' : 'Удалить'}
            </button>
          </div>
        </div>
      </div>
    )}

    {/* Share modal */}
    {shareTarget && (() => {
      const shareUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}/programs/custom/${shareTarget.share_token}`;
      return (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
          onClick={() => setShareTarget(null)}
        >
          <div
            className="bg-white rounded-2xl p-6 shadow-xl w-full max-w-sm mx-4 flex flex-col gap-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <h2 className="text-lg font-bold text-gray-900 mb-1">Поделиться программой</h2>
                <p className="text-sm text-gray-500">«{shareTarget.title}»</p>
              </div>
              <button
                onClick={() => setShareTarget(null)}
                className="text-gray-400 hover:text-gray-700 transition-colors p-1 -mt-1 -mr-1"
                aria-label="Закрыть"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <div className="flex gap-2">
              <input
                readOnly
                value={shareUrl}
                className="flex-1 text-sm bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-gray-700 select-all outline-none focus:border-emerald-400"
                onFocus={(e) => e.target.select()}
              />
              <button
                onClick={() => handleCopyShareUrl(shareUrl, shareTarget.share_token)}
                className="shrink-0 px-4 py-2 text-sm font-semibold rounded-xl transition-colors bg-emerald-600 text-white hover:bg-emerald-700"
              >
                {copiedToken === shareTarget.share_token ? 'Скопировано!' : 'Копировать'}
              </button>
            </div>
          </div>
        </div>
      );
    })()}
    </>
  );
}
