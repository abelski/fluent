# Articles and Google (SEO)

How an article at `/dashboard/articles/<slug>/` reaches Google, and what an author must do so it
can bring organic traffic. Checked 2026-09-22 against the live `why-review-beats-new-words` page.

## What Google gets

- Articles are in `/sitemap.xml` (`backend/main.py`, published only), and `robots.txt` allows
  `/dashboard/articles/`.
- The page is a static export. `frontend/app/dashboard/articles/[slug]/layout.tsx` pre-renders one
  HTML file per article **published at build time** (`generateStaticParams`), with:
  - `<title>` = `title_ru`;
  - `<meta name="description">` = the **first 160 characters of `body_ru`**, with the leading
    `# Title` line and Markdown symbols stripped first (see `documentation/seo.md` for the
    H1-eats-the-budget bug this fixed in #37). There is no separate description field;
  - canonical URL, Open Graph, `<html lang="ru">`, and Article JSON-LD (`page.tsx`).
- The RU body is in the HTML. The EN body is only in the page data, and there is no `hreflang`.

## Gotchas

- **Publishing needs the deploy *after* the next one.** The build calls the **live** site's
  `/api/articles` to know which pages to pre-render, and that list is cached in the running
  instance (`backend/cache.py`). A write through the API invalidates that cache; a direct SQL
  insert does not, and even an API write is only picked up by a build that starts after it.
  The running instance's cache is cleared when the deploy restarts it, so the *first* deploy
  after publishing still builds without the article and the *second* one pre-renders it
  (2026-09-22, `lithuanian-pronunciation`).
- **Publishing is not enough: redeploy after it.** An article published after the last build has
  no HTML file of its own. It is served through the `_` placeholder, which renders on the client
  with the generic title «Статьи о литовском языке», no description and no JSON-LD. So the order is:
  publish, then deploy.
- **Each article has an English twin (#48c).** `/en/dashboard/articles/<slug>/` is prerendered in
  English (`title_en`, description from `body_en`), self-canonical, with reciprocal `hreflang` to the
  RU page (RU is `x-default`). An article whose `title_en` or `body_en` is empty gets **no** EN twin
  (not built, no `hreflang`, not in the sitemap) — and the EN reader falls back to the RU body. So
  the first paragraph of `body_en` matters for English search the same way `body_ru` does for
  Russian. Mechanism and rules: `documentation/seo.md`, "English article twins".
- **The first paragraph is the search snippet.** Since the description is the first 160 characters
  of `body_ru`, the first paragraph must contain the words people search for (e.g. «литовское
  произношение»), and so must `title_ru`. A title like «Зачем слышать слово» matches no query.
- **Aim at a real query.** An article gets organic traffic when it answers something people type
  into Google (a practical how-to about Lithuanian), not a general essay. Science and the product
  pitch can live inside such an article, not replace it.
- The slug is part of the URL: put the keyword in it (`lithuanian-pronunciation`), and never
  change it after publishing.

## Checking results

Google Search Console → Performance → filter by the page URL: impressions and queries appear 2–4
weeks after indexing.
