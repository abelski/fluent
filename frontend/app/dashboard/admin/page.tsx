'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { BACKEND_URL, getToken, sendEmailToUser } from '../../../lib/api';
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
  is_redactor: boolean;
  sessions_today: number;
  daily_limit: number | null;
  last_login: string | null;
  email_consent: boolean;
}

interface ReportRow {
  id: number;
  user_name: string;
  user_email: string;
  context: string | null;
  description: string;
  status: 'open' | 'onhold' | 'resolved';
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
  status: string;
  created_by: string | null;
}

interface GrammarRuleRow {
  id: number;
  case_index: number;
  name_ru: string;
  status: string;
}

interface ConstitutionQuestionRow {
  id: number;
  question_ru: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  correct_option: string;
  category: string | null;
  is_active: boolean;
  sort_order: number;
}

const BLANK_QUESTION: Omit<ConstitutionQuestionRow, 'id' | 'sort_order'> = {
  question_ru: '',
  option_a: '',
  option_b: '',
  option_c: '',
  option_d: '',
  correct_option: 'a',
  category: '',
  is_active: true,
};

interface PracticeCategoryRow {
  id: number;
  name_ru: string;
  name_en: string | null;
  description_ru: string | null;
  sort_order: number;
  total_tests: number;
  published_tests: number;
}

interface PracticeTestRow {
  id: number;
  category_id: number | null;
  title_ru: string;
  title_en: string | null;
  description_ru: string | null;
  description_en: string | null;
  question_count: number;
  pass_threshold: number;
  status: string;
  is_premium: boolean;
  created_by: string | null;
  sort_order: number;
  total_questions: number;
  active_questions: number;
}

interface PracticeQuestionRow {
  id: number;
  question_ru: string;
  question_lt: string | null;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  correct_option: string;
  category: string | null;
  is_active: boolean;
  sort_order: number;
}

const BLANK_PRACTICE_QUESTION: Omit<PracticeQuestionRow, 'id' | 'sort_order'> = {
  question_ru: '',
  question_lt: '',
  option_a: '',
  option_b: '',
  option_c: '',
  option_d: '',
  correct_option: 'a',
  category: '',
  is_active: true,
};

const BLANK_TEST: Omit<PracticeTestRow, 'id' | 'total_questions' | 'active_questions'> = {
  category_id: null,
  title_ru: '',
  title_en: '',
  description_ru: '',
  description_en: '',
  question_count: 20,
  pass_threshold: 0.75,
  status: 'draft',
  is_premium: false,
  created_by: null,
  sort_order: 0,
};

interface FeedbackRow {
  id: number;
  email: string;
  message: string;
  created_at: string;
}

interface NewsRow {
  id: number;
  title_ru: string;
  title_en: string;
  body_ru: string;
  body_en: string;
  published_at: string;
  published: boolean;
}

const BLANK_NEWS: Omit<NewsRow, 'id'> = {
  title_ru: '',
  title_en: '',
  body_ru: '',
  body_en: '',
  published_at: new Date().toISOString().slice(0, 10),
  published: true,
};

type Area = 'admin' | 'content';
type AdminSubTab = 'users' | 'reports' | 'feedback';
type ContentSubTab = 'articles' | 'vocabularies' | 'grammar' | 'practice' | 'news' | 'settings' | 'phrases';

interface CefrThresholdRow { level: string; threshold: number; }

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
  star: number;
  position: number;
}

interface EditingWord {
  id: number;
  item_id: number;
  lithuanian: string;
  translation_en: string;
  translation_ru: string;
  hint: string;
  star: number;
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

interface UserProgress {
  words_known: number;
  words_learning: number;
  words_new: number;
  mistakes_total: number;
  sessions_today: number;
  sessions_total: number;
  streak: number;
  grammar_lessons_passed: number;
  grammar_lessons_total: number;
  practice_exams_completed: number;
  last_active: string | null;
  member_since: string | null;
}

function UserProgressModal({ userId, userName, onClose }: { userId: string; userName: string; onClose: () => void }) {
  const [data, setData] = useState<UserProgress | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    const token = getToken();
    fetch(`${BACKEND_URL}/api/admin/users/${userId}/progress`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => { setData(d); setLoading(false); })
      .catch(() => { setError(true); setLoading(false); });
  }, [userId]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-2xl border border-gray-900 shadow-xl w-full max-w-md mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div>
            <p className="font-semibold text-gray-900">{userName}</p>
            <p className="text-xs text-gray-400">Прогресс обучения</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-900 transition-colors text-xl leading-none">×</button>
        </div>

        {/* Body */}
        <div className="px-6 py-5">
          {loading && <p className="text-sm text-gray-400 text-center py-6">Загрузка...</p>}
          {error && <p className="text-sm text-red-500 text-center py-6">Не удалось загрузить данные</p>}
          {data && (
            <div className="flex flex-col gap-4">
              {/* Vocabulary */}
              <div>
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">Словарный запас</p>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: 'Выучено', value: data.words_known, color: 'text-emerald-600' },
                    { label: 'Учится', value: data.words_learning, color: 'text-amber-600' },
                    { label: 'Новые', value: data.words_new, color: 'text-gray-500' },
                  ].map(({ label, value, color }) => (
                    <div key={label} className="bg-gray-50 rounded-xl px-3 py-3 text-center">
                      <p className={`text-2xl font-bold ${color}`}>{value}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{label}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Activity */}
              <div>
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">Активность</p>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: 'Серия', value: `${data.streak} д.`, color: 'text-orange-500' },
                    { label: 'Сессий сегодня', value: data.sessions_today, color: 'text-gray-900' },
                    { label: 'Сессий всего', value: data.sessions_total, color: 'text-gray-900' },
                  ].map(({ label, value, color }) => (
                    <div key={label} className="bg-gray-50 rounded-xl px-3 py-3 text-center">
                      <p className={`text-2xl font-bold ${color}`}>{value}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{label}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Grammar & Practice */}
              <div>
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">Грамматика и тесты</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-gray-50 rounded-xl px-3 py-3 text-center">
                    <p className="text-2xl font-bold text-gray-900">{data.grammar_lessons_passed}<span className="text-sm font-normal text-gray-400"> / {data.grammar_lessons_total}</span></p>
                    <p className="text-xs text-gray-400 mt-0.5">Уроков грамматики</p>
                  </div>
                  <div className="bg-gray-50 rounded-xl px-3 py-3 text-center">
                    <p className="text-2xl font-bold text-gray-900">{data.practice_exams_completed}</p>
                    <p className="text-xs text-gray-400 mt-0.5">Практических тестов</p>
                  </div>
                </div>
              </div>

              {/* Meta */}
              <div className="flex justify-between text-xs text-gray-400 pt-1 border-t border-gray-100">
                <span>Последний вход: {data.last_active ? new Date(data.last_active).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}</span>
                <span>С нами с: {data.member_since ? new Date(data.member_since).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ActionMenu({
  items,
}: {
  items: { label: string; danger?: boolean; onClick: () => void }[];
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  return (
    <div ref={ref} className="relative inline-block">
      <button
        onClick={() => setOpen((v) => !v)}
        className="text-sm px-2 py-1 text-gray-400 hover:text-gray-900 border border-gray-200 hover:border-gray-900 rounded-lg transition-colors"
        title="Действия"
      >
        ···
      </button>
      {open && (
        <div className="absolute right-0 z-10 mt-1 w-44 bg-white border border-gray-200 rounded-xl shadow-lg py-1">
          {items.map((item) => (
            <button
              key={item.label}
              onClick={() => { setOpen(false); item.onClick(); }}
              className={`w-full text-left px-4 py-2 text-sm transition-colors hover:bg-gray-50 ${item.danger ? 'text-red-600' : 'text-gray-700'}`}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
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
  const [grammarRules, setGrammarRules] = useState<GrammarRuleRow[]>([]);
  const [constitutionQuestions, setConstitutionQuestions] = useState<ConstitutionQuestionRow[]>([]);
  const [constitutionLoaded, setConstitutionLoaded] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<ConstitutionQuestionRow | null>(null);
  const [addingQuestion, setAddingQuestion] = useState(false);
  const [newQuestion, setNewQuestion] = useState({ ...BLANK_QUESTION });
  const [questionSaving, setQuestionSaving] = useState(false);
  const [constitutionPage, setConstitutionPage] = useState(1);
  // Generic practice tests state
  const [practiceView, setPracticeView] = useState<'categories' | 'tests' | 'questions'>('categories');
  const [practiceCategories, setPracticeCategories] = useState<PracticeCategoryRow[]>([]);
  const [categoriesLoaded, setCategoriesLoaded] = useState(false);
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);
  const [editingCategory, setEditingCategory] = useState<PracticeCategoryRow | null>(null);
  const [addingCategory, setAddingCategory] = useState(false);
  const [newCategory, setNewCategory] = useState({ name_ru: '', name_en: '', description_ru: '', sort_order: 0 });
  const [categorySaving, setCategorySaving] = useState(false);
  const [practiceTests, setPracticeTests] = useState<PracticeTestRow[]>([]);
  const [selectedTestId, setSelectedTestId] = useState<number | null>(null);
  const [practiceQuestions, setPracticeQuestions] = useState<PracticeQuestionRow[]>([]);
  const [editingPracticeQ, setEditingPracticeQ] = useState<PracticeQuestionRow | null>(null);
  const [addingPracticeQ, setAddingPracticeQ] = useState(false);
  const [newPracticeQ, setNewPracticeQ] = useState({ ...BLANK_PRACTICE_QUESTION });
  const [editingTest, setEditingTest] = useState<PracticeTestRow | null>(null);
  const [addingTest, setAddingTest] = useState(false);
  const [newTest, setNewTest] = useState({ ...BLANK_TEST });
  const [practiceSaving, setPracticeSaving] = useState(false);
  const practiceImportRef = useRef<HTMLInputElement>(null);

  const [feedbackList, setFeedbackList] = useState<FeedbackRow[]>([]);
  const [feedbackPage, setFeedbackPage] = useState(1);

  const [newsList, setNewsList] = useState<NewsRow[]>([]);
  const [newsLoaded, setNewsLoaded] = useState(false);
  const [editingNews, setEditingNews] = useState<NewsRow | null>(null);
  const [addingNews, setAddingNews] = useState(false);
  const [newsDraft, setNewsDraft] = useState<Omit<NewsRow, 'id'>>({ ...BLANK_NEWS });
  const [newsSaving, setNewsSaving] = useState(false);

  // CEFR thresholds settings
  const [cefrThresholds, setCefrThresholds] = useState<CefrThresholdRow[]>([]);
  const [cefrLoaded, setCefrLoaded] = useState(false);
  const [cefrSaving, setCefrSaving] = useState(false);
  const [cefrMsg, setCefrMsg] = useState('');

  // Phrase programs admin
  interface AdminPhraseProgram { id: number; title: string; title_en: string | null; description: string | null; description_en: string | null; difficulty: number; is_public: boolean; phrase_count: number; enrolled_count: number; }
  interface AdminPhrase { id: number; text: string; translation: string; translation_en: string | null; position: number; chapter?: number | null; chapter_title?: string | null; }
  const [phrasePrograms, setPhrasePrograms] = useState<AdminPhraseProgram[]>([]);
  const [phraseProgramsLoaded, setPhraseProgramsLoaded] = useState(false);
  const [expandedPhraseProgram, setExpandedPhraseProgram] = useState<number | null>(null);
  const [phrasesMap, setPhrasesMap] = useState<Record<number, AdminPhrase[]>>({});
  const [addingPhraseProgram, setAddingPhraseProgram] = useState(false);
  const [editingPhraseProgram, setEditingPhraseProgram] = useState<AdminPhraseProgram | null>(null);
  const [phraseProgramDraft, setPhraseProgramDraft] = useState({ title: '', title_en: '', description: '', description_en: '', difficulty: 1, is_public: true });
  const [phraseProgramSaving, setPhraseProgramSaving] = useState(false);
  const [addingPhrase, setAddingPhrase] = useState<number | null>(null);  // program id being added to
  const [editingPhrase, setEditingPhrase] = useState<AdminPhrase | null>(null);
  const [phraseDraft, setPhraseDraft] = useState({ text: '', translation: '', translation_en: '', position: 0 });
  const [phraseSaving, setPhraseSaving] = useState(false);

  async function loadPhrasePrograms() {
    const token = getToken();
    const r = await fetch(`${BACKEND_URL}/api/admin/phrase-programs`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    if (r.ok) { setPhrasePrograms(await r.json()); setPhraseProgramsLoaded(true); }
  }

  async function loadPhrasesForProgram(programId: number) {
    const token = getToken();
    const r = await fetch(`${BACKEND_URL}/api/admin/phrase-programs/${programId}/phrases`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    if (r.ok) { const data = await r.json(); setPhrasesMap((prev) => ({ ...prev, [programId]: data })); }
  }

  async function savePhraseProgram() {
    setPhraseProgramSaving(true);
    const token = getToken();
    try {
      if (editingPhraseProgram) {
        await fetch(`${BACKEND_URL}/api/admin/phrase-programs/${editingPhraseProgram.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(phraseProgramDraft) });
      } else {
        await fetch(`${BACKEND_URL}/api/admin/phrase-programs`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(phraseProgramDraft) });
      }
      setAddingPhraseProgram(false);
      setEditingPhraseProgram(null);
      await loadPhrasePrograms();
    } finally { setPhraseProgramSaving(false); }
  }

  async function deletePhraseProgram(id: number) {
    if (!confirm('Удалить программу и все её фразы?')) return;
    const token = getToken();
    await fetch(`${BACKEND_URL}/api/admin/phrase-programs/${id}`, { method: 'DELETE', headers: token ? { Authorization: `Bearer ${token}` } : {} });
    await loadPhrasePrograms();
  }

  async function savePhrase(programId: number) {
    setPhraseSaving(true);
    const token = getToken();
    try {
      if (editingPhrase) {
        await fetch(`${BACKEND_URL}/api/admin/phrases/${editingPhrase.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(phraseDraft) });
        setEditingPhrase(null);
      } else {
        await fetch(`${BACKEND_URL}/api/admin/phrase-programs/${programId}/phrases`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(phraseDraft) });
        setAddingPhrase(null);
      }
      await loadPhrasesForProgram(programId);
    } finally { setPhraseSaving(false); }
  }

  async function deletePhrase(phraseId: number, programId: number) {
    if (!confirm('Удалить фразу?')) return;
    const token = getToken();
    await fetch(`${BACKEND_URL}/api/admin/phrases/${phraseId}`, { method: 'DELETE', headers: token ? { Authorization: `Bearer ${token}` } : {} });
    await loadPhrasesForProgram(programId);
  }

  // Report filter
  type ReportFilter = 'open' | 'onhold' | 'resolved' | 'all';
  const [reportFilter, setReportFilter] = useState<ReportFilter>('open');

  // User search
  const [userSearch, setUserSearch] = useState('');

  // User progress modal
  const [progressUserId, setProgressUserId] = useState<string | null>(null);
  const [progressUserName, setProgressUserName] = useState('');

  // Send email modal
  const [emailUserId, setEmailUserId] = useState<string | null>(null);
  const [emailUserName, setEmailUserName] = useState('');
  const [emailSubject, setEmailSubject] = useState('');
  const [emailBody, setEmailBody] = useState('');
  const [emailSending, setEmailSending] = useState(false);
  const [emailError, setEmailError] = useState('');
  const [emailSuccess, setEmailSuccess] = useState(false);

  // Pagination pages (1-based)
  const PAGE_SIZE = 20;
  const [usersPage, setUsersPage] = useState(1);
  const [reportsPage, setReportsPage] = useState(1);
  const [articlesPage, setArticlesPage] = useState(1);
const [practiceQPage, setPracticeQPage] = useState(1);

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
      fetch(`${BACKEND_URL}/api/admin/grammar/rules`, { headers }),
      fetch(`${BACKEND_URL}/api/admin/feedback`, { headers }),
    ])
      .then(async ([usersRes, quotaRes, reportsRes, articlesRes, subcatsRes, contentRes, grammarRulesRes, feedbackRes]) => {
        if (usersRes.status === 403 || usersRes.status === 401) { router.replace('/dashboard/lists'); return; }
        const [usersData, quotaData] = await Promise.all([usersRes.json(), quotaRes.json()]);
        setUsers(usersData);
        setIsSuperadmin(!!quotaData.is_superadmin);
        if (reportsRes.ok) setReports(await reportsRes.json());
        if (articlesRes.ok) setArticles(await articlesRes.json());
        if (subcatsRes.ok) setSubcategories(await subcatsRes.json());
        if (contentRes.ok) setContentLists(await contentRes.json());
        if (grammarRulesRes.ok) setGrammarRules(await grammarRulesRes.json());
        if (feedbackRes.ok) setFeedbackList(await feedbackRes.json());
      })
      .catch((err) => console.error('API error:', err))
      .finally(() => setLoading(false));
  }

  async function loadNews() {
    const res = await fetch(`${BACKEND_URL}/api/admin/news`, { headers: authHeaders() });
    if (res.ok) {
      setNewsList(await res.json());
      setNewsLoaded(true);
    }
  }

  async function loadCefrThresholds() {
    const res = await fetch(`${BACKEND_URL}/api/admin/settings/cefr-thresholds`);
    if (res.ok) {
      setCefrThresholds(await res.json());
      setCefrLoaded(true);
    }
  }

  async function saveCefrThresholds() {
    setCefrSaving(true);
    setCefrMsg('');
    try {
      const res = await fetch(`${BACKEND_URL}/api/admin/settings/cefr-thresholds`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify(cefrThresholds),
      });
      if (res.ok) {
        setCefrMsg('Сохранено');
      } else {
        const err = await res.json().catch(() => ({}));
        setCefrMsg(err.detail ?? 'Ошибка');
      }
    } finally {
      setCefrSaving(false);
    }
  }

  async function saveNews() {
    setNewsSaving(true);
    try {
      const payload = {
        ...newsDraft,
        published_at: newsDraft.published_at ? new Date(newsDraft.published_at).toISOString() : undefined,
      };
      let res: Response;
      if (editingNews) {
        res = await fetch(`${BACKEND_URL}/api/admin/news/${editingNews.id}`, {
          method: 'PUT', headers: { ...authHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      } else {
        res = await fetch(`${BACKEND_URL}/api/admin/news`, {
          method: 'POST', headers: { ...authHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      }
      if (res.ok) {
        setEditingNews(null);
        setAddingNews(false);
        setNewsDraft({ ...BLANK_NEWS });
        await loadNews();
      }
    } finally {
      setNewsSaving(false);
    }
  }

  async function deleteNews(id: number) {
    if (!window.confirm(tr.news.deleteConfirm)) return;
    await fetch(`${BACKEND_URL}/api/admin/news/${id}`, { method: 'DELETE', headers: authHeaders() });
    await loadNews();
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
      star: word.star ?? 1,
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
        star: editingWord.star,
      }),
    }).catch(() => null);
    setWordSaving(false);
    if (res?.ok) {
      setListWords((prev) => {
        const updated = { ...prev };
        for (const [listId, words] of Object.entries(updated)) {
          updated[Number(listId)] = words.map((w) =>
            w.id === editingWord.id
              ? { ...w, lithuanian: editingWord.lithuanian, translation_en: editingWord.translation_en, translation_ru: editingWord.translation_ru, hint: editingWord.hint || null, star: editingWord.star }
              : w
          );
        }
        return updated;
      });
      setEditingWord(null);
    }
  }

  async function saveWordStar(wordId: number, listId: number, star: number) {
    const res = await fetch(`${BACKEND_URL}/api/admin/content/words/${wordId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ star }),
    }).catch(() => null);
    if (res?.ok) {
      setListWords((prev) => {
        const updated = { ...prev };
        updated[listId] = (updated[listId] ?? []).map((w) =>
          w.id === wordId ? { ...w, star } : w
        );
        return updated;
      });
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

  async function deleteUser(userId: string, userName: string) {
    if (!confirm(`Удалить пользователя «${userName}» и все его данные? Это действие необратимо.`)) return;
    setSaving(true);
    const token = getToken();
    await fetch(`${BACKEND_URL}/api/admin/users/${userId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    }).catch((err) => console.error('API error:', err));
    setSaving(false);
    loadData();
  }

  async function applyAdmin(userId: string, isAdmin: boolean) {
    setSaving(true);
    const token = getToken();
    await fetch(`${BACKEND_URL}/api/admin/users/${userId}/set-admin`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ is_admin: isAdmin }),
    }).catch((err) => console.error('API error:', err));
    setSaving(false);
    loadData();
  }

  async function applyRedactor(userId: string, isRedactor: boolean) {
    setSaving(true);
    const token = getToken();
    await fetch(`${BACKEND_URL}/api/admin/users/${userId}/set-redactor`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ is_redactor: isRedactor }),
    }).catch((err) => console.error('API error:', err));
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
    }).catch((err) => console.error('API error:', err));
    setSaving(false);
    setEditingId(null);
    setGrantDate('');
    loadData();
  }

  async function handleSendEmail() {
    if (!emailUserId || !emailSubject.trim() || !emailBody.trim()) return;
    setEmailSending(true);
    setEmailError('');
    setEmailSuccess(false);
    try {
      await sendEmailToUser(emailUserId, emailSubject.trim(), emailBody.trim());
      setEmailSuccess(true);
      setTimeout(() => {
        setEmailUserId(null);
        setEmailUserName('');
        setEmailSubject('');
        setEmailBody('');
        setEmailSuccess(false);
      }, 1500);
    } catch (err: unknown) {
      setEmailError(err instanceof Error ? err.message : 'Ошибка отправки');
    } finally {
      setEmailSending(false);
    }
  }

  async function resolveReport(id: number) {
    const token = getToken();
    await fetch(`${BACKEND_URL}/api/admin/reports/${id}/resolve`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}` },
    }).catch((err) => console.error('API error:', err));
    loadData();
  }

  async function holdReport(id: number) {
    const token = getToken();
    await fetch(`${BACKEND_URL}/api/admin/reports/${id}/hold`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}` },
    }).catch((err) => console.error('API error:', err));
    loadData();
  }

  async function deleteReport(id: number) {
    if (!confirm(tr.admin.deleteConfirm)) return;
    const token = getToken();
    await fetch(`${BACKEND_URL}/api/admin/reports/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    }).catch((err) => console.error('API error:', err));
    loadData();
  }

  async function deleteFeedback(id: number) {
    if (!confirm('Удалить это сообщение?')) return;
    await fetch(`${BACKEND_URL}/api/admin/feedback/${id}`, {
      method: 'DELETE',
      headers: authHeaders(),
    }).catch((err) => console.error('API error:', err));
    loadData();
  }

  async function deleteArticle(slug: string) {
    if (!confirm(tr.articles.deleteConfirm)) return;
    await fetch(`${BACKEND_URL}/api/admin/articles/${slug}`, {
      method: 'DELETE',
      headers: authHeaders(),
    }).catch((err) => console.error('API error:', err));
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
    }).catch((err) => console.error('API error:', err));
    setSaving(false);
    setEditingListKey(null);
    loadData();
  }

  async function setSubcatStatus(key: string, status: string) {
    await fetch(`${BACKEND_URL}/api/admin/subcategories/${encodeURIComponent(key)}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ status }),
    }).catch((err) => console.error('API error:', err));
    setSubcategories((prev) => prev.map((s) => s.key === key ? { ...s, status } : s));
  }

  // ── Practice categories CRUD ─────────────────────────────────────────────

  async function loadPracticeCategories() {
    const res = await fetch(`${BACKEND_URL}/api/admin/practice/categories`, { headers: authHeaders() }).catch(() => null);
    if (res?.ok) { setPracticeCategories(await res.json()); setCategoriesLoaded(true); }
  }

  async function saveNewCategory() {
    if (!newCategory.name_ru.trim()) return;
    setCategorySaving(true);
    const res = await fetch(`${BACKEND_URL}/api/admin/practice/categories`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ ...newCategory, name_ru: newCategory.name_ru.trim() }),
    }).catch(() => null);
    setCategorySaving(false);
    if (res?.ok) { setAddingCategory(false); setNewCategory({ name_ru: '', name_en: '', description_ru: '', sort_order: 0 }); loadPracticeCategories(); }
  }

  async function saveEditCategory() {
    if (!editingCategory) return;
    setCategorySaving(true);
    const res = await fetch(`${BACKEND_URL}/api/admin/practice/categories/${editingCategory.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ name_ru: editingCategory.name_ru, name_en: editingCategory.name_en || null, description_ru: editingCategory.description_ru || null }),
    }).catch(() => null);
    setCategorySaving(false);
    if (res?.ok) { setEditingCategory(null); loadPracticeCategories(); }
  }

  async function deletePracticeCategory(id: number) {
    if (!confirm(tr.adminPractice.deleteCategoryConfirm)) return;
    await fetch(`${BACKEND_URL}/api/admin/practice/categories/${id}`, { method: 'DELETE', headers: authHeaders() }).catch((err) => console.error('API error:', err));
    loadPracticeCategories();
  }

  // ── Practice tests CRUD ──────────────────────────────────────────────────

  async function loadPracticeTests(categoryId: number) {
    const res = await fetch(`${BACKEND_URL}/api/admin/practice/categories/${categoryId}/tests`, { headers: authHeaders() }).catch(() => null);
    if (res?.ok) { setPracticeTests(await res.json()); }
  }

  async function loadPracticeQuestions(testId: number) {
    const res = await fetch(`${BACKEND_URL}/api/admin/practice/tests/${testId}/questions`, { headers: authHeaders() }).catch(() => null);
    if (res?.ok) setPracticeQuestions(await res.json());
  }

  async function saveNewTest() {
    if (!newTest.title_ru.trim()) return;
    setPracticeSaving(true);
    const res = await fetch(`${BACKEND_URL}/api/admin/practice/tests`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ ...newTest, title_ru: newTest.title_ru.trim() }),
    }).catch(() => null);
    setPracticeSaving(false);
    if (res?.ok) { setAddingTest(false); setNewTest({ ...BLANK_TEST }); if (selectedCategoryId) loadPracticeTests(selectedCategoryId); }
  }

  async function saveEditTest() {
    if (!editingTest) return;
    setPracticeSaving(true);
    const res = await fetch(`${BACKEND_URL}/api/admin/practice/tests/${editingTest.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({
        title_ru: editingTest.title_ru,
        title_en: editingTest.title_en || null,
        description_ru: editingTest.description_ru || null,
        description_en: editingTest.description_en || null,
        question_count: editingTest.question_count,
        pass_threshold: editingTest.pass_threshold,
        status: editingTest.status,
        is_premium: editingTest.is_premium,
      }),
    }).catch(() => null);
    setPracticeSaving(false);
    if (res?.ok) { setEditingTest(null); if (selectedCategoryId) loadPracticeTests(selectedCategoryId); }
  }

  async function deletePracticeTest(id: number) {
    if (!confirm(tr.adminPractice.deleteTestConfirm)) return;
    await fetch(`${BACKEND_URL}/api/admin/practice/tests/${id}`, { method: 'DELETE', headers: authHeaders() }).catch((err) => console.error('API error:', err));
    setSelectedTestId(null);
    if (selectedCategoryId) loadPracticeTests(selectedCategoryId);
  }

  async function saveNewPracticeQ(testId: number) {
    if (!newPracticeQ.question_ru.trim()) return;
    setPracticeSaving(true);
    const res = await fetch(`${BACKEND_URL}/api/admin/practice/tests/${testId}/questions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ ...newPracticeQ, sort_order: practiceQuestions.length }),
    }).catch(() => null);
    setPracticeSaving(false);
    if (res?.ok) { setAddingPracticeQ(false); setNewPracticeQ({ ...BLANK_PRACTICE_QUESTION }); loadPracticeQuestions(testId); }
  }

  async function saveEditPracticeQ(testId: number) {
    if (!editingPracticeQ) return;
    setPracticeSaving(true);
    const res = await fetch(`${BACKEND_URL}/api/admin/practice/questions/${editingPracticeQ.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({
        question_ru: editingPracticeQ.question_ru,
        question_lt: editingPracticeQ.question_lt || null,
        option_a: editingPracticeQ.option_a,
        option_b: editingPracticeQ.option_b,
        option_c: editingPracticeQ.option_c,
        option_d: editingPracticeQ.option_d,
        correct_option: editingPracticeQ.correct_option,
        category: editingPracticeQ.category || null,
        is_active: editingPracticeQ.is_active,
      }),
    }).catch(() => null);
    setPracticeSaving(false);
    if (res?.ok) { setEditingPracticeQ(null); loadPracticeQuestions(testId); }
  }

  async function deletePracticeQ(id: number, testId: number) {
    if (!confirm(tr.adminPractice.deleteQuestionConfirm)) return;
    await fetch(`${BACKEND_URL}/api/admin/practice/questions/${id}`, { method: 'DELETE', headers: authHeaders() }).catch((err) => console.error('API error:', err));
    loadPracticeQuestions(testId);
  }

  async function togglePracticeQActive(q: PracticeQuestionRow, testId: number) {
    await fetch(`${BACKEND_URL}/api/admin/practice/questions/${q.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ is_active: !q.is_active }),
    }).catch((err) => console.error('API error:', err));
    loadPracticeQuestions(testId);
  }

  function exportPracticeTest(testId: number) {
    const token = getToken();
    const link = document.createElement('a');
    link.href = `${BACKEND_URL}/api/admin/practice/tests/${testId}/export`;
    link.setAttribute('download', '');
    // Pass auth via query param not ideal, so open with fetch + blob
    fetch(`${BACKEND_URL}/api/admin/practice/tests/${testId}/export`, { headers: authHeaders() })
      .then((r) => r.blob())
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        link.href = url;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      }).catch((err) => console.error('API error:', err));
  }

  async function importPracticeTest(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const form = new FormData();
    form.append('file', file);
    const res = await fetch(`${BACKEND_URL}/api/admin/practice/tests/import`, {
      method: 'POST',
      headers: authHeaders(),
      body: form,
    }).catch(() => null);
    if (res?.ok && selectedCategoryId) loadPracticeTests(selectedCategoryId);
    if (practiceImportRef.current) practiceImportRef.current.value = '';
  }

  async function loadConstitutionQuestions() {
    const res = await fetch(`${BACKEND_URL}/api/admin/constitution/questions`, {
      headers: authHeaders(),
    }).catch(() => null);
    if (res?.ok) {
      setConstitutionQuestions(await res.json());
      setConstitutionLoaded(true);
    }
  }

  async function saveNewQuestion() {
    if (!newQuestion.question_ru.trim()) return;
    setQuestionSaving(true);
    const res = await fetch(`${BACKEND_URL}/api/admin/constitution/questions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ ...newQuestion, sort_order: constitutionQuestions.length }),
    }).catch(() => null);
    setQuestionSaving(false);
    if (res?.ok) {
      setAddingQuestion(false);
      setNewQuestion({ ...BLANK_QUESTION });
      loadConstitutionQuestions();
    }
  }

  async function saveEditQuestion() {
    if (!editingQuestion) return;
    setQuestionSaving(true);
    const res = await fetch(`${BACKEND_URL}/api/admin/constitution/questions/${editingQuestion.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({
        question_ru: editingQuestion.question_ru,
        option_a: editingQuestion.option_a,
        option_b: editingQuestion.option_b,
        option_c: editingQuestion.option_c,
        option_d: editingQuestion.option_d,
        correct_option: editingQuestion.correct_option,
        category: editingQuestion.category || null,
        is_active: editingQuestion.is_active,
      }),
    }).catch(() => null);
    setQuestionSaving(false);
    if (res?.ok) {
      setEditingQuestion(null);
      loadConstitutionQuestions();
    }
  }

  async function deleteQuestion(id: number) {
    if (!confirm(tr.adminConstitution.deleteConfirm)) return;
    await fetch(`${BACKEND_URL}/api/admin/constitution/questions/${id}`, {
      method: 'DELETE',
      headers: authHeaders(),
    }).catch((err) => console.error('API error:', err));
    loadConstitutionQuestions();
  }

  async function toggleQuestionActive(q: ConstitutionQuestionRow) {
    await fetch(`${BACKEND_URL}/api/admin/constitution/questions/${q.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ is_active: !q.is_active }),
    }).catch((err) => console.error('API error:', err));
    loadConstitutionQuestions();
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const openReports = reports.filter((r) => r.status === 'open').length;

  // Filtered + paginated slices
  const filteredReports = reportFilter === 'all' ? reports : reports.filter((r) => r.status === reportFilter);
  const filteredUsers = userSearch.trim()
    ? users.filter((u) => {
        const q = userSearch.toLowerCase();
        return u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
      })
    : users;
  const pagedUsers = filteredUsers.slice((usersPage - 1) * PAGE_SIZE, usersPage * PAGE_SIZE);
  const pagedReports = filteredReports.slice((reportsPage - 1) * PAGE_SIZE, reportsPage * PAGE_SIZE);
  const pagedArticles = articles.slice((articlesPage - 1) * PAGE_SIZE, articlesPage * PAGE_SIZE);
  const pagedPracticeQ = practiceQuestions.slice((practiceQPage - 1) * PAGE_SIZE, practiceQPage * PAGE_SIZE);
  const pagedConstitution = constitutionQuestions.slice((constitutionPage - 1) * PAGE_SIZE, constitutionPage * PAGE_SIZE);

  function Pagination({ total, page, onPage }: { total: number; page: number; onPage: (p: number) => void }) {
    const pages = Math.ceil(total / PAGE_SIZE);
    if (pages <= 1) return null;
    return (
      <div className="flex items-center gap-2 mt-4 justify-end">
        <button
          onClick={() => onPage(page - 1)}
          disabled={page === 1}
          className="px-3 py-1.5 text-xs border border-gray-900 rounded-lg disabled:opacity-30 hover:bg-gray-50 transition-colors"
        >
          ←
        </button>
        <span className="text-xs text-gray-400">{page} / {pages}</span>
        <button
          onClick={() => onPage(page + 1)}
          disabled={page === pages}
          className="px-3 py-1.5 text-xs border border-gray-900 rounded-lg disabled:opacity-30 hover:bg-gray-50 transition-colors"
        >
          →
        </button>
      </div>
    );
  }

  return (
    <>
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
              className={`relative px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${adminTab === 'users' ? 'bg-gray-100 text-gray-900' : 'text-gray-400 hover:text-gray-900'}`}
            >
              {tr.admin.tabUsers}
              {users.length > 0 && (
                <span className="ml-1.5 inline-flex items-center justify-center min-w-[1rem] h-4 px-1 text-[10px] font-bold bg-gray-500 text-white rounded-full">{users.length}</span>
              )}
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
            <button
              onClick={() => setAdminTab('feedback')}
              className={`relative px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${adminTab === 'feedback' ? 'bg-gray-100 text-gray-900' : 'text-gray-400 hover:text-gray-900'}`}
            >
              Обратная связь
              {feedbackList.length > 0 && (
                <span className="ml-1.5 inline-flex items-center justify-center min-w-[1rem] h-4 px-1 text-[10px] font-bold bg-gray-500 text-white rounded-full">{feedbackList.length}</span>
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
              Слова
            </button>
            <button
              onClick={() => router.push('/dashboard/admin/grammar')}
              className="px-3 py-1.5 rounded-lg text-sm font-medium transition-colors text-gray-400 hover:text-gray-900"
            >
              Грамматика
            </button>
<button
              onClick={() => { setContentTab('practice'); if (!categoriesLoaded) loadPracticeCategories(); if (!constitutionLoaded) loadConstitutionQuestions(); }}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${contentTab === 'practice' ? 'bg-gray-100 text-gray-900' : 'text-gray-400 hover:text-gray-900'}`}
            >
              {tr.adminPractice.tabLabel}
            </button>
            <button
              onClick={() => { setContentTab('news'); if (!newsLoaded) loadNews(); }}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${contentTab === 'news' ? 'bg-gray-100 text-gray-900' : 'text-gray-400 hover:text-gray-900'}`}
            >
              {tr.news.adminTitle}
            </button>
            <button
              onClick={() => { setContentTab('settings'); if (!cefrLoaded) loadCefrThresholds(); }}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${contentTab === 'settings' ? 'bg-gray-100 text-gray-900' : 'text-gray-400 hover:text-gray-900'}`}
            >
              Настройки
            </button>
            <button
              onClick={() => { setContentTab('phrases'); if (!phraseProgramsLoaded) loadPhrasePrograms(); }}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${contentTab === 'phrases' ? 'bg-gray-100 text-gray-900' : 'text-gray-400 hover:text-gray-900'}`}
            >
              Фразы
            </button>
          </div>
        )}

        {/* ── Users ── */}
        {area === 'admin' && adminTab === 'users' && (
          <div className="flex flex-col gap-3">
          <input
            type="text"
            placeholder="Поиск по имени или email..."
            value={userSearch}
            onChange={(e) => { setUserSearch(e.target.value); setUsersPage(1); }}
            className="w-full max-w-sm bg-white border border-gray-900 rounded-xl px-4 py-2 text-sm text-gray-900 outline-none placeholder-gray-400 focus:border-gray-600"
          />
          <div className="overflow-x-auto rounded-2xl border border-gray-900">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-900 text-gray-400 text-left">
                  <th className="px-4 py-3 font-medium">{tr.admin.colUser}</th>
                  <th className="px-4 py-3 font-medium">{tr.admin.colPlan}</th>
                  <th className="px-4 py-3 font-medium hidden sm:table-cell">{tr.admin.colPremiumUntil}</th>
                  <th className="px-4 py-3 font-medium hidden sm:table-cell">{tr.admin.colSessionsToday}</th>
                  <th className="px-4 py-3 font-medium hidden lg:table-cell">Последний вход</th>
                  <th className="px-4 py-3 font-medium">{tr.admin.colAction}</th>
                </tr>
              </thead>
              <tbody>
                {pagedUsers.map((u) => (
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
                      ) : u.is_redactor ? (
                        <span className="text-xs font-semibold text-purple-600 bg-purple-50 border border-gray-900 rounded-full px-2 py-0.5">Редактор</span>
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
                    <td className="px-4 py-3 text-gray-400 hidden lg:table-cell text-xs">
                      {u.last_login
                        ? new Date(u.last_login).toLocaleString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
                        : '—'}
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
                          {isSuperadmin && u.email_consent && (
                            <button
                              onClick={() => { setEmailUserId(u.id); setEmailUserName(u.name); setEmailSubject(''); setEmailBody(''); setEmailError(''); setEmailSuccess(false); }}
                              title="Отправить письмо"
                              className="text-xs px-2 py-1.5 text-blue-600 hover:text-blue-800 border border-gray-900 hover:border-gray-900 rounded-lg transition-colors"
                            >
                              ✉
                            </button>
                          )}
                          <ActionMenu
                            items={[
                              {
                                label: 'Прогресс',
                                onClick: () => { setProgressUserId(u.id); setProgressUserName(u.name); },
                              },
                              ...(!u.is_superadmin ? [
                                {
                                  label: u.is_redactor ? 'Убрать редактора' : 'Сделать редактором',
                                  onClick: () => applyRedactor(u.id, !u.is_redactor),
                                },
                              ] : []),
                              ...(isSuperadmin && !u.is_superadmin ? [
                                {
                                  label: u.is_admin ? tr.admin.removeAdmin : tr.admin.makeAdmin,
                                  onClick: () => applyAdmin(u.id, !u.is_admin),
                                },
                                {
                                  label: 'Удалить',
                                  danger: true,
                                  onClick: () => deleteUser(u.id, u.name),
                                },
                              ] : []),
                            ]}
                          />
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Pagination total={filteredUsers.length} page={usersPage} onPage={setUsersPage} />
          </div>
          </div>
        )}

        {/* ── Reports ── */}
        {area === 'admin' && adminTab === 'reports' && (
          <div className="flex flex-col gap-3">
            {/* Filter tabs */}
            <div className="flex gap-1 bg-white border border-gray-200 rounded-xl p-1 w-fit mb-2">
              {(['open', 'onhold', 'resolved', 'all'] as ReportFilter[]).map((f) => (
                <button
                  key={f}
                  onClick={() => { setReportFilter(f); setReportsPage(1); }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${reportFilter === f ? 'bg-gray-100 text-gray-900' : 'text-gray-400 hover:text-gray-900'}`}
                >
                  {f === 'open' ? 'Открытые' : f === 'onhold' ? 'На паузе' : f === 'resolved' ? 'Решённые' : 'Все'}
                  {f === 'open' && openReports > 0 && (
                    <span className="ml-1 inline-flex items-center justify-center w-4 h-4 text-[10px] font-bold bg-red-500 text-white rounded-full">{openReports}</span>
                  )}
                </button>
              ))}
            </div>

            {filteredReports.length === 0 && (
              <p className="text-gray-400 text-sm py-8 text-center">{tr.admin.noReports}</p>
            )}
            {pagedReports.map((r) => (
              <div
                key={r.id}
                className={`rounded-2xl border p-4 transition-colors ${
                  r.status === 'resolved' ? 'border-gray-900 bg-white opacity-50'
                  : r.status === 'onhold' ? 'border-gray-300 bg-white opacity-60'
                  : 'border-gray-900 bg-gray-50'
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-mono text-gray-400">#{r.id}</span>
                      <span className="text-gray-300 text-xs">·</span>
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
                      <>
                        <button
                          onClick={() => holdReport(r.id)}
                          className="text-xs px-3 py-1.5 text-amber-600 border border-gray-900 hover:border-gray-900 rounded-lg transition-colors"
                        >
                          {tr.admin.hold}
                        </button>
                        <button
                          onClick={() => resolveReport(r.id)}
                          className="text-xs px-3 py-1.5 text-emerald-600 border border-gray-900 hover:border-gray-900 rounded-lg transition-colors"
                        >
                          {tr.admin.resolve}
                        </button>
                      </>
                    )}
                    {r.status === 'onhold' && (
                      <span className="text-xs text-amber-500">{tr.admin.onholdBadge}</span>
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
            <Pagination total={filteredReports.length} page={reportsPage} onPage={setReportsPage} />
          </div>
        )}

        {/* ── Feedback ── */}
        {area === 'admin' && adminTab === 'feedback' && (
          <div className="flex flex-col gap-3">
            {feedbackList.length === 0 ? (
              <p className="text-gray-400 text-sm">Сообщений пока нет.</p>
            ) : (
              <>
                {feedbackList.slice((feedbackPage - 1) * PAGE_SIZE, feedbackPage * PAGE_SIZE).map((f) => (
                  <div key={f.id} className="border border-gray-900 rounded-2xl p-4 flex flex-col gap-2">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <span className="text-sm font-medium text-gray-900">{f.email}</span>
                      <span className="text-xs text-gray-400">{new Date(f.created_at).toLocaleString('ru-RU')}</span>
                    </div>
                    <p className="text-sm text-gray-700 whitespace-pre-wrap">{f.message}</p>
                    <div className="flex justify-end">
                      <button
                        onClick={() => deleteFeedback(f.id)}
                        className="text-xs px-3 py-1.5 text-red-500 hover:text-red-600 border border-gray-900 rounded-lg transition-colors"
                      >
                        {tr.admin.delete}
                      </button>
                    </div>
                  </div>
                ))}
                <Pagination total={feedbackList.length} page={feedbackPage} onPage={setFeedbackPage} />
              </>
            )}
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
              {pagedArticles.map((a) => {
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
              <Pagination total={articles.length} page={articlesPage} onPage={setArticlesPage} />
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
                  status: 'draft',
                  created_by: null,
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
                          <select
                            value={scMeta.status}
                            onChange={(e) => { e.stopPropagation(); setSubcatStatus(subcatKey, e.target.value); }}
                            onClick={(e) => e.stopPropagation()}
                            className={`text-xs border rounded-lg px-2 py-1 outline-none font-medium ${
                              scMeta.status === 'published' ? 'border-emerald-500 bg-emerald-50 text-emerald-700' :
                              scMeta.status === 'testing' ? 'border-amber-400 bg-amber-50 text-amber-700' :
                              'border-gray-300 bg-gray-50 text-gray-500'
                            }`}
                          >
                            <option value="draft">Черновик</option>
                            <option value="testing">Тестирование</option>
                            <option value="published">Опубликован</option>
                          </select>
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
                                                <div className="flex flex-col gap-1">
                                                  <label className="text-xs text-gray-400">{tr.admin.contentFieldStar}</label>
                                                  <div className="flex gap-1">
                                                    {[1, 2, 3].map((s) => (
                                                      <button
                                                        key={s}
                                                        type="button"
                                                        onClick={() => setEditingWord((d) => d ? { ...d, star: s } : d)}
                                                        className={`px-2 py-1 rounded text-xs border transition-colors ${editingWord.star === s ? 'bg-gray-900 text-white border-gray-900' : 'bg-gray-50 border-gray-300 text-gray-500 hover:border-gray-900'}`}
                                                      >
                                                        {'★'.repeat(s)}
                                                      </button>
                                                    ))}
                                                  </div>
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
                                              <div className="flex gap-0.5 opacity-60 group-hover:opacity-100 transition-opacity">
                                                {[1, 2, 3].map((s) => (
                                                  <button
                                                    key={s}
                                                    onClick={() => saveWordStar(word.id, list.id, s)}
                                                    title={`★`.repeat(s)}
                                                    className={`text-xs px-1 rounded transition-colors ${
                                                      word.star === s
                                                        ? 'text-gray-900'
                                                        : 'text-gray-300 hover:text-gray-600'
                                                    }`}
                                                  >
                                                    {'★'.repeat(s)}
                                                  </button>
                                                ))}
                                              </div>
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
        {/* ── Publication tab ── */}
        {/* ── Practice (3-level: categories → tests → questions) ── */}
        {area === 'content' && contentTab === 'practice' && (
          <div className="flex flex-col gap-4">
            <input ref={practiceImportRef} type="file" accept=".json" className="hidden" onChange={importPracticeTest} />

            {/* ── Level 1: Categories ── */}
            {practiceView === 'categories' && (
              <>
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <h2 className="font-semibold text-gray-900">{tr.adminPractice.tabLabel}</h2>
                  <button
                    onClick={() => { setAddingCategory(true); setNewCategory({ name_ru: '', name_en: '', description_ru: '', sort_order: 0 }); }}
                    className="text-sm px-3 py-1.5 bg-gray-900 text-white rounded-lg hover:bg-gray-700 transition-colors"
                  >
                    {tr.adminPractice.addCategory}
                  </button>
                </div>

                {addingCategory && (
                  <div className="border border-gray-900 rounded-2xl p-4 bg-amber-50 flex flex-col gap-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div className="flex flex-col gap-1">
                        <label className="text-xs text-gray-400">{tr.adminPractice.fieldCategoryNameRu}</label>
                        <input value={newCategory.name_ru} onChange={(e) => setNewCategory((p) => ({ ...p, name_ru: e.target.value }))} className="bg-white border border-gray-900 rounded-lg px-2 py-1 text-sm outline-none" />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-xs text-gray-400">{tr.adminPractice.fieldCategoryNameEn}</label>
                        <input value={newCategory.name_en} onChange={(e) => setNewCategory((p) => ({ ...p, name_en: e.target.value }))} className="bg-white border border-gray-900 rounded-lg px-2 py-1 text-sm outline-none" />
                      </div>
                      <div className="flex flex-col gap-1 sm:col-span-2">
                        <label className="text-xs text-gray-400">{tr.adminPractice.fieldCategoryDescRu}</label>
                        <input value={newCategory.description_ru} onChange={(e) => setNewCategory((p) => ({ ...p, description_ru: e.target.value }))} className="bg-white border border-gray-900 rounded-lg px-2 py-1 text-sm outline-none" />
                      </div>
                    </div>
                    <div className="flex gap-2 justify-end">
                      <button onClick={() => setAddingCategory(false)} className="text-xs text-gray-400 px-3 py-1 border border-gray-900 rounded-lg">{tr.adminPractice.cancel}</button>
                      <button onClick={saveNewCategory} disabled={categorySaving} className="text-xs bg-gray-900 text-white px-3 py-1 rounded-lg disabled:opacity-50">{tr.adminPractice.save}</button>
                    </div>
                  </div>
                )}

                <div className="border border-gray-900 rounded-2xl overflow-hidden bg-white">
                  {practiceCategories.length === 0 && <p className="text-gray-400 text-sm py-8 text-center">{tr.adminPractice.noCategories}</p>}
                  <div className="divide-y divide-gray-100">
                    {practiceCategories.map((c) => (
                      <div key={c.id}>
                        {editingCategory?.id === c.id ? (
                          <div className="p-4 bg-blue-50 flex flex-col gap-3">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              <div className="flex flex-col gap-1">
                                <label className="text-xs text-gray-400">{tr.adminPractice.fieldCategoryNameRu}</label>
                                <input value={editingCategory.name_ru} onChange={(e) => setEditingCategory((p) => p ? { ...p, name_ru: e.target.value } : p)} className="bg-white border border-gray-900 rounded-lg px-2 py-1 text-sm outline-none" />
                              </div>
                              <div className="flex flex-col gap-1">
                                <label className="text-xs text-gray-400">{tr.adminPractice.fieldCategoryNameEn}</label>
                                <input value={editingCategory.name_en ?? ''} onChange={(e) => setEditingCategory((p) => p ? { ...p, name_en: e.target.value } : p)} className="bg-white border border-gray-900 rounded-lg px-2 py-1 text-sm outline-none" />
                              </div>
                              <div className="flex flex-col gap-1 sm:col-span-2">
                                <label className="text-xs text-gray-400">{tr.adminPractice.fieldCategoryDescRu}</label>
                                <input value={editingCategory.description_ru ?? ''} onChange={(e) => setEditingCategory((p) => p ? { ...p, description_ru: e.target.value } : p)} className="bg-white border border-gray-900 rounded-lg px-2 py-1 text-sm outline-none" />
                              </div>
                            </div>
                            <div className="flex gap-2 justify-end">
                              <button onClick={() => setEditingCategory(null)} className="text-xs text-gray-400 px-3 py-1 border border-gray-900 rounded-lg">{tr.adminPractice.cancel}</button>
                              <button onClick={saveEditCategory} disabled={categorySaving} className="text-xs bg-gray-900 text-white px-3 py-1 rounded-lg disabled:opacity-50">{tr.adminPractice.save}</button>
                            </div>
                          </div>
                        ) : (
                          <div className="px-5 py-4 flex items-center justify-between gap-3 hover:bg-gray-50 transition-colors">
                            <div className="flex-1 min-w-0 cursor-pointer" onClick={() => { setSelectedCategoryId(c.id); setNewTest((p) => ({ ...p, category_id: c.id })); setPracticeView('tests'); loadPracticeTests(c.id); }}>
                              <p className="font-semibold text-gray-900">{c.name_ru}</p>
                              {c.name_en && <p className="text-xs text-gray-400">{c.name_en}</p>}
                              <p className="text-xs text-gray-400 mt-0.5">
                                {c.published_tests}/{c.total_tests} {tr.adminPractice.testsCount}
                              </p>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <button onClick={() => setEditingCategory(c)} className="text-xs px-2 py-1 rounded-lg border border-gray-900 text-gray-600 hover:bg-gray-100 transition-colors">{tr.adminPractice.editCategory}</button>
                              <button onClick={() => deletePracticeCategory(c.id)} className="text-xs px-2 py-1 rounded-lg border border-red-300 text-red-500 hover:bg-red-50 transition-colors">{tr.adminPractice.delete}</button>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* ── Level 2: Tests in category ── */}
            {practiceView === 'tests' && (() => {
              const category = practiceCategories.find((c) => c.id === selectedCategoryId);
              return (
                <div className="flex flex-col gap-4">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-3">
                      <button onClick={() => { setPracticeView('categories'); setSelectedCategoryId(null); setEditingTest(null); setAddingTest(false); }} className="text-sm text-gray-400 hover:text-gray-900 transition-colors">{tr.adminPractice.backToCategories}</button>
                      <h2 className="font-semibold text-gray-900">{category?.name_ru}</h2>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => practiceImportRef.current?.click()} className="text-sm px-3 py-1.5 border border-gray-900 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors">{tr.adminPractice.importTest}</button>
                      <button onClick={() => { setAddingTest(true); setNewTest({ ...BLANK_TEST, category_id: selectedCategoryId }); }} className="text-sm px-3 py-1.5 bg-gray-900 text-white rounded-lg hover:bg-gray-700 transition-colors">{tr.adminPractice.addTest}</button>
                    </div>
                  </div>

                  {addingTest && (
                    <div className="border border-gray-900 rounded-2xl p-4 bg-amber-50 flex flex-col gap-3">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div className="flex flex-col gap-1">
                          <label className="text-xs text-gray-400">{tr.adminPractice.fieldTitleRu}</label>
                          <input value={newTest.title_ru} onChange={(e) => setNewTest((p) => ({ ...p, title_ru: e.target.value }))} className="bg-white border border-gray-900 rounded-lg px-2 py-1 text-sm outline-none" />
                        </div>
                        <div className="flex flex-col gap-1">
                          <label className="text-xs text-gray-400">{tr.adminPractice.fieldTitleEn}</label>
                          <input value={newTest.title_en ?? ''} onChange={(e) => setNewTest((p) => ({ ...p, title_en: e.target.value }))} className="bg-white border border-gray-900 rounded-lg px-2 py-1 text-sm outline-none" />
                        </div>
                        <div className="flex flex-col gap-1">
                          <label className="text-xs text-gray-400">{tr.adminPractice.fieldDescRu}</label>
                          <input value={newTest.description_ru ?? ''} onChange={(e) => setNewTest((p) => ({ ...p, description_ru: e.target.value }))} className="bg-white border border-gray-900 rounded-lg px-2 py-1 text-sm outline-none" />
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                          <div className="flex flex-col gap-1">
                            <label className="text-xs text-gray-400">{tr.adminPractice.fieldQuestionCount}</label>
                            <input type="number" value={newTest.question_count} onChange={(e) => setNewTest((p) => ({ ...p, question_count: Number(e.target.value) }))} className="bg-white border border-gray-900 rounded-lg px-2 py-1 text-sm outline-none" />
                          </div>
                          <div className="flex flex-col gap-1">
                            <label className="text-xs text-gray-400">{tr.adminPractice.fieldPassThreshold}</label>
                            <input type="number" step="0.05" min="0" max="1" value={newTest.pass_threshold} onChange={(e) => setNewTest((p) => ({ ...p, pass_threshold: Number(e.target.value) }))} className="bg-white border border-gray-900 rounded-lg px-2 py-1 text-sm outline-none" />
                          </div>
                          <div className="flex flex-col gap-1">
                            <label className="text-xs text-gray-400">Статус</label>
                            <select value={newTest.status} onChange={(e) => setNewTest((p) => ({ ...p, status: e.target.value }))} className="bg-white border border-gray-900 rounded-lg px-2 py-1 text-sm outline-none">
                              <option value="draft">Черновик</option>
                              <option value="testing">Тестирование</option>
                              <option value="published">Опубликован</option>
                            </select>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <label className="text-xs text-gray-400">{tr.adminPractice.fieldIsPremium}</label>
                        <input type="checkbox" checked={newTest.is_premium} onChange={(e) => setNewTest((p) => ({ ...p, is_premium: e.target.checked }))} className="w-4 h-4" />
                      </div>
                      <div className="flex gap-2 justify-end">
                        <button onClick={() => setAddingTest(false)} className="text-xs text-gray-400 px-3 py-1 border border-gray-900 rounded-lg">{tr.adminPractice.cancel}</button>
                        <button onClick={saveNewTest} disabled={practiceSaving} className="text-xs bg-gray-900 text-white px-3 py-1 rounded-lg disabled:opacity-50">{tr.adminPractice.save}</button>
                      </div>
                    </div>
                  )}

                  <div className="border border-gray-900 rounded-2xl overflow-hidden bg-white">
                    {practiceTests.length === 0 && <p className="text-gray-400 text-sm py-8 text-center">{tr.adminPractice.noTests}</p>}
                    <div className="divide-y divide-gray-100">
                      {practiceTests.map((t) => (
                        <div key={t.id}>
                          {editingTest?.id === t.id ? (
                            <div className="p-4 bg-blue-50 flex flex-col gap-3">
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                <div className="flex flex-col gap-1">
                                  <label className="text-xs text-gray-400">{tr.adminPractice.fieldTitleRu}</label>
                                  <input value={editingTest.title_ru} onChange={(e) => setEditingTest((p) => p ? { ...p, title_ru: e.target.value } : p)} className="bg-white border border-gray-900 rounded-lg px-2 py-1 text-sm outline-none" />
                                </div>
                                <div className="flex flex-col gap-1">
                                  <label className="text-xs text-gray-400">{tr.adminPractice.fieldTitleEn}</label>
                                  <input value={editingTest.title_en ?? ''} onChange={(e) => setEditingTest((p) => p ? { ...p, title_en: e.target.value } : p)} className="bg-white border border-gray-900 rounded-lg px-2 py-1 text-sm outline-none" />
                                </div>
                                <div className="flex flex-col gap-1">
                                  <label className="text-xs text-gray-400">{tr.adminPractice.fieldDescRu}</label>
                                  <input value={editingTest.description_ru ?? ''} onChange={(e) => setEditingTest((p) => p ? { ...p, description_ru: e.target.value } : p)} className="bg-white border border-gray-900 rounded-lg px-2 py-1 text-sm outline-none" />
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                  <div className="flex flex-col gap-1">
                                    <label className="text-xs text-gray-400">{tr.adminPractice.fieldQuestionCount}</label>
                                    <input type="number" value={editingTest.question_count} onChange={(e) => setEditingTest((p) => p ? { ...p, question_count: Number(e.target.value) } : p)} className="bg-white border border-gray-900 rounded-lg px-2 py-1 text-sm outline-none" />
                                  </div>
                                  <div className="flex flex-col gap-1">
                                    <label className="text-xs text-gray-400">{tr.adminPractice.fieldPassThreshold}</label>
                                    <input type="number" step="0.05" min="0" max="1" value={editingTest.pass_threshold} onChange={(e) => setEditingTest((p) => p ? { ...p, pass_threshold: Number(e.target.value) } : p)} className="bg-white border border-gray-900 rounded-lg px-2 py-1 text-sm outline-none" />
                                  </div>
                                </div>
                              </div>
                              <div className="flex items-center gap-4 flex-wrap">
                                <div className="flex items-center gap-2">
                                  <label className="text-xs text-gray-400">Статус</label>
                                  <select value={editingTest.status} onChange={(e) => setEditingTest((p) => p ? { ...p, status: e.target.value } : p)} className="bg-white border border-gray-900 rounded-lg px-2 py-1 text-xs outline-none">
                                    <option value="draft">Черновик</option>
                                    <option value="testing">Тестирование</option>
                                    <option value="published">Опубликован</option>
                                  </select>
                                </div>
                                <div className="flex items-center gap-2">
                                  <label className="text-xs text-gray-400">{tr.adminPractice.fieldIsPremium}</label>
                                  <input type="checkbox" checked={editingTest.is_premium} onChange={(e) => setEditingTest((p) => p ? { ...p, is_premium: e.target.checked } : p)} className="w-4 h-4" />
                                </div>
                              </div>
                              <div className="flex gap-2 justify-end">
                                <button onClick={() => setEditingTest(null)} className="text-xs text-gray-400 px-3 py-1 border border-gray-900 rounded-lg">{tr.adminPractice.cancel}</button>
                                <button onClick={saveEditTest} disabled={practiceSaving} className="text-xs bg-gray-900 text-white px-3 py-1 rounded-lg disabled:opacity-50">{tr.adminPractice.save}</button>
                              </div>
                            </div>
                          ) : (
                            <div className="px-5 py-4 flex items-center justify-between gap-3 hover:bg-gray-50 transition-colors">
                              <div className="flex-1 min-w-0 cursor-pointer" onClick={() => { setSelectedTestId(t.id); setPracticeQPage(1); setPracticeView('questions'); loadPracticeQuestions(t.id); }}>
                                <div className="flex items-center gap-2">
                                  <p className="font-semibold text-gray-900">{t.title_ru}</p>
                                  {t.is_premium && <span className="text-[10px] px-1.5 py-0.5 bg-amber-50 border border-amber-300 text-amber-700 rounded font-medium">{tr.adminPractice.premiumBadge}</span>}
                                </div>
                                {t.title_en && <p className="text-xs text-gray-400">{t.title_en}</p>}
                                <p className="text-xs text-gray-400 mt-0.5">
                                  {t.active_questions}/{t.total_questions} {tr.adminPractice.questionsCount} · {Math.round(t.pass_threshold * 100)}% · {t.question_count} на экзамен
                                  {t.status === 'draft' && <span className="ml-2 text-gray-500 font-medium">· Черновик</span>}
                                  {t.status === 'testing' && <span className="ml-2 text-amber-600 font-medium">· Тестирование</span>}
                                </p>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <button onClick={() => exportPracticeTest(t.id)} className="text-xs px-2 py-1 rounded-lg border border-gray-300 text-gray-500 hover:border-gray-900 transition-colors">{tr.adminPractice.exportTest}</button>
                                <button onClick={() => setEditingTest(t)} className="text-xs px-2 py-1 rounded-lg border border-gray-900 text-gray-600 hover:bg-gray-100 transition-colors">{tr.adminPractice.editTest}</button>
                                <button onClick={() => deletePracticeTest(t.id)} className="text-xs px-2 py-1 rounded-lg border border-red-300 text-red-500 hover:bg-red-50 transition-colors">{tr.adminPractice.delete}</button>
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* ── Level 3: Questions in test ── */}
            {practiceView === 'questions' && (() => {
              const test = practiceTests.find((t) => t.id === selectedTestId);
              return (
                <div className="flex flex-col gap-4">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-3">
                      <button onClick={() => { setPracticeView('tests'); setSelectedTestId(null); setEditingPracticeQ(null); setAddingPracticeQ(false); }} className="text-sm text-gray-400 hover:text-gray-900 transition-colors">{tr.adminPractice.backToTests}</button>
                      <h2 className="font-semibold text-gray-900">{test?.title_ru}</h2>
                    </div>
                    <button onClick={() => { setAddingPracticeQ(true); setNewPracticeQ({ ...BLANK_PRACTICE_QUESTION }); }} className="text-sm px-3 py-1.5 bg-gray-900 text-white rounded-lg hover:bg-gray-700 transition-colors">{tr.adminPractice.addQuestion}</button>
                  </div>

                  {addingPracticeQ && (
                    <div className="border border-gray-900 rounded-2xl p-4 bg-amber-50 flex flex-col gap-3">
                      <div className="flex flex-col gap-1">
                        <label className="text-xs text-gray-400">{tr.adminPractice.fieldQuestion} (RU)</label>
                        <textarea value={newPracticeQ.question_ru} onChange={(e) => setNewPracticeQ((p) => ({ ...p, question_ru: e.target.value }))} rows={2} className="bg-white border border-gray-900 rounded-lg px-2 py-1.5 text-sm outline-none resize-none" />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-xs text-gray-400">{tr.adminPractice.fieldQuestion} (LT)</label>
                        <textarea value={newPracticeQ.question_lt ?? ''} onChange={(e) => setNewPracticeQ((p) => ({ ...p, question_lt: e.target.value }))} rows={2} className="bg-white border border-gray-900 rounded-lg px-2 py-1.5 text-sm outline-none resize-none" placeholder="Lietuviškas klausimo tekstas (neprivaloma)" />
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {(['a', 'b', 'c', 'd'] as const).map((opt) => (
                          <div key={opt} className="flex flex-col gap-1">
                            <label className="text-xs text-gray-400">{tr.adminPractice[`fieldOption${opt.toUpperCase() as 'A'|'B'|'C'|'D'}`]}</label>
                            <input value={newPracticeQ[`option_${opt}` as 'option_a'|'option_b'|'option_c'|'option_d']} onChange={(e) => setNewPracticeQ((p) => ({ ...p, [`option_${opt}`]: e.target.value }))} className="bg-white border border-gray-900 rounded-lg px-2 py-1 text-sm outline-none" />
                          </div>
                        ))}
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <div className="flex flex-col gap-1">
                          <label className="text-xs text-gray-400">{tr.adminPractice.fieldCorrect}</label>
                          <select value={newPracticeQ.correct_option} onChange={(e) => setNewPracticeQ((p) => ({ ...p, correct_option: e.target.value }))} className="bg-white border border-gray-900 rounded-lg px-2 py-1 text-sm outline-none">
                            {['a','b','c','d'].map((o) => <option key={o} value={o}>{o.toUpperCase()}</option>)}
                          </select>
                        </div>
                        <div className="flex flex-col gap-1">
                          <label className="text-xs text-gray-400">{tr.adminPractice.fieldCategory}</label>
                          <input value={newPracticeQ.category ?? ''} onChange={(e) => setNewPracticeQ((p) => ({ ...p, category: e.target.value }))} className="bg-white border border-gray-900 rounded-lg px-2 py-1 text-sm outline-none" />
                        </div>
                        <div className="flex items-end gap-2 pb-1">
                          <label className="text-xs text-gray-400">{tr.adminPractice.fieldActive}</label>
                          <input type="checkbox" checked={newPracticeQ.is_active} onChange={(e) => setNewPracticeQ((p) => ({ ...p, is_active: e.target.checked }))} className="w-4 h-4" />
                        </div>
                      </div>
                      <div className="flex gap-2 justify-end">
                        <button onClick={() => setAddingPracticeQ(false)} className="text-xs text-gray-400 px-3 py-1 border border-gray-900 rounded-lg">{tr.adminPractice.cancel}</button>
                        <button onClick={() => saveNewPracticeQ(selectedTestId!)} disabled={practiceSaving} className="text-xs bg-gray-900 text-white px-3 py-1 rounded-lg disabled:opacity-50">{tr.adminPractice.save}</button>
                      </div>
                    </div>
                  )}

                  <div className="border border-gray-900 rounded-2xl overflow-hidden bg-white">
                    {practiceQuestions.length === 0 && <p className="text-gray-400 text-sm py-8 text-center">{tr.adminPractice.noQuestions}</p>}
                    <div className="divide-y divide-gray-100">
                      {pagedPracticeQ.map((q) => (
                        <div key={q.id}>
                          {editingPracticeQ?.id === q.id ? (
                            <div className="p-4 bg-blue-50 flex flex-col gap-3">
                              <div className="flex flex-col gap-1">
                                <label className="text-xs text-gray-400">{tr.adminPractice.fieldQuestion} (RU)</label>
                                <textarea value={editingPracticeQ.question_ru} onChange={(e) => setEditingPracticeQ((p) => p ? { ...p, question_ru: e.target.value } : p)} rows={2} className="bg-white border border-gray-900 rounded-lg px-2 py-1.5 text-sm outline-none resize-none" />
                              </div>
                              <div className="flex flex-col gap-1">
                                <label className="text-xs text-gray-400">{tr.adminPractice.fieldQuestion} (LT)</label>
                                <textarea value={editingPracticeQ.question_lt ?? ''} onChange={(e) => setEditingPracticeQ((p) => p ? { ...p, question_lt: e.target.value } : p)} rows={2} className="bg-white border border-gray-900 rounded-lg px-2 py-1.5 text-sm outline-none resize-none" placeholder="Lietuviškas klausimo tekstas (neprivaloma)" />
                              </div>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                {(['a', 'b', 'c', 'd'] as const).map((opt) => (
                                  <div key={opt} className="flex flex-col gap-1">
                                    <label className="text-xs text-gray-400">{tr.adminPractice[`fieldOption${opt.toUpperCase() as 'A'|'B'|'C'|'D'}`]}</label>
                                    <input value={editingPracticeQ[`option_${opt}` as 'option_a'|'option_b'|'option_c'|'option_d']} onChange={(e) => setEditingPracticeQ((p) => p ? { ...p, [`option_${opt}`]: e.target.value } : p)} className="bg-white border border-gray-900 rounded-lg px-2 py-1 text-sm outline-none" />
                                  </div>
                                ))}
                              </div>
                              <div className="grid grid-cols-3 gap-2">
                                <div className="flex flex-col gap-1">
                                  <label className="text-xs text-gray-400">{tr.adminPractice.fieldCorrect}</label>
                                  <select value={editingPracticeQ.correct_option} onChange={(e) => setEditingPracticeQ((p) => p ? { ...p, correct_option: e.target.value } : p)} className="bg-white border border-gray-900 rounded-lg px-2 py-1 text-sm outline-none">
                                    {['a','b','c','d'].map((o) => <option key={o} value={o}>{o.toUpperCase()}</option>)}
                                  </select>
                                </div>
                                <div className="flex flex-col gap-1">
                                  <label className="text-xs text-gray-400">{tr.adminPractice.fieldCategory}</label>
                                  <input value={editingPracticeQ.category ?? ''} onChange={(e) => setEditingPracticeQ((p) => p ? { ...p, category: e.target.value } : p)} className="bg-white border border-gray-900 rounded-lg px-2 py-1 text-sm outline-none" />
                                </div>
                                <div className="flex items-end gap-2 pb-1">
                                  <label className="text-xs text-gray-400">{tr.adminPractice.fieldActive}</label>
                                  <input type="checkbox" checked={editingPracticeQ.is_active} onChange={(e) => setEditingPracticeQ((p) => p ? { ...p, is_active: e.target.checked } : p)} className="w-4 h-4" />
                                </div>
                              </div>
                              <div className="flex gap-2 justify-end">
                                <button onClick={() => setEditingPracticeQ(null)} className="text-xs text-gray-400 px-3 py-1 border border-gray-900 rounded-lg">{tr.adminPractice.cancel}</button>
                                <button onClick={() => saveEditPracticeQ(selectedTestId!)} disabled={practiceSaving} className="text-xs bg-gray-900 text-white px-3 py-1 rounded-lg disabled:opacity-50">{tr.adminPractice.save}</button>
                              </div>
                            </div>
                          ) : (
                            <div className="px-4 py-3 flex items-start justify-between gap-3 hover:bg-gray-50 transition-colors">
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-gray-900 leading-snug">{q.question_ru}</p>
                                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
                                  {(['a','b','c','d'] as const).map((opt) => (
                                    <span key={opt} className={`text-xs ${q.correct_option === opt ? 'text-emerald-600 font-semibold' : 'text-gray-400'}`}>
                                      {opt.toUpperCase()}. {q[`option_${opt}` as keyof PracticeQuestionRow] as string}
                                    </span>
                                  ))}
                                </div>
                                {q.category && <span className="mt-1 inline-block text-[10px] px-1.5 py-px bg-amber-50 border border-amber-200 text-amber-700 rounded">{q.category}</span>}
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <button onClick={() => togglePracticeQActive(q, selectedTestId!)} className={`text-xs px-2 py-1 rounded-lg border font-medium transition-colors ${q.is_active ? 'border-emerald-500 text-emerald-600 bg-emerald-50 hover:bg-emerald-100' : 'border-gray-300 text-gray-400 hover:border-gray-500'}`}>
                                  {q.is_active ? tr.adminPractice.activeLabel : tr.adminPractice.inactiveLabel}
                                </button>
                                <button onClick={() => setEditingPracticeQ(q)} className="text-xs px-2 py-1 rounded-lg border border-gray-900 text-gray-600 hover:bg-gray-100 transition-colors">{tr.adminPractice.editQuestion}</button>
                                <button onClick={() => deletePracticeQ(q.id, selectedTestId!)} className="text-xs px-2 py-1 rounded-lg border border-red-300 text-red-500 hover:bg-red-50 transition-colors">{tr.adminPractice.delete}</button>
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                    <Pagination total={practiceQuestions.length} page={practiceQPage} onPage={setPracticeQPage} />
                  </div>
                </div>
              );
            })()}
          </div>
        )}

        {/* ── News ── */}
        {area === 'content' && contentTab === 'news' && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-gray-900">{tr.news.adminTitle}</h2>
              <button
                onClick={() => { setAddingNews(true); setEditingNews(null); setNewsDraft({ ...BLANK_NEWS }); }}
                className="text-xs px-3 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors font-medium"
              >
                + {tr.news.newPost}
              </button>
            </div>

            {(addingNews || editingNews) && (
              <div className="mb-4 p-4 rounded-2xl border border-gray-900 bg-white flex flex-col gap-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">{tr.news.fieldTitleRu}</label>
                    <input
                      type="text"
                      value={newsDraft.title_ru}
                      onChange={(e) => setNewsDraft((d) => ({ ...d, title_ru: e.target.value }))}
                      className="w-full border border-gray-900 rounded-lg px-3 py-2 text-sm outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">{tr.news.fieldTitleEn}</label>
                    <input
                      type="text"
                      value={newsDraft.title_en}
                      onChange={(e) => setNewsDraft((d) => ({ ...d, title_en: e.target.value }))}
                      className="w-full border border-gray-900 rounded-lg px-3 py-2 text-sm outline-none"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">{tr.news.fieldBodyRu}</label>
                    <textarea
                      rows={4}
                      value={newsDraft.body_ru}
                      onChange={(e) => setNewsDraft((d) => ({ ...d, body_ru: e.target.value }))}
                      className="w-full border border-gray-900 rounded-lg px-3 py-2 text-sm outline-none resize-y"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">{tr.news.fieldBodyEn}</label>
                    <textarea
                      rows={4}
                      value={newsDraft.body_en}
                      onChange={(e) => setNewsDraft((d) => ({ ...d, body_en: e.target.value }))}
                      className="w-full border border-gray-900 rounded-lg px-3 py-2 text-sm outline-none resize-y"
                    />
                  </div>
                </div>
                <div className="flex items-center gap-4 flex-wrap">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">{tr.news.fieldPublishedAt}</label>
                    <input
                      type="date"
                      value={newsDraft.published_at.slice(0, 10)}
                      onChange={(e) => setNewsDraft((d) => ({ ...d, published_at: e.target.value }))}
                      className="border border-gray-900 rounded-lg px-3 py-2 text-sm outline-none"
                    />
                  </div>
                  <label className="flex items-center gap-2 text-sm text-gray-700">
                    <input
                      type="checkbox"
                      checked={newsDraft.published}
                      onChange={(e) => setNewsDraft((d) => ({ ...d, published: e.target.checked }))}
                    />
                    {tr.news.fieldPublished}
                  </label>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={saveNews}
                    disabled={newsSaving}
                    className="text-xs px-3 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors font-medium disabled:opacity-50"
                  >
                    {tr.news.save}
                  </button>
                  <button
                    onClick={() => { setAddingNews(false); setEditingNews(null); setNewsDraft({ ...BLANK_NEWS }); }}
                    className="text-xs px-3 py-2 border border-gray-900 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors"
                  >
                    {tr.news.cancel}
                  </button>
                </div>
              </div>
            )}

            {newsList.length === 0 && !addingNews && (
              <p className="text-gray-400 text-sm py-8 text-center">{tr.news.noNews}</p>
            )}

            <div className="flex flex-col gap-3">
              {newsList.map((post) => (
                <div key={post.id} className="flex items-center justify-between gap-4 rounded-2xl border border-gray-900 bg-white px-4 py-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-gray-900 truncate">{post.title_ru}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full border border-gray-900 font-medium ${post.published ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-50 text-gray-400'}`}>
                        {post.published ? tr.articles.published : tr.articles.draft}
                      </span>
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">{new Date(post.published_at).toLocaleDateString('ru-RU')}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => { setEditingNews(post); setAddingNews(false); setNewsDraft({ title_ru: post.title_ru, title_en: post.title_en, body_ru: post.body_ru, body_en: post.body_en, published_at: post.published_at.slice(0, 10), published: post.published }); }}
                      className="text-xs px-3 py-1.5 border border-gray-900 rounded-lg text-emerald-600 hover:bg-gray-50 transition-colors"
                    >
                      {tr.articles.editArticle}
                    </button>
                    <button
                      onClick={() => deleteNews(post.id)}
                      className="text-xs px-3 py-1.5 border border-gray-900 rounded-lg text-red-500 hover:bg-gray-50 transition-colors"
                    >
                      {tr.news.delete}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Phrase Programs ── */}
        {area === 'content' && contentTab === 'phrases' && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-gray-900">Программы фраз</h2>
              <button
                onClick={() => { setAddingPhraseProgram(true); setEditingPhraseProgram(null); setPhraseProgramDraft({ title: '', title_en: '', description: '', description_en: '', difficulty: 1, is_public: true }); }}
                className="px-3 py-1.5 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition-colors"
              >
                + Добавить программу
              </button>
            </div>

            {(addingPhraseProgram || editingPhraseProgram) && (
              <div className="bg-white border border-gray-200 rounded-2xl p-4 mb-4 space-y-3">
                <h3 className="font-medium text-gray-900 text-sm">{editingPhraseProgram ? 'Редактировать программу' : 'Новая программа'}</h3>
                <input value={phraseProgramDraft.title} onChange={(e) => setPhraseProgramDraft((d) => ({ ...d, title: e.target.value }))} placeholder="Название (RU)" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-emerald-500" />
                <input value={phraseProgramDraft.title_en} onChange={(e) => setPhraseProgramDraft((d) => ({ ...d, title_en: e.target.value }))} placeholder="Название (EN)" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-emerald-500" />
                <input value={phraseProgramDraft.description} onChange={(e) => setPhraseProgramDraft((d) => ({ ...d, description: e.target.value }))} placeholder="Описание (RU)" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-emerald-500" />
                <input value={phraseProgramDraft.description_en} onChange={(e) => setPhraseProgramDraft((d) => ({ ...d, description_en: e.target.value }))} placeholder="Описание (EN)" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-emerald-500" />
                <div className="flex items-center gap-4">
                  <label className="text-sm text-gray-600">Сложность:</label>
                  {[1, 2, 3].map((d) => (
                    <button key={d} onClick={() => setPhraseProgramDraft((prev) => ({ ...prev, difficulty: d }))} className={`px-3 py-1 rounded-lg text-sm font-medium border transition-colors ${phraseProgramDraft.difficulty === d ? 'bg-gray-900 text-white border-gray-900' : 'border-gray-200 text-gray-600 hover:border-gray-400'}`}>{d}</button>
                  ))}
                  <label className="flex items-center gap-2 text-sm text-gray-600 ml-4">
                    <input type="checkbox" checked={phraseProgramDraft.is_public} onChange={(e) => setPhraseProgramDraft((d) => ({ ...d, is_public: e.target.checked }))} />
                    Публичная
                  </label>
                </div>
                <div className="flex gap-2">
                  <button onClick={savePhraseProgram} disabled={phraseProgramSaving} className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 transition-colors">
                    {phraseProgramSaving ? 'Сохранение…' : 'Сохранить'}
                  </button>
                  <button onClick={() => { setAddingPhraseProgram(false); setEditingPhraseProgram(null); }} className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200 transition-colors">Отмена</button>
                </div>
              </div>
            )}

            <div className="space-y-3">
              {phrasePrograms.map((prog) => (
                <div key={prog.id} className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3">
                    <div>
                      <span className="font-medium text-gray-900 text-sm">{prog.title}</span>
                      <span className="ml-2 text-xs text-gray-400">{prog.phrase_count} фраз · {prog.enrolled_count} пользователей</span>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          if (expandedPhraseProgram === prog.id) { setExpandedPhraseProgram(null); }
                          else { setExpandedPhraseProgram(prog.id); if (!phrasesMap[prog.id]) loadPhrasesForProgram(prog.id); }
                        }}
                        className="text-xs text-gray-500 hover:text-gray-900 px-2 py-1 rounded-lg hover:bg-gray-100 transition-colors"
                      >
                        {expandedPhraseProgram === prog.id ? 'Свернуть' : 'Фразы'}
                      </button>
                      <button
                        onClick={() => { setEditingPhraseProgram(prog); setAddingPhraseProgram(false); setPhraseProgramDraft({ title: prog.title, title_en: prog.title_en ?? '', description: prog.description ?? '', description_en: prog.description_en ?? '', difficulty: prog.difficulty, is_public: prog.is_public }); }}
                        className="text-xs text-blue-600 hover:text-blue-700 px-2 py-1 rounded-lg hover:bg-blue-50 transition-colors"
                      >
                        Редактировать
                      </button>
                      <button onClick={() => deletePhraseProgram(prog.id)} className="text-xs text-red-500 hover:text-red-700 px-2 py-1 rounded-lg hover:bg-red-50 transition-colors">
                        Удалить
                      </button>
                    </div>
                  </div>

                  {expandedPhraseProgram === prog.id && (
                    <div className="border-t border-gray-100 px-4 pb-4 pt-3">
                      <div className="space-y-2 mb-3">
                        {(phrasesMap[prog.id] ?? []).map((phrase) => (
                          <div key={phrase.id} className="flex items-start justify-between gap-3 bg-gray-50 rounded-xl px-3 py-2">
                            {editingPhrase?.id === phrase.id ? (
                              <div className="flex-1 space-y-2">
                                <input value={phraseDraft.text} onChange={(e) => setPhraseDraft((d) => ({ ...d, text: e.target.value }))} placeholder="Литовский текст" className="w-full border border-gray-200 rounded-lg px-2 py-1 text-xs outline-none focus:border-emerald-500" />
                                <input value={phraseDraft.translation} onChange={(e) => setPhraseDraft((d) => ({ ...d, translation: e.target.value }))} placeholder="Перевод (RU)" className="w-full border border-gray-200 rounded-lg px-2 py-1 text-xs outline-none focus:border-emerald-500" />
                                <input value={phraseDraft.translation_en} onChange={(e) => setPhraseDraft((d) => ({ ...d, translation_en: e.target.value }))} placeholder="Translation (EN)" className="w-full border border-gray-200 rounded-lg px-2 py-1 text-xs outline-none focus:border-emerald-500" />
                                <div className="flex gap-2">
                                  <button onClick={() => savePhrase(prog.id)} disabled={phraseSaving} className="px-3 py-1 bg-emerald-600 text-white rounded-lg text-xs font-medium disabled:opacity-50">Сохранить</button>
                                  <button onClick={() => setEditingPhrase(null)} className="px-3 py-1 bg-gray-100 text-gray-700 rounded-lg text-xs font-medium">Отмена</button>
                                </div>
                              </div>
                            ) : (
                              <>
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm text-gray-900">{phrase.text}</p>
                                  <p className="text-xs text-gray-400">{phrase.translation}{phrase.translation_en ? ` · ${phrase.translation_en}` : ''}</p>
                                </div>
                                <div className="flex gap-1 shrink-0">
                                  <button onClick={() => { setEditingPhrase(phrase); setPhraseDraft({ text: phrase.text, translation: phrase.translation, translation_en: phrase.translation_en ?? '', position: phrase.position }); }} className="text-xs text-blue-500 hover:text-blue-700 px-2 py-0.5 rounded hover:bg-blue-50">✏️</button>
                                  <button onClick={() => deletePhrase(phrase.id, prog.id)} className="text-xs text-red-400 hover:text-red-600 px-2 py-0.5 rounded hover:bg-red-50">✕</button>
                                </div>
                              </>
                            )}
                          </div>
                        ))}
                      </div>

                      {addingPhrase === prog.id ? (
                        <div className="bg-gray-50 rounded-xl px-3 py-2 space-y-2">
                          <input value={phraseDraft.text} onChange={(e) => setPhraseDraft((d) => ({ ...d, text: e.target.value }))} placeholder="Литовский текст" className="w-full border border-gray-200 rounded-lg px-2 py-1 text-xs outline-none focus:border-emerald-500" />
                          <input value={phraseDraft.translation} onChange={(e) => setPhraseDraft((d) => ({ ...d, translation: e.target.value }))} placeholder="Перевод (RU)" className="w-full border border-gray-200 rounded-lg px-2 py-1 text-xs outline-none focus:border-emerald-500" />
                          <input value={phraseDraft.translation_en} onChange={(e) => setPhraseDraft((d) => ({ ...d, translation_en: e.target.value }))} placeholder="Translation (EN)" className="w-full border border-gray-200 rounded-lg px-2 py-1 text-xs outline-none focus:border-emerald-500" />
                          <div className="flex gap-2">
                            <button onClick={() => savePhrase(prog.id)} disabled={phraseSaving} className="px-3 py-1 bg-emerald-600 text-white rounded-lg text-xs font-medium disabled:opacity-50">Добавить</button>
                            <button onClick={() => setAddingPhrase(null)} className="px-3 py-1 bg-gray-100 text-gray-700 rounded-lg text-xs font-medium">Отмена</button>
                          </div>
                        </div>
                      ) : (
                        <button onClick={() => { setAddingPhrase(prog.id); setPhraseDraft({ text: '', translation: '', translation_en: '', position: (phrasesMap[prog.id]?.length ?? 0) }); }} className="text-xs text-emerald-600 hover:text-emerald-700 font-medium">
                          + Добавить фразу
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ))}
              {phraseProgramsLoaded && phrasePrograms.length === 0 && (
                <p className="text-sm text-gray-400 text-center py-6">Нет программ фраз.</p>
              )}
            </div>
          </div>
        )}

        {/* ── Settings: CEFR thresholds ── */}
        {area === 'content' && contentTab === 'settings' && (
          <div>
            <h2 className="font-semibold text-gray-900 mb-1">CEFR уровни — пороговые значения слов</h2>
            <p className="text-sm text-gray-500 mb-4">Количество выученных слов, необходимое для достижения каждого уровня.</p>
            {cefrLoaded && (
              <div className="bg-white rounded-2xl border border-gray-200 divide-y divide-gray-100 mb-4">
                {cefrThresholds.map((row) => (
                  <div key={row.level} className="flex items-center gap-4 px-4 py-3">
                    <span className="w-10 font-bold text-gray-900 text-sm">{row.level}</span>
                    <input
                      type="number"
                      min={1}
                      value={row.threshold}
                      onChange={(e) => setCefrThresholds((prev) =>
                        prev.map((r) => r.level === row.level ? { ...r, threshold: Number(e.target.value) } : r)
                      )}
                      className="w-32 border border-gray-300 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-emerald-500"
                    />
                    <span className="text-xs text-gray-400">слов</span>
                  </div>
                ))}
              </div>
            )}
            <div className="flex items-center gap-3">
              <button
                onClick={saveCefrThresholds}
                disabled={cefrSaving || !cefrLoaded}
                className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 disabled:opacity-50 transition-colors"
              >
                {cefrSaving ? 'Сохранение…' : 'Сохранить'}
              </button>
              {cefrMsg && <span className="text-sm text-emerald-600">{cefrMsg}</span>}
            </div>
          </div>
        )}

      </div>
    </main>

    {progressUserId && (
      <UserProgressModal
        userId={progressUserId}
        userName={progressUserName}
        onClose={() => setProgressUserId(null)}
      />
    )}

    {emailUserId && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
        <div className="bg-white border border-gray-900 rounded-2xl p-6 w-full max-w-md flex flex-col gap-4">
          <h2 className="text-base font-semibold text-gray-900">Письмо пользователю: {emailUserName}</h2>
          <input
            type="text"
            placeholder="Тема письма"
            value={emailSubject}
            onChange={(e) => setEmailSubject(e.target.value)}
            className="w-full border border-gray-900 rounded-xl px-4 py-2 text-sm text-gray-900 outline-none focus:border-gray-600"
          />
          <textarea
            placeholder="Текст письма"
            value={emailBody}
            onChange={(e) => setEmailBody(e.target.value)}
            rows={6}
            className="w-full border border-gray-900 rounded-xl px-4 py-2 text-sm text-gray-900 outline-none focus:border-gray-600 resize-none"
          />
          {emailError && <p className="text-red-600 text-sm">{emailError}</p>}
          {emailSuccess && <p className="text-emerald-600 text-sm font-medium">Письмо отправлено</p>}
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => { setEmailUserId(null); setEmailUserName(''); setEmailSubject(''); setEmailBody(''); setEmailError(''); }}
              className="px-4 py-2 text-sm text-gray-500 hover:text-gray-900 transition-colors"
            >
              Отмена
            </button>
            <button
              onClick={handleSendEmail}
              disabled={emailSending || !emailSubject.trim() || !emailBody.trim()}
              className="px-4 py-2 bg-gray-900 hover:bg-gray-800 disabled:opacity-50 rounded-xl text-sm font-medium text-white transition-colors"
            >
              {emailSending ? '...' : 'Отправить'}
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}
