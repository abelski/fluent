'use client';

import { useCallback, useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { isEnPath } from './localHref';

export type Lang = 'ru' | 'en';

const STORAGE_KEY = 'fluent_lang';

export function useLang(): [Lang, (l: Lang) => void] {
  // An /en/ URL forces English on every render — including the static prerender,
  // so crawlers get English HTML (#48c). The stored choice still drives every other page.
  const forced: Lang | null = isEnPath(usePathname()) ? 'en' : null;
  const [lang, setLangState] = useState<Lang>('ru');

  useEffect(() => {
    // Landing on /en/ with no stored choice adopts English; an explicit RU choice is kept.
    if (forced && !localStorage.getItem(STORAGE_KEY)) localStorage.setItem(STORAGE_KEY, forced);
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'en' || stored === 'ru') setLangState(stored);
  }, [forced]);

  const setLang = useCallback((l: Lang) => {
    localStorage.setItem(STORAGE_KEY, l);
    setLangState(l);
  }, []);

  return [forced ?? lang, setLang];
}
