'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { BACKEND_URL, getToken } from '../../../lib/api';
import { useT } from '../../../lib/useT';

interface UserRow {
  id: string;
  email: string;
  name: string;
  is_premium: boolean;
  premium_until: string | null;
  premium_active: boolean;
  is_admin: boolean;
  is_superadmin: boolean;
  sessions_today: number;
  daily_limit: number | null;
}

interface ReportRow {
  id: number;
  user_name: string;
  user_email: string;
  context: string | null;
  description: string;
  status: 'open' | 'resolved';
  created_at: string;
}

interface ArticleRow {
  id: number;
  slug: string;
  title_ru: string;
  title_en: string;
  tags: string[];
  published: boolean;
  created_at: string;
  updated_at: string;
}

interface SubcategoryRow {
  key: string;
  cefr_level: string | null;
  difficulty: string | null;
  article_url: string | null;
  article_name_ru: string | null;
  article_name_en: string | null;
}

type Tab = 'users' | 'reports' | 'articles' | 'lists';

export default function AdminPage() {
  const router = useRouter();
  const { tr, lang } = useT();
  const [tab, setTab] = useState<Tab>('users');
  const [users, setUsers] = useState<UserRow[]>([]);
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [articles, setArticles] = useState<ArticleRow[]>([]);
  const [subcategories, setSubcategories] = useState<SubcategoryRow[]>([]);
  const [editingListKey, setEditingListKey] = useState<string | null>(null);
  const [listDraft, setListDraft] = useState<{ cefr_level: string; difficulty: string; article_url: string; article_name_ru: string; article_name_en: string }>({ cefr_level: '', difficulty: '', article_url: '', article_name_ru: '', article_name_en: '' });
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [grantDate, setGrantDate] = useState('');
  const [saving, setSaving] = useState(false);
  const [isSuperadmin, setIsSuperadmin] = useState(false);
  const [importMsg, setImportMsg] = useState('');
  const importRef = useRef<HTMLInputElement>(null);

  function authHeaders() {
    const token = getToken();
    return { Authorization: `Bearer ${token}` };
  }

  function loadData() {
    const token = getToken();
    if (!token) { router.replace('/login'); return; }
    const headers = { Authorization: `Bearer ${token}` };
    Promise.all([
      fetch(`${BACKEND_URL}/api/admin/users`, { headers }),
      fetch(`${BACKEND_URL}/api/me/quota`, { headers }),
      fetch(`${BACKEND_URL}/api/admin/reports`, { headers }),
      fetch(`${BACKEND_URL}/api/admin/articles`, { headers }),
      fetch(`${BACKEND_URL}/api/admin/subcategories`, { headers }),
    ])
      .then(async ([usersRes, quotaRes, reportsRes, articlesRes, subcatsRes]) => {
        if (usersRes.status === 403 || usersRes.status === 401) { router.replace('/dashboard/lists'); return; }
        const [usersData, quotaData] = await Promise.all([usersRes.json(), quotaRes.json()]);
        setUsers(usersData);
        setIsSuperadmin(!!quotaData.is_superadmin);
        if (reportsRes.ok) setReports(await reportsRes.json());
        if (articlesRes.ok) setArticles(await articlesRes.json());
        if (subcatsRes.ok) setSubcategories(await subcatsRes.json());
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  useEffect(() => { loadData(); }, []);

  function startGrant(userId: string) {
    setEditingId(userId);
    setGrantDate('');
  }

  function cancelEdit() {
    setEditingId(null);
    setGrantDate('');
  }

  async function applyAdmin(userId: string, isAdmin: boolean) {
    setSaving(true);
    const token = getToken();
    await fetch(`${BACKEND_URL}/api/admin/users/${userId}/set-admin`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ is_admin: isAdmin }),
    }).catch(() => {});
    setSaving(false);
    loadData();
  }

  async function applyPremium(userId: string, isPremium: boolean, until: string | null) {
    setSaving(true);
    const token = getToken();
    await fetch(`${BACKEND_URL}/api/admin/users/${userId}/premium`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ is_premium: isPremium, premium_until: until ? `${until}T00:00:00` : null }),
    }).catch(() => {});
    setSaving(false);
    setEditingId(null);
    setGrantDate('');
    loadData();
  }

  async function resolveReport(id: number) {
    const token = getToken();
    await fetch(`${BACKEND_URL}/api/admin/reports/${id}/resolve`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}` },
    }).catch(() => {});
    loadData();
  }

  async function deleteReport(id: number) {
    if (!confirm(tr.admin.deleteConfirm)) return;
    const token = getToken();
    await fetch(`${BACKEND_URL}/api/admin/reports/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    }).catch(() => {});
    loadData();
  }

  async function deleteArticle(slug: string) {
    if (!confirm(tr.articles.deleteConfirm)) return;
    await fetch(`${BACKEND_URL}/api/admin/articles/${slug}`, {
      method: 'DELETE',
      headers: authHeaders(),
    }).catch(() => {});
    loadData();
  }

  async function exportArticle(slug: string) {
    const res = await fetch(`${BACKEND_URL}/api/admin/articles/${slug}/export`, {
      headers: authHeaders(),
    });
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${slug}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const form = new FormData();
    form.append('file', file);
    const res = await fetch(`${BACKEND_URL}/api/admin/articles/import`, {
      method: 'POST',
      headers: authHeaders(),
      body: form,
    });
    setImportMsg(res.ok ? tr.articles.importSuccess : tr.articles.importError);
    if (importRef.current) importRef.current.value = '';
    setTimeout(() => setImportMsg(''), 3000);
    if (res.ok) loadData();
  }

  function startEditSubcat(sc: SubcategoryRow) {
    setEditingListKey(sc.key);
    setListDraft({
      cefr_level: sc.cefr_level ?? '',
      difficulty: sc.difficulty ?? '',
      article_url: sc.article_url ?? '',
      article_name_ru: sc.article_name_ru ?? '',
      article_name_en: sc.article_name_en ?? '',
    });
  }

  async function saveSubcatMeta(key: string) {
    setSaving(true);
    await fetch(`${BACKEND_URL}/api/admin/subcategories/${encodeURIComponent(key)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({
        cefr_level: listDraft.cefr_level || null,
        difficulty: listDraft.difficulty || null,
        article_url: listDraft.article_url || null,
        article_name_ru: listDraft.article_name_ru || null,
        article_name_en: listDraft.article_name_en || null,
      }),
    }).catch(() => {});
    setSaving(false);
    setEditingListKey(null);
    loadData();
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const openReports = reports.filter((r) => r.status === 'open').length;

  return (
    <main className="bg-slate-50 text-gray-900 min-h-screen">
      <div className="pointer-events-none fixed inset-0 flex items-start justify-center overflow-hidden">
        <div className="w-full max-w-[600px] h-[400px] bg-emerald-100/40 blur-[120px] rounded-full mt-[-100px]" />
      </div>

      <div className="relative z-10 max-w-5xl mx-auto px-6 py-8">
        <h1 className="text-3xl font-bold mb-2">{tr.admin.title}</h1>
        <p className="text-gray-400 mb-6">{tr.admin.subtitle}</p>

        {/* Tabs */}
        <div className="flex gap-1 bg-gray-50 border border-gray-900 rounded-xl p-1 w-fit mb-8">
          <button
            onClick={() => setTab('users')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === 'users' ? 'bg-gray-100 text-gray-900' : 'text-gray-500 hover:text-gray-900'}`}
          >
            {tr.admin.tabUsers}
          </button>
          <button
            onClick={() => setTab('reports')}
            className={`relative px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === 'reports' ? 'bg-gray-100 text-gray-900' : 'text-gray-500 hover:text-gray-900'}`}
          >
            {tr.admin.tabReports}
            {openReports > 0 && (
              <span className="ml-1.5 inline-flex items-center justify-center w-4 h-4 text-[10px] font-bold bg-red-500 rounded-full">{openReports}</span>
            )}
          </button>
          <button
            onClick={() => setTab('articles')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === 'articles' ? 'bg-gray-100 text-gray-900' : 'text-gray-500 hover:text-gray-900'}`}
          >
            {tr.admin.tabArticles}
          </button>
          <button
            onClick={() => setTab('lists')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === 'lists' ? 'bg-gray-100 text-gray-900' : 'text-gray-500 hover:text-gray-900'}`}
          >
            {tr.admin.tabLists}
          </button>
        </div>

        {/* ── Users tab ── */}
        {tab === 'users' && (
          <div className="overflow-x-auto rounded-2xl border border-gray-900">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-900 text-gray-400 text-left">
                  <th className="px-4 py-3 font-medium">{tr.admin.colUser}</th>
                  <th className="px-4 py-3 font-medium">{tr.admin.colPlan}</th>
                  <th className="px-4 py-3 font-medium hidden sm:table-cell">{tr.admin.colPremiumUntil}</th>
                  <th className="px-4 py-3 font-medium hidden sm:table-cell">{tr.admin.colSessionsToday}</th>
                  <th className="px-4 py-3 font-medium">{tr.admin.colAction}</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-b border-gray-900 hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900 truncate max-w-[180px]">{u.name}</p>
                      <p className="text-gray-400 text-xs truncate max-w-[180px]">{u.email}</p>
                    </td>
                    <td className="px-4 py-3">
                      {u.is_superadmin ? (
                        <span className="text-xs font-semibold text-rose-600 bg-rose-50 border border-gray-900 rounded-full px-2 py-0.5">{tr.admin.superadmin}</span>
                      ) : u.is_admin ? (
                        <span className="text-xs font-semibold text-amber-600 bg-amber-50 border border-gray-900 rounded-full px-2 py-0.5">{tr.admin.adminBadge}</span>
                      ) : u.premium_active ? (
                        <span className="text-xs font-semibold text-emerald-600 bg-emerald-50 border border-gray-900 rounded-full px-2 py-0.5">{tr.admin.premium}</span>
                      ) : (
                        <span className="text-xs font-semibold text-gray-400 bg-white border border-gray-900 rounded-full px-2 py-0.5">{tr.admin.basic}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-400 hidden sm:table-cell">
                      {u.premium_until
                        ? new Date(u.premium_until).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' })
                        : u.premium_active ? '∞' : '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-400 hidden sm:table-cell">
                      {u.sessions_today} / {u.daily_limit ?? '∞'}
                    </td>
                    <td className="px-4 py-3">
                      {editingId === u.id ? (
                        <div className="flex items-center gap-2 flex-wrap">
                          <input
                            type="date"
                            value={grantDate}
                            onChange={(e) => setGrantDate(e.target.value)}
                            className="bg-gray-100 border border-gray-900 rounded-lg px-2 py-1 text-sm text-gray-900 outline-none focus:border-gray-900"
                          />
                          <button
                            onClick={() => applyPremium(u.id, true, grantDate || null)}
                            disabled={saving}
                            className="text-xs px-3 py-1.5 bg-gray-900 hover:bg-gray-800 rounded-lg font-medium text-white transition-colors disabled:opacity-50"
                          >
                            {saving ? '...' : tr.admin.save}
                          </button>
                          <button onClick={cancelEdit} className="text-xs px-2 py-1.5 text-gray-400 hover:text-gray-900 transition-colors">
                            {tr.admin.cancel}
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 flex-wrap">
                          {u.premium_active ? (
                            <button
                              onClick={() => applyPremium(u.id, false, null)}
                              className="text-xs px-3 py-1.5 text-red-600 hover:text-red-600 border border-gray-900 hover:border-gray-900 rounded-lg transition-colors"
                            >
                              {tr.admin.revoke}
                            </button>
                          ) : null}
                          <button
                            onClick={() => startGrant(u.id)}
                            className="text-xs px-3 py-1.5 text-emerald-600 hover:text-emerald-600 border border-gray-900 hover:border-gray-900 rounded-lg transition-colors"
                          >
                            {u.premium_active ? tr.admin.extend : tr.admin.grantPremium}
                          </button>
                          {isSuperadmin && !u.is_superadmin && (
                            <button
                              onClick={() => applyAdmin(u.id, !u.is_admin)}
                              disabled={saving}
                              className={`text-xs px-3 py-1.5 border rounded-lg transition-colors disabled:opacity-50 ${
                                u.is_admin
                                  ? 'text-amber-600 hover:text-amber-700 border-gray-900 hover:border-gray-900'
                                  : 'text-amber-500 hover:text-amber-600 border-amber-500/10 hover:border-gray-900'
                              }`}
                            >
                              {u.is_admin ? tr.admin.removeAdmin : tr.admin.makeAdmin}
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* ── Reports tab ── */}
        {tab === 'reports' && (
          <div className="flex flex-col gap-3">
            {reports.length === 0 && (
              <p className="text-gray-400 text-sm py-8 text-center">{tr.admin.noReports}</p>
            )}
            {reports.map((r) => (
              <div
                key={r.id}
                className={`rounded-2xl border p-4 transition-colors ${
                  r.status === 'resolved' ? 'border-gray-900 bg-white opacity-50' : 'border-gray-900 bg-gray-50'
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-medium text-gray-500 truncate">{r.user_name}</span>
                      <span className="text-gray-300 text-xs">·</span>
                      <span className="text-gray-400 text-xs">{new Date(r.created_at).toLocaleDateString('ru-RU')}</span>
                      {r.context && (
                        <>
                          <span className="text-gray-300 text-xs">·</span>
                          <span className="text-xs text-emerald-500 font-mono">{r.context}</span>
                        </>
                      )}
                    </div>
                    <p className="text-gray-900 text-sm">{r.description}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {r.status === 'open' && (
                      <button
                        onClick={() => resolveReport(r.id)}
                        className="text-xs px-3 py-1.5 text-emerald-600 hover:text-emerald-600 border border-gray-900 hover:border-gray-900 rounded-lg transition-colors"
                      >
                        {tr.admin.resolve}
                      </button>
                    )}
                    {r.status === 'resolved' && (
                      <span className="text-xs text-gray-300">{tr.admin.resolvedBadge}</span>
                    )}
                    {isSuperadmin && (
                      <button
                        onClick={() => deleteReport(r.id)}
                        className="text-xs px-3 py-1.5 text-red-500 hover:text-red-600 border border-gray-900 hover:border-gray-900 rounded-lg transition-colors"
                      >
                        {tr.admin.delete}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Lists tab ── */}
        {tab === 'lists' && (
          <div>
            {subcategories.length === 0 && (
              <p className="text-gray-400 text-sm py-8 text-center">{tr.admin.noLists}</p>
            )}
            <div className="flex flex-col gap-3">
              {subcategories.map((sc) => (
                <div key={sc.key} className="rounded-2xl border border-gray-900 bg-white px-4 py-3">
                  {editingListKey === sc.key ? (
                    <div className="flex flex-col gap-3">
                      <p className="font-medium text-gray-900 text-sm font-mono">{tr.lists.subcategories[sc.key] ?? sc.key}</p>
                      <div className="flex flex-wrap gap-3">
                        <div className="flex flex-col gap-1">
                          <label className="text-xs text-gray-400">{tr.admin.colCefr}</label>
                          <input
                            type="text"
                            value={listDraft.cefr_level}
                            onChange={(e) => setListDraft((d) => ({ ...d, cefr_level: e.target.value }))}
                            placeholder="A1, A1-A2, B1…"
                            className="bg-gray-50 border border-gray-900 rounded-lg px-3 py-1.5 text-sm text-gray-900 outline-none w-32"
                          />
                        </div>
                        <div className="flex flex-col gap-1">
                          <label className="text-xs text-gray-400">{tr.admin.colDifficulty}</label>
                          <select
                            value={listDraft.difficulty}
                            onChange={(e) => setListDraft((d) => ({ ...d, difficulty: e.target.value }))}
                            className="bg-gray-50 border border-gray-900 rounded-lg px-3 py-1.5 text-sm text-gray-900 outline-none"
                          >
                            {Object.entries(tr.admin.difficultyOptions).map(([val, label]) => (
                              <option key={val} value={val}>{label}</option>
                            ))}
                          </select>
                        </div>
                        <div className="flex flex-col gap-1 flex-1 min-w-[200px]">
                          <label className="text-xs text-gray-400">{tr.admin.colArticleUrl}</label>
                          <input
                            type="text"
                            value={listDraft.article_url}
                            onChange={(e) => setListDraft((d) => ({ ...d, article_url: e.target.value }))}
                            placeholder="/dashboard/articles/slug or https://…"
                            className="bg-gray-50 border border-gray-900 rounded-lg px-3 py-1.5 text-sm text-gray-900 outline-none w-full"
                          />
                        </div>
                        <div className="flex flex-col gap-1 min-w-[140px]">
                          <label className="text-xs text-gray-400">{tr.admin.colArticleName} RU</label>
                          <input
                            type="text"
                            value={listDraft.article_name_ru}
                            onChange={(e) => setListDraft((d) => ({ ...d, article_name_ru: e.target.value }))}
                            placeholder="Читать статью…"
                            className="bg-gray-50 border border-gray-900 rounded-lg px-3 py-1.5 text-sm text-gray-900 outline-none w-full"
                          />
                        </div>
                        <div className="flex flex-col gap-1 min-w-[140px]">
                          <label className="text-xs text-gray-400">{tr.admin.colArticleName} EN</label>
                          <input
                            type="text"
                            value={listDraft.article_name_en}
                            onChange={(e) => setListDraft((d) => ({ ...d, article_name_en: e.target.value }))}
                            placeholder="Read article…"
                            className="bg-gray-50 border border-gray-900 rounded-lg px-3 py-1.5 text-sm text-gray-900 outline-none w-full"
                          />
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => saveSubcatMeta(sc.key)}
                          disabled={saving}
                          className="text-xs px-3 py-1.5 bg-gray-900 hover:bg-gray-800 rounded-lg font-medium text-white transition-colors disabled:opacity-50"
                        >
                          {saving ? '...' : tr.admin.save}
                        </button>
                        <button
                          onClick={() => setEditingListKey(null)}
                          className="text-xs px-2 py-1.5 text-gray-400 hover:text-gray-900 transition-colors"
                        >
                          {tr.admin.cancel}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between gap-4 flex-wrap">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-gray-900">{tr.lists.subcategories[sc.key] ?? sc.key}</p>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          {sc.cefr_level && (
                            <span className="text-xs font-semibold px-2 py-0.5 rounded-full border border-gray-900 bg-blue-50 text-blue-700">{sc.cefr_level}</span>
                          )}
                          {sc.difficulty && (
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border border-gray-900 ${
                              sc.difficulty === 'easy' ? 'bg-emerald-50 text-emerald-700' :
                              sc.difficulty === 'medium' ? 'bg-amber-50 text-amber-700' :
                              'bg-red-50 text-red-700'
                            }`}>{tr.admin.difficultyOptions[sc.difficulty] ?? sc.difficulty}</span>
                          )}
                          {sc.article_url && (
                            <span className="text-xs text-gray-400 font-mono truncate max-w-[200px]">{sc.article_url}</span>
                          )}
                          {!sc.cefr_level && !sc.difficulty && !sc.article_url && (
                            <span className="text-xs text-gray-300">—</span>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={() => startEditSubcat(sc)}
                        className="text-xs px-3 py-1.5 border border-gray-900 rounded-lg text-emerald-600 hover:bg-gray-50 transition-colors shrink-0"
                      >
                        {tr.articles.editArticle}
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Articles tab ── */}
        {tab === 'articles' && (
          <div>
            <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
              <div className="flex items-center gap-2 flex-wrap">
                {importMsg && (
                  <span className="text-xs text-emerald-600 font-medium">{importMsg}</span>
                )}
                <label className="cursor-pointer text-xs px-3 py-2 border border-gray-900 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors">
                  {tr.articles.importArticle}
                  <input
                    ref={importRef}
                    type="file"
                    accept=".md"
                    className="hidden"
                    onChange={handleImport}
                  />
                </label>
                <Link
                  href="/dashboard/admin/articles/new/edit"
                  className="text-xs px-3 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors font-medium"
                >
                  + {tr.articles.newArticle}
                </Link>
              </div>
            </div>

            {articles.length === 0 && (
              <p className="text-gray-400 text-sm py-8 text-center">{tr.articles.noArticles}</p>
            )}

            <div className="flex flex-col gap-3">
              {articles.map((a) => {
                const title = lang === 'ru' ? a.title_ru : a.title_en;
                return (
                  <div
                    key={a.id}
                    className="flex items-center justify-between gap-4 rounded-2xl border border-gray-900 bg-white px-4 py-3"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-gray-900 truncate">{title}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full border border-gray-900 font-medium ${
                          a.published
                            ? 'bg-emerald-50 text-emerald-700'
                            : 'bg-gray-50 text-gray-400'
                        }`}>
                          {a.published ? tr.articles.published : tr.articles.draft}
                        </span>
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5 font-mono">{a.slug}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 flex-wrap">
                      <button
                        onClick={() => exportArticle(a.slug)}
                        className="text-xs px-3 py-1.5 border border-gray-900 rounded-lg text-gray-500 hover:text-gray-900 transition-colors"
                      >
                        {tr.articles.exportArticle}
                      </button>
                      <Link
                        href={`/dashboard/admin/articles/${a.slug}/edit`}
                        className="text-xs px-3 py-1.5 border border-gray-900 rounded-lg text-emerald-600 hover:bg-gray-50 transition-colors"
                      >
                        {tr.articles.editArticle}
                      </Link>
                      <button
                        onClick={() => deleteArticle(a.slug)}
                        className="text-xs px-3 py-1.5 border border-gray-900 rounded-lg text-red-500 hover:bg-gray-50 transition-colors"
                      >
                        {tr.articles.deleteArticle}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
