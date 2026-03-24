'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { BACKEND_URL, getToken } from '../lib/api';
import { useT } from '../lib/useT';

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
  const [error, setError] = useState(false);

  const { tr } = useT();
  useEffect(() => { setMounted(true); }, []);

  // Only render after client mount to avoid SSR/localStorage hydration mismatch
  if (!mounted) return null;
  const token = getToken();
  if (!token) return null;

  async function submit() {
    if (!text.trim()) return;
    setSending(true);
    setError(false);
    try {
      const res = await fetch(`${BACKEND_URL}/api/reports`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ context: context ?? pathname, description: text.trim() }),
      });
      if (!res.ok) throw new Error('failed');
      setSent(true);
      setText('');
      setTimeout(() => { setSent(false); setOpen(false); }, 1500);
    } catch {
      setError(true);
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
        className="fixed bottom-6 right-4 sm:right-6 z-40 flex items-center gap-1.5 text-xs text-gray-700 hover:text-gray-900 bg-white hover:bg-gray-50 border border-gray-900 rounded-full px-2 py-2 sm:px-3 transition-colors shadow-sm"
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
          <circle cx="8" cy="8" r="7" />
          <path d="M8 5v4M8 11v.5" strokeLinecap="round" />
        </svg>
        <span className="hidden sm:inline">{tr.mistake.trigger}</span>
      </button>

      {/* Modal */}
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
        >
          <div className="bg-white border border-gray-900 rounded-2xl w-full max-w-sm p-5 shadow-xl">
            <h3 className="text-gray-900 font-semibold mb-1">{tr.mistake.title}</h3>
            <p className="text-gray-400 text-xs mb-4">{tr.mistake.subtitle}</p>

            {sent ? (
              <p className="text-emerald-600 text-sm text-center py-4">{tr.mistake.sent}</p>
            ) : (
              <>
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder={tr.mistake.placeholder}
                  rows={3}
                  maxLength={500}
                  className="w-full bg-gray-100 border border-gray-900 rounded-xl px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-gray-900 resize-none mb-3"
                />
                {error && (
                  <p className="text-red-600 text-xs mb-2">{tr.mistake.error}</p>
                )}
                <div className="flex gap-2 justify-end">
                  <button
                    onClick={() => setOpen(false)}
                    className="text-xs px-3 py-2 text-gray-400 hover:text-gray-900 transition-colors"
                  >
                    {tr.mistake.cancel}
                  </button>
                  <button
                    onClick={submit}
                    disabled={sending || !text.trim()}
                    data-testid="mistake-submit"
                    className="text-xs px-4 py-2 bg-gray-900 hover:bg-gray-800 rounded-lg font-medium text-white transition-colors disabled:opacity-50"
                  >
                    {sending ? '...' : tr.mistake.send}
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
