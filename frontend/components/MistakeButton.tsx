'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { BACKEND_URL, getToken } from '../lib/api';

interface Props {
  context?: string; // e.g. 'word:42', 'grammar:3'
}

export default function MistakeButton({ context }: Props) {
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  // Only render after client mount to avoid SSR/localStorage hydration mismatch
  if (!mounted) return null;
  const token = getToken();
  if (!token) return null;

  async function submit() {
    if (!text.trim()) return;
    setSending(true);
    try {
      await fetch(`${BACKEND_URL}/api/reports`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ context: context ?? pathname, description: text.trim() }),
      });
      setSent(true);
      setText('');
      setTimeout(() => { setSent(false); setOpen(false); }, 1500);
    } catch {
      // ignore
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      {/* Floating trigger button */}
      <button
        onClick={() => setOpen(true)}
        data-testid="mistake-button"
        className="fixed bottom-6 right-6 z-40 flex items-center gap-1.5 text-xs text-white/40 hover:text-white/70 bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 rounded-full px-3 py-2 transition-colors"
      >
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
          <circle cx="8" cy="8" r="7" />
          <path d="M8 5v4M8 11v.5" strokeLinecap="round" />
        </svg>
        Нашёл ошибку?
      </button>

      {/* Modal */}
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
        >
          <div className="bg-[#080f08] border border-white/10 rounded-2xl w-full max-w-sm p-5 shadow-xl">
            <h3 className="text-white font-semibold mb-1">Сообщить об ошибке</h3>
            <p className="text-white/40 text-xs mb-4">
              Опишите, что не так — мы исправим как можно скорее.
            </p>

            {sent ? (
              <p className="text-emerald-400 text-sm text-center py-4">Спасибо! Отчёт отправлен.</p>
            ) : (
              <>
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="Например: неверный перевод слова..."
                  rows={3}
                  className="w-full bg-white/[0.06] border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder-white/20 outline-none focus:border-emerald-500/50 resize-none mb-3"
                />
                <div className="flex gap-2 justify-end">
                  <button
                    onClick={() => setOpen(false)}
                    className="text-xs px-3 py-2 text-white/40 hover:text-white transition-colors"
                  >
                    Отмена
                  </button>
                  <button
                    onClick={submit}
                    disabled={sending || !text.trim()}
                    data-testid="mistake-submit"
                    className="text-xs px-4 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-lg font-medium transition-colors disabled:opacity-50"
                  >
                    {sending ? '...' : 'Отправить'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
