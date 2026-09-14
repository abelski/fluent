'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useT } from '../lib/useT';
import {
  INBOX_CHANGED,
  INBOX_REUSE_MS,
  fetchInbox,
  fetchUnreadCount,
  formatInboxDate,
  inboxAction,
  inboxSnippet,
  inboxTitle,
  notifyInboxChanged,
  type InboxItem,
} from '../lib/inbox';

const PREVIEW_COUNT = 5;

/**
 * Header envelope + unread badge + 5-message preview (#23).
 *
 * Request discipline matters more than it looks: this component is mounted on
 * every page for every logged-in user, and an unread-count call costs an auth
 * lookup plus a query (~0.5s of DB time in production). So it never refetches on
 * navigation, throttles the visibility refresh to once a minute, reuses the
 * dropdown's list for 60s, and applies `unread`/`delta` carried on a
 * `fluent:inbox-changed` event locally instead of asking the server again.
 * The unread-count badge fails silently — ~90 Playwright specs don't mock
 * these endpoints — but the open dropdown now surfaces a load-error message.
 */
export default function InboxMenu() {
  const { tr, lang } = useT();
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<InboxItem[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const countFetchedAt = useRef(0);
  const listFetchedAt = useRef(0);

  const refreshCount = useCallback((force = false) => {
    if (!force && Date.now() - countFetchedAt.current < INBOX_REUSE_MS) return;
    countFetchedAt.current = Date.now();
    fetchUnreadCount()
      .then((data) => setUnread(data.unread ?? 0))
      .catch(() => {});
  }, []);

  useEffect(() => {
    refreshCount(true);
    const onVisible = () => { if (document.visibilityState === 'visible') refreshCount(); };
    const onChanged = (e: Event) => {
      const detail = (e as CustomEvent<{ unread?: number; delta?: number }>).detail;
      if (detail && typeof detail.unread === 'number') {
        setUnread(Math.max(0, detail.unread));
      } else if (detail && typeof detail.delta === 'number') {
        setUnread((n) => Math.max(0, n + detail.delta!));
      } else {
        refreshCount(true);
      }
      listFetchedAt.current = 0;   // the cached preview is stale now
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener(INBOX_CHANGED, onChanged);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener(INBOX_CHANGED, onChanged);
    };
  }, [refreshCount]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  function toggle() {
    const next = !open;
    setOpen(next);
    if (!next) return;
    if (items && Date.now() - listFetchedAt.current < INBOX_REUSE_MS) return;
    setLoading(true);
    setFailed(false);
    fetchInbox(PREVIEW_COUNT, 0)
      .then((page) => {
        setItems(page.items);
        setUnread(page.unread ?? 0);
        listFetchedAt.current = Date.now();
      })
      .catch(() => setFailed(true))
      .finally(() => setLoading(false));
  }

  function markAllRead() {
    const before = items;
    setItems((list) => (list ? list.map((i) => ({ ...i, read: true })) : list));
    setUnread(0);
    inboxAction('read', { all: true })
      .then((res) => notifyInboxChanged({ unread: res.unread }))
      .catch(() => { setItems(before); refreshCount(true); });
  }

  const label = unread > 0
    ? tr.inbox.ariaLabelUnread.replace('{n}', String(unread))
    : tr.inbox.ariaLabel;

  return (
    <div ref={wrapRef}>
      <button
        type="button"
        onClick={toggle}
        aria-label={label}
        aria-expanded={open}
        data-testid="inbox-button"
        className="flex items-center justify-center min-w-11 min-h-11 text-muted-nav hover:text-ink transition-colors"
      >
        {/* The badge anchors to the 20px glyph, not the 44px tap area, so its centre
            lands on the envelope's top-right corner (Teams-style overlap). */}
        <span className="relative block w-5 h-5">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
            <rect x="2.5" y="4.5" width="19" height="15" rx="2.5" />
            <path d="M3 6.5l9 6.5 9-6.5" />
          </svg>
          {unread > 0 && (
            <span
              aria-hidden="true"
              data-testid="inbox-badge"
              className={`absolute -top-[9px] -right-[9px] h-[18px] ${
                unread < 10 ? 'w-[18px]' : 'min-w-[18px] px-[5px]'
              } rounded-full bg-destructive text-white text-[11px] font-bold tabular-nums leading-[18px] text-center ring-2 ring-white`}
            >
              {unread > 99 ? '99+' : unread}
            </span>
          )}
        </span>
      </button>

      {open && (
        <div
          data-testid="inbox-dropdown"
          className="absolute top-full right-4 min-[1000px]:right-8 mt-2 w-[min(20rem,calc(100vw-2rem))] bg-white border border-line rounded-[14px] shadow-[0_6px_20px_rgba(0,0,0,0.08)] overflow-hidden z-30"
        >
          <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-line-strong">
            <span className="text-sm font-semibold text-ink">{tr.inbox.title}</span>
            {unread > 0 && (
              <button
                type="button"
                onClick={markAllRead}
                data-testid="inbox-dropdown-mark-all"
                className="text-[12.5px] text-muted hover:text-ink transition-colors"
              >
                {tr.inbox.markAllRead}
              </button>
            )}
          </div>

          {loading && !items && (
            <div data-testid="inbox-dropdown-loading" className="px-4 py-4">
              <div className="h-3.5 w-1/2 rounded bg-[#f2f3f3] animate-pulse" />
            </div>
          )}
          {!loading && !items?.length && (
            <p data-testid="inbox-dropdown-empty" className="px-4 py-6 text-center text-[13.5px] text-muted">
              {failed && !items ? tr.inbox.loadError : tr.inbox.empty}
            </p>
          )}
          {items && items.map((item) => (
            <Link
              key={item.id}
              href={`/dashboard/inbox?m=${item.id}`}
              onClick={() => setOpen(false)}
              data-testid="inbox-dropdown-item"
              className="flex gap-2 px-4 py-3 border-b border-line-soft last:border-b-0 hover:bg-[#f2f3f3] transition-colors text-ink hover:text-ink"
            >
              <span className={`mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 ${item.read ? 'bg-transparent' : 'bg-emerald-600'}`} />
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-2">
                  <span className={`text-[13.5px] truncate ${item.read ? 'text-ink' : 'font-semibold text-ink'}`}>
                    {inboxTitle(item, lang)}
                  </span>
                  <span className="text-[11.5px] text-faint shrink-0">{formatInboxDate(item.created_at, lang)}</span>
                </span>
                <span className="block text-[12.5px] text-muted line-clamp-2">{inboxSnippet(item, lang)}</span>
              </span>
            </Link>
          ))}

          <Link
            href="/dashboard/inbox"
            onClick={() => setOpen(false)}
            data-testid="inbox-all-messages"
            className="block px-4 py-3 border-t border-line-strong text-[13px] font-semibold text-emerald-600 hover:text-emerald-700 transition-colors"
          >
            {tr.inbox.allMessages}
          </Link>
        </div>
      )}
    </div>
  );
}
