'use client';

import { useEffect } from 'react';
import { useLang } from '../lib/useLang';

/** Keeps <html lang="..."> in sync with the user's language preference. */
export default function LangSync() {
  const [lang] = useLang();
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);
  return null;
}
