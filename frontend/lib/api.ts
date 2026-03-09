export const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:8000';

export function getToken(): string | null {
  return typeof window !== 'undefined'
    ? localStorage.getItem('fluent_token')
    : null;
}

// Needed for static export: useParams returns '_' placeholder, resolve real id from URL
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
