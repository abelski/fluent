/**
 * Free machine translation using the MyMemory API (no API key required).
 * Limit: ~500 words/day per IP without a key.
 * Returns the translated string, or an empty string on any error (silent fail).
 */
export async function translateText(
  text: string,
  from: 'ru' | 'en',
  to: 'ru' | 'en',
): Promise<string> {
  if (!text.trim() || from === to) return text;
  try {
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${from}|${to}`;
    const r = await fetch(url);
    if (!r.ok) return '';
    const data = await r.json();
    return data?.responseData?.translatedText ?? '';
  } catch {
    return '';
  }
}
