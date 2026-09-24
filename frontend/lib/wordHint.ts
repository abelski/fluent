import type { Lang } from './useLang';

/**
 * `word.hint` is fixed vocabulary seeded in Russian (plan #48a, Requirement 4):
 * «глагол» (×356), «разг.», «ед.ч.», «мн.ч.», «где?», «plurale tantum — только
 * во мн.ч.». Full DB content translation is 48b — this is just an EN lookup
 * for the known values. Anything else (freeform hints) passes through as-is.
 */
// i18n-allow: RU keys are DB content values (word.hint), not UI copy — this is the EN lookup table for them.
const HINT_EN: Record<string, string> = {
  'глагол': 'verb', // i18n-allow
  'разг.': 'colloq.', // i18n-allow
  'ед.ч.': 'sg.', // i18n-allow
  'мн.ч.': 'pl.', // i18n-allow
  'где?': 'where?', // i18n-allow
  'plurale tantum — только во мн.ч.': 'plurale tantum — plural only', // i18n-allow
};

export function translateHint(hint: string | null | undefined, lang: Lang): string {
  if (!hint) return '';
  if (lang === 'en' && hint in HINT_EN) return HINT_EN[hint];
  return hint;
}

const DEFAULT_SET_TITLE_RE = /^Набор (\d+)$/; // i18n-allow: matches the RU default word-set title stored in the DB

/**
 * Custom-program word sets that were never renamed keep the backend's RU
 * default title (plan #48a, Requirement 5 — the DB rows aren't touched).
 * Display it through the UI-language template instead of leaking RU in EN.
 */
export function displaySetTitle(title: string, setNTemplate: string): string {
  const m = DEFAULT_SET_TITLE_RE.exec(title);
  return m ? setNTemplate.replace('{n}', m[1]) : title;
}
