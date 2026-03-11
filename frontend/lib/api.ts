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
