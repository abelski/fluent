'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { BACKEND_URL, getToken } from '../../../../lib/api';

// Case names for tabs (case_index 1-14)
const CASE_NAMES: Record<number, string> = {
  1: 'Vardininkas sg',
  2: 'Kilmininkas sg',
  3: 'Naudininkas sg',
  4: 'Galininkas sg',
  5: 'Įnagininkas sg',
  6: 'Vietininkas sg',
  7: 'Šauksmininkas sg',
  8: 'Vardininkas pl',
  9: 'Kilmininkas pl',
  10: 'Naudininkas pl',
  11: 'Galininkas pl',
  12: 'Įnagininkas pl',
  13: 'Vietininkas pl',
  14: 'Šauksmininkas pl',
};

// Lesson configuration derived from content/grammar/lessons.json
// Format: [lesson_id, level, [case_indices], task_count, title]
// basic    = sentence gap-fill, grammar rule always visible
// advanced = sentence gap-fill, grammar rule collapsible
// practice = sentence gap-fill, no grammar rule shown
interface LessonInfo {
  id: number;
  level: 'basic' | 'advanced' | 'practice';
  title: string;
  task_count: number;
}
const LESSONS_BY_CASE: Record<number, LessonInfo[]> = {
  4:  [{ id: 1,  level: 'basic',    title: 'Galininkas Vns.',    task_count: 24 },
       { id: 2,  level: 'advanced', title: 'Galininkas Vns.',    task_count: 35 },
       { id: 3,  level: 'practice', title: 'Galininkas Vns.',    task_count: 20 }],
  6:  [{ id: 4,  level: 'basic',    title: 'Vietininkas Vns.',   task_count: 24 },
       { id: 5,  level: 'advanced', title: 'Vietininkas Vns.',   task_count: 35 },
       { id: 6,  level: 'practice', title: 'Vietininkas Vns.',   task_count: 20 }],
  2:  [{ id: 10, level: 'basic',    title: 'Kilmininkas Vns.',   task_count: 24 },
       { id: 11, level: 'advanced', title: 'Kilmininkas Vns.',   task_count: 35 },
       { id: 12, level: 'practice', title: 'Kilmininkas Vns.',   task_count: 20 }],
  8:  [{ id: 16, level: 'basic',    title: 'Vardininkas Dgs.',   task_count: 24 },
       { id: 17, level: 'advanced', title: 'Vardininkas Dgs.',   task_count: 35 },
       { id: 18, level: 'practice', title: 'Vardininkas Dgs.',   task_count: 20 }],
  9:  [{ id: 22, level: 'basic',    title: 'Kilmininkas Dgs.',   task_count: 24 },
       { id: 23, level: 'advanced', title: 'Kilmininkas Dgs.',   task_count: 35 },
       { id: 24, level: 'practice', title: 'Kilmininkas Dgs.',   task_count: 20 }],
  5:  [{ id: 28, level: 'basic',    title: 'Įnagininkas Vns.',   task_count: 24 },
       { id: 29, level: 'advanced', title: 'Įnagininkas Vns.',   task_count: 35 },
       { id: 30, level: 'practice', title: 'Įnagininkas Vns.',   task_count: 10 }],
  3:  [{ id: 34, level: 'basic',    title: 'Naudininkas Vns.',   task_count: 24 },
       { id: 35, level: 'advanced', title: 'Naudininkas Vns.',   task_count: 35 },
       { id: 36, level: 'practice', title: 'Naudininkas Vns.',   task_count: 10 }],
  7:  [{ id: 40, level: 'basic',    title: 'Šauksmininkas Vns.', task_count: 24 },
       { id: 41, level: 'advanced', title: 'Šauksmininkas Vns.', task_count: 35 },
       { id: 42, level: 'practice', title: 'Šauksmininkas Vns.', task_count: 10 }],
  13: [{ id: 46, level: 'basic',    title: 'Vietininkas Dgs.',   task_count: 24 },
       { id: 47, level: 'advanced', title: 'Vietininkas Dgs.',   task_count: 35 },
       { id: 48, level: 'practice', title: 'Vietininkas Dgs.',   task_count: 10 }],
  11: [{ id: 52, level: 'basic',    title: 'Galininkas Dgs.',    task_count: 24 },
       { id: 53, level: 'advanced', title: 'Galininkas Dgs.',    task_count: 35 },
       { id: 54, level: 'practice', title: 'Galininkas Dgs.',    task_count: 10 }],
  12: [{ id: 58, level: 'basic',    title: 'Įnagininkas Dgs.',   task_count: 24 },
       { id: 59, level: 'advanced', title: 'Įnagininkas Dgs.',   task_count: 35 },
       { id: 60, level: 'practice', title: 'Įnagininkas Dgs.',   task_count: 10 }],
  10: [{ id: 64, level: 'basic',    title: 'Naudininkas Dgs.',   task_count: 24 },
       { id: 65, level: 'advanced', title: 'Naudininkas Dgs.',   task_count: 35 },
       { id: 66, level: 'practice', title: 'Naudininkas Dgs.',   task_count: 35 }],
};

// Case tabs ordered by learning sequence (matches user-facing grammar page order).
// Cases with no lessons (1, 14) are appended at the end.
const CASE_ORDER: number[] = [4, 6, 2, 8, 9, 5, 3, 7, 13, 11, 12, 10, 1, 14];

const LEVEL_LABELS: Record<string, { label: string; color: string; desc: string }> = {
  basic:    { label: 'Basic',    color: 'bg-blue-100 text-blue-700 border-blue-200',     desc: 'Предложения, правило всегда видно' },
  advanced: { label: 'Advanced', color: 'bg-amber-100 text-amber-700 border-amber-200',  desc: 'Предложения с подсказкой правила' },
  practice: { label: 'Practice', color: 'bg-emerald-100 text-emerald-700 border-emerald-200', desc: 'Предложения без подсказки' },
};

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

interface EditingSentence {
  id: number | null; // null = new
  case_index: number;
  display: string;
  answer_ending: string;
  full_word: string;
  russian: string;
}

interface EditingRule {
  id: number;
  case_index: number;
  name_ru: string;
  question: string;
  usage: string;
  endings_sg: string;
  endings_pl: string;
  transform: string;
  article_slug: string;
}

function authHeaders() {
  const token = getToken();
  return { Authorization: `Bearer ${token}` };
}

export default function GrammarAdminPage() {
  const router = useRouter();
  const [sentences, setSentences] = useState<GrammarSentence[]>([]);
  const [rules, setRules] = useState<GrammarRule[]>([]);
  const [selectedCase, setSelectedCase] = useState<number>(1);
  const [loading, setLoading] = useState(true);
  const [editingSentence, setEditingSentence] = useState<EditingSentence | null>(null);
  const [editingRule, setEditingRule] = useState<EditingRule | null>(null);
  const [saving, setSaving] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [error, setError] = useState('');

  async function loadData() {
    const token = getToken();
    if (!token) { router.replace('/login'); return; }
    const headers = { Authorization: `Bearer ${token}` };
    const [sentencesRes, rulesRes] = await Promise.all([
      fetch(`${BACKEND_URL}/api/admin/grammar/sentences?show_archived=true`, { headers }),
      fetch(`${BACKEND_URL}/api/admin/grammar/rules`, { headers }),
    ]);
    if (sentencesRes.status === 403 || sentencesRes.status === 401) {
      router.replace('/dashboard/lists');
      return;
    }
    if (sentencesRes.ok) setSentences(await sentencesRes.json());
    if (rulesRes.ok) setRules(await rulesRes.json());
    setLoading(false);
  }

  useEffect(() => { loadData(); }, []);

  async function setRuleStatus(ruleId: number, status: string) {
    await fetch(`${BACKEND_URL}/api/admin/grammar/rules/${ruleId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ status }),
    }).catch((err) => console.error('API error:', err));
    setRules((prev) => prev.map((r) => r.id === ruleId ? { ...r, status } : r));
  }

  const visibleSentences = sentences.filter(
    (s) => s.case_index === selectedCase && (showArchived || !s.archived)
  );

  function startAddSentence() {
    setEditingSentence({
      id: null,
      case_index: selectedCase,
      display: '',
      answer_ending: '',
      full_word: '',
      russian: '',
    });
    setError('');
  }

  function startEditSentence(s: GrammarSentence) {
    setEditingSentence({
      id: s.id,
      case_index: s.case_index,
      display: s.display,
      answer_ending: s.answer_ending,
      full_word: s.full_word,
      russian: s.russian,
    });
    setError('');
  }

  async function saveSentence() {
    if (!editingSentence) return;
    if (!editingSentence.display.includes('___')) {
      setError('Поле «предложение» должно содержать ___ (пропуск)');
      return;
    }
    if (!editingSentence.answer_ending.trim() || !editingSentence.full_word.trim() || !editingSentence.russian.trim()) {
      setError('Все поля обязательны');
      return;
    }
    setSaving(true);
    setError('');
    const isNew = editingSentence.id === null;
    const url = isNew
      ? `${BACKEND_URL}/api/admin/grammar/sentences`
      : `${BACKEND_URL}/api/admin/grammar/sentences/${editingSentence.id}`;
    const res = await fetch(url, {
      method: isNew ? 'POST' : 'PATCH',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({
        case_index: editingSentence.case_index,
        display: editingSentence.display.trim(),
        answer_ending: editingSentence.answer_ending.trim(),
        full_word: editingSentence.full_word.trim(),
        russian: editingSentence.russian.trim(),
      }),
    }).catch(() => null);
    setSaving(false);
    if (res?.ok) {
      setEditingSentence(null);
      loadData();
    } else {
      setError('Ошибка при сохранении');
    }
  }

  async function archiveSentence(id: number) {
    if (!confirm('Скрыть это предложение из упражнений?')) return;
    const res = await fetch(`${BACKEND_URL}/api/admin/grammar/sentences/${id}`, {
      method: 'DELETE',
      headers: authHeaders(),
    }).catch(() => null);
    if (res?.ok) loadData();
  }

  async function toggleSentenceLevel(s: GrammarSentence, level: 'basic' | 'advanced' | 'practice') {
    const key = `use_in_${level}` as 'use_in_basic' | 'use_in_advanced' | 'use_in_practice';
    const updated = { ...s, [key]: !s[key] };
    // Optimistic update
    setSentences((prev) => prev.map((row) => row.id === s.id ? updated : row));
    const res = await fetch(`${BACKEND_URL}/api/admin/grammar/sentences/${s.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({
        display: s.display,
        answer_ending: s.answer_ending,
        full_word: s.full_word,
        russian: s.russian,
        use_in_basic: updated.use_in_basic,
        use_in_advanced: updated.use_in_advanced,
        use_in_practice: updated.use_in_practice,
      }),
    }).catch(() => null);
    if (!res?.ok) {
      // Revert on failure
      setSentences((prev) => prev.map((row) => row.id === s.id ? s : row));
    }
  }

  function startEditRule(rule: GrammarRule) {
    setEditingRule({ ...rule, article_slug: rule.article_slug ?? '' });
    setError('');
  }

  async function saveRule() {
    if (!editingRule) return;
    if (!editingRule.name_ru.trim()) {
      setError('Название падежа обязательно');
      return;
    }
    setSaving(true);
    setError('');
    const res = await fetch(`${BACKEND_URL}/api/admin/grammar/rules/${editingRule.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({
        name_ru: editingRule.name_ru.trim(),
        question: editingRule.question.trim(),
        usage: editingRule.usage.trim(),
        endings_sg: editingRule.endings_sg.trim(),
        endings_pl: editingRule.endings_pl.trim(),
        transform: editingRule.transform.trim(),
        article_slug: editingRule.article_slug.trim() || null,
      }),
    }).catch(() => null);
    setSaving(false);
    if (res?.ok) {
      setEditingRule(null);
      loadData();
    } else {
      setError('Ошибка при сохранении');
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const currentRule = rules.find((r) => r.case_index === selectedCase);

  return (
    <main className="bg-slate-50 text-gray-900 min-h-screen">
      <div className="pointer-events-none fixed inset-0 flex items-start justify-center overflow-hidden">
        <div className="w-full max-w-[600px] h-[400px] bg-emerald-100/40 blur-[120px] rounded-full mt-[-100px]" />
      </div>

      <div className="relative z-10 max-w-5xl mx-auto px-6 py-8">
        <div className="flex items-center gap-3 mb-2">
          <Link
            href="/dashboard/admin"
            className="text-sm text-gray-400 hover:text-gray-900 transition-colors"
          >
            ← Админ
          </Link>
        </div>
        <h1 className="text-3xl font-bold mb-1">Грамматика</h1>
        <p className="text-gray-400 mb-6 text-sm">Предложения и правила падежей</p>

        {/* Case tabs */}
        <div className="flex flex-wrap gap-1 mb-6">
          {CASE_ORDER.map((idx, pos) => {
            const count = sentences.filter((s) => s.case_index === idx && !s.archived).length;
            const hasLessons = !!LESSONS_BY_CASE[idx];
            return (
              <button
                key={idx}
                onClick={() => { setSelectedCase(idx); setEditingSentence(null); setEditingRule(null); setError(''); }}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
                  selectedCase === idx
                    ? 'bg-gray-900 text-white border-gray-900'
                    : hasLessons
                      ? 'bg-white text-gray-600 border-gray-200 hover:border-gray-900 hover:text-gray-900'
                      : 'bg-white text-gray-400 border-gray-100 hover:border-gray-300 hover:text-gray-500'
                }`}
              >
                {pos + 1}. {CASE_NAMES[idx]}
                <span className={`ml-1 text-[10px] ${selectedCase === idx ? 'text-gray-300' : 'text-gray-400'}`}>
                  {count}
                </span>
                {!hasLessons && (
                  <span className={`ml-1 text-[9px] ${selectedCase === idx ? 'text-gray-400' : 'text-gray-300'}`} title="Нет уроков">⚠</span>
                )}
              </button>
            );
          })}
        </div>

        {/* Selected case info */}
        <div className="mb-4 flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-lg font-semibold">
              {idx_to_name(selectedCase)}
            </h2>
            {currentRule && (
              <p className="text-gray-400 text-xs mt-0.5">{currentRule.name_ru} · {currentRule.question}</p>
            )}
            {!LESSONS_BY_CASE[selectedCase] && (
              <p className="text-[11px] text-gray-300 mt-0.5">нет уроков — предложения не используются в практике</p>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer">
              <input
                type="checkbox"
                checked={showArchived}
                onChange={(e) => setShowArchived(e.target.checked)}
                className="w-3.5 h-3.5"
              />
              Показать скрытые
            </label>
            <button
              onClick={startAddSentence}
              className="text-xs px-3 py-1.5 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors font-medium"
            >
              + Добавить предложение
            </button>
          </div>
        </div>

        {/* Error message */}
        {error && (
          <div className="mb-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        {/* Add / Edit sentence form */}
        {editingSentence && (
          <div className="mb-4 bg-blue-50 border border-gray-900 rounded-2xl p-4 flex flex-col gap-3">
            <p className="text-sm font-semibold text-gray-900">
              {editingSentence.id === null ? 'Новое предложение' : 'Редактировать предложение'}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2 flex flex-col gap-1">
                <label className="text-xs text-gray-500">Предложение с пропуском (___)</label>
                <input
                  value={editingSentence.display}
                  onChange={(e) => setEditingSentence((d) => d ? { ...d, display: e.target.value } : d)}
                  placeholder="Laima mato brol___."
                  className="bg-white border border-gray-900 rounded-lg px-3 py-1.5 text-sm text-gray-900 outline-none w-full"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-gray-500">Окончание (answer_ending)</label>
                <input
                  value={editingSentence.answer_ending}
                  onChange={(e) => setEditingSentence((d) => d ? { ...d, answer_ending: e.target.value } : d)}
                  placeholder="į"
                  className="bg-white border border-gray-900 rounded-lg px-3 py-1.5 text-sm text-gray-900 outline-none"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-gray-500">Полное слово (full_word)</label>
                <input
                  value={editingSentence.full_word}
                  onChange={(e) => setEditingSentence((d) => d ? { ...d, full_word: e.target.value } : d)}
                  placeholder="brolį"
                  className="bg-white border border-gray-900 rounded-lg px-3 py-1.5 text-sm text-gray-900 outline-none"
                />
              </div>
              <div className="sm:col-span-2 flex flex-col gap-1">
                <label className="text-xs text-gray-500">Перевод на русский</label>
                <input
                  value={editingSentence.russian}
                  onChange={(e) => setEditingSentence((d) => d ? { ...d, russian: e.target.value } : d)}
                  placeholder="Лайма видит брата."
                  className="bg-white border border-gray-900 rounded-lg px-3 py-1.5 text-sm text-gray-900 outline-none w-full"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={saveSentence}
                disabled={saving}
                className="text-xs px-3 py-1.5 bg-gray-900 hover:bg-gray-800 rounded-lg font-medium text-white transition-colors disabled:opacity-50"
              >
                {saving ? '...' : 'Сохранить'}
              </button>
              <button
                onClick={() => { setEditingSentence(null); setError(''); }}
                className="text-xs px-2 py-1.5 text-gray-400 hover:text-gray-900 transition-colors"
              >
                Отмена
              </button>
            </div>
          </div>
        )}

        {/* Sentences list */}
        <div className="rounded-2xl border border-gray-900 overflow-hidden mb-6">
          {visibleSentences.length === 0 ? (
            <p className="text-gray-400 text-sm py-8 text-center">
              Нет предложений для этого падежа
            </p>
          ) : (
            <div className="divide-y divide-gray-100">
              {visibleSentences.map((s) => (
                <div
                  key={s.id}
                  className={`flex items-start gap-3 px-4 py-3 group hover:bg-gray-50 transition-colors ${s.archived ? 'opacity-40' : ''}`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2 flex-wrap">
                      {LESSONS_BY_CASE[s.case_index] && (['basic', 'advanced', 'practice'] as const).map((level) => {
                        const meta = LEVEL_LABELS[level];
                        const active = s[`use_in_${level}`];
                        return (
                          <button
                            key={level}
                            onClick={() => !s.archived && toggleSentenceLevel(s, level)}
                            disabled={s.archived}
                            title={active ? `Убрать из ${meta.label}` : `Добавить в ${meta.label}`}
                            className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border shrink-0 transition-all ${
                              active ? `${meta.color} hover:opacity-70` : 'bg-gray-50 text-gray-300 border-gray-200 hover:border-gray-400 hover:text-gray-400'
                            } ${s.archived ? 'cursor-default' : 'cursor-pointer'}`}
                          >
                            {meta.label}
                          </button>
                        );
                      })}
                      <p className="text-sm text-gray-900 font-mono">
                        {s.display.replace('___', `[${s.answer_ending}]`)}
                      </p>
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">
                      <span className="text-emerald-600 font-medium">{s.full_word}</span>
                      {' · '}
                      {s.russian}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                    {!s.archived && (
                      <>
                        <button
                          onClick={() => startEditSentence(s)}
                          className="text-xs px-2 py-1 border border-gray-900 rounded-lg text-emerald-600 hover:bg-gray-100 transition-colors"
                        >
                          ✎
                        </button>
                        <button
                          onClick={() => archiveSentence(s.id)}
                          className="text-xs px-2 py-1 border border-gray-900 rounded-lg text-red-500 hover:bg-gray-100 transition-colors"
                        >
                          Скрыть
                        </button>
                      </>
                    )}
                    {s.archived && (
                      <span className="text-xs text-gray-300 px-2">скрыто</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Case rule section */}
        {currentRule && (
          <div className="border border-gray-900 rounded-2xl overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 bg-gray-50">
              <button
                onClick={() => setRulesOpen((v) => !v)}
                className="flex items-center gap-2 flex-1 text-left"
              >
                <svg
                  width="12" height="12" viewBox="0 0 12 12" fill="currentColor"
                  className={`text-gray-400 transition-transform duration-200 shrink-0 ${rulesOpen ? 'rotate-180' : ''}`}
                >
                  <path d="M6 8L1 3h10L6 8z" />
                </svg>
                <span className="font-semibold text-gray-900 text-sm">
                  Правило: {currentRule.name_ru}
                </span>
                <span className="text-gray-400 text-xs">{currentRule.question}</span>
              </button>
              <select
                value={currentRule.status}
                onChange={(e) => setRuleStatus(currentRule.id, e.target.value)}
                className={`text-xs border rounded-lg px-2 py-1 outline-none font-medium shrink-0 ${
                  currentRule.status === 'published' ? 'border-emerald-500 bg-emerald-50 text-emerald-700' :
                  currentRule.status === 'testing' ? 'border-amber-400 bg-amber-50 text-amber-700' :
                  'border-gray-300 bg-gray-50 text-gray-500'
                }`}
              >
                <option value="draft">Черновик</option>
                <option value="testing">Тестирование</option>
                <option value="published">Опубликован</option>
              </select>
            </div>

            {rulesOpen && (
              <div className="border-t border-gray-900 px-4 py-4">
                {editingRule?.id === currentRule.id ? (
                  <div className="flex flex-col gap-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="flex flex-col gap-1">
                        <label className="text-xs text-gray-500">Название (RU)</label>
                        <input
                          value={editingRule.name_ru}
                          onChange={(e) => setEditingRule((d) => d ? { ...d, name_ru: e.target.value } : d)}
                          className="bg-white border border-gray-900 rounded-lg px-3 py-1.5 text-sm outline-none"
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-xs text-gray-500">Вопрос</label>
                        <input
                          value={editingRule.question}
                          onChange={(e) => setEditingRule((d) => d ? { ...d, question: e.target.value } : d)}
                          className="bg-white border border-gray-900 rounded-lg px-3 py-1.5 text-sm outline-none"
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-xs text-gray-500">Окончания ед.ч.</label>
                        <input
                          value={editingRule.endings_sg}
                          onChange={(e) => setEditingRule((d) => d ? { ...d, endings_sg: e.target.value } : d)}
                          className="bg-white border border-gray-900 rounded-lg px-3 py-1.5 text-sm outline-none"
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-xs text-gray-500">Окончания мн.ч.</label>
                        <input
                          value={editingRule.endings_pl}
                          onChange={(e) => setEditingRule((d) => d ? { ...d, endings_pl: e.target.value } : d)}
                          className="bg-white border border-gray-900 rounded-lg px-3 py-1.5 text-sm outline-none"
                        />
                      </div>
                      <div className="sm:col-span-2 flex flex-col gap-1">
                        <label className="text-xs text-gray-500">Употребление</label>
                        <textarea
                          value={editingRule.usage}
                          onChange={(e) => setEditingRule((d) => d ? { ...d, usage: e.target.value } : d)}
                          rows={2}
                          className="bg-white border border-gray-900 rounded-lg px-3 py-1.5 text-sm outline-none resize-none"
                        />
                      </div>
                      <div className="sm:col-span-2 flex flex-col gap-1">
                        <label className="text-xs text-gray-500">Трансформация</label>
                        <textarea
                          value={editingRule.transform}
                          onChange={(e) => setEditingRule((d) => d ? { ...d, transform: e.target.value } : d)}
                          rows={2}
                          className="bg-white border border-gray-900 rounded-lg px-3 py-1.5 text-sm outline-none resize-none"
                        />
                      </div>
                      <div className="sm:col-span-2 flex flex-col gap-1">
                        <label className="text-xs text-gray-500">Статья (slug)</label>
                        <input
                          value={editingRule.article_slug}
                          onChange={(e) => setEditingRule((d) => d ? { ...d, article_slug: e.target.value } : d)}
                          placeholder="например: daiktavardžiai-linksniavimas"
                          className="bg-white border border-gray-900 rounded-lg px-3 py-1.5 text-sm outline-none font-mono"
                        />
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={saveRule}
                        disabled={saving}
                        className="text-xs px-3 py-1.5 bg-gray-900 hover:bg-gray-800 rounded-lg font-medium text-white transition-colors disabled:opacity-50"
                      >
                        {saving ? '...' : 'Сохранить'}
                      </button>
                      <button
                        onClick={() => { setEditingRule(null); setError(''); }}
                        className="text-xs px-2 py-1.5 text-gray-400 hover:text-gray-900 transition-colors"
                      >
                        Отмена
                      </button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm mb-3">
                      <div>
                        <p className="text-xs text-gray-400 mb-0.5">Употребление</p>
                        <p className="text-gray-700">{currentRule.usage}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-400 mb-0.5">Трансформация</p>
                        <p className="text-gray-700">{currentRule.transform}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-400 mb-0.5">Окончания ед.ч.</p>
                        <p className="text-gray-700 font-mono">{currentRule.endings_sg}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-400 mb-0.5">Окончания мн.ч.</p>
                        <p className="text-gray-700 font-mono">{currentRule.endings_pl}</p>
                      </div>
                      {currentRule.article_slug && (
                        <div className="sm:col-span-2">
                          <p className="text-xs text-gray-400 mb-0.5">Статья</p>
                          <a
                            href={`/dashboard/articles/${currentRule.article_slug}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-teal-600 hover:underline text-sm font-mono"
                          >
                            {currentRule.article_slug}
                          </a>
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => startEditRule(currentRule)}
                      className="text-xs px-3 py-1.5 border border-gray-900 rounded-lg text-emerald-600 hover:bg-gray-50 transition-colors"
                    >
                      ✎ Редактировать правило
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}

function idx_to_name(idx: number): string {
  const sg = idx <= 7;
  const names = ['Vardininkas', 'Kilmininkas', 'Naudininkas', 'Galininkas', 'Įnagininkas', 'Vietininkas', 'Šauksmininkas'];
  const name = names[(idx - 1) % 7] ?? `Падеж ${idx}`;
  return `${name} (${sg ? 'ед.ч.' : 'мн.ч.'})`;
}
