'use client';

import { Suspense, useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  getToken,
  getMyWordList,
  updateMyWordList,
  addMyWord,
  bulkAddMyWords,
  updateMyWord,
  deleteMyWord,
  resolveMyListId,
  type WordListMineDetail,
  type CustomWordItem,
} from '../../../../../../lib/api';
import { useT } from '../../../../../../lib/useT';

function EditListContent() {
  const { id: _id } = useParams<{ id: string }>();
  const id = Number(resolveMyListId(_id));
  const router = useRouter();
  const { tr } = useT();
  const t = tr.myWordLists;
  const difficultyLabels: Record<number, string> = { 1: t.easy, 2: t.medium, 3: t.hard };

  const [detail, setDetail] = useState<WordListMineDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState('');
  const [difficulty, setDifficulty] = useState(1);
  const [savingMeta, setSavingMeta] = useState(false);

  // single add
  const [newText, setNewText] = useState('');
  const [newTranslation, setNewTranslation] = useState('');
  const [adding, setAdding] = useState(false);

  // bulk add
  const [bulkText, setBulkText] = useState('');
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkMsg, setBulkMsg] = useState<string | null>(null);

  // inline edit
  const [editId, setEditId] = useState<number | null>(null);
  const [editText, setEditText] = useState('');
  const [editTranslation, setEditTranslation] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    getMyWordList(id)
      .then((d) => {
        setDetail(d);
        setTitle(d.title);
        setDifficulty(d.difficulty);
      })
      .catch((e: Error) => {
        if (e.message === 'List not found') router.replace('/dashboard/lists');
        else setError(e.message || t.loadError);
      })
      .finally(() => setLoading(false));
  }, [id, router]);

  useEffect(() => {
    if (!getToken()) { router.replace('/login'); return; }
    load();
  }, [load, router]);

  async function saveMeta() {
    if (!title.trim()) return;
    setSavingMeta(true);
    try {
      await updateMyWordList(id, { title: title.trim(), difficulty });
      setDetail((d) => (d ? { ...d, title: title.trim(), difficulty } : d));
    } catch (e) {
      console.error(e);
    } finally {
      setSavingMeta(false);
    }
  }

  async function handleAdd() {
    if (!newText.trim() || !newTranslation.trim()) return;
    setAdding(true);
    try {
      await addMyWord(id, { lithuanian: newText.trim(), translation: newTranslation.trim() });
      setNewText('');
      setNewTranslation('');
      load();
    } catch (e) {
      console.error(e);
    } finally {
      setAdding(false);
    }
  }

  async function handleBulk() {
    if (!bulkText.trim()) return;
    setBulkBusy(true);
    setBulkMsg(null);
    try {
      const { added } = await bulkAddMyWords(id, bulkText);
      setBulkText('');
      setBulkMsg(t.bulkAdded.replace('{n}', String(added)));
      load();
    } catch (e) {
      setBulkMsg((e as Error).message || t.loadError);
    } finally {
      setBulkBusy(false);
    }
  }

  function startEdit(w: CustomWordItem) {
    setEditId(w.id);
    setEditText(w.lithuanian);
    setEditTranslation(w.translation);
  }

  async function saveEdit(wordId: number) {
    if (!editText.trim() || !editTranslation.trim()) return;
    try {
      await updateMyWord(wordId, { lithuanian: editText.trim(), translation: editTranslation.trim() });
      setEditId(null);
      load();
    } catch (e) {
      console.error(e);
    }
  }

  async function handleDelete(wordId: number) {
    try {
      await deleteMyWord(wordId);
      setDetail((d) => (d ? { ...d, words: d.words.filter((w) => w.id !== wordId) } : d));
    } catch (e) {
      console.error(e);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F5F5F7] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !detail) {
    return (
      <main className="min-h-screen bg-[#F5F5F7] flex flex-col items-center justify-center px-6 gap-4">
        <p className="text-gray-500">{error ?? t.listNotFound}</p>
        <Link href="/dashboard/lists" className="text-sm text-emerald-600 hover:text-emerald-700">{t.backToLists}</Link>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#F5F5F7] text-gray-900 flex flex-col items-center px-4 py-10" data-testid="word-list-edit-page">
      <div className="relative z-10 w-full max-w-2xl">
        <div className="mb-6">
          <Link href="/dashboard/lists" className="text-sm text-gray-400 hover:text-gray-900 transition-colors">{t.backToLists}</Link>
        </div>

        {/* List meta */}
        <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-5 mb-6">
          <label className="block text-xs font-medium text-gray-400 mb-1">{t.listName}</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-emerald-200"
            data-testid="list-title-input"
          />
          <label className="block text-xs font-medium text-gray-400 mb-1.5">{t.difficulty}</label>
          <div className="flex items-center gap-2.5 mb-4">
            <button
              type="button"
              onClick={() => setDifficulty(difficulty === 3 ? 1 : difficulty + 1)}
              aria-label={t.difficulty}
              className="relative w-16 h-6 rounded-full bg-gray-100 border border-gray-200 hover:bg-gray-200/70 transition-colors shrink-0"
            >
              <span className="absolute inset-0 flex items-center justify-between px-2 pointer-events-none">
                <span className="w-0.5 h-0.5 rounded-full bg-gray-300" />
                <span className="w-0.5 h-0.5 rounded-full bg-gray-300" />
                <span className="w-0.5 h-0.5 rounded-full bg-gray-300" />
              </span>
              <span
                className="absolute top-0.5 h-5 w-5 rounded-full bg-emerald-600 shadow-sm transition-all duration-300 ease-out"
                style={{
                  left: difficulty === 1 ? '2px' : difficulty === 2 ? 'calc(50% - 10px)' : 'calc(100% - 22px)',
                }}
              />
            </button>
            <span className="text-xs text-gray-500">{difficultyLabels[difficulty]}</span>
          </div>
          <div className="flex items-center justify-between">
            <button
              onClick={saveMeta}
              disabled={savingMeta || !title.trim()}
              className="px-4 py-2 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-full transition-colors disabled:opacity-40"
            >
              {savingMeta ? t.saving : t.save}
            </button>
            {detail.words.length > 0 && (
              <Link
                href={`/dashboard/lists/${id}/study`}
                data-testid="study-button"
                className="px-4 py-2 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-full transition-colors shadow-sm shadow-emerald-600/20"
              >
                {t.studyArrow}
              </Link>
            )}
          </div>
        </div>

        {/* Words */}
        <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-5 mb-6">
          <h2 className="font-headline font-semibold text-gray-900 mb-4">{t.wordsHeading} <span className="text-gray-400 font-normal">({detail.words.length})</span></h2>

          <div className="flex flex-col divide-y divide-gray-100">
            {detail.words.map((w) => (
              <div key={w.id} className="py-3" data-testid="word-row">
                {editId === w.id ? (
                  <div className="flex flex-col gap-2">
                    <input value={editText} onChange={(e) => setEditText(e.target.value)} className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm" placeholder={t.wordPlaceholder} />
                    <input value={editTranslation} onChange={(e) => setEditTranslation(e.target.value)} className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm" placeholder={t.translationPlaceholder} />
                    <div className="flex gap-2">
                      <button onClick={() => saveEdit(w.id)} className="px-3 py-1 text-xs font-semibold text-white bg-emerald-600 rounded-full hover:bg-emerald-700">{t.save}</button>
                      <button onClick={() => setEditId(null)} className="px-3 py-1 text-xs text-gray-500 border border-gray-200 rounded-full hover:bg-gray-50">{t.cancel}</button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm text-gray-900 truncate">{w.lithuanian}</p>
                      <p className="text-xs text-gray-400 truncate">{w.translation}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span
                        className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border whitespace-nowrap ${
                          w.status === 'known'
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : w.status === 'learning'
                            ? 'bg-amber-50 text-amber-700 border-amber-200'
                            : 'bg-gray-100 text-gray-500 border-gray-200'
                        }`}
                        data-testid="word-status"
                      >
                        {w.status === 'known' ? t.statusLearned : w.status === 'learning' ? t.statusInProgress : t.statusNew}
                      </span>
                      <button onClick={() => startEdit(w)} title={t.edit} className="text-gray-300 hover:text-gray-700 transition-colors p-1.5 rounded">
                        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M11.5 2.5l2 2L6 12l-3 1 1-3 7.5-7.5z" /></svg>
                      </button>
                      <button onClick={() => handleDelete(w.id)} title={t.delete} className="text-gray-300 hover:text-red-500 transition-colors p-1.5 rounded">
                        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M2 4h12M5 4V2h6v2M6 7v5M10 7v5M3 4l1 9a1 1 0 001 1h6a1 1 0 001-1l1-9" /></svg>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
            {detail.words.length === 0 && (
              <p className="text-sm text-gray-400 py-4 text-center">{t.noWords}</p>
            )}
          </div>

          {/* Single add */}
          <div className="mt-4 pt-4 border-t border-gray-100 flex flex-col gap-2">
            <input value={newText} onChange={(e) => setNewText(e.target.value)} placeholder={t.wordPlaceholder} className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200" data-testid="new-word-text" />
            <input value={newTranslation} onChange={(e) => setNewTranslation(e.target.value)} placeholder={t.translationPlaceholder} className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200" data-testid="new-word-translation" />
            <button onClick={handleAdd} disabled={adding || !newText.trim() || !newTranslation.trim()} className="self-start px-4 py-2 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-full transition-colors disabled:opacity-40" data-testid="add-word-button">
              {adding ? t.adding : t.addWord}
            </button>
          </div>
        </div>

        {/* Bulk paste */}
        <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-5">
          <h2 className="font-headline font-semibold text-gray-900 mb-1">{t.bulkTitle}</h2>
          <p className="text-xs text-gray-400 mb-3">{t.bulkHint}</p>
          <textarea
            value={bulkText}
            onChange={(e) => setBulkText(e.target.value)}
            rows={5}
            placeholder={t.bulkExample}
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-200"
            data-testid="bulk-textarea"
          />
          <div className="mt-3 flex items-center gap-3">
            <button onClick={handleBulk} disabled={bulkBusy || !bulkText.trim()} className="px-4 py-2 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-full transition-colors disabled:opacity-40" data-testid="bulk-add-button">
              {bulkBusy ? t.adding : t.bulkAddAll}
            </button>
            {bulkMsg && <span className="text-xs text-gray-500">{bulkMsg}</span>}
          </div>
        </div>
      </div>
    </main>
  );
}

export default function EditListPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#F5F5F7] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <EditListContent />
    </Suspense>
  );
}
