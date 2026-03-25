'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getToken, getSettings, updateSettings, type UserSettings } from '../../../lib/api';
import { useT } from '../../../lib/useT';

export default function SettingsPage() {
  const router = useRouter();
  const { tr } = useT();
  const [settings, setSettings] = useState<UserSettings>({ words_per_session: 10, new_words_ratio: 0.7 });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!getToken()) {
      router.replace('/login');
      return;
    }
    getSettings()
      .then(setSettings)
      .catch(() => setError('Не удалось загрузить настройки'))
      .finally(() => setLoading(false));
  }, [router]);

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
        <h1 className="text-2xl font-bold mb-8">{tr.settings.title}</h1>

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
      </div>
    </main>
  );
}
