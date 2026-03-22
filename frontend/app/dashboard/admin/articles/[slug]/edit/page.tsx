'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { BACKEND_URL, getToken } from '../../../../../../lib/api';
import { useT } from '../../../../../../lib/useT';

// @uiw/react-md-editor uses browser APIs — must be loaded client-side only
const MDEditor = dynamic(() => import('@uiw/react-md-editor'), { ssr: false });

type EditorTab = 'ru' | 'en';

interface ArticleForm {
  slug: string;
  title_ru: string;
  title_en: string;
  body_ru: string;
  body_en: string;
  tags: string;
  published: boolean;
}

const EMPTY: ArticleForm = {
  slug: '',
  title_ru: '',
  title_en: '',
  body_ru: '',
  body_en: '',
  tags: '',
  published: true,
};

function resolveSlug(): string {
  if (typeof window === 'undefined') return '_';
  const parts = window.location.pathname.split('/').filter(Boolean);
  // /dashboard/admin/articles/<slug>/edit
  return parts[3] ?? '_';
}

export default function ArticleEditorPage() {
  const router = useRouter();
  const { tr } = useT();
  const [form, setForm] = useState<ArticleForm>(EMPTY);
  const [tab, setTab] = useState<EditorTab>('ru');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [isNew, setIsNew] = useState(false);

  function authHeaders() {
    return { Authorization: `Bearer ${getToken()}` };
  }

  useEffect(() => {
    const slug = resolveSlug();
    if (slug === 'new') {
      setIsNew(true);
      setLoading(false);
      return;
    }
    fetch(`${BACKEND_URL}/api/admin/articles/${slug}`, { headers: authHeaders() })
      .then((r) => {
        if (r.status === 403 || r.status === 401) { router.replace('/dashboard/lists'); return null; }
        return r.ok ? r.json() : null;
      })
      .then((data) => {
        if (data) {
          setForm({
            slug: data.slug,
            title_ru: data.title_ru,
            title_en: data.title_en,
            body_ru: data.body_ru,
            body_en: data.body_en,
            tags: data.tags,
            published: data.published,
          });
        }
      })
      .catch((err) => console.error('API error:', err))
      .finally(() => setLoading(false));
  }, []);

  function set(key: keyof ArticleForm, value: string | boolean) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function save() {
    if (!form.slug || !form.title_ru || !form.title_en) {
      setMsg('Slug, RU title and EN title are required.');
      return;
    }
    setSaving(true);
    const slug = resolveSlug();
    const method = isNew ? 'POST' : 'PUT';
    const url = isNew
      ? `${BACKEND_URL}/api/admin/articles`
      : `${BACKEND_URL}/api/admin/articles/${slug}`;

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify(form),
    }).catch(() => null);

    setSaving(false);
    if (res?.ok) {
      setMsg(tr.articles.saveSuccess);
      setTimeout(() => setMsg(''), 3000);
      if (isNew) {
        router.replace('/dashboard/admin/articles');
      }
    } else {
      setMsg(tr.articles.saveError);
    }
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
      <div className="relative z-10 max-w-5xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold">
              {isNew ? tr.articles.newArticle : tr.articles.editArticle}
            </h1>
            <Link
              href="/dashboard/admin/articles"
              className="text-sm text-gray-400 hover:text-gray-900 transition-colors"
            >
              ← {tr.articles.adminTitle}
            </Link>
          </div>
          <div className="flex items-center gap-3">
            {msg && (
              <span className="text-xs text-emerald-600 font-medium">{msg}</span>
            )}
            <button
              onClick={save}
              disabled={saving}
              className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50"
            >
              {saving ? '...' : tr.common.save}
            </button>
          </div>
        </div>

        {/* Metadata fields */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">
              {tr.articles.slugLabel}
            </label>
            <input
              type="text"
              value={form.slug}
              onChange={(e) => set('slug', e.target.value)}
              placeholder="my-article-slug"
              className="w-full bg-white border border-gray-900 rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-emerald-500 font-mono"
            />
          </div>
          <div className="flex items-end gap-4">
            <div className="flex-1">
              <label className="block text-xs font-medium text-gray-500 mb-1">
                {tr.articles.tagsLabel}
              </label>
              <input
                type="text"
                value={form.tags}
                onChange={(e) => set('tags', e.target.value)}
                placeholder="exam,a2,tips"
                className="w-full bg-white border border-gray-900 rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>
            <label className="flex items-center gap-2 cursor-pointer mb-2">
              <input
                type="checkbox"
                checked={form.published}
                onChange={(e) => set('published', e.target.checked)}
                className="w-4 h-4 accent-emerald-600"
              />
              <span className="text-sm text-gray-700">{tr.articles.publishedLabel}</span>
            </label>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">
              {tr.articles.titleRuLabel}
            </label>
            <input
              type="text"
              value={form.title_ru}
              onChange={(e) => set('title_ru', e.target.value)}
              className="w-full bg-white border border-gray-900 rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">
              {tr.articles.titleEnLabel}
            </label>
            <input
              type="text"
              value={form.title_en}
              onChange={(e) => set('title_en', e.target.value)}
              className="w-full bg-white border border-gray-900 rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>
        </div>

        {/* Language tabs for body editor */}
        <div className="flex gap-1 bg-gray-50 border border-gray-900 rounded-xl p-1 w-fit mb-4">
          <button
            onClick={() => setTab('ru')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === 'ru' ? 'bg-gray-100 text-gray-900' : 'text-gray-500 hover:text-gray-900'
            }`}
          >
            {tr.articles.bodyRuLabel}
          </button>
          <button
            onClick={() => setTab('en')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === 'en' ? 'bg-gray-100 text-gray-900' : 'text-gray-500 hover:text-gray-900'
            }`}
          >
            {tr.articles.bodyEnLabel}
          </button>
        </div>

        {/* Markdown editor */}
        <div data-color-mode="light" className="rounded-xl overflow-hidden border border-gray-900">
          {tab === 'ru' && (
            <MDEditor
              value={form.body_ru}
              onChange={(val) => set('body_ru', val ?? '')}
              height={500}
              preview="live"
            />
          )}
          {tab === 'en' && (
            <MDEditor
              value={form.body_en}
              onChange={(val) => set('body_en', val ?? '')}
              height={500}
              preview="live"
            />
          )}
        </div>
      </div>
    </main>
  );
}
