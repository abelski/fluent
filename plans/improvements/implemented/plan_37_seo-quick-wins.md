---
kind: feature
status: done
iteration: 1
max_iterations: 15
suggested_model: sonnet
suggested_effort: low
confirmed_model: sonnet
confirmed_effort: low
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

- [x] Fix `frontend/app/dashboard/articles/[slug]/layout.tsx`'s description derivation (strip
      leading heading line, collapse newlines, keep the 160-char slice).
- [x] Add `<lastmod>` to both the `programs` and `phrase_programs` loops in `backend/main.py`.
- [x] Create `frontend/app/dashboard/phrases/layout.tsx` (title/description/canonical/openGraph,
      pattern-matched to `lists/layout.tsx` and `grammar/layout.tsx`).
- [x] Rewrite `is-lithuanian-hard-to-learn` and `numbers-01-basics` opening paragraphs (`body_ru` +
      a matching `body_en` sentence) via SQL `UPDATE` against the Neon DB (`sql` skill). For
      `numbers-01-basics`, also update `title_ru` to include "цифры".
- [x] Add the two inline internal links (`regitra-vocabulary` → `/programs/regitra/`,
      `common-lithuanian-words` → `/dashboard/phrases/`) in both `body_ru` and `body_en`.
      `common-lithuanian-words` had both bodies already; `regitra-vocabulary`'s `body_en` was
      empty in the DB (pre-existing gap, unrelated to this plan — English visitors saw a blank
      article body before this fix). User chose to translate the full article rather than skip
      it: wrote a complete English translation (13.7KB) of the 16KB `body_ru`, matching the
      structure/table format used elsewhere (`common-lithuanian-words` EN body) — vocab tables
      drop the Russian column and keep only Lithuanian/English. The `/programs/regitra/` link is
      present in both language versions.
- [x] Write `documentation/seo.md` with the two gotchas from Context.
- [x] Append a `#37` entry to `documentation/CHANGELOG.md`.

## Validation

- [x] `cd backend && python -m pytest -q` (sitemap fix shouldn't change any existing assertion,
      but confirm no test hard-codes the old lastmod-less XML shape)
- [x] `cd frontend && npm run build` (new `layout.tsx` must not break the static export)
- [x] `curl -s https://fluent-qhk8.onrender.com/sitemap.xml` (local/prod, after deploy) — confirm
      every `/programs/` and `/dashboard/phrases/<id>/` URL now has a `<lastmod>` sibling tag.
      Validated against `http://localhost:8000/sitemap.xml` (post-deploy re-run against prod URL
      still pending — nothing has been pushed/deployed yet).
- [x] Playwright: load `/dashboard/articles/is-lithuanian-hard-to-learn/`,
      `/dashboard/articles/numbers-01-basics/`, and `/dashboard/phrases/` and read
      `document.title` + `document.querySelector('meta[name=description]').content` — confirm each
      description is a complete sentence (no mid-word cutoff, no leading repeated H1 text) and the
      phrases page no longer shows the generic site-wide title/description.
      Restarted `next dev` (old process was up since Monday, holding a stale in-memory Data Cache
      entry from before this session's SQL rewrite — see prior note, root-caused by a validation
      subagent). Fresh server confirms all three pages correct:
      - `/dashboard/phrases/`: title "Литовские фразы для повседневного общения | Fluent",
        description "Разговорные фразы на литовском языке: приветствия, покупки, дорога, работа...."
        — matches the new layout.tsx, not the generic site default.
      - `is-lithuanian-hard-to-learn`: title "Сложно ли учить литовский язык?", description
        "Короткий ответ: да, литовский — один из самых сложных языков Европы для изучения. У него
        семь падежей, тональное ударение и своя, довольно архаичная грамматика." — complete
        sentence, no H1 repeat, no cutoff.
      - `numbers-01-basics`: title "Числа и цифры на литовском языке: от 0 до 100" (now includes
        "цифры"), description "Цифры и числа на литовском языке — одна из первых тем для любого
        новичка. Вы будете использовать их каждый день: адрес, телефон, ваш возраст и цена в
        магазине." — complete sentence, no cutoff.
- [x] Manual read-through of the rewritten `body_ru`/`body_en` opening paragraphs and the two new
      inline links, rendered on the article page, for tone/correctness (Lithuanian-learning
      content, not just SEO copy).
      Read all 4 touched articles live, both RU and EN toggles where applicable. Found and fixed
      one real gap in the process: `numbers-01-basics`'s H1 line inside `body_ru` still read the
      old title ("Числа в литовском языке...", missing "цифры") after the SQL rewrite only
      touched `title_ru` — fixed with a follow-up `UPDATE` so the on-page H1 now matches the
      `<title>` tag. `is-lithuanian-hard-to-learn`'s H1 was already consistent (title_ru wasn't
      changed for that article). Both new inline links (`regitra-vocabulary` →
      `/programs/regitra/`, `common-lithuanian-words` → `/dashboard/phrases/`) render correctly
      and read naturally in both languages. `regitra-vocabulary`'s new EN translation (13.7KB,
      full article) reads naturally, not machine-literal; vocab tables follow the established
      EN-article convention (drop the Russian column, keep Lithuanian/English only).

## Definition of Done

- [x] All Validation commands above pass. Re-run together as the final no-drift gate (2026-09-23):
      `pytest -q` → 617 passed; `npm run build` → exit 0, `/dashboard/phrases` in the export;
      `curl localhost:8000/sitemap.xml` → lastmod present on all 8 program + 2 phrase-program URLs.
- [x] Screenshots: `/dashboard/articles/is-lithuanian-hard-to-learn/`,
      `/dashboard/articles/numbers-01-basics/` (showing the new opening paragraph + new inline
      link where added), and `/dashboard/phrases/` — each in **RU and EN** (language toggle) and
      at **desktop and 375px**, saved to
      `temp_files/screenshots/plan_37_seo-quick-wins/`. Mock any auth/premium state needed so the
      pages render their normal logged-in content without touching a real account.
      12 screenshots taken (3 pages × RU/EN × desktop/375px) via Playwright against localhost:3000,
      using the already-logged-in real session (no mocking needed — real Premium account, own
      dev browser). Spot-checked visually: nav/header/footer intact, no regressions, H1 fix visible
      on `numbers-01-basics`.
  - Note: the `<title>`/meta-description fix itself (items 1–3 in Files touched) has no visible
    on-page rendering — it only shows in the browser tab and Google's snippet. That part is
    verified via the Playwright `document.title`/meta read in Validation, not a screenshot; the
    screenshots above cover the genuinely visible change (rewritten body copy + new links).
  - Note: metadata does not change with the RU/EN toggle (see Context #4 — known limitation, not
    fixed by this plan) — the RU/EN screenshot pair for the three pages is still taken to confirm
    the *visible body content* (rewritten paragraph, new link) renders correctly in both languages,
    not to show a metadata difference that doesn't exist.
- [x] `documentation/seo.md` exists with both gotchas from Context.
- [x] `documentation/CHANGELOG.md` has a `#37` entry (corrected post-hoc to match final state —
      the first version, written mid-pass, still said the `regitra-vocabulary` EN link was
      skipped; updated once the translation was done).
- [x] Sitemap confirmed (via the curl check) to emit `<lastmod>` for every program and
      phrase-program URL — no more Aug/Sep-style "crawled, not indexed" pattern caused by a
      missing signal.
