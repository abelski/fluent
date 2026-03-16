'use client';

import { useLang } from './useLang';
import ru from './i18n/ru';
import en from './i18n/en';
import type { PluralForms, Translations } from './i18n/types';

export type { PluralForms, Translations };

/** Returns plural form for a number in the current language. */
function makePlural(lang: 'ru' | 'en') {
  return function plural(n: number, forms: PluralForms): string {
    if (lang === 'ru') {
      const mod10 = n % 10;
      const mod100 = n % 100;
      if (mod100 >= 11 && mod100 <= 14) return forms.many;
      if (mod10 === 1) return forms.one;
      if (mod10 >= 2 && mod10 <= 4) return forms.few;
      return forms.many;
    }
    return n === 1 ? forms.one : forms.many;
  };
}

export function useT(): {
  tr: Translations;
  plural: (n: number, forms: PluralForms) => string;
  lang: 'ru' | 'en';
  setLang: (l: 'ru' | 'en') => void;
} {
  const [lang, setLang] = useLang();
  const tr = lang === 'en' ? en : ru;
  return { tr, plural: makePlural(lang), lang, setLang };
}
