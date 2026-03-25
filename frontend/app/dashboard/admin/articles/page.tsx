'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { BACKEND_URL, getToken } from '../../../../lib/api';
import { useT } from '../../../../lib/useT';

interface ArticleRow {
  id: number;
  slug: string;
  title_ru: string;
  title_en: string;
  tags: string[];
  published: boolean;
  show_in_footer: boolean;
  created_at: string;
  updated_at: string;
}

export default function AdminArticlesPage() {
  const router = useRouter();
  const { tr, lang } = useT();
  const [articles, setArticles] = useState<ArticleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [importMsg, setImportMsg] = useState('');
  const importRef = useRef<HTMLInputElement>(null);

  function authHeaders() {
    const token = getToken();
    return { Authorization: `Bearer ${token}` };
  }

  function loadArticles() {
    const token = getToken();
    if (!token) { router.replace('/dashboard/lists'); return; }
    fetch(`${BACKEND_URL}/api/admin/articles`, { headers: authHeaders() })
      .then((r) => {
        if (r.status === 403 || r.status === 401) { router.replace('/dashboard/lists'); return null; }
        return r.ok ? r.json() : null;
      })
      .then((data) => { if (data) setArticles(data); })
      .catch((err) => console.error('API error:', err))
      .finally(() => setLoading(false));
  }

  useEffect(() => { loadArticles(); }, []);

  async function deleteArticle(slug: string) {
    if (!confirm(tr.articles.deleteConfirm)) return;
    await fetch(`${BACKEND_URL}/api/admin/articles/${slug}`, {
      method: 'DELETE',
      headers: authHeaders(),
    }).catch((err) => console.error('API error:', err));
    loadArticles();
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
    if (res.ok) loadArticles();
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <main className="bg-slate-50 text-gray-900 min-h-screen">
      <div className="pointer-events-none fixed inset-0 flex items-start justify-center overflow-hidden">
        <div className="w-full max-w-[600px] h-[400px] bg-emerald-100/40 blur-[120px] rounded-full mt-[-100px]" />
      </div>

      <div className="relative z-10 max-w-5xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <div>
            <h1 className="text-3xl font-bold">{tr.articles.adminTitle}</h1>
            <Link href="/dashboard/admin" className="text-sm text-gray-400 hover:text-gray-900 transition-colors">
              ← {tr.admin.title}
            </Link>
          </div>
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
          <p className="text-gray-400 text-sm text-center py-16">{tr.articles.noArticles}</p>
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
                    {a.show_in_footer && (
                      <span className="text-xs px-2 py-0.5 rounded-full border border-blue-300 bg-blue-50 text-blue-600 font-medium">
                        footer
                      </span>
                    )}
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
    </main>
  );
}
