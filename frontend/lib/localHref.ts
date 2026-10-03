'use client';

import { useCallback } from 'react';
import { usePathname } from 'next/navigation';

// EN twins (#48c). Exact match only — the article index and one article
// (`/dashboard/articles/` or `/dashboard/articles/<slug>/`), with or without a
// trailing slash, query or hash. Never prefix-match: a path without a twin must
// never get `/en/` and 404. Later plans extend this one rule (kept next to the
// public-page list — see PUBLIC_PREFIXES in app/dashboard/layout.tsx).
const EN_TWIN = /^\/dashboard\/articles(?:\/|\/([^/?#]+)\/?)?(?:[?#].*)?$/;

// Articles without an English version (content gate) have no /en/ twin. The path
// alone can't tell, so the article page registers its own slug here once loaded;
// the index list checks `has_en` from the API instead. Markdown links to *other*
// RU-only articles still get /en/ (known limit, documentation/seo.md).
const ruOnly = new Set<string>();
export const markRuOnly = (slug: string) => { ruOnly.add(slug).add(encodeURIComponent(slug)); };

export const isEnPath = (pathname: string | null | undefined) =>
  pathname === '/en' || !!pathname?.startsWith('/en/');

export const hasEnTwin = (path: string) => {
  const m = EN_TWIN.exec(path);
  return !!m && !(m[1] && ruOnly.has(m[1]));
};

/** `path` as it should be linked from an EN (`en=true`) or RU page. */
export const localHref = (path: string, en: boolean) => (en && hasEnTwin(path) ? `/en${path}` : path);

/** Strips the `/en` prefix: the RU path of the current page. */
export const ruPath = (pathname: string) => (isEnPath(pathname) ? pathname.slice(3) || '/' : pathname);

/** Returns a mapper that prefixes `/en` on twin paths while on an EN page. */
export function useLocalHref(): (path: string) => string {
  const en = isEnPath(usePathname());
  return useCallback((path: string) => localHref(path, en), [en]);
}
