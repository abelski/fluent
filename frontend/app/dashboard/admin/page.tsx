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
  name_ru: string | null;
  name_en: string | null;
}

type Area = 'admin' | 'content';
type AdminSubTab = 'users' | 'reports';
type ContentSubTab = 'articles' | 'vocabularies';

interface ContentList {
  id: number;
  title: string;
  title_en: string | null;
  description: string | null;
  description_en: string | null;
  subcategory: string | null;
  sort_order: number;
  word_count: number;
}

interface ContentWord {
  id: number;
  item_id: number;
  lithuanian: string;
  translation_en: string;
  translation_ru: string;
  hint: string | null;
  position: number;
}

interface EditingWord {
  id: number;
  item_id: number;
  lithuanian: string;
  translation_en: string;
  translation_ru: string;
  hint: string;
}

function ListMetaEditForm({
  list,
  onSave,
  onCancel,
}: {
  list: ContentList;
  onSave: (titleRu: string, titleEn: string | null) => void;
  onCancel: () => void;
}) {
  const { tr } = useT();
  const [titleRu, setTitleRu] = useState(list.title);
  const [titleEn, setTitleEn] = useState(list.title_en ?? '');
  const [saving, setSaving] = useState(false);

  function authHeaders() {
    const token = getToken();
    return { Authorization: `Bearer ${token}` };
  }

  async function handleSave() {
    if (!titleRu.trim()) return;
    setSaving(true);
    const res = await fetch(`${BACKEND_URL}/api/admin/content/word-lists/${list.id}/meta`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ title_ru: titleRu.trim(), title_en: titleEn.trim() || null }),
    }).catch(() => null);
    setSaving(false);
    if (res?.ok) onSave(titleRu.trim(), titleEn.trim() || null);
  }

  return (
    <div className="bg-blue-50 border-t border-gray-900 px-5 py-3 flex flex-col gap-2">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-400">{tr.admin.contentFieldTitleRu}</label>
          <input
            value={titleRu}
            onChange={(e) => setTitleRu(e.target.value)}
            className="bg-white border border-gray-900 rounded-lg px-2 py-1 text-xs text-gray-900 outline-none"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-400">{tr.admin.contentFieldTitleEn}</label>
          <input
            value={titleEn}
            onChange={(e) => setTitleEn(e.target.value)}
            className="bg-white border border-gray-900 rounded-lg px-2 py-1 text-xs text-gray-900 outline-none"
          />
        </div>
      </div>
      <div className="flex gap-2 justify-end">
        <button onClick={onCancel} className="text-xs text-gray-400 hover:text-gray-900 px-3 py-1 border border-gray-900 rounded-lg transition-colors">{tr.admin.cancel}</button>
        <button onClick={handleSave} disabled={saving} className="text-xs bg-gray-900 text-white px-3 py-1 rounded-lg disabled:opacity-50 transition-colors">{tr.admin.save}</button>
      </div>
    </div>
  );
}

export default function AdminPage() {
  const router = useRouter();
  const { tr, lang } = useT();
  const [area, setArea] = useState<Area>('admin');
  const [adminTab, setAdminTab] = useState<AdminSubTab>('users');
  const [contentTab, setContentTab] = useState<ContentSubTab>('articles');
  const [users, setUsers] = useState<UserRow[]>([]);
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [articles, setArticles] = useState<ArticleRow[]>([]);
  const [subcategories, setSubcategories] = useState<SubcategoryRow[]>([]);
  const [editingListKey, setEditingListKey] = useState<string | null>(null);
  const [listDraft, setListDraft] = useState<{ cefr_level: string; difficulty: string; article_url: string; article_name_ru: string; article_name_en: string; name_ru: string; name_en: string }>({ cefr_level: '', difficulty: '', article_url: '', article_name_ru: '', article_name_en: '', name_ru: '', name_en: '' });
  const [contentLists, setContentLists] = useState<ContentList[]>([]);
  const [expandedSubcats, setExpandedSubcats] = useState<Set<string>>(new Set());
  const [expandedLists, setExpandedLists] = useState<Set<number>>(new Set());
  const [listWords, setListWords] = useState<Record<number, ContentWord[]>>({});
  const [editingWord, setEditingWord] = useState<EditingWord | null>(null);
  const [wordSaving, setWordSaving] = useState(false);
  const [editingListId, setEditingListId] = useState<number | null>(null);
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
      fetch(`${BACKEND_URL}/api/admin/content/word-lists`, { headers }),
    ])
      .then(async ([usersRes, quotaRes, reportsRes, articlesRes, subcatsRes, contentRes]) => {
        if (usersRes.status === 403 || usersRes.status === 401) { router.replace('/dashboard/lists'); return; }
        const [usersData, quotaData] = await Promise.all([usersRes.json(), quotaRes.json()]);
        setUsers(usersData);
        setIsSuperadmin(!!quotaData.is_superadmin);
        if (reportsRes.ok) setReports(await reportsRes.json());
        if (articlesRes.ok) setArticles(await articlesRes.json());
        if (subcatsRes.ok) setSubcategories(await subcatsRes.json());
        if (contentRes.ok) setContentLists(await contentRes.json());
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  async function loadListWords(listId: number) {
    const res = await fetch(`${BACKEND_URL}/api/admin/content/word-lists/${listId}/words`, {
      headers: authHeaders(),
    });
    if (res.ok) {
      const words = await res.json();
      setListWords((prev) => ({ ...prev, [listId]: words }));
    }
  }

  function toggleExpandList(listId: number) {
    setExpandedLists((prev) => {
      const next = new Set(prev);
      if (next.has(listId)) {
        next.delete(listId);
      } else {
        next.add(listId);
        if (!listWords[listId]) loadListWords(listId);
      }
      return next;
    });
  }

  function toggleExpandSubcat(key: string) {
    setExpandedSubcats((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  function getContentSubcats(): string[] {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const l of contentLists) {
      const key = l.subcategory ?? 'other';
      if (!seen.has(key)) { seen.add(key); result.push(key); }
    }
    return result;
  }

  async function moveSubcat(key: string, dir: -1 | 1) {
    const subcats = getContentSubcats();
    const idx = subcats.indexOf(key);
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= subcats.length) return;
    const swapped = [...subcats];
    [swapped[idx], swapped[newIdx]] = [swapped[newIdx], swapped[idx]];
    const body = swapped.map((k, i) => ({ key: k, sort_order: i }));
    await fetch(`${BACKEND_URL}/api/admin/content/subcategories/reorder`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify(body),
    });
    loadData();
  }

  async function moveList(listId: number, subcatKey: string, dir: -1 | 1) {
    const lists = contentLists.filter((l) => (l.subcategory ?? 'other') === subcatKey);
    const idx = lists.findIndex((l) => l.id === listId);
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= lists.length) return;
    const swapped = [...lists];
    [swapped[idx], swapped[newIdx]] = [swapped[newIdx], swapped[idx]];
    const body = swapped.map((l, i) => ({ id: l.id, sort_order: i }));
    await fetch(`${BACKEND_URL}/api/admin/content/word-lists/reorder`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify(body),
    });
    loadData();
  }

  async function moveWord(listId: number, itemId: number, dir: -1 | 1) {
    const words = listWords[listId] ?? [];
    const idx = words.findIndex((w) => w.item_id === itemId);
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= words.length) return;
    const swapped = [...words];
    [swapped[idx], swapped[newIdx]] = [swapped[newIdx], swapped[idx]];
    const body = swapped.map((w, i) => ({ item_id: w.item_id, position: i }));
    await fetch(`${BACKEND_URL}/api/admin/content/word-lists/${listId}/words/reorder`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify(body),
    });
    setListWords((prev) => ({
      ...prev,
      [listId]: swapped.map((w, i) => ({ ...w, position: i })),
    }));
  }

  function startEditWord(word: ContentWord) {
    setEditingWord({
      id: word.id,
      item_id: word.item_id,
      lithuanian: word.lithuanian,
      translation_en: word.translation_en,
      translation_ru: word.translation_ru,
      hint: word.hint ?? '',
    });
  }

  async function saveWord() {
    if (!editingWord) return;
    setWordSaving(true);
    const res = await fetch(`${BACKEND_URL}/api/admin/content/words/${editingWord.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({
        lithuanian: editingWord.lithuanian,
        translation_en: editingWord.translation_en,
        translation_ru: editingWord.translation_ru,
        hint: editingWord.hint || null,
      }),
    }).catch(() => null);
    setWordSaving(false);
    if (res?.ok) {
      setListWords((prev) => {
        const updated = { ...prev };
        for (const [listId, words] of Object.entries(updated)) {
          updated[Number(listId)] = words.map((w) =>
            w.id === editingWord.id
              ? { ...w, lithuanian: editingWord.lithuanian, translation_en: editingWord.translation_en, translation_ru: editingWord.translation_ru, hint: editingWord.hint || null }
              : w
          );
        }
        return updated;
      });
      setEditingWord(null);
    }
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
      name_ru: sc.name_ru ?? '',
      name_en: sc.name_en ?? '',
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
        name_ru: listDraft.name_ru || null,
        name_en: listDraft.name_en || null,
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

        {/* Top-level area tabs */}
        <div className="flex gap-1 bg-gray-50 border border-gray-900 rounded-xl p-1 w-fit mb-4">
          <button
            onClick={() => setArea('admin')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${area === 'admin' ? 'bg-gray-100 text-gray-900' : 'text-gray-500 hover:text-gray-900'}`}
          >
            Администрирование
          </button>
          <button
            onClick={() => setArea('content')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${area === 'content' ? 'bg-gray-100 text-gray-900' : 'text-gray-500 hover:text-gray-900'}`}
          >
            Контент
          </button>
        </div>

        {/* Sub-tabs for admin area */}
        {area === 'admin' && (
          <div className="flex gap-1 bg-white border border-gray-200 rounded-xl p-1 w-fit mb-6">
            <button
              onClick={() => setAdminTab('users')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${adminTab === 'users' ? 'bg-gray-100 text-gray-900' : 'text-gray-400 hover:text-gray-900'}`}
            >
              {tr.admin.tabUsers}
            </button>
            <button
              onClick={() => setAdminTab('reports')}
              className={`relative px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${adminTab === 'reports' ? 'bg-gray-100 text-gray-900' : 'text-gray-400 hover:text-gray-900'}`}
            >
              {tr.admin.tabReports}
              {openReports > 0 && (
                <span className="ml-1.5 inline-flex items-center justify-center w-4 h-4 text-[10px] font-bold bg-red-500 text-white rounded-full">{openReports}</span>
              )}
            </button>
          </div>
        )}

        {/* Sub-tabs for content area */}
        {area === 'content' && (
          <div className="flex gap-1 bg-white border border-gray-200 rounded-xl p-1 w-fit mb-6">
            <button
              onClick={() => setContentTab('articles')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${contentTab === 'articles' ? 'bg-gray-100 text-gray-900' : 'text-gray-400 hover:text-gray-900'}`}
            >
              {tr.admin.tabArticles}
            </button>
            <button
              onClick={() => setContentTab('vocabularies')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${contentTab === 'vocabularies' ? 'bg-gray-100 text-gray-900' : 'text-gray-400 hover:text-gray-900'}`}
            >
              Словари
            </button>
          </div>
        )}

        {/* ── Users ── */}
        {area === 'admin' && adminTab === 'users' && (
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

        {/* ── Reports ── */}
        {area === 'admin' && adminTab === 'reports' && (
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

        {/* ── Articles ── */}
        {area === 'content' && contentTab === 'articles' && (
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

        {/* ── Vocabularies (словари + контент merged) ── */}
        {area === 'content' && contentTab === 'vocabularies' && (() => {
          const subcats = getContentSubcats();
          return (
            <div className="flex flex-col gap-3">
              {subcats.length === 0 && (
                <p className="text-gray-400 text-sm py-8 text-center">{tr.admin.noLists}</p>
              )}
              {subcats.map((subcatKey, subcatIdx) => {
                const subcatLists = contentLists.filter((l) => (l.subcategory ?? 'other') === subcatKey);
                const isSubcatOpen = expandedSubcats.has(subcatKey);
                const scMeta: SubcategoryRow = subcategories.find((s) => s.key === subcatKey) ?? {
                  key: subcatKey,
                  cefr_level: null,
                  difficulty: null,
                  article_url: null,
                  article_name_ru: null,
                  article_name_en: null,
                  name_ru: null,
                  name_en: null,
                };
                const label = (lang === 'en' ? scMeta.name_en : scMeta.name_ru) ?? tr.lists.subcategories[subcatKey] ?? subcatKey;
                const isEditingMeta = editingListKey === subcatKey;

                return (
                  <div key={subcatKey} className="border border-gray-900 rounded-2xl overflow-hidden">
                    {/* Subcategory header */}
                    {isEditingMeta ? (
                      <div className="px-4 py-3 bg-gray-50 border-b border-gray-900">
                        <p className="font-semibold text-gray-900 text-sm mb-3">{label}</p>
                        <div className="flex flex-wrap gap-3">
                          <div className="flex flex-col gap-1">
                            <label className="text-xs text-gray-400">{tr.admin.colCefr}</label>
                            <input
                              type="text"
                              value={listDraft.cefr_level}
                              onChange={(e) => setListDraft((d) => ({ ...d, cefr_level: e.target.value }))}
                              placeholder="A1, A1-A2, B1…"
                              className="bg-white border border-gray-900 rounded-lg px-3 py-1.5 text-sm text-gray-900 outline-none w-32"
                            />
                          </div>
                          <div className="flex flex-col gap-1">
                            <label className="text-xs text-gray-400">{tr.admin.colDifficulty}</label>
                            <select
                              value={listDraft.difficulty}
                              onChange={(e) => setListDraft((d) => ({ ...d, difficulty: e.target.value }))}
                              className="bg-white border border-gray-900 rounded-lg px-3 py-1.5 text-sm text-gray-900 outline-none"
                            >
                              {Object.entries(tr.admin.difficultyOptions).map(([val, lbl]) => (
                                <option key={val} value={val}>{lbl}</option>
                              ))}
                            </select>
                          </div>
                          <div className="flex flex-col gap-1 flex-1 min-w-[200px]">
                            <label className="text-xs text-gray-400">{tr.admin.colArticleUrl}</label>
                            <select
                              value={articles.find(a => `/dashboard/articles/${a.slug}` === listDraft.article_url) ? listDraft.article_url : ''}
                              onChange={(e) => {
                                const val = e.target.value;
                                if (!val) {
                                  setListDraft((d) => ({ ...d, article_url: '' }));
                                } else {
                                  const art = articles.find(a => `/dashboard/articles/${a.slug}` === val);
                                  setListDraft((d) => ({
                                    ...d,
                                    article_url: val,
                                    article_name_ru: art?.title_ru ?? d.article_name_ru,
                                    article_name_en: art?.title_en ?? d.article_name_en,
                                  }));
                                }
                              }}
                              className="bg-white border border-gray-900 rounded-lg px-3 py-1.5 text-sm text-gray-900 outline-none w-full"
                            >
                              <option value="">— нет —</option>
                              {articles.filter(a => a.published).map(a => (
                                <option key={a.slug} value={`/dashboard/articles/${a.slug}`}>{a.title_ru}</option>
                              ))}
                            </select>
                            <input
                              type="text"
                              value={listDraft.article_url.startsWith('http') || (!articles.find(a => `/dashboard/articles/${a.slug}` === listDraft.article_url) && listDraft.article_url !== '') ? listDraft.article_url : ''}
                              onChange={(e) => setListDraft((d) => ({ ...d, article_url: e.target.value }))}
                              placeholder="https://… (внешняя ссылка)"
                              className="bg-white border border-gray-900 rounded-lg px-3 py-1.5 text-sm text-gray-900 outline-none w-full mt-1"
                            />
                          </div>
                          <div className="flex flex-col gap-1 min-w-[140px]">
                            <label className="text-xs text-gray-400">{tr.admin.colArticleName} RU</label>
                            <input
                              type="text"
                              value={listDraft.article_name_ru}
                              onChange={(e) => setListDraft((d) => ({ ...d, article_name_ru: e.target.value }))}
                              placeholder="Читать статью…"
                              className="bg-white border border-gray-900 rounded-lg px-3 py-1.5 text-sm text-gray-900 outline-none w-full"
                            />
                          </div>
                          <div className="flex flex-col gap-1 min-w-[140px]">
                            <label className="text-xs text-gray-400">{tr.admin.colArticleName} EN</label>
                            <input
                              type="text"
                              value={listDraft.article_name_en}
                              onChange={(e) => setListDraft((d) => ({ ...d, article_name_en: e.target.value }))}
                              placeholder="Read article…"
                              className="bg-white border border-gray-900 rounded-lg px-3 py-1.5 text-sm text-gray-900 outline-none w-full"
                            />
                          </div>
                          <div className="flex flex-col gap-1 min-w-[140px]">
                            <label className="text-xs text-gray-400">{tr.admin.contentFieldCategoryNameRu}</label>
                            <input
                              type="text"
                              value={listDraft.name_ru}
                              onChange={(e) => setListDraft((d) => ({ ...d, name_ru: e.target.value }))}
                              placeholder={label}
                              className="bg-white border border-gray-900 rounded-lg px-3 py-1.5 text-sm text-gray-900 outline-none w-full"
                            />
                          </div>
                          <div className="flex flex-col gap-1 min-w-[140px]">
                            <label className="text-xs text-gray-400">{tr.admin.contentFieldCategoryNameEn}</label>
                            <input
                              type="text"
                              value={listDraft.name_en}
                              onChange={(e) => setListDraft((d) => ({ ...d, name_en: e.target.value }))}
                              className="bg-white border border-gray-900 rounded-lg px-3 py-1.5 text-sm text-gray-900 outline-none w-full"
                            />
                          </div>
                        </div>
                        <div className="flex gap-2 mt-3">
                          <button
                            onClick={() => saveSubcatMeta(subcatKey)}
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
                      <div className="flex items-center justify-between px-4 py-3 bg-gray-50">
                        <button
                          onClick={() => toggleExpandSubcat(subcatKey)}
                          className="flex items-center gap-2 flex-1 text-left min-w-0"
                        >
                          <svg
                            width="12" height="12" viewBox="0 0 12 12" fill="currentColor"
                            className={`text-gray-400 transition-transform duration-200 shrink-0 ${isSubcatOpen ? 'rotate-180' : ''}`}
                          >
                            <path d="M6 8L1 3h10L6 8z" />
                          </svg>
                          <span className="font-semibold text-gray-900 text-sm">{label}</span>
                          <span className="text-gray-400 text-xs">{subcatLists.length} {tr.admin.contentWordLists}</span>
                          <div className="flex items-center gap-1.5 ml-1">
                            {scMeta.cefr_level && (
                              <span className="text-xs font-semibold px-2 py-0.5 rounded-full border border-gray-200 bg-blue-50 text-blue-700">{scMeta.cefr_level}</span>
                            )}
                            {scMeta.difficulty && (
                              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border border-gray-200 ${
                                scMeta.difficulty === 'easy' ? 'bg-emerald-50 text-emerald-700' :
                                scMeta.difficulty === 'medium' ? 'bg-amber-50 text-amber-700' :
                                'bg-red-50 text-red-700'
                              }`}>{tr.admin.difficultyOptions[scMeta.difficulty] ?? scMeta.difficulty}</span>
                            )}
                          </div>
                        </button>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={() => startEditSubcat(scMeta)}
                            title="Редактировать метаданные"
                            className="w-7 h-7 flex items-center justify-center rounded border border-gray-900 text-emerald-600 hover:bg-white transition-colors text-xs"
                          >
                            ✎
                          </button>
                          <button
                            onClick={() => moveSubcat(subcatKey, -1)}
                            disabled={subcatIdx === 0}
                            title={tr.admin.contentMoveUp}
                            className="w-7 h-7 flex items-center justify-center rounded border border-gray-900 text-gray-500 hover:text-gray-900 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                          >
                            ↑
                          </button>
                          <button
                            onClick={() => moveSubcat(subcatKey, 1)}
                            disabled={subcatIdx === subcats.length - 1}
                            title={tr.admin.contentMoveDown}
                            className="w-7 h-7 flex items-center justify-center rounded border border-gray-900 text-gray-500 hover:text-gray-900 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                          >
                            ↓
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Word lists inside subcategory */}
                    {isSubcatOpen && !isEditingMeta && (
                      <div className="border-t border-gray-900 divide-y divide-gray-100">
                        {subcatLists.map((list, listIdx) => {
                          const isListOpen = expandedLists.has(list.id);
                          const words = listWords[list.id];
                          return (
                            <div key={list.id}>
                              <div className="flex items-center justify-between px-5 py-3 bg-white hover:bg-gray-50">
                                <button
                                  onClick={() => toggleExpandList(list.id)}
                                  className="flex items-center gap-2 flex-1 text-left min-w-0"
                                >
                                  <svg
                                    width="10" height="10" viewBox="0 0 12 12" fill="currentColor"
                                    className={`text-gray-300 transition-transform duration-200 shrink-0 ${isListOpen ? 'rotate-180' : ''}`}
                                  >
                                    <path d="M6 8L1 3h10L6 8z" />
                                  </svg>
                                  <span className="font-medium text-gray-900 text-sm truncate">{list.title}</span>
                                  {list.title_en && <span className="text-gray-400 text-xs shrink-0 italic">{list.title_en}</span>}
                                  <span className="text-gray-400 text-xs shrink-0">{list.word_count} {tr.admin.contentWordsCount}</span>
                                </button>
                                <div className="flex items-center gap-1 ml-2">
                                  <button
                                    onClick={() => setEditingListId(editingListId === list.id ? null : list.id)}
                                    title={tr.admin.contentEditList}
                                    className="w-6 h-6 flex items-center justify-center rounded border border-gray-900 text-gray-400 hover:text-gray-900 text-xs transition-colors"
                                  >
                                    ✎
                                  </button>
                                  <button
                                    onClick={() => moveList(list.id, subcatKey, -1)}
                                    disabled={listIdx === 0}
                                    title={tr.admin.contentMoveUp}
                                    className="w-6 h-6 flex items-center justify-center rounded border border-gray-900 text-gray-400 hover:text-gray-900 disabled:opacity-30 disabled:cursor-not-allowed text-xs transition-colors"
                                  >
                                    ↑
                                  </button>
                                  <button
                                    onClick={() => moveList(list.id, subcatKey, 1)}
                                    disabled={listIdx === subcatLists.length - 1}
                                    title={tr.admin.contentMoveDown}
                                    className="w-6 h-6 flex items-center justify-center rounded border border-gray-900 text-gray-400 hover:text-gray-900 disabled:opacity-30 disabled:cursor-not-allowed text-xs transition-colors"
                                  >
                                    ↓
                                  </button>
                                </div>
                              </div>

                              {/* List meta edit form */}
                              {editingListId === list.id && (
                                <ListMetaEditForm
                                  list={list}
                                  onSave={(titleRu, titleEn) => {
                                    setContentLists((prev) => prev.map((l) =>
                                      l.id === list.id ? { ...l, title: titleRu, title_en: titleEn } : l
                                    ));
                                    setEditingListId(null);
                                  }}
                                  onCancel={() => setEditingListId(null)}
                                />
                              )}

                              {/* Words inside list */}
                              {isListOpen && (
                                <div className="bg-gray-50 border-t border-gray-100 px-5 py-3">
                                  {!words && (
                                    <div className="flex justify-center py-4">
                                      <div className="w-5 h-5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                                    </div>
                                  )}
                                  {words && words.length === 0 && (
                                    <p className="text-gray-400 text-xs py-2">{tr.admin.contentNoWords}</p>
                                  )}
                                  {words && words.length > 0 && (
                                    <div className="flex flex-col gap-1">
                                      {words.map((word, wordIdx) => (
                                        <div key={word.item_id}>
                                          {editingWord?.id === word.id ? (
                                            <div className="bg-white border border-gray-900 rounded-xl p-3 flex flex-col gap-2">
                                              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                                <div className="flex flex-col gap-1">
                                                  <label className="text-xs text-gray-400">{tr.admin.contentFieldLithuanian}</label>
                                                  <input
                                                    value={editingWord.lithuanian}
                                                    onChange={(e) => setEditingWord((d) => d ? { ...d, lithuanian: e.target.value } : d)}
                                                    className="bg-gray-50 border border-gray-900 rounded-lg px-2 py-1 text-xs text-gray-900 outline-none"
                                                  />
                                                </div>
                                                <div className="flex flex-col gap-1">
                                                  <label className="text-xs text-gray-400">{tr.admin.contentFieldRu}</label>
                                                  <input
                                                    value={editingWord.translation_ru}
                                                    onChange={(e) => setEditingWord((d) => d ? { ...d, translation_ru: e.target.value } : d)}
                                                    className="bg-gray-50 border border-gray-900 rounded-lg px-2 py-1 text-xs text-gray-900 outline-none"
                                                  />
                                                </div>
                                                <div className="flex flex-col gap-1">
                                                  <label className="text-xs text-gray-400">{tr.admin.contentFieldEn}</label>
                                                  <input
                                                    value={editingWord.translation_en}
                                                    onChange={(e) => setEditingWord((d) => d ? { ...d, translation_en: e.target.value } : d)}
                                                    className="bg-gray-50 border border-gray-900 rounded-lg px-2 py-1 text-xs text-gray-900 outline-none"
                                                  />
                                                </div>
                                                <div className="flex flex-col gap-1">
                                                  <label className="text-xs text-gray-400">{tr.admin.contentFieldHint}</label>
                                                  <input
                                                    value={editingWord.hint}
                                                    onChange={(e) => setEditingWord((d) => d ? { ...d, hint: e.target.value } : d)}
                                                    className="bg-gray-50 border border-gray-900 rounded-lg px-2 py-1 text-xs text-gray-900 outline-none"
                                                  />
                                                </div>
                                              </div>
                                              <div className="flex gap-2">
                                                <button
                                                  onClick={saveWord}
                                                  disabled={wordSaving}
                                                  className="text-xs px-3 py-1.5 bg-gray-900 hover:bg-gray-800 rounded-lg font-medium text-white transition-colors disabled:opacity-50"
                                                >
                                                  {wordSaving ? '...' : tr.admin.save}
                                                </button>
                                                <button
                                                  onClick={() => setEditingWord(null)}
                                                  className="text-xs px-2 py-1.5 text-gray-400 hover:text-gray-900 transition-colors"
                                                >
                                                  {tr.admin.cancel}
                                                </button>
                                              </div>
                                            </div>
                                          ) : (
                                            <div className="flex items-center gap-2 py-1.5 group">
                                              <div className="flex items-center gap-1 shrink-0">
                                                <button
                                                  onClick={() => moveWord(list.id, word.item_id, -1)}
                                                  disabled={wordIdx === 0}
                                                  title={tr.admin.contentMoveUp}
                                                  className="w-5 h-5 flex items-center justify-center rounded border border-gray-200 text-gray-300 hover:border-gray-900 hover:text-gray-700 disabled:opacity-20 disabled:cursor-not-allowed text-xs transition-colors"
                                                >
                                                  ↑
                                                </button>
                                                <button
                                                  onClick={() => moveWord(list.id, word.item_id, 1)}
                                                  disabled={wordIdx === words.length - 1}
                                                  title={tr.admin.contentMoveDown}
                                                  className="w-5 h-5 flex items-center justify-center rounded border border-gray-200 text-gray-300 hover:border-gray-900 hover:text-gray-700 disabled:opacity-20 disabled:cursor-not-allowed text-xs transition-colors"
                                                >
                                                  ↓
                                                </button>
                                              </div>
                                              <span className="text-sm font-medium text-gray-900 min-w-[120px]">{word.lithuanian}</span>
                                              <span className="text-sm text-gray-500 min-w-[100px]">{word.translation_ru}</span>
                                              <span className="text-xs text-gray-400 flex-1">{word.translation_en}{word.hint ? ` · ${word.hint}` : ''}</span>
                                              <button
                                                onClick={() => startEditWord(word)}
                                                className="text-xs px-2 py-1 border border-gray-900 rounded-lg text-emerald-600 hover:bg-gray-100 transition-colors opacity-0 group-hover:opacity-100"
                                              >
                                                {tr.articles.editArticle}
                                              </button>
                                            </div>
                                          )}
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })()}
      </div>
    </main>
  );
}
