'use client';

// Word audio (#38 prototype → #39 production) — see documentation/audio.md.
//
// Premium/admin users get `SpeakButton` (+ `AutoplayToggle` on the lesson card); free users get
// the same-shaped `LockedSpeakButton` (and, on the lesson card, `AudioPremiumPill`), both linking
// to /pricing. `useAudioState` / `audioStateFromQuota` decide which, from `/api/me/quota`.
//
// One module-level `Map<text, objectURL>` is shared by the button and the lesson prefetch
// (`prefetchAudio`, called once per session from QuizSession) so a prefetched word plays
// instantly on click instead of re-fetching.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { BACKEND_URL, getToken } from '../../../lib/api';
import { useT } from '../../../lib/useT';

/** `'on'` = Premium/admin, `'locked'` = known free user (or no token), `null` = unknown yet or the
 * quota fetch failed — render nothing audio-related, so a paying user never sees the lock (A2-9). */
export type AudioState = 'on' | 'locked' | null;

type QuotaFlags = { premium_active?: boolean; is_admin?: boolean; is_superadmin?: boolean } | null;

/** Map a `/api/me/quota` body (null = non-2xx) to an AudioState. */
export function audioStateFromQuota(q: QuotaFlags): AudioState {
  if (!q) return null;
  if (q.premium_active === true || q.is_admin === true || q.is_superadmin === true) return 'on';
  return q.premium_active === false ? 'locked' : null;
}

/** Own `/api/me/quota` fetch for pages that need nothing else from it (the list pages). */
export function useAudioState(): AudioState {
  const [state, setState] = useState<AudioState>(null);
  useEffect(() => {
    const token = getToken();
    if (!token) { setState('locked'); return; }
    fetch(`${BACKEND_URL}/api/me/quota`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((q) => setState(audioStateFromQuota(q)))
      .catch(() => setState(null));
  }, []);
  return state;
}

function SpeakerIcon({ size, waves }: { size: number; waves: 1 | 2 }) {
  return (
    <svg width={size} height={size} viewBox="2 2 20 20" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M11 5 6 9H3v6h3l5 4V5z" fill="currentColor" stroke="none" />
      <path d="M15.5 8.5a5 5 0 0 1 0 7" />
      {waves === 2 && <path d="M18.5 5.5a9 9 0 0 1 0 13" />}
    </svg>
  );
}

// In a lesson, /pricing opens in a new tab so a free user doesn't lose the session they already
// spent one of their daily sessions on (A2-10). The list pages navigate normally.
const newTabProps = { target: '_blank', rel: 'noopener' } as const;

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
      <SpeakerIcon size={size === 'sm' ? 16 : 24} waves={playing ? 2 : 1} />
    </button>
  );
}

/** Free users' version of SpeakButton: same shape and place, disabled look (faint icon, light
 * border), links to /pricing. `newTab` is for the lesson card only (A2-10). */
export function LockedSpeakButton({ size = 'md', newTab = false }: { size?: 'sm' | 'md'; newTab?: boolean }) {
  const { tr } = useT();
  return (
    <Link
      href="/pricing"
      {...(newTab ? newTabProps : {})}
      aria-label={tr.audio.lockedLabel}
      title={tr.audio.lockedLabel}
      data-testid="speak-btn-locked"
      className={`relative shrink-0 inline-flex items-center justify-center rounded-full border bg-white border-line-strong text-faint hover:border-line hover:text-muted transition-colors ${size === 'sm' ? 'w-7 h-7' : 'w-10 h-10'}`}
    >
      <SpeakerIcon size={size === 'sm' ? 16 : 24} waves={1} />
    </Link>
  );
}

/** «🔊 Послушать в Premium» — the call to action the grey locked button lacks on its own. Sits 6px
 * above the lesson card's top-right edge (the parent positions it). Same amber as the practice
 * page's Premium badge. The link is the 44px mobile tap area; the inner span is the visual pill,
 * bottom-aligned so the 6px gap to the card holds. */
export function AudioPremiumPill({ newTab = false }: { newTab?: boolean }) {
  const { tr } = useT();
  return (
    <Link
      href="/pricing"
      {...(newTab ? newTabProps : {})}
      data-testid="audio-premium-pill"
      className="group flex items-end min-h-[44px] sm:min-h-0"
    >
      <span className="inline-flex items-center gap-1 whitespace-nowrap text-[11px] leading-4 px-2 py-0.5 bg-amber-50 border border-amber-300 text-amber-700 rounded-full font-semibold group-hover:bg-amber-100 transition-colors">
        <SpeakerIcon size={12} waves={1} />
        {tr.audio.listenPremium}
      </span>
    </Link>
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
