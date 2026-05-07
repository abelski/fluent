'use client';

import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { dismissWelcome, WelcomeContent } from '../lib/api';
import { useT } from '../lib/useT';

interface Props {
  content: WelcomeContent;
  /** Close for this session only — modal will reappear next login */
  onClose: () => void;
  /** Permanently dismiss — never show again */
  onDismiss: () => void;
}

export default function WelcomeModal({ content, onClose, onDismiss }: Props) {
  const { lang } = useT();
  const [loading, setLoading] = useState(false);

  const title = lang === 'ru' ? content.title_ru : content.title_en;
  const body = lang === 'ru' ? content.body_ru : content.body_en;

  async function handleDismiss() {
    setLoading(true);
    try {
      await dismissWelcome();
    } catch {
      // best-effort — dismiss locally even if the request fails
    }
    onDismiss();
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white overflow-y-auto sm:items-center sm:justify-center sm:bg-black/40 sm:p-4">
      <div
        className="flex flex-col flex-1 sm:flex-none sm:rounded-2xl sm:border sm:border-gray-900 sm:shadow-xl bg-white w-full sm:max-w-lg sm:flex-initial"
        data-testid="welcome-modal"
      >
        {/* Header */}
        <div className="px-6 pt-10 pb-4 sm:pt-8 relative">
          <button
            onClick={onClose}
            data-testid="welcome-close"
            aria-label="Закрыть"
            className="absolute top-4 right-4 sm:top-5 sm:right-5 text-gray-400 hover:text-gray-700 transition-colors p-1"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          <div className="text-3xl mb-4">👋</div>
          <h1 className="text-2xl font-bold text-gray-900 leading-snug">{title}</h1>
        </div>

        {/* Body — rendered as Markdown */}
        <div className="px-6 pb-6 flex-1 overflow-y-auto">
          <article className="prose prose-gray max-w-none
            prose-headings:font-bold prose-headings:text-gray-900
            prose-h2:text-lg prose-h3:text-base
            prose-p:text-gray-600 prose-p:leading-relaxed
            prose-li:text-gray-600
            prose-ul:list-disc prose-ul:pl-5
            prose-ol:list-decimal prose-ol:pl-5
            prose-strong:text-gray-900
            prose-a:text-emerald-600 prose-a:no-underline hover:prose-a:underline">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {body}
            </ReactMarkdown>
          </article>
        </div>

        {/* Footer */}
        <div className="px-6 pb-10 sm:pb-6 flex flex-col gap-2">
          <button
            onClick={handleDismiss}
            disabled={loading}
            data-testid="welcome-dismiss"
            className="w-full bg-gray-900 hover:bg-gray-800 active:bg-gray-700 text-white font-semibold rounded-2xl px-6 py-4 text-base transition-colors disabled:opacity-50"
          >
            {loading ? '...' : lang === 'ru' ? 'Понятно, не показывать снова' : "Got it, don't show again"}
          </button>
          <button
            onClick={onClose}
            className="w-full text-sm text-gray-400 hover:text-gray-700 py-2 transition-colors"
          >
            {lang === 'ru' ? 'Закрыть' : 'Close'}
          </button>
        </div>
      </div>
    </div>
  );
}
