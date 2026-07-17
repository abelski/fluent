'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { BACKEND_URL, getToken } from '../../../../lib/api';

// ── Types ────────────────────────────────────────────────────────────────────

interface GrammarProgramRow {
  id: number;
  title: string;
  title_en: string | null;
  description: string | null;
  difficulty: number;
  is_public: boolean;
  lesson_filter: string | null;
}

interface GrammarConfig {
  lessons: Array<[number, string, number[], number, string]>;
  cases: Record<string, [string, string]>;
}

interface LessonInfo {
  id: number;
  level: 'basic' | 'advanced' | 'practice';
  title: string;
  task_count: number;
  cases: number[];
}

interface GrammarSentence {
  id: number;
  case_index: number;
  display: string;
  answer_ending: string;
  full_word: string;
  russian: string;
  archived: boolean;
  use_in_basic: boolean;
  use_in_advanced: boolean;
  use_in_practice: boolean;
}

interface GrammarRule {
  id: number;
  case_index: number;
  name_ru: string;
  question: string;
  usage: string;
  endings_sg: string;
  endings_pl: string;
  transform: string;
  status: string;
  article_slug: string | null;
}

interface SentenceForm {
  id: number | null;
  case_index: number;
  display: string;
  answer_ending: string;
  full_word: string;
  russian: string;
}

// ── Constants ────────────────────────────────────────────────────────────────

const GROUP_LABELS: Record<string, string> = {
  Vienaskaita: 'Единственное число',
  Daugiskaita: 'Множественное число',
  Skaičiai:   'Числительные',
};

const GROUP_ORDER = ['Vienaskaita', 'Daugiskaita', 'Skaičiai'];

const LEVEL_META: Record<string, { label: string; color: string }> = {
  basic:    { label: 'Basic',    color: 'bg-blue-100 text-blue-700 border-blue-200' },
  advanced: { label: 'Advanced', color: 'bg-amber-100 text-amber-700 border-amber-200' },
  practice: { label: 'Practice', color: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
};

const STATUS_COLORS: Record<string, string> = {
  published: 'border-emerald-500 bg-emerald-50 text-emerald-700',
  testing:   'border-amber-400 bg-amber-50 text-amber-700',
  draft:     'border-gray-300 bg-gray-50 text-gray-500',
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function authHeaders() {
  const token = getToken();
  return { Authorization: `Bearer ${token}` };
}

function deriveLessonsByCase(config: GrammarConfig): Record<number, LessonInfo[]> {
  const map: Record<number, LessonInfo[]> = {};
  for (const entry of config.lessons) {
    const [id, level, cases, task_count, title] = entry;
    for (const c of cases) {
      if (!map[c]) map[c] = [];
      map[c].push({ id, level: level as LessonInfo['level'], title, task_count, cases });
    }
  }
  return map;
}

function deriveGroupCases(config: GrammarConfig): Record<string, number[]> {
  const groups: Record<string, number[]> = {};
  const seen = new Set<number>();
  // Follow lesson order so cases appear in learning sequence
  for (const entry of config.lessons) {
    for (const c of entry[2]) {
      if (!seen.has(c)) {
        seen.add(c);
        const group = config.cases[String(c)]?.[1] ?? 'Other';
        if (!groups[group]) groups[group] = [];
        groups[group].push(c);
      }
    }
  }
  // Add any cases from CASE_INFO not in lessons
  for (const k of Object.keys(config.cases).map(Number)) {
    if (!seen.has(k)) {
      seen.add(k);
      const group = config.cases[String(k)]?.[1] ?? 'Other';
      if (!groups[group]) groups[group] = [];
      groups[group].push(k);
    }
  }
  return groups;
}

// ── Main component ───────────────────────────────────────────────────────────

export default function GrammarAdminPage() {
  const router = useRouter();

  const [config, setConfig] = useState<GrammarConfig | null>(null);
  const [lessonsByCase, setLessonsByCase] = useState<Record<number, LessonInfo[]>>({});
  const [groupCases, setGroupCases] = useState<Record<string, number[]>>({});
  const [sentences, setSentences] = useState<GrammarSentence[]>([]);
  const [rules, setRules] = useState<GrammarRule[]>([]);
  const [programs, setPrograms] = useState<GrammarProgramRow[]>([]);
  const [loading, setLoading] = useState(true);

  // Which cases have their sentence panel expanded
  const [expandedCases, setExpandedCases] = useState<Set<number>>(new Set());
  // Which groups are collapsed
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  // Which program has its lessons panel expanded (null = none)
  const [expandedProgramId, setExpandedProgramId] = useState<number | null>(null);

  // Programs modal state
  const [programModal, setProgramModal] = useState<GrammarProgramRow | 'new' | null>(null);
  const [programForm, setProgramForm] = useState({ title: '', title_en: '', description: '', difficulty: 1, is_public: true, lesson_filter: '' });
  const [programError, setProgramError] = useState('');

  // Sentence modal state
  const [sentenceModal, setSentenceModal] = useState<SentenceForm | null>(null);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const loadData = useCallback(async () => {
    const token = getToken();
    if (!token) { router.replace('/login'); return; }
    const headers = { Authorization: `Bearer ${token}` };

    const [configRes, sentencesRes, rulesRes, programsRes] = await Promise.all([
      fetch(`${BACKEND_URL}/api/admin/grammar/config`),
      fetch(`${BACKEND_URL}/api/admin/grammar/sentences?show_archived=true`, { headers }),
      fetch(`${BACKEND_URL}/api/admin/grammar/rules`, { headers }),
      fetch(`${BACKEND_URL}/api/admin/grammar/programs`, { headers }),
    ]);

    if (sentencesRes.status === 403 || sentencesRes.status === 401) {
      router.replace('/dashboard/lists');
      return;
    }

    if (configRes.ok) {
      const cfg: GrammarConfig = await configRes.json();
      setConfig(cfg);
      setLessonsByCase(deriveLessonsByCase(cfg));
      setGroupCases(deriveGroupCases(cfg));
    }
    if (sentencesRes.ok) setSentences(await sentencesRes.json());
    if (rulesRes.ok) setRules(await rulesRes.json());
    if (programsRes.ok) setPrograms(await programsRes.json());
    setLoading(false);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadData(); }, [loadData]);

  function openProgramModal(p: GrammarProgramRow | 'new') {
    if (p === 'new') {
      setProgramForm({ title: '', title_en: '', description: '', difficulty: 1, is_public: true, lesson_filter: '' });
    } else {
      setProgramForm({ title: p.title, title_en: p.title_en ?? '', description: p.description ?? '', difficulty: p.difficulty, is_public: p.is_public, lesson_filter: p.lesson_filter ?? '' });
    }
    setProgramModal(p);
    setProgramError('');
  }

  async function saveProgram() {
    if (!programForm.title.trim()) { setProgramError('Название обязательно'); return; }
    setSaving(true); setProgramError('');
    const isNew = programModal === 'new';
    const url = isNew
      ? `${BACKEND_URL}/api/admin/grammar/programs`
      : `${BACKEND_URL}/api/admin/grammar/programs/${(programModal as GrammarProgramRow).id}`;
    const res = await fetch(url, {
      method: isNew ? 'POST' : 'PATCH',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({
        title: programForm.title.trim(),
        title_en: programForm.title_en.trim() || null,
        description: programForm.description.trim() || null,
        difficulty: programForm.difficulty,
        is_public: programForm.is_public,
        lesson_filter: programForm.lesson_filter.trim() || null,
      }),
    }).catch(() => null);
    setSaving(false);
    if (res?.ok) { setProgramModal(null); loadData(); }
    else setProgramError('Ошибка при сохранении');
  }

  async function deleteProgram(id: number) {
    if (!confirm('Удалить программу? Пользователи потеряют доступ.')) return;
    await fetch(`${BACKEND_URL}/api/admin/grammar/programs/${id}`, {
      method: 'DELETE', headers: authHeaders(),
    }).catch(() => null);
    loadData();
  }

  const allUniqueLessons: LessonInfo[] = config
    ? Array.from(
        config.lessons.reduce((map, [id, level, cases, task_count, title]) => {
          if (!map.has(id)) map.set(id, { id, level: level as LessonInfo['level'], title, task_count, cases });
          return map;
        }, new Map<number, LessonInfo>()).values()
      )
    : [];

  function getProgramCases(program: GrammarProgramRow): number[] {
    if (!program.lesson_filter) return GROUP_ORDER.flatMap(g => groupCases[g] ?? []);
    let groups: string[];
    try { groups = JSON.parse(program.lesson_filter); } catch { return []; }
    return groups.flatMap(g => groupCases[g] ?? []);
  }

  function filterProgramLessons(program: GrammarProgramRow): LessonInfo[] {
    if (!program.lesson_filter) return allUniqueLessons;
    let allowed: Set<string>;
    try { allowed = new Set(JSON.parse(program.lesson_filter)); } catch { return allUniqueLessons; }
    const caseToGroup: Record<number, string> = {};
    if (config) {
      for (const [k, v] of Object.entries(config.cases)) caseToGroup[Number(k)] = v[1];
    }
    return allUniqueLessons.filter(l => l.cases.every(c => allowed.has(caseToGroup[c] ?? '')));
  }

  function toggleCase(idx: number) {
    setExpandedCases(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx); else next.add(idx);
      return next;
    });
  }

  function toggleGroup(group: string) {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group); else next.add(group);
      return next;
    });
  }

  async function setRuleStatus(ruleId: number, status: string) {
    await fetch(`${BACKEND_URL}/api/admin/grammar/rules/${ruleId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ status }),
    }).catch(() => null);
    setRules(prev => prev.map(r => r.id === ruleId ? { ...r, status } : r));
  }

  async function toggleSentenceLevel(s: GrammarSentence, level: 'basic' | 'advanced' | 'practice') {
    const key = `use_in_${level}` as keyof GrammarSentence;
    const updated = { ...s, [key]: !s[key] };
    setSentences(prev => prev.map(r => r.id === s.id ? updated : r));
    const res = await fetch(`${BACKEND_URL}/api/admin/grammar/sentences/${s.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({
        display: s.display, answer_ending: s.answer_ending, full_word: s.full_word, russian: s.russian,
        use_in_basic: updated.use_in_basic, use_in_advanced: updated.use_in_advanced, use_in_practice: updated.use_in_practice,
      }),
    }).catch(() => null);
    if (!res?.ok) setSentences(prev => prev.map(r => r.id === s.id ? s : r));
  }

  async function archiveSentence(id: number) {
    if (!confirm('Скрыть это предложение из упражнений?')) return;
    const res = await fetch(`${BACKEND_URL}/api/admin/grammar/sentences/${id}`, {
      method: 'DELETE', headers: authHeaders(),
    }).catch(() => null);
    if (res?.ok) loadData();
  }

  function openAddSentence(caseIdx: number) {
    setSentenceModal({ id: null, case_index: caseIdx, display: '', answer_ending: '', full_word: '', russian: '' });
    setFormError('');
  }

  function openEditSentence(s: GrammarSentence) {
    setSentenceModal({ id: s.id, case_index: s.case_index, display: s.display, answer_ending: s.answer_ending, full_word: s.full_word, russian: s.russian });
    setFormError('');
  }

  async function saveSentence() {
    if (!sentenceModal) return;
    if (!sentenceModal.display.includes('___')) { setFormError('Предложение должно содержать ___ (пропуск)'); return; }
    if (!sentenceModal.answer_ending.trim() || !sentenceModal.full_word.trim() || !sentenceModal.russian.trim()) { setFormError('Все поля обязательны'); return; }
    setSaving(true); setFormError('');
    const isNew = sentenceModal.id === null;
    const url = isNew
      ? `${BACKEND_URL}/api/admin/grammar/sentences`
      : `${BACKEND_URL}/api/admin/grammar/sentences/${sentenceModal.id}`;
    const res = await fetch(url, {
      method: isNew ? 'POST' : 'PATCH',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({
        case_index: sentenceModal.case_index,
        display: sentenceModal.display.trim(),
        answer_ending: sentenceModal.answer_ending.trim(),
        full_word: sentenceModal.full_word.trim(),
        russian: sentenceModal.russian.trim(),
      }),
    }).catch(() => null);
    setSaving(false);
    if (res?.ok) { setSentenceModal(null); loadData(); }
    else setFormError('Ошибка при сохранении');
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const groups = GROUP_ORDER.filter(g => groupCases[g]?.length);

  return (
    <main className="bg-slate-50 text-gray-900 min-h-screen">
      <div className="pointer-events-none fixed inset-0 flex items-start justify-center overflow-hidden">
        <div className="w-full max-w-[600px] h-[400px] bg-emerald-100/40 blur-[120px] rounded-full mt-[-100px]" />
      </div>

      <div className="relative z-10 max-w-4xl mx-auto px-6 py-8">
        <div className="flex items-center gap-3 mb-2">
          <Link href="/dashboard/admin" className="text-sm text-gray-400 hover:text-gray-900 transition-colors">
            ← Админ
          </Link>
        </div>
        <h1 className="font-headline text-3xl font-bold mb-1">Грамматика</h1>
        <p className="text-gray-400 mb-6 text-sm">Программы, падежи и предложения</p>

        {/* Programs section */}
        <div className="flex items-center justify-between mb-3">
          <span className="font-bold text-gray-900">Программы</span>
          <button
            onClick={() => openProgramModal('new')}
            className="text-xs px-3 py-1.5 bg-gray-900 text-white rounded-xl hover:bg-gray-800 transition-colors font-medium"
          >
            + Добавить
          </button>
        </div>
        {programs.length === 0 ? (
          <p className="text-gray-400 text-sm py-6 text-center">Нет программ</p>
        ) : (
          <div className="flex flex-col gap-4">
            {programs.map(p => {
              const progCases = getProgramCases(p);
              const totalActive = sentences.filter(s => progCases.includes(s.case_index) && !s.archived).length;
              const isOpen = expandedProgramId === p.id;
              return (
                <div key={p.id} className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
                  {/* Program header row */}
                  <div className="flex items-center gap-3 px-5 py-4 group hover:bg-gray-50 transition-colors">
                    <button
                      onClick={() => setExpandedProgramId(isOpen ? null : p.id)}
                      data-testid={`program-lessons-toggle-${p.id}`}
                      className="flex items-center gap-3 flex-1 min-w-0 text-left"
                    >
                      <svg width="10" height="10" viewBox="0 0 12 12" fill="currentColor"
                        className={`text-gray-400 transition-transform duration-150 shrink-0 ${isOpen ? '' : '-rotate-90'}`}
                      >
                        <path d="M6 8L1 3h10L6 8z" />
                      </svg>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-900">{p.title}</p>
                        {p.description && <p className="text-xs text-gray-400 mt-0.5 truncate">{p.description}</p>}
                      </div>
                      <span className="text-xs text-gray-400 shrink-0">
                        {progCases.length} падежей · {totalActive} пред.
                      </span>
                    </button>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium shrink-0 ${
                      p.difficulty === 1 ? 'bg-emerald-100 text-emerald-700' :
                      p.difficulty === 2 ? 'bg-amber-100 text-amber-700' :
                      'bg-red-100 text-red-700'
                    }`}>
                      {p.difficulty === 1 ? 'easy' : p.difficulty === 2 ? 'medium' : 'hard'}
                    </span>
                    {!p.is_public && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 shrink-0">скрыта</span>
                    )}
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                      <button
                        onClick={() => openProgramModal(p)}
                        className="text-xs px-2 py-1 border border-gray-200 rounded-lg text-gray-400 hover:border-gray-900 hover:text-emerald-600 transition-colors"
                      >
                        ✎
                      </button>
                      <button
                        onClick={() => deleteProgram(p.id)}
                        className="text-xs px-2 py-1 border border-gray-200 rounded-lg text-gray-400 hover:border-red-200 hover:text-red-500 transition-colors"
                      >
                        ✕
                      </button>
                    </div>
                  </div>

                  {/* Expanded cases panel */}
                  {isOpen && (
                    <div className="border-t border-gray-100 divide-y divide-gray-100" data-testid={`program-lessons-panel-${p.id}`}>
                      {progCases.length === 0 ? (
                        <p className="text-gray-400 text-xs py-4 px-5">Нет падежей</p>
                      ) : progCases.map((caseIdx: number) => (
                        <CaseRow
                          key={caseIdx}
                          caseIdx={caseIdx}
                          caseName={config?.cases[String(caseIdx)]?.[0] ?? `Падеж ${caseIdx}`}
                          lessons={lessonsByCase[caseIdx] ?? []}
                          rule={rules.find(r => r.case_index === caseIdx) ?? null}
                          sentences={sentences.filter(s => s.case_index === caseIdx)}
                          expanded={expandedCases.has(caseIdx)}
                          onToggle={() => toggleCase(caseIdx)}
                          onSetStatus={(id, status) => setRuleStatus(id, status)}
                          onAddSentence={() => { openAddSentence(caseIdx); if (!expandedCases.has(caseIdx)) toggleCase(caseIdx); }}
                          onEditSentence={openEditSentence}
                          onArchiveSentence={archiveSentence}
                          onToggleLevel={toggleSentenceLevel}
                        />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Program modal */}
      {programModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4"
          onClick={e => { if (e.target === e.currentTarget) { setProgramModal(null); setProgramError(''); } }}
        >
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <h2 className="font-headline text-lg font-bold mb-4 text-gray-900">
              {programModal === 'new' ? 'Новая программа' : 'Редактировать программу'}
            </h2>
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs text-gray-500">Название (RU)</label>
                <input
                  value={programForm.title}
                  onChange={e => setProgramForm(f => ({ ...f, title: e.target.value }))}
                  placeholder="Литовские падежи"
                  className="border border-gray-300 focus:border-gray-900 rounded-xl px-3 py-2 text-sm outline-none transition-colors"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-gray-500">Название (EN)</label>
                <input
                  value={programForm.title_en}
                  onChange={e => setProgramForm(f => ({ ...f, title_en: e.target.value }))}
                  placeholder="Lithuanian Cases"
                  className="border border-gray-300 focus:border-gray-900 rounded-xl px-3 py-2 text-sm outline-none transition-colors"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-gray-500">Описание</label>
                <textarea
                  value={programForm.description}
                  onChange={e => setProgramForm(f => ({ ...f, description: e.target.value }))}
                  rows={2}
                  className="border border-gray-300 focus:border-gray-900 rounded-xl px-3 py-2 text-sm outline-none resize-none transition-colors"
                />
              </div>
              <div className="flex gap-3">
                <div className="flex flex-col gap-1 flex-1">
                  <label className="text-xs text-gray-500">Сложность</label>
                  <select
                    value={programForm.difficulty}
                    onChange={e => setProgramForm(f => ({ ...f, difficulty: Number(e.target.value) }))}
                    className="border border-gray-300 focus:border-gray-900 rounded-xl px-3 py-2 text-sm outline-none transition-colors"
                  >
                    <option value={1}>Easy</option>
                    <option value={2}>Medium</option>
                    <option value={3}>Hard</option>
                  </select>
                </div>
                <div className="flex flex-col gap-1 justify-end">
                  <label className="flex items-center gap-2 text-xs text-gray-500 cursor-pointer pb-2">
                    <input
                      type="checkbox"
                      checked={programForm.is_public}
                      onChange={e => setProgramForm(f => ({ ...f, is_public: e.target.checked }))}
                      className="w-4 h-4"
                    />
                    Публичная
                  </label>
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-gray-500">Фильтр уроков</label>
                <select
                  value={programForm.lesson_filter}
                  onChange={e => setProgramForm(f => ({ ...f, lesson_filter: e.target.value }))}
                  className="border border-gray-300 focus:border-gray-900 rounded-xl px-3 py-2 text-sm outline-none transition-colors"
                >
                  <option value="">Все уроки</option>
                  <option value='["Vienaskaita","Daugiskaita"]'>Падежи (ед. и мн. число)</option>
                  <option value='["Vienaskaita"]'>Только единственное число</option>
                  <option value='["Daugiskaita"]'>Только множественное число</option>
                  <option value='["Skaičiai"]'>Числительные</option>
                </select>
                <p className="text-[10px] text-gray-400 mt-0.5">Какие уроки показывать пользователям в этой программе</p>
              </div>
            </div>
            {programError && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2 mt-3">{programError}</p>
            )}
            <div className="flex gap-2 mt-5">
              <button
                onClick={saveProgram}
                disabled={saving}
                className="flex-1 py-2 bg-gray-900 hover:bg-gray-800 rounded-xl font-medium text-white text-sm transition-colors disabled:opacity-50"
              >
                {saving ? '...' : 'Сохранить'}
              </button>
              <button
                onClick={() => { setProgramModal(null); setProgramError(''); }}
                className="px-4 py-2 text-gray-500 hover:text-gray-900 text-sm transition-colors"
              >
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sentence modal */}
      {sentenceModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4"
          onClick={e => { if (e.target === e.currentTarget) { setSentenceModal(null); setFormError(''); } }}
        >
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6">
            <h2 className="font-headline text-lg font-bold mb-4 text-gray-900">
              {sentenceModal.id === null ? 'Новое предложение' : 'Редактировать предложение'}
            </h2>
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs text-gray-500">Предложение с пропуском (___)</label>
                <input
                  value={sentenceModal.display}
                  onChange={e => setSentenceModal(d => d ? { ...d, display: e.target.value } : d)}
                  placeholder="Laima mato brol___."
                  className="bg-white border border-gray-300 focus:border-gray-900 rounded-xl px-3 py-2 text-sm outline-none w-full transition-colors"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-gray-500">Окончание</label>
                  <input
                    value={sentenceModal.answer_ending}
                    onChange={e => setSentenceModal(d => d ? { ...d, answer_ending: e.target.value } : d)}
                    placeholder="į"
                    className="bg-white border border-gray-300 focus:border-gray-900 rounded-xl px-3 py-2 text-sm outline-none transition-colors"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-gray-500">Полное слово</label>
                  <input
                    value={sentenceModal.full_word}
                    onChange={e => setSentenceModal(d => d ? { ...d, full_word: e.target.value } : d)}
                    placeholder="brolį"
                    className="bg-white border border-gray-300 focus:border-gray-900 rounded-xl px-3 py-2 text-sm outline-none transition-colors"
                  />
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-gray-500">Перевод на русский</label>
                <input
                  value={sentenceModal.russian}
                  onChange={e => setSentenceModal(d => d ? { ...d, russian: e.target.value } : d)}
                  placeholder="Лайма видит брата."
                  className="bg-white border border-gray-300 focus:border-gray-900 rounded-xl px-3 py-2 text-sm outline-none w-full transition-colors"
                />
              </div>
            </div>
            {formError && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2 mt-3">{formError}</p>
            )}
            <div className="flex gap-2 mt-5">
              <button
                onClick={saveSentence}
                disabled={saving}
                className="flex-1 py-2 bg-gray-900 hover:bg-gray-800 rounded-xl font-medium text-white text-sm transition-colors disabled:opacity-50"
              >
                {saving ? '...' : 'Сохранить'}
              </button>
              <button
                onClick={() => { setSentenceModal(null); setFormError(''); }}
                className="px-4 py-2 text-gray-500 hover:text-gray-900 text-sm transition-colors"
              >
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

// ── Case row ─────────────────────────────────────────────────────────────────

function CaseRow({
  caseIdx,
  caseName,
  lessons,
  rule,
  sentences,
  expanded,
  onToggle,
  onSetStatus,
  onAddSentence,
  onEditSentence,
  onArchiveSentence,
  onToggleLevel,
}: {
  caseIdx?: number;
  caseName: string;
  lessons: LessonInfo[];
  rule: GrammarRule | null;
  sentences: GrammarSentence[];
  expanded: boolean;
  onToggle: () => void;
  onSetStatus: (id: number, status: string) => void;
  onAddSentence: () => void;
  onEditSentence: (s: GrammarSentence) => void;
  onArchiveSentence: (id: number) => void;
  onToggleLevel: (s: GrammarSentence, level: 'basic' | 'advanced' | 'practice') => void;
}) {
  const activeCount = sentences.filter(s => !s.archived).length;
  const hasLessons = lessons.length > 0;
  const status = rule?.status ?? 'draft';

  return (
    <div>
      {/* Case header row */}
      <div className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50 transition-colors group">
        <button onClick={onToggle} className="flex items-center gap-3 flex-1 min-w-0 text-left">
          <svg
            width="10" height="10" viewBox="0 0 12 12" fill="currentColor"
            className={`text-gray-300 transition-transform duration-150 shrink-0 ${expanded ? 'rotate-180' : ''}`}
          >
            <path d="M6 8L1 3h10L6 8z" />
          </svg>
          <span className="text-sm font-medium text-gray-800 truncate">{caseName}</span>

          {/* Lesson badges */}
          {hasLessons ? (
            <div className="flex gap-1 shrink-0">
              {(['basic', 'advanced', 'practice'] as const).map(level => {
                const l = lessons.find(x => x.level === level);
                return l ? (
                  <span key={level} className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${LEVEL_META[level].color}`}>
                    {l.task_count}
                  </span>
                ) : null;
              })}
            </div>
          ) : (
            <span className="text-[10px] text-amber-400 shrink-0">нет уроков</span>
          )}

          <span className="text-xs text-gray-400 shrink-0">{activeCount} пр.</span>
        </button>

        {/* Status selector — always visible */}
        {rule && (
          <select
            value={status}
            onClick={e => e.stopPropagation()}
            onChange={e => onSetStatus(rule.id, e.target.value)}
            className={`text-[11px] border rounded-lg px-2 py-1 outline-none font-medium shrink-0 transition-colors ${STATUS_COLORS[status] ?? STATUS_COLORS.draft}`}
          >
            <option value="draft">Черновик</option>
            <option value="testing">Тестирование</option>
            <option value="published">Опубликован</option>
          </select>
        )}

        <button
          onClick={e => { e.stopPropagation(); onAddSentence(); }}
          className="text-xs px-2 py-1 border border-gray-200 rounded-lg text-gray-400 hover:border-gray-900 hover:text-gray-900 transition-colors shrink-0 opacity-0 group-hover:opacity-100"
        >
          + пред.
        </button>
      </div>

      {/* Expanded sentences panel */}
      {expanded && (
        <div className="bg-gray-50 border-t border-gray-100">
          {/* Rule summary */}
          {rule && (rule.usage || rule.endings_sg) && (
            <div className="px-5 py-3 border-b border-gray-100 flex gap-6 text-xs text-gray-500">
              {rule.question && <span><span className="text-gray-400">Вопрос:</span> {rule.question}</span>}
              {rule.endings_sg && <span><span className="text-gray-400">Ед.ч.:</span> <span className="font-mono">{rule.endings_sg}</span></span>}
              {rule.endings_pl && <span><span className="text-gray-400">Мн.ч.:</span> <span className="font-mono">{rule.endings_pl}</span></span>}
            </div>
          )}

          {/* Sentences */}
          <div className="divide-y divide-gray-100">
            {sentences.filter(s => !s.archived).length === 0 && (
              <p className="text-gray-400 text-xs py-4 px-5">Нет предложений</p>
            )}
            {sentences.filter(s => !s.archived).map(s => (
              <div key={s.id} className="flex items-start gap-2 px-5 py-2 group/row hover:bg-white transition-colors">
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-1.5 flex-wrap">
                    {hasLessons && (['basic', 'advanced', 'practice'] as const).map(level => {
                      const active = s[`use_in_${level}`];
                      const meta = LEVEL_META[level];
                      return (
                        <button
                          key={level}
                          onClick={() => onToggleLevel(s, level)}
                          className={`text-[9px] font-semibold px-1 py-0.5 rounded border shrink-0 transition-all cursor-pointer ${
                            active ? `${meta.color} hover:opacity-70` : 'bg-white text-gray-300 border-gray-200 hover:border-gray-400 hover:text-gray-400'
                          }`}
                        >
                          {meta.label}
                        </button>
                      );
                    })}
                    <span className="text-xs text-gray-900 font-mono">
                      {s.display.replace('___', `[${s.answer_ending}]`)}
                    </span>
                  </div>
                  <p className="text-[11px] text-gray-400 mt-0.5">
                    <span className="text-emerald-600 font-medium">{s.full_word}</span>
                    {' · '}{s.russian}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover/row:opacity-100 transition-opacity">
                  <button
                    onClick={() => onEditSentence(s)}
                    className="text-[11px] px-1.5 py-0.5 border border-gray-200 rounded text-gray-400 hover:border-gray-900 hover:text-emerald-600 transition-colors"
                  >
                    ✎
                  </button>
                  <button
                    onClick={() => onArchiveSentence(s.id)}
                    className="text-[11px] px-1.5 py-0.5 border border-gray-200 rounded text-gray-400 hover:border-red-200 hover:text-red-500 transition-colors"
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="px-5 py-2 border-t border-gray-100">
            <button
              onClick={onAddSentence}
              className="text-xs text-gray-400 hover:text-gray-900 transition-colors"
            >
              + Добавить предложение
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
