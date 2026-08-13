---
kind: feature
status: done
iteration: 1
max_iterations: 22
suggested_model: sonnet
suggested_effort: medium
confirmed_model: sonnet
confirmed_effort: medium
---

# Reorganize /dashboard/articles into categories

## Context

`/dashboard/articles` currently renders all 29 non-footer articles in one flat card grid with no
grouping. The goal is three browsable categories — **Learning Materials** (grammar/vocabulary),
**Adaptation in Lithuania** (exams, driver's license, history, registration — currently thin, meant
to grow), and **Blog** (news / everything else) — while keeping every existing indexed URL
(`/dashboard/articles/{slug}`) unchanged, since Google has these slugs indexed
(`backend/main.py` sitemap generation, lines ~182-190).

Key existing pieces (from exploration):
- `Article` model: `backend/models.py:201-215` — has `slug`, bilingual title/body, free-text `tags`,
  `published`, `show_in_footer`. **No category field.**
- Public API: `backend/routers/articles.py` — `GET /api/articles` (29 non-footer articles),
  `GET /api/articles/{slug}`, admin CRUD (`POST/PUT/GET/DELETE /api/admin/articles[/{slug}]`),
  markdown import/export (`_article_to_markdown` / `_parse_markdown_article`).
- Frontend list: `frontend/app/dashboard/articles/ArticlesList.tsx` (client card grid) fed by
  `frontend/app/dashboard/articles/page.tsx` (server component, build-time fetch for SEO + runtime
  refresh). Type in `frontend/app/dashboard/articles/types.ts`.
- Detail page: `frontend/app/dashboard/articles/[slug]/page.tsx` + `ArticleContent.tsx` — slug is
  read directly from the URL client-side (no numeric ID resolution needed, unlike lists).
- Admin: `frontend/app/dashboard/admin/articles/page.tsx` (list) and
  `.../[slug]/edit/page.tsx` (create/edit form, `ArticleForm` interface).
- `PUBLIC_PREFIXES` in `frontend/app/dashboard/layout.tsx:10` already includes `/dashboard/articles`
  as a full-prefix match, so a `?category=` query string needs no change there.
- Migrations use Alembic (`backend/migrations/versions/`, most recent additions there, e.g.
  `f6a7b8c9d0e1_add_chapter_title_en_to_phrase.py`) — standalone `migrate_*.py` scripts are the
  older/legacy pattern. Use Alembic for the new column.
- Design system: Статьи already uses the shared `PageShell` + card grid pattern
  (`documentation/design system/Component Library (as-built).html` ~line 519-543, 622); it has no
  hero. `ArticlesList.tsx:55` uses `font-headline` on card titles, which violates the CLAUDE.md
  "Inter only" rule — pre-existing drift, worth fixing while this file is touched anyway.
- 32 total articles in DB; 3 are utility pages misusing the table via `show_in_footer=True`
  (`about-team`, `privacy-gdpr`, `terms-of-service`) and must stay excluded from the category grid,
  same as today.

**Model/effort rationale**: `sonnet` / `medium` — mechanical CRUD + UI filtering work following
existing patterns (Alembic column add, extend existing endpoints/forms, add a tab bar to an
existing grid). No auth/payment/novel-architecture risk.

Confirmed with user via clarifying questions:
- Add a real `category` enum column (not tag-inference).
- Category browsing via query param `/dashboard/articles?category=x` (no new routes, zero risk to
  indexed slug URLs).
- The 3 utility pages stay excluded from the category grid (already excluded via `show_in_footer`).
- Migration mapping for the 32 existing articles is pre-approved (below).

## Goals

- Add a `category` field to articles: `learning_materials` | `adaptation` | `blog`.
- Backfill all 29 non-utility existing articles (the 3 footer utility pages are excluded from
  categorization) per the approved mapping below.
- `/dashboard/articles` shows category tabs/filter (All / Learning Materials / Adaptation in
  Lithuania / Blog) using `?category=` query param; default (no param) shows all, matching current
  behavior exactly for the indexed base URL.
- Individual article URLs (`/dashboard/articles/{slug}`) are completely unchanged.
- Admin create/edit form gets a required `category` dropdown; admin list shows the category per row.
- `GET /api/articles` returns `category` in the payload; optional `?category=` filter param added
  server-side for the public endpoint (validated server-side, used for API completeness / future
  reuse even though the frontend filters the already-fetched list client-side at this article volume).

## Non-Goals

- No new page routes / no dedicated category landing pages (ruled out — query param approach).
- No changes to the markdown import/export frontmatter format beyond adding an optional `category:`
  field (defaults to `blog` if omitted, so old export files without it still import).
- No redesign of the article detail page or card visual style beyond adding a category badge/tab bar.
- No changes to `show_in_footer` handling or the 3 utility pages' behavior.
- No retroactive sitemap/robots.txt changes — slugs are already listed there and are unaffected.

## Requirements

1. `Article.category` — new required string column, one of `learning_materials`, `adaptation`,
   `blog`. Default `blog` at the DB level for safety during migration, but the admin form makes it
   a required explicit choice going forward (frontend + backend validate it's one of the 3 values).
2. Backfill migration applies this approved mapping (32 rows total):

   **Learning Materials** (21): `būdvardžiai-linksniavimas`, `common-lithuanian-words`,
   `daiktavardžiai-linksniavimas`, `dalyviai-rūšys-ir-linksniavimas`, `lithuanian-cases-explained`,
   `numbers-01-basics`, `numbers-02-nouns-and-prices`, `numbers-03-time`, `numbers-04-ordinal`,
   `numbers-05-age-dates-years`, `skaitvardžiai-linksniavimas`, `veiksmažodžiai-asmenuojama`,
   `verb-conditional`, `verb-future-tense`, `verb-governance`, `verb-imperative`, `verb-intro`,
   `verb-participles`, `verb-past-tenses`, `verb-present-tense`, `įvardžiai-linksniavimas`.

   **Adaptation in Lithuania** (2): `prepare-for-lithuanian-a2`, `regitra-vocabulary`.

   **Blog** (6): `best-apps-to-learn-lithuanian`, `how-long-to-learn-lithuanian`,
   `how-to-use-fluent`, `is-lithuanian-hard-to-learn`, `lithuanian-for-russian-speakers`, `welcome`.

   **Unchanged / excluded from grid** (3, `show_in_footer=True`, no category needed but column still
   gets a default `blog` value to satisfy NOT NULL): `about-team`, `privacy-gdpr`, `terms-of-service`.

3. `GET /api/articles` accepts optional `?category=` query param; server validates it's one of the
   3 known values (400 on anything else) and filters; omitted = all (current behavior).
4. `GET /api/articles/{slug}` and admin endpoints return `category` in the payload.
5. `ArticleBody` (admin create/update pydantic model) requires `category` and validates against the
   3 allowed values (422 on invalid).
6. `/dashboard/articles` UI: a tab bar (All / Learning Materials / Adaptation in Lithuania / Blog)
   above the grid, driven by `useSearchParams`/`router.push` on `?category=`. The build-time fetch
   still loads all articles (unfiltered) for the SEO-visible base page; the tab bar filters that
   already-fetched list client-side — no extra network round trip needed at this article volume.
7. Admin list page: add a Category column; admin edit form: add a required `<select>` for category
   next to the existing tags/published fields, matching existing field styling
   (`border-gray-900` heavy-border admin style — admin pages are excluded from the redesigned
   PageShell per the design system's "Heavy-border pages left alone" note, so match the *existing*
   admin styling here, not PageShell tokens).
8. Markdown import/export: add `category` to the frontmatter (`_article_to_markdown`,
   `_parse_markdown_article`), defaulting to `blog` on import if the field is missing (backward
   compatible with old exported `.md` files).
9. Fix `ArticlesList.tsx:55` — drop the stray `font-headline` class while touching this file (drift
   fix, not new scope).

### Standing constraints
- All validation must be server-side (never frontend-only) — category value is validated in the
  FastAPI layer (`ArticleBody` + the new query-param filter), not just constrained by the `<select>`.
- This plan touches markup/styling — read `documentation/design system/Component Library (as-built).html`
  and `documentation/IMPLEMENTATION.md` first, use named tokens (`emerald-600`, `ink`, `muted`,
  `line`, `faint` etc.) for the new tab bar on `/dashboard/articles` (which uses the redesigned
  `PageShell`), and run `frontend/tests/design-system-parity.spec.ts` after. The admin pages are the
  documented exception (heavy-border style, not migrated) — match their existing look, don't
  introduce PageShell tokens there.
- Add autotest coverage for the new feature (category filter tab + backend filter param + slug
  URLs still resolve) and run the relevant suite(s) as part of Validation.

## Implementation

- [x] 1. `backend/migrations/versions/` — new Alembic revision: add `category VARCHAR NOT NULL
      DEFAULT 'blog'` to `article`, then a data migration step (raw SQL `UPDATE` statements) applying
      the approved mapping from Requirement 2 by slug.
- [x] 2. `backend/models.py:201-215` — add `category: str = Field(default="blog")` to `Article`.
- [x] 3. `backend/routers/articles.py`:
      - add `_VALID_CATEGORIES = {"learning_materials", "adaptation", "blog"}` constant
      - `list_articles` (line 41): accept optional `category: Optional[str] = None` query param,
        400 if not in `_VALID_CATEGORIES`, filter query when present, include `category` in the
        response dict
      - `get_article` (line 81): include `category` in the response dict
      - `admin_list_articles` (101) / `admin_get_article` (125): include `category`
      - `ArticleBody` (151): add `category: str` field; validate membership in `_VALID_CATEGORIES`
        in `create_article` (162) and `update_article` (191), 422/400 on invalid
      - `_article_to_markdown` (240) / `_parse_markdown_article` (261): read/write `category:`
        frontmatter, defaulting to `"blog"` on import when absent
- [x] 4. `frontend/app/dashboard/articles/types.ts` — add `category: string` to `ArticleSummary`.
- [x] 5. `frontend/app/dashboard/articles/ArticlesList.tsx` — add a category tab bar above the grid
      (All / Learning Materials / Adaptation in Lithuania / Blog) using named design tokens,
      `useSearchParams` to read `?category=`, filter the already-fetched articles client-side,
      `router.push`/`replace` to update the query param on tab click without a full navigation;
      remove stray `font-headline` at line 55.
- [x] 6. `frontend/app/dashboard/articles/page.tsx` — no change needed for the base build-time fetch
      (still fetches all articles for the default/no-category view); confirm it still works
      unfiltered.
- [x] 7. `frontend/lib/i18n/ru.ts` and `frontend/lib/i18n/en.ts` — add category tab labels under the
      `articles` block (e.g. `categoryAll`, `categoryLearning`, `categoryAdaptation`, `categoryBlog`)
      and `categoryLabel` for the admin form.
- [x] 8. `frontend/app/dashboard/admin/articles/page.tsx` — add `category` to `ArticleRow` interface
      and render it as a column in the admin list table.
- [x] 9. `frontend/app/dashboard/admin/articles/[slug]/edit/page.tsx` — add `category` to
      `ArticleForm`/`EMPTY`, add a required `<select>` (3 options) next to the tags field, matching
      existing `border-gray-900` admin input styling; include it in the save payload.
- [x] 10. `documentation/design system/Component Library (as-built).html` — document the new
      category tab bar pattern on Статьи (tokens used, where it sits relative to the existing card
      grid) since it's a new shared-ish UI element on one of the 5 top-nav pages.
- [x] 11. `documentation/IMPLEMENTATION.md` — add the `category` field/pattern → file mapping entry.

## Validation

- [x] Backend: run existing article tests if present (`cd backend && .venv/bin/python -m pytest -k article -q`); add/extend a test covering `GET /api/articles?category=learning_materials` filtering and 400 on an invalid category value.
- [x] Playwright: extend or add a spec under `frontend/tests/` clicking through the category tabs on `/dashboard/articles` and asserting the grid filters, plus asserting an existing slug URL (e.g. `/dashboard/articles/verb-intro`) still loads unchanged.
- [x] Smoke: navigate to `/dashboard/articles`, confirm all 4 tabs present and each filters correctly; open one article from each category and confirm the detail page still renders at its original URL.
- [x] Edge case: `GET /api/articles?category=bogus` → 400.
- [x] Admin: create/edit an article via `/dashboard/admin/articles`, confirm category is required and saved/round-trips through export/import `.md`.
- [x] Migration: after running the Alembic migration locally, spot-check row counts per category match the approved mapping (21 / 2 / 6, 3 utility rows default to `blog`).
- [x] Design parity: `frontend/tests/design-system-parity.spec.ts` passes after the `/dashboard/articles` UI change.
- [ ] News post written and published via /news-writer.

## Definition of Done

```bash
cd backend && .venv/bin/python -m pytest -q
cd frontend && npx tsc --noEmit
cd frontend && npx playwright test --reporter=list
```
