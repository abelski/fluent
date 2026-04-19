'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { BACKEND_URL, getToken, resolvePhraseId } from '../../../../lib/api';

interface PhraseRow {
  id: number;
  text: string;
  translation: string;
  translation_en: string | null;
  chapter: number | null;
  chapter_title: string | null;
  position: number;
  lesson_stage: number; // 0=new, 1=fill-word, 2=mastered
}

interface ProgramDetail {
  id: number;
  title: string;
  title_en: string | null;
  description: string | null;
  description_en: string | null;
  difficulty: number;
  phrases: PhraseRow[];
}

const STAGE_LABELS: Record<number, string> = { 0: 'Новая', 1: 'Изучается', 2: 'Освоена' };
const STAGE_COLORS: Record<number, string> = {
  0: 'text-gray-400',
  1: 'text-amber-500',
  2: 'text-emerald-600',
};

interface Chapter {
  num: number | null;
  title: string | null;
  phrases: PhraseRow[];
}

export default function PhraseProgramDetailPage() {
  const { id: _id } = useParams<{ id: string }>();
  const id = resolvePhraseId(_id);
  const router = useRouter();

  const [program, setProgram] = useState<ProgramDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  useEffect(() => {
    const token = getToken();
    fetch(`${BACKEND_URL}/api/phrase-programs/${id}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { if (data) setProgram(data); else router.replace('/dashboard/phrases'); })
      .catch(() => router.replace('/dashboard/phrases'))
      .finally(() => setLoading(false));
  }, [id, router]);

  function handleStudyAll() {
    if (!getToken()) { router.replace('/login'); return; }
    router.push(`/dashboard/phrases/${id}/study`);
  }

  function handleStudyChapter(chapterNum: number) {
    if (!getToken()) { router.replace('/login'); return; }
    router.push(`/dashboard/phrases/${id}/study?chapter=${chapterNum}`);
  }

  function toggleChapter(key: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!program) return null;

  // Group phrases by chapter
  const chapters: Chapter[] = [];
  for (const p of program.phrases) {
    const last = chapters[chapters.length - 1];
    if (!last || last.num !== p.chapter) {
      chapters.push({ num: p.chapter, title: p.chapter_title, phrases: [p] });
    } else {
      last.phrases.push(p);
    }
  }

  const hasChapters = chapters.some((c) => c.num !== null);
  const masteredCount = program.phrases.filter((p) => p.lesson_stage === 2).length;
  const learningCount = program.phrases.filter((p) => p.lesson_stage === 1).length;

  return (
    <main className="bg-slate-50 text-gray-900 min-h-screen">
      <div className="pointer-events-none fixed inset-0 flex items-start justify-center overflow-hidden">
        <div className="w-full max-w-[600px] h-[400px] bg-emerald-100/40 blur-[120px] rounded-full mt-[-100px]" />
      </div>

      <div className="relative z-10 max-w-4xl mx-auto px-6 py-8">
        {/* Back */}
        <div className="mb-4">
          <Link href="/dashboard/phrases" className="text-gray-400 hover:text-gray-900 text-sm transition-colors">
            ← Назад к программам
          </Link>
        </div>

        {/* Header */}
        <div className="flex items-start justify-between gap-4 mb-6">
          <div>
            <h1 className="text-3xl font-bold">{program.title}</h1>
            {program.description && (
              <p className="text-gray-400 mt-1">{program.description}</p>
            )}
            <p className="text-gray-400 text-sm mt-2">{program.phrases.length} фраз</p>
          </div>
          <button
            onClick={handleStudyAll}
            className="shrink-0 px-6 py-3 bg-gray-900 hover:bg-gray-800 rounded-xl transition-colors font-medium text-sm text-white"
          >
            Учить всё
          </button>
        </div>

        {/* Overall progress bar */}
        {(masteredCount > 0 || learningCount > 0) && (
          <div className="mb-6">
            <div className="flex h-2 rounded-full overflow-hidden gap-0.5 mb-2">
              <div className="bg-emerald-500 transition-all" style={{ width: `${(masteredCount / program.phrases.length) * 100}%` }} />
              <div className="bg-amber-400 transition-all" style={{ width: `${(learningCount / program.phrases.length) * 100}%` }} />
              <div className="bg-gray-200 flex-1" />
            </div>
            <div className="flex gap-4 text-xs text-gray-400">
              <span><span className="text-emerald-600 font-medium">{masteredCount}</span> освоено</span>
              <span><span className="text-amber-500 font-medium">{learningCount}</span> изучается</span>
              <span><span className="font-medium">{program.phrases.length - masteredCount - learningCount}</span> новых</span>
            </div>
          </div>
        )}

        {/* Chapter list */}
        <div className="space-y-4">
          {chapters.map((ch, ci) => {
            const key = `ch-${ci}`;
            const isCollapsed = collapsed.has(key);
            const chMastered = ch.phrases.filter((p) => p.lesson_stage === 2).length;
            const chLearning = ch.phrases.filter((p) => p.lesson_stage === 1).length;
            const chPct = ch.phrases.length > 0 ? Math.round((chMastered / ch.phrases.length) * 100) : 0;

            return (
              <div key={key} className="bg-white border border-gray-900 rounded-2xl overflow-hidden">
                {/* Chapter header — always visible */}
                <div
                  className="flex items-center justify-between px-4 sm:px-6 py-4 cursor-pointer select-none hover:bg-gray-50 transition-colors"
                  onClick={() => toggleChapter(key)}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {/* Collapse arrow */}
                    <span className={`text-gray-400 text-xs transition-transform duration-200 ${isCollapsed ? '-rotate-90' : ''}`}>
                      ▼
                    </span>

                    <div className="min-w-0">
                      <span className="font-semibold text-gray-900">
                        {hasChapters && ch.num !== null
                          ? (ch.title ?? `Глава ${ch.num}`)
                          : program.title}
                      </span>
                      <span className="text-gray-400 text-sm ml-2">{ch.phrases.length} фраз</span>
                      {chMastered > 0 && (
                        <span className="text-emerald-600 text-xs ml-2">{chPct}%</span>
                      )}
                    </div>
                  </div>

                  {/* Chapter study button (only shown for named chapters) */}
                  {hasChapters && ch.num !== null && (
                    <button
                      onClick={(e) => { e.stopPropagation(); handleStudyChapter(ch.num!); }}
                      className="shrink-0 ml-3 px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium rounded-lg transition-colors"
                    >
                      Учить
                    </button>
                  )}
                </div>

                {/* Chapter progress bar (thin, sits below header when not collapsed) */}
                {!isCollapsed && (chMastered > 0 || chLearning > 0) && (
                  <div className="flex h-1 mx-4 sm:mx-6 mb-0 overflow-hidden rounded-full gap-0.5">
                    <div className="bg-emerald-500" style={{ width: `${(chMastered / ch.phrases.length) * 100}%` }} />
                    <div className="bg-amber-400" style={{ width: `${(chLearning / ch.phrases.length) * 100}%` }} />
                    <div className="bg-gray-100 flex-1" />
                  </div>
                )}

                {/* Phrase rows */}
                {!isCollapsed && (
                  <div className="border-t border-gray-900">
                    <div className="grid grid-cols-[1fr_1fr_auto] text-xs text-gray-400 uppercase tracking-wider px-4 sm:px-6 py-2 border-b border-gray-100">
                      <span>Фраза</span>
                      <span>Перевод</span>
                      <span>Уровень</span>
                    </div>
                    {ch.phrases.map((phrase, i) => (
                      <div
                        key={phrase.id}
                        className={`grid grid-cols-[1fr_1fr_auto] px-4 sm:px-6 py-3 gap-4 items-center ${
                          i < ch.phrases.length - 1 ? 'border-b border-gray-100' : ''
                        }`}
                      >
                        <span className="font-medium text-gray-900 text-sm">{phrase.text}</span>
                        <span className="text-gray-500 text-sm">{phrase.translation}</span>
                        <span className={`text-xs font-medium ${STAGE_COLORS[phrase.lesson_stage] ?? 'text-gray-400'}`}>
                          {STAGE_LABELS[phrase.lesson_stage] ?? ''}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </main>
  );
}
