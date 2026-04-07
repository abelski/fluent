// Shared API utilities used across all frontend pages.
//
// BACKEND_URL is injected at build time via NEXT_PUBLIC_BACKEND_URL so it can
// differ between local development (localhost:8000) and production (same origin).

export const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:8000';

/**
 * Read the JWT from localStorage.
 * The token is stored by the dashboard page after a successful Google OAuth login
 * (backend redirects to /dashboard?token=<jwt> and the page picks it up).
 * Returns null during SSR (window is undefined) or when the user is logged out.
 */
export function getToken(): string | null {
  return typeof window !== 'undefined'
    ? localStorage.getItem('fluent_token')
    : null;
}

/**
 * Resolve the real numeric list ID from the current browser URL.
 *
 * Problem: Next.js static export replaces dynamic route segments like [id] with '_'
 * in the output filenames (e.g. out/dashboard/lists/_/study/index.html).
 * At runtime, useParams() therefore returns '_' instead of the real ID.
 *
 * Solution: the real ID is still in window.location.pathname (the browser URL),
 * so we look for the numeric segment that follows "lists" in the path.
 *
 * Example: /dashboard/lists/42/study → "42"
 */
export function resolveListId(_id: string): string {
  if (typeof window !== 'undefined' && !/^\d+$/.test(_id)) {
    return (
      window.location.pathname
        .split('/')
        .find((s, i, a) => a[i - 1] === 'lists' && /^\d+$/.test(s)) ?? _id
    );
  }
  return _id;
}

export interface UserSettings {
  words_per_session: number;
  new_words_ratio: number;  // 0.0–1.0
  lesson_mode: 'thorough' | 'quick';
  use_question_timer: boolean;
  question_timer_seconds: number;  // 5–30
}

export async function getSettings(): Promise<UserSettings> {
  const token = getToken();
  const r = await fetch(`${BACKEND_URL}/api/me/settings`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!r.ok) throw new Error('Failed to load settings');
  return r.json();
}

export async function updateSettings(data: UserSettings): Promise<UserSettings> {
  const token = getToken();
  const r = await fetch(`${BACKEND_URL}/api/me/settings`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(data),
  });
  if (!r.ok) throw new Error('Failed to save settings');
  return r.json();
}

/** Return subcategory keys the current user is enrolled in. */
export async function getEnrolledPrograms(): Promise<string[]> {
  const token = getToken();
  if (!token) return [];
  const r = await fetch(`${BACKEND_URL}/api/me/programs`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok) return [];
  return r.json();
}

/** Enroll the current user in a program (subcategory). Throws on network error. */
export async function enrollProgram(subcategory: string): Promise<void> {
  const token = getToken();
  const r = await fetch(`${BACKEND_URL}/api/me/programs`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ subcategory }),
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error((err as { detail?: string }).detail ?? 'Failed to enroll');
  }
}

/** Unenroll the current user from a program (subcategory). Throws on network error. */
export async function unenrollProgram(subcategory: string): Promise<void> {
  const token = getToken();
  const r = await fetch(`${BACKEND_URL}/api/me/programs/${encodeURIComponent(subcategory)}`, {
    method: 'DELETE',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error((err as { detail?: string }).detail ?? 'Failed to unenroll');
  }
}
