---
kind: feature
status: draft
iteration: 0
max_iterations: 15
suggested_model: sonnet
suggested_effort: low
confirmed_model: null
confirmed_effort: null
---

# #37 — Low-effort SEO traffic fixes (CTR + sitemap)

## Context

GSC Performance report (15 Jun–14 Sep 2026, 3 months): 86 clicks, 2,211 impressions, 3.9% avg
CTR, avg position 11.2. Full numbers in `temp_files/seo-report-2026-09-17.md`. The pattern: pages
already rank, people don't click. Two specific pages have real impressions and near-zero CTR:
- `/dashboard/articles/is-lithuanian-hard-to-learn/` — 212 impressions, 1 click (0.5%)
- `/dashboard/phrases/` — 159 impressions, 0 clicks
- `/dashboard/articles/numbers-01-basics/` — 416 impressions (highest of any page), 6 clicks (1.4%)

Investigated root causes (not guesses — read the actual code):

1. **Article meta descriptions are auto-truncated body text, and the H1 eats the budget.**
   `frontend/app/dashboard/articles/[slug]/layout.tsx:29` builds the description as
   `article.body_ru.replace(/[#*\`[\]]/g, '').slice(0, 160).trim()`. This strips markdown syntax
   but not the leading `# Heading` *text* — so every article's snippet starts by repeating its own
   title, then gets cut off mid-sentence (or mid-word) once the 160-char budget runs out. This
   affects **every** article, not just the two flagged ones — fixing it in the shared function is
   higher leverage than patching two rows in the DB.
2. **`/dashboard/phrases/` has no per-page metadata at all.** Unlike `/dashboard/lists/layout.tsx`
   and `/dashboard/grammar/layout.tsx` (both have a static `export const metadata` with a
   keyword-matched RU title/description and are indexed), `frontend/app/dashboard/phrases/` has no
   `layout.tsx`. It falls through to the root layout's generic default (`Fluent — Learn Lithuanian`
   / the site-wide description) — a mismatch with phrase-learning search intent, which is the
   direct explanation for 159 impressions / 0 clicks. `lithuanian phrases` (10 impressions, 0
   clicks) is a top query that this page should be answering.
3. **The sitemap's `/programs/[key]/` and `/dashboard/phrases/[id]/` blocks
   (`backend/main.py:196-217`) have no `<lastmod>` at all**, unlike the `static_pages` block
   (line 174) and the `articles` block (line 189) which both set one. This was already flagged for
   `/programs/` in the Sep indexing check (`temp_files/seo-report-2026-09-17.md`) as a likely
   non-indexing signal for 5 of 8 program pages. Same missing field, same fix, in **two** loops
   (the phrase-program loop has the identical bug and wasn't checked before).
4. **Article title/description is always sourced from `title_ru`/`body_ru`, never `_en`**
   (`layout.tsx:31,37`), regardless of which language the visitor's toggle is set to. This is a
   real architectural limitation, not something this plan fixes: the site is one static URL per
   article (no `/en/` route), so Google only ever sees one (Russian) `<title>`/description for it.
   English-language queries (`lithuanian phrases`, `lithuanian slang` — 7 & 10 impressions, 0
   clicks each) are competing on a Russian snippet. Worth knowing, out of scope for a low-effort
   pass — recorded in `documentation/seo.md` (new) so it isn't re-discovered from scratch later.

## Files touched

- `frontend/app/dashboard/articles/[slug]/layout.tsx` — description derivation: drop the leading
  `# ...` line before slicing, and collapse newlines so the snippet reads as one sentence instead
  of containing a raw line break.
- `backend/main.py` — add `<lastmod>{today}</lastmod>` to the `programs` loop (~line 198) and the
  `phrase_programs` loop (~line 211), mirroring the `static_pages` block exactly. Neither
  `SubcategoryMeta` nor `PhraseProgram` tracks a per-row update time, so `today` (same value the
  static-pages block already uses) is the correct, simplest choice — no model/migration change.
- `frontend/app/dashboard/phrases/layout.tsx` — **new**, pattern-matched to
  `frontend/app/dashboard/grammar/layout.tsx` (title, description, `alternates.canonical`, and an
  `openGraph` block — `lists/layout.tsx` omits `openGraph`, `grammar/layout.tsx` has it, follow the
  latter) with static RU title + description targeting phrase-learning intent.
- Article content (DB rows, via the `sql` skill — `backend/.env`'s `DATABASE_URL`, psycopg3 since
  `psql` isn't installed locally): rewrite the opening paragraph of `body_ru` (and a matching
  `body_en` sentence, for language parity) on:
  - `is-lithuanian-hard-to-learn` — title is already a good match for "сложный ли литовский
    язык"; only the description-worthy opening sentence needs to be tightened to a complete,
    self-contained hook.
  - `numbers-01-basics` — rewrite opening paragraph to front-load "цифры" (top query "цифры на
    литовском", 35 impressions). Body currently has only one dative form, "цифре" (singular), not
    the plural "цифры" people actually search — close but not a real match. Also add "цифры" to
    `title_ru` itself (currently "Числа в литовском языке: от 0 до 100") — the title line is what
    Google bolds on a query match and is more CTR-influential than the description, and this row
    is already being SQL-UPDATEd for the body change, so it's the same effort to fix both.
  - One inline markdown link added to `regitra-vocabulary`'s body (RU+EN) pointing at
    `/programs/regitra/` (61 impressions vs. 4 — free authority transfer to an indexed-but-dead
    page), and one added to `common-lithuanian-words`'s body (RU+EN) pointing at
    `/dashboard/phrases/`.
- `documentation/seo.md` — **new**. Records the two gotchas above (H1-eats-description-budget
  pattern, RU-only metadata regardless of language toggle) so a future session doesn't re-derive
  them from the diff.
- `documentation/CHANGELOG.md` — append `#37`.

**Deploy-ordering gotcha (verified in code, not just theory):** the frontend is a static export.
`frontend/app/dashboard/articles/[slug]/page.tsx` fetches each article at *build* time and passes
it as `initialArticle`; `ArticleContent.tsx:24-25` only refetches client-side when that snapshot
was `null` — for an already-published article it never refetches. So a raw SQL `UPDATE` against
the DB (title/body rewrites, the two new links) produces **zero visible change**, locally or in
production, until `npm run build` runs again and the result is redeployed. Same for the
`layout.tsx` description fix (also build-time, via `generateMetadata`). Do the SQL edits *first*,
then build, so the build picks up the new rows — not the other way around. Don't mistake "still
shows old copy" for "the fix didn't work" if the build/deploy step hasn't happened yet.

## Implementation

- [ ] Fix `frontend/app/dashboard/articles/[slug]/layout.tsx`'s description derivation (strip
      leading heading line, collapse newlines, keep the 160-char slice).
- [ ] Add `<lastmod>` to both the `programs` and `phrase_programs` loops in `backend/main.py`.
- [ ] Create `frontend/app/dashboard/phrases/layout.tsx` (title/description/canonical/openGraph,
      pattern-matched to `lists/layout.tsx` and `grammar/layout.tsx`).
- [ ] Rewrite `is-lithuanian-hard-to-learn` and `numbers-01-basics` opening paragraphs (`body_ru` +
      a matching `body_en` sentence) via SQL `UPDATE` against the Neon DB (`sql` skill). For
      `numbers-01-basics`, also update `title_ru` to include "цифры".
- [ ] Add the two inline internal links (`regitra-vocabulary` → `/programs/regitra/`,
      `common-lithuanian-words` → `/dashboard/phrases/`) in both `body_ru` and `body_en`.
- [ ] Write `documentation/seo.md` with the two gotchas from Context.
- [ ] Append a `#37` entry to `documentation/CHANGELOG.md`.

## Validation

- [ ] `cd backend && python -m pytest -q` (sitemap fix shouldn't change any existing assertion,
      but confirm no test hard-codes the old lastmod-less XML shape)
- [ ] `cd frontend && npm run build` (new `layout.tsx` must not break the static export)
- [ ] `curl -s https://fluent-qhk8.onrender.com/sitemap.xml` (local/prod, after deploy) — confirm
      every `/programs/` and `/dashboard/phrases/<id>/` URL now has a `<lastmod>` sibling tag.
- [ ] Playwright: load `/dashboard/articles/is-lithuanian-hard-to-learn/`,
      `/dashboard/articles/numbers-01-basics/`, and `/dashboard/phrases/` and read
      `document.title` + `document.querySelector('meta[name=description]').content` — confirm each
      description is a complete sentence (no mid-word cutoff, no leading repeated H1 text) and the
      phrases page no longer shows the generic site-wide title/description.
- [ ] Manual read-through of the rewritten `body_ru`/`body_en` opening paragraphs and the two new
      inline links, rendered on the article page, for tone/correctness (Lithuanian-learning
      content, not just SEO copy).

## Definition of Done

- [ ] All Validation commands above pass.
- [ ] Screenshots: `/dashboard/articles/is-lithuanian-hard-to-learn/`,
      `/dashboard/articles/numbers-01-basics/` (showing the new opening paragraph + new inline
      link where added), and `/dashboard/phrases/` — each in **RU and EN** (language toggle) and
      at **desktop and 375px**, saved to
      `temp_files/screenshots/plan_37_seo-quick-wins/`. Mock any auth/premium state needed so the
      pages render their normal logged-in content without touching a real account.
  - Note: the `<title>`/meta-description fix itself (items 1–3 in Files touched) has no visible
    on-page rendering — it only shows in the browser tab and Google's snippet. That part is
    verified via the Playwright `document.title`/meta read in Validation, not a screenshot; the
    screenshots above cover the genuinely visible change (rewritten body copy + new links).
  - Note: metadata does not change with the RU/EN toggle (see Context #4 — known limitation, not
    fixed by this plan) — the RU/EN screenshot pair for the three pages is still taken to confirm
    the *visible body content* (rewritten paragraph, new link) renders correctly in both languages,
    not to show a metadata difference that doesn't exist.
- [ ] `documentation/seo.md` exists with both gotchas from Context.
- [ ] `documentation/CHANGELOG.md` has a `#37` entry.
- [ ] Sitemap confirmed (via the curl check) to emit `<lastmod>` for every program and
      phrase-program URL — no more Aug/Sep-style "crawled, not indexed" pattern caused by a
      missing signal.
