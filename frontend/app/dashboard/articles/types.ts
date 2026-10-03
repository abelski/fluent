export interface ArticleSummary {
  slug: string;
  title_ru: string;
  title_en: string;
  has_en?: boolean; // #48c content gate: an /en/ twin exists
  tags: string[];
  category: string;
  theme?: string | null; // one of ARTICLE_THEMES (#55); missing/null → «Другое»
  created_at: string;
}

// Same keys, same order as backend routers/articles.py ARTICLE_THEMES (#55).
// Labels live in tr.articles.themes; a missing/unknown theme renders as «Другое».
export const ARTICLE_THEMES = ['verbs', 'numbers', 'cases', 'words', 'life', 'start'] as const;
