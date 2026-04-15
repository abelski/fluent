'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  getToken,
  getMyCustomPrograms,
  getCustomProgramWordSets,
  updateCustomProgram,
  type CustomProgramSummary,
  type WordPair,
  type WordSet,
  type WordSetWithId,
} from '../../../../../lib/api';
import { translateText } from '../../../../../lib/translate';

function resolveProgramId(): number | null {
  if (typeof window === 'undefined') return null;
  const parts = window.location.pathname.split('/');
  const idx = parts.indexOf('programs');
  if (idx === -1) return null;
  const raw = parts[idx + 1];
  const n = parseInt(raw, 10);
  return isNaN(n) ? null : n;
}

function toWordSet(ws: WordSetWithId): WordSet {
  return {
    title: ws.title,
    words: ws.words.length > 0
      ? ws.words.map((wp) => ({ front: wp.front, back_ru: wp.back_ru, back_en: wp.back_en }))
      : [{ front: '', back_ru: '', back_en: '' }],
  };
}

export default function EditProgramPage() {
  const router = useRouter();
  const [program, setProgram] = useState<CustomProgramSummary | null>(null);

  // Language flags
  const [langRu, setLangRu] = useState(true);
  const [langEn, setLangEn] = useState(false);

  // Metadata
  const [title, setTitle] = useState('');
  const [titleEn, setTitleEn] = useState('');
  const [description, setDescription] = useState('');
  const [descriptionEn, setDescriptionEn] = useState('');

  // Word sets
  const [wordSets, setWordSets] = useState<WordSet[]>([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [translating, setTranslating] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const token = getToken();
    if (!token) { router.replace('/login'); return; }
    const programId = resolveProgramId();
    if (!programId) { router.replace('/programs?tab=community'); return; }

    Promise.all([
      getMyCustomPrograms(),
      getCustomProgramWordSets(programId),
    ]).then(([myPrograms, rawWordSets]: [CustomProgramSummary[], WordSetWithId[]]) => {
      const found = myPrograms.find((p) => p.id === programId);
      if (!found) { router.replace('/programs?tab=community'); return; }
      setProgram(found);
      setLangRu(found.lang_ru ?? true);
      setLangEn(found.lang_en ?? false);
      setTitle(found.title);
      setTitleEn(found.title_en ?? '');
      setDescription(found.description ?? '');
      setDescriptionEn(found.description_en ?? '');
      const sets = rawWordSets.length > 0
        ? rawWordSets.map(toWordSet)
        : [{ title: 'Набор 1', words: [{ front: '', back_ru: '', back_en: '' }] }];
      setWordSets(sets);
    }).finally(() => setLoading(false));
  }, [router]);

  // ── Language checkbox handlers ────────────────────────────────────────────

  function toggleLangRu() {
    if (langRu && !langEn) return;
    setLangRu((v) => !v);
  }

  function toggleLangEn() {
    if (langEn && !langRu) return;
    setLangEn((v) => !v);
  }

  // ── Word set mutations ────────────────────────────────────────────────────

  const addWordSet = useCallback(() => {
    setWordSets((prev) => [...prev, { title: `Набор ${prev.length + 1}`, words: [{ front: '', back_ru: '', back_en: '' }] }]);
  }, []);

  const removeWordSet = useCallback((setIdx: number) => {
    setWordSets((prev) => prev.filter((_, i) => i !== setIdx));
  }, []);

  const updateSetTitle = useCallback((setIdx: number, value: string) => {
    setWordSets((prev) => prev.map((ws, i) => i === setIdx ? { ...ws, title: value } : ws));
  }, []);

  const addWord = useCallback((setIdx: number) => {
    setWordSets((prev) => prev.map((ws, i) =>
      i === setIdx ? { ...ws, words: [...ws.words, { front: '', back_ru: '', back_en: '' }] } : ws
    ));
  }, []);

  const removeWord = useCallback((setIdx: number, wordIdx: number) => {
    setWordSets((prev) => prev.map((ws, i) =>
      i === setIdx ? { ...ws, words: ws.words.filter((_, wi) => wi !== wordIdx) } : ws
    ));
  }, []);

  const updateWord = useCallback((setIdx: number, wordIdx: number, field: keyof WordPair, value: string) => {
    setWordSets((prev) => prev.map((ws, i) =>
      i === setIdx
        ? { ...ws, words: ws.words.map((wp, wi) => wi === wordIdx ? { ...wp, [field]: value } : wp) }
        : ws
    ));
  }, []);

  // ── Auto-translate on save ────────────────────────────────────────────────

  async function runAutoTranslate(): Promise<{
    resolvedTitle: string; resolvedTitleEn: string;
    resolvedDesc: string; resolvedDescEn: string;
    resolvedSets: WordSet[];
  }> {
    const bothLangs = langRu && langEn;
    if (bothLangs) {
      return { resolvedTitle: title, resolvedTitleEn: titleEn, resolvedDesc: description, resolvedDescEn: descriptionEn, resolvedSets: wordSets };
    }

    const from = langRu ? 'ru' : 'en';
    const to = langRu ? 'en' : 'ru';

    setTranslating(true);
    try {
      const [tTitle, tDesc] = await Promise.all([
        langRu ? translateText(title, from, to) : translateText(titleEn, from, to),
        langRu ? translateText(description, from, to) : translateText(descriptionEn, from, to),
      ]);

      const resolvedTitle = langRu ? title : tTitle;
      const resolvedTitleEn = langRu ? tTitle : titleEn;
      const resolvedDesc = langRu ? description : tDesc;
      const resolvedDescEn = langRu ? tDesc : descriptionEn;

      const resolvedSets: WordSet[] = await Promise.all(wordSets.map(async (ws) => {
        const words: WordPair[] = await Promise.all(ws.words.map(async (wp) => {
          const srcBack = langRu ? wp.back_ru : wp.back_en;
          const translated = srcBack.trim() ? await translateText(srcBack, from, to) : '';
          return {
            front: wp.front,
            back_ru: langRu ? wp.back_ru : translated,
            back_en: langRu ? translated : wp.back_en,
          };
        }));
        return { ...ws, words };
      }));

      return { resolvedTitle, resolvedTitleEn, resolvedDesc, resolvedDescEn, resolvedSets };
    } finally {
      setTranslating(false);
    }
  }

  // ── Save ──────────────────────────────────────────────────────────────────

  async function handleSave() {
    setError('');
    const primaryTitle = langRu ? title : titleEn;
    if (!primaryTitle.trim()) { setError('Введите название программы'); return; }
    if (wordSets.length === 0) { setError('Добавьте хотя бы один набор слов'); return; }
    const hasWords = wordSets.some((ws) => ws.words.some((wp) =>
      wp.front.trim() || wp.back_ru.trim() || wp.back_en.trim()
    ));
    if (!hasWords) { setError('Добавьте хотя бы одно слово'); return; }
    if (!program) return;
    setSaving(true);
    try {
      const { resolvedTitle, resolvedTitleEn, resolvedDesc, resolvedDescEn, resolvedSets } = await runAutoTranslate();
      await updateCustomProgram(program.id, {
        title: resolvedTitle.trim() || resolvedTitleEn.trim(),
        title_en: resolvedTitleEn.trim() || undefined,
        description: resolvedDesc.trim() || undefined,
        description_en: resolvedDescEn.trim() || undefined,
        lang_ru: langRu,
        lang_en: langEn,
        word_sets: resolvedSets,
      });
      router.push('/programs?tab=community');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка при сохранении');
    } finally {
      setSaving(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <main className="bg-[#F5F5F7] min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </main>
    );
  }

  const bothLangs = langRu && langEn;

  return (
    <main className="bg-[#F5F5F7] min-h-screen text-gray-900">
      <div className="max-w-3xl mx-auto px-6 py-8">
        <div className="mb-6">
          <Link href="/programs?tab=community" className="text-sm text-gray-400 hover:text-gray-700 transition-colors">
            ← Назад к программам
          </Link>
        </div>

        <h1 className="text-2xl font-bold mb-6">Редактировать программу</h1>

        {/* Program metadata */}
        <div className="bg-white rounded-2xl p-6 border border-gray-100 flex flex-col gap-5 mb-6">

          {/* Language checkboxes */}
          <div>
            <p className="text-sm font-semibold text-gray-700 mb-2">Язык программы</p>
            <div className="flex gap-5">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={langRu}
                  onChange={toggleLangRu}
                  className="rounded accent-emerald-600 w-4 h-4"
                />
                <span className="text-sm text-gray-700">Русский</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={langEn}
                  onChange={toggleLangEn}
                  className="rounded accent-emerald-600 w-4 h-4"
                />
                <span className="text-sm text-gray-700">English</span>
              </label>
            </div>
            {!bothLangs && (
              <p className="text-xs text-gray-400 mt-1.5">
                {langRu
                  ? 'Перевод на английский будет добавлен автоматически при сохранении'
                  : 'Russian translation will be added automatically on save'}
              </p>
            )}
          </div>

          {/* Title */}
          {langRu && (
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                {bothLangs ? 'Название (рус.)' : 'Название'} <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={120}
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          )}
          {langEn && (
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                {bothLangs ? 'Title (eng.)' : 'Title'} <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={titleEn}
                onChange={(e) => setTitleEn(e.target.value)}
                maxLength={120}
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          )}

          {/* Description */}
          {langRu && (
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                {bothLangs ? 'Описание (рус.)' : 'Описание'}{' '}
                <span className="text-gray-400 font-normal">(необязательно)</span>
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                maxLength={500}
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
              />
            </div>
          )}
          {langEn && (
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                {bothLangs ? 'Description (eng.)' : 'Description'}{' '}
                <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <textarea
                value={descriptionEn}
                onChange={(e) => setDescriptionEn(e.target.value)}
                rows={2}
                maxLength={500}
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
              />
            </div>
          )}
        </div>

        {/* Word sets */}
        <div className="flex flex-col gap-4">
          {wordSets.map((ws, setIdx) => (
            <div key={setIdx} className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
              <div className="flex items-center gap-3 px-4 py-3 bg-gray-50 border-b border-gray-100">
                <input
                  type="text"
                  value={ws.title}
                  onChange={(e) => updateSetTitle(setIdx, e.target.value)}
                  placeholder={`Набор ${setIdx + 1}`}
                  maxLength={100}
                  className="flex-1 bg-transparent text-sm font-semibold text-gray-800 focus:outline-none placeholder:text-gray-400"
                />
                {wordSets.length > 1 && (
                  <button
                    onClick={() => removeWordSet(setIdx)}
                    className="text-gray-400 hover:text-red-500 transition-colors text-lg leading-none"
                    title="Удалить набор"
                  >
                    ×
                  </button>
                )}
              </div>

              <div className="divide-y divide-gray-50">
                <div className={`grid gap-2 px-4 py-2 ${bothLangs ? 'grid-cols-[1fr_1fr_1fr_32px]' : 'grid-cols-[1fr_1fr_32px]'}`}>
                  <span className="text-xs text-gray-400 font-medium">Литовский</span>
                  {langRu && <span className="text-xs text-gray-400 font-medium">Перевод (рус.)</span>}
                  {langEn && <span className="text-xs text-gray-400 font-medium">Translation (eng.)</span>}
                  <span />
                </div>
                {ws.words.map((wp, wordIdx) => (
                  <div key={wordIdx} className={`grid gap-2 px-4 py-2 items-center ${bothLangs ? 'grid-cols-[1fr_1fr_1fr_32px]' : 'grid-cols-[1fr_1fr_32px]'}`}>
                    <input
                      type="text"
                      value={wp.front}
                      onChange={(e) => updateWord(setIdx, wordIdx, 'front', e.target.value)}
                      placeholder="labas"
                      className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                    {langRu && (
                      <input
                        type="text"
                        value={wp.back_ru}
                        onChange={(e) => updateWord(setIdx, wordIdx, 'back_ru', e.target.value)}
                        placeholder="привет"
                        className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                    )}
                    {langEn && (
                      <input
                        type="text"
                        value={wp.back_en}
                        onChange={(e) => updateWord(setIdx, wordIdx, 'back_en', e.target.value)}
                        placeholder="hello"
                        className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                    )}
                    <button
                      onClick={() => removeWord(setIdx, wordIdx)}
                      disabled={ws.words.length <= 1}
                      className="text-gray-300 hover:text-red-400 disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-lg leading-none"
                      title="Удалить строку"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>

              <div className="px-4 py-3 border-t border-gray-50">
                <button
                  onClick={() => addWord(setIdx)}
                  className="text-sm text-emerald-600 hover:text-emerald-700 font-medium transition-colors"
                >
                  + Добавить слово
                </button>
              </div>
            </div>
          ))}

          <button
            onClick={addWordSet}
            className="w-full py-3 border-2 border-dashed border-gray-200 rounded-2xl text-sm text-gray-400 hover:border-emerald-400 hover:text-emerald-600 transition-colors"
          >
            + Добавить набор слов
          </button>
        </div>

        {error && <p className="text-sm text-red-500 mt-4">{error}</p>}

        <div className="flex items-center gap-3 justify-end mt-6">
          <Link
            href="/programs?tab=community"
            className="text-sm text-gray-500 hover:text-gray-800 px-4 py-2 transition-colors"
          >
            Отмена
          </Link>
          <button
            onClick={handleSave}
            disabled={saving || translating}
            className="text-sm font-semibold px-6 py-2.5 rounded-full bg-emerald-600 text-white hover:bg-emerald-700 transition-all active:scale-95 disabled:opacity-50 flex items-center gap-2"
          >
            {translating && <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />}
            {translating ? 'Перевожу...' : saving ? 'Сохранение...' : 'Сохранить'}
          </button>
        </div>
      </div>
    </main>
  );
}
