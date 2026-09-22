'use client';

// Speaker button for the word audio prototype (#38). Local only — see documentation/audio.md.
//
// One module-level `Map<text, objectURL>` is shared by the button and the lesson prefetch
// (`prefetchAudio`, called once per session from QuizSession) so a prefetched word plays
// instantly on click instead of re-fetching.

import { useState } from 'react';
import { BACKEND_URL, getToken } from '../../../lib/api';
import { useT } from '../../../lib/useT';

// Caches the *promise*, not the finished URL, so a click or autoplay that lands while the
// prefetch for the same word is still in flight joins that request instead of sending a
// second one. A failed request is evicted so the next attempt can retry.
const audioUrlCache = new Map<string, Promise<string>>();

/** Fetch (or reuse) the object URL for `text`. Rejects on any non-2xx/network error. */
function fetchAudioUrl(text: string): Promise<string> {
  let pending = audioUrlCache.get(text);
  if (!pending) {
    pending = (async () => {
      const token = getToken();
      const res = await fetch(`${BACKEND_URL}/api/audio?text=${encodeURIComponent(text)}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        // Always revalidate (server answers 304 via ETag): a pronunciation fix changes the clip
        // behind the same URL. Also overrides clips cached before, under the old 24h max-age.
        cache: 'no-cache',
      });
      if (!res.ok) throw new Error(`audio fetch failed: ${res.status}`);
      return URL.createObjectURL(await res.blob());
    })();
    audioUrlCache.set(text, pending);
    pending.catch(() => audioUrlCache.delete(text));
  }
  return pending;
}

/** Fetch `text`'s clip (if needed) and play it. Shared by the button and autoplay so
 * both go through one code path. Ignores errors — autoplay is best-effort. */
export async function playAudio(text: string): Promise<void> {
  try {
    const url = await fetchAudioUrl(text);
    await new Audio(url).play();
  } catch {
    // best-effort — a failed/blocked autoplay is silently skipped
  }
}

/** Warm the shared cache for a lesson's words, one at a time, in lesson order. Call once
 * per session, only for premium/admin users. Ignores errors (best-effort). */
export async function prefetchAudio(texts: string[]): Promise<void> {
  for (const text of texts) {
    try {
      await fetchAudioUrl(text);
    } catch {
      // ignore — the button/autoplay will just fetch it on demand instead
    }
  }
}

/** `sm` is the compact variant for table rows (word-list page); `md` sits next to the big
 * word on the study card. */
export default function SpeakButton({ text, size = 'md' }: { text: string; size?: 'sm' | 'md' }) {
  const { tr } = useT();
  const [playing, setPlaying] = useState(false);
  const [hidden, setHidden] = useState(false);

  if (hidden) return null;

  async function handleClick() {
    try {
      const url = await fetchAudioUrl(text);
      setPlaying(true);
      const audio = new Audio(url);
      audio.onended = () => setPlaying(false);
      audio.onpause = () => setPlaying(false);
      await audio.play();
    } catch {
      setPlaying(false);
      setHidden(true);
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={tr.audio.listen}
      data-testid="speak-btn"
      className={`relative shrink-0 inline-flex items-center justify-center rounded-full border transition-colors ${size === 'sm' ? 'w-7 h-7' : 'w-10 h-10'} ${
        playing ? 'bg-emerald-50 border-emerald-600 text-emerald-600' : 'bg-white border-line text-muted hover:text-ink'
      }`}
    >
      <svg width={size === 'sm' ? 16 : 24} height={size === 'sm' ? 16 : 24} viewBox="2 2 20 20" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M11 5 6 9H3v6h3l5 4V5z" fill="currentColor" stroke="none" />
        <path d="M15.5 8.5a5 5 0 0 1 0 7" />
        {playing && <path d="M18.5 5.5a9 9 0 0 1 0 13" />}
      </svg>
    </button>
  );
}

/** In-card autoplay switch (top-right of the flashcard), styled as a mini copy of the header's
 * RU/EN segmented pill: 🔊 = autoplay on, 🔇 = off. Same `fluent_audio_autoplay` preference as
 * the Settings checkbox — the parent owns the state and persists it. */
export function AutoplayToggle({ on, onChange }: { on: boolean; onChange: (on: boolean) => void }) {
  const { tr } = useT();
  const seg = (active: boolean) =>
    `flex items-center px-2 py-[4px] rounded-full ${active ? 'bg-white text-ink shadow-[0_1px_2px_rgba(0,0,0,0.06)]' : 'text-muted-nav'}`;
  return (
    <button
      type="button"
      onClick={() => onChange(!on)}
      role="switch"
      aria-checked={on}
      aria-label={tr.audio.autoplayLabel}
      title={tr.audio.autoplayLabel}
      data-testid="autoplay-toggle"
      className="flex items-center bg-[#f2f3f3] rounded-full p-[3px] transition-colors"
    >
      <span className={seg(on)} data-testid="autoplay-toggle-on">
        <svg width="14" height="14" viewBox="2 2 20 20" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M11 5 6 9H3v6h3l5 4V5z" fill="currentColor" stroke="none" />
          <path d="M15.5 8.5a5 5 0 0 1 0 7" />
          <path d="M18.5 5.5a9 9 0 0 1 0 13" />
        </svg>
      </span>
      <span className={seg(!on)} data-testid="autoplay-toggle-off">
        <svg width="14" height="14" viewBox="2 2 20 20" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M11 5 6 9H3v6h3l5 4V5z" fill="currentColor" stroke="none" />
          <path d="m16 9 5 5" />
          <path d="m21 9-5 5" />
        </svg>
      </span>
    </button>
  );
}
