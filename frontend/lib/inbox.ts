// Shared inbox client (#23) — typed API calls, Gmail-style dates and the
// `fluent:inbox-changed` event, used by both the header envelope and
// /dashboard/inbox so the two can't drift apart.

import { BACKEND_URL, getToken } from './api';
import type { Lang } from './useLang';

export type InboxKind = 'info' | 'celebration' | 'offer';
export type InboxSource = 'admin' | 'achievement' | 'leaderboard' | 'report' | 'premium';

export interface InboxItem {
  id: number;                 // delivery id
  kind: InboxKind;
  source: InboxSource;
  title_ru: string;
  title_en: string;
  snippet_ru: string;
  snippet_en: string;
  created_at: string;
  read: boolean;
}

export interface InboxPage {
  items: InboxItem[];
  has_more: boolean;
  unread: number;
}

export interface InboxDetail {
  id: number;
  kind: InboxKind;
  source: InboxSource;
  title_ru: string;
  title_en: string;
  body_ru: string;
  body_en: string;
  cta_label_ru: string | null;
  cta_label_en: string | null;
  cta_url: string | null;
  created_at: string;
  read: boolean;
}

export type InboxAction = 'read' | 'delete' | 'undelete';

export interface InboxActionResult {
  affected_ids: number[];
  unread: number;
}

export const INBOX_CHANGED = 'fluent:inbox-changed';

/** Reuse window for the dropdown's list and the badge's count, in ms. */
export const INBOX_REUSE_MS = 60_000;

function headers(): HeadersInit {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BACKEND_URL}/api${path}`, { headers: headers(), cache: 'no-store' });
  if (!res.ok) throw new Error(String(res.status));
  return res.json() as Promise<T>;
}

export function fetchUnreadCount(): Promise<{ unread: number }> {
  return get('/me/inbox/unread-count');
}

export function fetchInbox(limit = 20, offset = 0): Promise<InboxPage> {
  return get(`/me/inbox?limit=${limit}&offset=${offset}`);
}

export function fetchMessage(id: number): Promise<{ item: InboxDetail }> {
  return get(`/me/inbox/${id}`);
}

export async function inboxAction(
  action: InboxAction,
  target: { ids: number[] } | { all: true },
): Promise<InboxActionResult> {
  const res = await fetch(`${BACKEND_URL}/api/me/inbox/actions`, {
    method: 'POST',
    headers: { ...headers(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...target }),
  });
  if (!res.ok) throw new Error(String(res.status));
  return res.json();
}

/**
 * Tell the header the inbox changed.
 *
 * `unread` (every action response carries it) or `delta` (+N from stats'
 * `new_inbox_messages`) let the badge update with **no** request at all — an
 * unread-count fetch costs an auth lookup plus a query, ~0.5s of DB time in
 * production. Only a detail-less event makes the header re-fetch.
 */
export function notifyInboxChanged(detail?: { unread?: number; delta?: number }): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(INBOX_CHANGED, { detail }));
}

/** The backend stores naive UTC, so an ISO string without a zone means UTC, not local. */
function parseUtc(iso: string): Date {
  return new Date(/Z|[+-]\d{2}:?\d{2}$/.test(iso) ? iso : `${iso}Z`);
}

/** Gmail's rule: today → time, this year → day+month, older → full numeric date. */
export function formatInboxDate(iso: string, lang: Lang, now: Date = new Date()): string {
  const date = parseUtc(iso);
  const locale = lang === 'en' ? 'en-GB' : 'ru-RU';
  if (date.toDateString() === now.toDateString()) {
    return new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(date);
  }
  if (date.getFullYear() === now.getFullYear()) {
    return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }).format(date);
  }
  return new Intl.DateTimeFormat(locale, { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date);
}

/** Full date + a relative suffix, e.g. "11 сент. 2026 г., 14:03 (2 часа назад)". */
export function formatFullDate(iso: string, lang: Lang, now: Date = new Date()): string {
  const date = parseUtc(iso);
  const locale = lang === 'en' ? 'en-GB' : 'ru-RU';
  const absolute = new Intl.DateTimeFormat(locale, {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(date);

  const seconds = Math.round((date.getTime() - now.getTime()) / 1000);
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ['year', 31536000], ['month', 2592000], ['day', 86400],
    ['hour', 3600], ['minute', 60],
  ];
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  for (const [unit, size] of units) {
    if (Math.abs(seconds) >= size) {
      return `${absolute} (${rtf.format(Math.round(seconds / size), unit)})`;
    }
  }
  return `${absolute} (${rtf.format(0, 'minute')})`;
}

export function inboxTitle(item: { title_ru: string; title_en: string }, lang: Lang): string {
  return (lang === 'en' ? item.title_en : item.title_ru) || item.title_ru;
}

export function inboxSnippet(item: InboxItem, lang: Lang): string {
  return (lang === 'en' ? item.snippet_en : item.snippet_ru) || item.snippet_ru;
}
