'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getToken, getSettings, updateSettings, getPhrasesSettings, updatePhrasesSettings, type UserSettings } from '../../../lib/api';
import { useT } from '../../../lib/useT';

type Complexity = 'easy' | 'medium' | 'hard';
type Tab = 'vocabulary' | 'grammar' | 'practice' | 'phrases' | 'other';

export default function SettingsPage() {
  const router = useRouter();
  const { tr } = useT();
  const [settings, setSettings] = useState<UserSettings>({ words_per_session: 10, new_words_ratio: 0.7, lesson_mode: 'thorough', use_question_timer: false, question_timer_seconds: 5, email_consent: true, lang: 'en' });
  const [complexity, setComplexity] = useState<Complexity>('medium');
  const [activeTab, setActiveTab] = useState<Tab>('vocabulary');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [phrasesPerSession, setPhrasesPerSession] = useState(10);
  const [phrasesSaving, setPhrasesSaving] = useState(false);
  const [phrasesSaved, setPhrasesSaved] = useState(false);

  useEffect(() => {
    if (!getToken()) {
      router.replace('/login');
      return;
    }
    const stored = localStorage.getItem('fluent_complexity') as Complexity | null;
    if (stored === 'easy' || stored === 'medium' || stored === 'hard') {
      setComplexity(stored);
    }
    Promise.all([
      getSettings(),
      getPhrasesSettings(),
    ])
      .then(([s, ps]) => { setSettings(s); setPhrasesPerSession(ps.phrases_per_session); })
      .catch(() => setError('Не удалось загрузить настройки'))
      .finally(() => setLoading(false));
  }, [router]);

  async function handlePhrasesSave() {
    setPhrasesSaving(true);
    setPhrasesSaved(false);
    try {
      await updatePhrasesSettings(phrasesPerSession);
      setPhrasesSaved(true);
      setTimeout(() => setPhrasesSaved(false), 3000);
    } catch {
      setError('Не удалось сохранить настройки фраз');
    } finally {
      setPhrasesSaving(false);
    }
  }

  function handleComplexityChange(value: Complexity) {
    setComplexity(value);
    localStorage.setItem('fluent_complexity', value);
  }

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    setError('');
    try {
      const updated = await updateSettings(settings);
      setSettings(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      setError('Не удалось сохранить настройки');
    } finally {
      setSaving(false);
    }
  }

  const newRatioPct = Math.round(settings.new_words_ratio * 100);
  const reviewRatioPct = 100 - newRatioPct;
  const newCount = Math.round(settings.words_per_session * settings.new_words_ratio);
  const reviewCount = settings.words_per_session - newCount;

  const tabs: { key: Tab; label: string }[] = [
    { key: 'vocabulary', label: tr.settings.tabVocabulary },
    { key: 'grammar', label: tr.settings.tabGrammar },
    { key: 'practice', label: tr.settings.tabPractice },
    { key: 'phrases', label: 'Фразы' },
    { key: 'other', label: tr.settings.tabOther },
  ];

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 text-gray-900 flex flex-col items-center px-6 py-12">
      <div className="pointer-events-none fixed inset-0 flex items-start justify-center overflow-hidden">
        <div className="w-full max-w-[600px] h-[400px] bg-emerald-100/40 blur-[120px] rounded-full mt-[-100px]" />
      </div>

      <div className="relative z-10 w-full max-w-sm">
        <h1 className="text-2xl font-bold mb-6">{tr.settings.title}</h1>

        {/* Tab bar */}
        <div className="flex gap-1 mb-6 bg-gray-100 rounded-xl p-1" data-testid="settings-tabs">
          {tabs.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              data-testid={`tab-${key}`}
              className={`flex-1 py-2 text-xs font-medium rounded-lg transition-colors ${
                activeTab === key
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {activeTab === 'vocabulary' ? (
          <div className="bg-white border border-gray-900 rounded-2xl p-6 flex flex-col gap-8">

            {/* Total words per session */}
            <div>
              <label className="block text-sm font-medium text-gray-900 mb-1">
                {tr.settings.sessionSizeLabel}
              </label>
              <p className="text-xs text-gray-400 mb-3">{tr.settings.sessionSizeHint}</p>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min={3}
                  max={50}
                  step={1}
                  value={settings.words_per_session}
                  onChange={(e) => setSettings((prev) => ({ ...prev, words_per_session: parseInt(e.target.value, 10) }))}
                  data-testid="session-size-slider"
                  className="flex-1 accent-emerald-600"
                />
                <span className="w-8 text-center font-semibold text-gray-900 tabular-nums" data-testid="session-size-value">
                  {settings.words_per_session}
                </span>
              </div>
            </div>

            {/* New vs review ratio */}
            <div>
              <label className="block text-sm font-medium text-gray-900 mb-1">
                {tr.settings.ratioLabel}
              </label>
              <p className="text-xs text-gray-400 mb-3">{tr.settings.ratioHint}</p>

              {/* Visual ratio bar */}
              <div className="flex rounded-lg overflow-hidden h-8 mb-3 border border-gray-900">
                <div
                  className="flex items-center justify-center text-xs font-medium text-white bg-emerald-600 transition-all duration-150"
                  style={{ width: `${newRatioPct}%` }}
                >
                  {newRatioPct > 15 && `${tr.settings.ratioNewLabel} ${newRatioPct}%`}
                </div>
                <div
                  className="flex items-center justify-center text-xs font-medium text-gray-700 bg-gray-100 transition-all duration-150"
                  style={{ width: `${reviewRatioPct}%` }}
                >
                  {reviewRatioPct > 15 && `${tr.settings.ratioReviewLabel} ${reviewRatioPct}%`}
                </div>
              </div>

              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={newRatioPct}
                onChange={(e) => setSettings((prev) => ({ ...prev, new_words_ratio: parseInt(e.target.value, 10) / 100 }))}
                data-testid="ratio-slider"
                className="w-full accent-emerald-600"
              />

              <div className="flex justify-between text-xs text-gray-400 mt-1">
                <span>{tr.settings.ratioNewLabel}: ~{newCount}</span>
                <span>{tr.settings.ratioReviewLabel}: ~{reviewCount}</span>
              </div>
            </div>

            {/* Complexity selector */}
            <div>
              <label className="block text-sm font-medium text-gray-900 mb-1">
                {tr.settings.complexityLabel}
              </label>
              <p className="text-xs text-gray-400 mb-3">{tr.settings.complexityHint}</p>
              <div className="flex items-center gap-3 mb-2">
                <input
                  type="range"
                  min={1}
                  max={3}
                  step={1}
                  value={complexity === 'easy' ? 1 : complexity === 'medium' ? 2 : 3}
                  onChange={(e) => {
                    const val = parseInt(e.target.value, 10);
                    handleComplexityChange(val === 1 ? 'easy' : val === 2 ? 'medium' : 'hard');
                  }}
                  data-testid="complexity-slider"
                  className="flex-1 accent-emerald-600"
                />
                <span className="w-16 text-right text-sm font-semibold text-gray-900">
                  {tr.settings[`complexity${complexity.charAt(0).toUpperCase()}${complexity.slice(1)}` as 'complexityEasy' | 'complexityMedium' | 'complexityHard']}
                </span>
              </div>
              <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 flex flex-col gap-2 text-sm">
                <div className="flex gap-2">
                  <span className="text-gray-400 shrink-0">📌</span>
                  <span className="text-gray-700">
                    {tr.settings[`complexity${complexity.charAt(0).toUpperCase()}${complexity.slice(1)}Kf` as 'complexityEasyKf' | 'complexityMediumKf' | 'complexityHardKf']}
                  </span>
                </div>
                <div className="flex gap-2">
                  <span className="text-gray-400 shrink-0">💡</span>
                  <span className="text-gray-500 italic">
                    {tr.settings[`complexity${complexity.charAt(0).toUpperCase()}${complexity.slice(1)}Tk` as 'complexityEasyTk' | 'complexityMediumTk' | 'complexityHardTk']}
                  </span>
                </div>
              </div>
            </div>

            {/* Lesson mode */}
            <div>
              <label className="block text-sm font-medium text-gray-900 mb-1">
                {tr.settings.lessonModeLabel}
              </label>
              <div className="flex items-center gap-3 mb-2">
                <input
                  type="range"
                  min={1}
                  max={2}
                  step={1}
                  value={settings.lesson_mode === 'thorough' ? 1 : 2}
                  onChange={(e) => setSettings((prev) => ({ ...prev, lesson_mode: parseInt(e.target.value, 10) === 1 ? 'thorough' : 'quick' }))}
                  data-testid="lesson-mode-slider"
                  className="flex-1 accent-emerald-600"
                />
                <span className="w-20 text-right text-sm font-semibold text-gray-900">
                  {settings.lesson_mode === 'thorough' ? tr.settings.lessonModeThoroughLabel : tr.settings.lessonModeQuickLabel}
                </span>
              </div>
              <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700">
                {settings.lesson_mode === 'thorough' ? tr.settings.lessonModeThoroughInfo : tr.settings.lessonModeQuickInfo}
              </div>
            </div>

            {/* Question timer */}
            <div className="flex flex-col gap-3">
              <label className="flex items-center gap-3 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={settings.use_question_timer}
                  onChange={(e) => setSettings((prev) => ({ ...prev, use_question_timer: e.target.checked }))}
                  data-testid="timer-checkbox"
                  className="w-4 h-4 accent-emerald-600"
                />
                <span className="text-sm font-medium text-gray-900">{tr.settings.timerLabel}</span>
              </label>

              {settings.use_question_timer && (
                <div data-testid="timer-seconds-control">
                  <label className="block text-xs text-gray-500 mb-2">
                    {tr.settings.timerSecondsLabel}: <span className="font-semibold text-gray-900" data-testid="timer-seconds-value">{settings.question_timer_seconds}</span> с
                  </label>
                  <input
                    type="range"
                    min={5}
                    max={30}
                    step={1}
                    value={settings.question_timer_seconds}
                    onChange={(e) => setSettings((prev) => ({ ...prev, question_timer_seconds: parseInt(e.target.value, 10) }))}
                    data-testid="timer-seconds-slider"
                    className="w-full accent-emerald-600"
                  />
                  <div className="flex justify-between text-xs text-gray-400 mt-1">
                    <span>5 с</span>
                    <span>30 с</span>
                  </div>
                </div>
              )}
            </div>

            {error && <p className="text-red-600 text-sm">{error}</p>}

            {saved && (
              <p className="text-emerald-600 text-sm font-medium" data-testid="saved-message">
                {tr.settings.savedMessage}
              </p>
            )}

            <button
              onClick={handleSave}
              disabled={saving}
              data-testid="save-settings-btn"
              className="w-full py-3 bg-gray-900 hover:bg-gray-800 disabled:opacity-50 rounded-xl font-medium text-white transition-colors"
            >
              {saving ? '...' : tr.settings.saveButton}
            </button>
          </div>
        ) : activeTab === 'phrases' ? (
          <div className="bg-white border border-gray-900 rounded-2xl p-6 flex flex-col gap-8">
            <div>
              <label className="block text-sm font-medium text-gray-900 mb-1">
                Фраз за сессию
              </label>
              <p className="text-xs text-gray-400 mb-3">Сколько фраз показывать в одной сессии изучения</p>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min={3}
                  max={30}
                  step={1}
                  value={phrasesPerSession}
                  onChange={(e) => setPhrasesPerSession(parseInt(e.target.value, 10))}
                  data-testid="phrases-session-size-slider"
                  className="flex-1 accent-emerald-600"
                />
                <span className="w-8 text-center font-semibold text-gray-900 tabular-nums">
                  {phrasesPerSession}
                </span>
              </div>
            </div>

            {error && <p className="text-red-600 text-sm">{error}</p>}

            {phrasesSaved && (
              <p className="text-emerald-600 text-sm font-medium">{tr.settings.savedMessage}</p>
            )}

            <button
              onClick={handlePhrasesSave}
              disabled={phrasesSaving}
              className="w-full py-3 bg-gray-900 hover:bg-gray-800 disabled:opacity-50 rounded-xl font-medium text-white transition-colors"
            >
              {phrasesSaving ? '...' : tr.settings.saveButton}
            </button>
          </div>
        ) : activeTab === 'other' ? (
          <div className="bg-white border border-gray-900 rounded-2xl p-6 flex flex-col gap-8">

            {/* Language preference */}
            <div>
              <label className="block text-sm font-medium text-gray-900 mb-2">
                {tr.settings.langLabel}
              </label>
              <select
                value={settings.lang}
                onChange={(e) => setSettings((prev) => ({ ...prev, lang: e.target.value as 'en' | 'ru' }))}
                data-testid="lang-select"
                className="w-full border border-gray-900 rounded-xl px-4 py-2 text-sm text-gray-900 bg-white outline-none focus:border-gray-600 cursor-pointer"
              >
                <option value="en">{tr.settings.langEn}</option>
                <option value="ru">{tr.settings.langRu}</option>
              </select>
            </div>

            {/* Email consent */}
            <div>
              <label className="flex items-start gap-3 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={settings.email_consent}
                  onChange={(e) => setSettings((prev) => ({ ...prev, email_consent: e.target.checked }))}
                  data-testid="email-consent-checkbox"
                  className="mt-0.5 w-4 h-4 accent-emerald-600"
                />
                <span>
                  <span className="block text-sm font-medium text-gray-900">{tr.settings.emailConsentLabel}</span>
                  <span className="block text-xs text-gray-400 mt-0.5">{tr.settings.emailConsentHint}</span>
                </span>
              </label>
            </div>

            {error && <p className="text-red-600 text-sm">{error}</p>}

            {saved && (
              <p className="text-emerald-600 text-sm font-medium" data-testid="saved-message">
                {tr.settings.savedMessage}
              </p>
            )}

            <button
              onClick={handleSave}
              disabled={saving}
              data-testid="save-settings-btn"
              className="w-full py-3 bg-gray-900 hover:bg-gray-800 disabled:opacity-50 rounded-xl font-medium text-white transition-colors"
            >
              {saving ? '...' : tr.settings.saveButton}
            </button>
          </div>
        ) : (
          <div className="bg-white border border-gray-200 rounded-2xl p-6 flex items-center justify-center min-h-[120px]">
            <p className="text-sm text-gray-400">{tr.settings.tabEmptyPlaceholder}</p>
          </div>
        )}
      </div>
    </main>
  );
}
