'use client';

import { useState } from 'react';
import { BACKEND_URL } from '../lib/api';

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function FeedbackModal({ open, onClose }: Props) {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  if (!open) return null;

  async function submit() {
    if (!email.trim() || !message.trim()) return;
    setSending(true);
    setError('');
    try {
      const res = await fetch(`${BACKEND_URL}/api/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), message: message.trim() }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { detail?: string }).detail ?? 'Ошибка отправки');
      }
      setSent(true);
      setEmail('');
      setMessage('');
      setTimeout(() => { setSent(false); onClose(); }, 1500);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка отправки');
    } finally {
      setSending(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white border border-gray-900 rounded-2xl w-full max-w-sm p-5 shadow-xl">
        <h3 className="text-gray-900 font-semibold mb-1">Написать нам</h3>
        <p className="text-gray-400 text-xs mb-4">Расскажите, что думаете — мы читаем каждое сообщение.</p>

        {sent ? (
          <p className="text-emerald-600 text-sm text-center py-4">Сообщение отправлено!</p>
        ) : (
          <>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Ваш email"
              data-testid="feedback-email"
              className="w-full bg-gray-100 border border-gray-900 rounded-xl px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-gray-900 mb-3"
            />
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Ваше сообщение"
              rows={4}
              maxLength={2000}
              data-testid="feedback-message"
              className="w-full bg-gray-100 border border-gray-900 rounded-xl px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-gray-900 resize-none mb-3"
            />
            {error && (
              <p className="text-red-600 text-xs mb-2">{error}</p>
            )}
            <div className="flex gap-2 justify-end">
              <button
                onClick={onClose}
                className="text-xs px-3 py-2 text-gray-400 hover:text-gray-900 transition-colors"
              >
                Отмена
              </button>
              <button
                onClick={submit}
                disabled={sending || !email.trim() || !message.trim()}
                data-testid="feedback-submit"
                className="text-xs px-4 py-2 bg-gray-900 hover:bg-gray-800 rounded-lg font-medium text-white transition-colors disabled:opacity-50"
              >
                {sending ? '...' : 'Отправить'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
