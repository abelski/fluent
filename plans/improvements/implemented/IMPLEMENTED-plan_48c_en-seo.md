---
kind: feature
status: done
iteration: 4
max_iterations: 24
suggested_model: opus
suggested_effort: high
confirmed_model: opus
confirmed_effort: high
---

# #48c — English coverage, part 3: indexable English articles

## Context

Idea: `plans/ideas/idea_48_full-english-coverage.md`. This is part 3 of 3. It starts only after
48a and 48b are merged, **deployed, and the 48b content is applied in prod** (done 2026-09-24),
so no `/en/` page goes live with Russian content. It ships as its own deploy, with no other SEO
change in the same weeks, so any change in GSC can be traced to it.

**Scope cut 2026-10-03: articles only.** The original plan made EN twins of 10 public pages.
A risk review found that hreflang does not stop Google from clustering near-duplicates: programs,
lists and phrases pages are mostly Lithuanian words, so RU and EN differ only in the translation
column, and Google could pick the EN twin as canonical and drop the RU page from RU results —
which is all our traffic today. We have already seen Google pick a wrong canonical (3 articles →
`www.747live.bet`, `documentation/seo-log.md`). Articles carry full, different RU and EN prose,
so clustering is unlikely. Other pages get twins in a later plan, only if this one causes no RU
loss after ~3–4 weeks.

Today the static export has one URL per page. The language is a client-side `localStorage`
toggle (`frontend/lib/useLang.ts`), so crawlers only see the RU build (`documentation/seo.md`,
"Metadata is always Russian"). All 31 published articles have `title_en`/`body_en` (checked on
prod 2026-10-03), but there is no English URL for a search result to land on.

Code facts (cold review 2026-09-24, re-checked 2026-10-03 after #55–57):
- `Header` and `LangSync` sit in the root layout and stay mounted across client navigation.
  `useLang`'s effect reads `localStorage`. `LangSync` only sets `<html lang>`; the UI language is
  never sent to the server (`user.lang`, which picks the email language, changes only in Settings).
- The Header nav, the logo and the article links point to RU paths (line numbers drifted after
  #55–57; grep, don't trust them). The active-pill logic uses `pathname.startsWith('/dashboard/…')`.
- `ArticlesList.tsx` (#55): article links are built by `href(a) => /dashboard/articles/${slug}`;
  the theme chips filter with `router.push('/dashboard/articles?…')`.
- Next's metadata merge replaces a child's `alternates` wholesale. The `_` placeholder
  (`articles/[slug]/layout.tsx`) inherits the index canonical.
- `generateStaticParams` lives in `articles/[slug]/layout.tsx`.
- `ArticleContent.tsx` reads the slug as `parts[2]`, which breaks under `/en`. It also uses
  `body_en` with no fallback.
- The backend `_` fallback in `resolve_static` (`backend/main.py`) resolves
  `/en/dashboard/articles/<new-slug>` correctly.
- `<html lang="ru">` is hardcoded in `app/layout.tsx`, with `suppressHydrationWarning`.
- `robots.txt` needs no change (`Allow: /`), and neither does `PUBLIC_PREFIXES`
  (`/en/dashboard` isn't under `app/dashboard`, so its auth-only layout doesn't apply).

**Model:** opus/high. It is SEO-critical routing, with a hard constraint not to hurt RU rankings.

## Goals
- `/en/dashboard/articles/` and `/en/dashboard/articles/<slug>/`, prerendered in English,
  self-canonical, and linked with reciprocal `hreflang` to their RU twins.
- RU pages keep their URL, title, description and canonical byte-for-byte. Only the article
  index and article pages gain `hreflang` links; every other RU page is unchanged.
- An English visitor who lands on an EN article stays in English while browsing.

## Non-Goals
- EN twins of any other page: `/`, `/pricing/`, grammar, lists, programs, phrases, extension.
  Their links from EN article pages stay RU (the UI stays EN through `localStorage`).
- Rewriting links inside article Markdown bodies that point to non-article pages
  (`/programs/regitra/`, `/dashboard/phrases/`) — they stay RU.
- Route groups to vary `<html lang>` at the framework level.
- Making EN the `x-default`: RU stays the default, to protect the current audience.

## Requirements
1. **`useLang`:**
   - It derives `forced = pathname === '/en' || pathname.startsWith('/en/') ? 'en' : null` on
     **every render** and returns `forced ?? lang`.
   - The `localStorage` effect doesn't override a forced value.
   - On an `/en/` path, it writes `fluent_lang='en'` **only when nothing is stored yet**, so a
     user who already chose RU keeps that choice.
2. **`useLocalHref(path)`:** a small helper that prefixes `/en` when the current path is EN and
   `path` has a twin.
   - **Twins, exact match only:** `/dashboard/articles/` and `/dashboard/articles/<slug>/`
     (one segment). Query strings and trailing slashes are kept. Everything else stays RU — no
     prefix matching, so no path without a twin can ever get `/en/` and 404.
   - Applied to: the Header «Статьи»/Articles nav link, the article links and the theme-chip
     `router.push` in `ArticlesList.tsx`, the links in `ArticleContent.tsx` (back to the list,
     related articles), and Markdown links to other articles inside the body
     (`/dashboard/articles/<slug>/` via ReactMarkdown's `a` component).
   - The twin rule lives in one place, next to `PUBLIC_PREFIXES`, so later plans extend it.
3. **Header:**
   - The active-pill checks strip the `/en` prefix first.
   - The toggle calls `setLang` and then does a full navigation (`window.location.href`) to the
     twin, built from the real `window.location.pathname`, on article pages (RU ↔ EN).
   - On pages with no twin, it keeps today's reload.
4. **Routes** under `app/en/dashboard/articles/`:
   - `page.tsx` re-exporting only `default` from the RU index, plus a `layout.tsx` with EN
     metadata.
   - `[slug]/layout.tsx` re-exports `generateStaticParams` (with the content gate) and has its own
     `generateMetadata`; `[slug]/page.tsx` renders the same content. The JSON-LD is `lang`-aware
     (`title_en`, `/en/` url).
   - Every EN metadata block sets its own `alternates` (a self-canonical plus `languages`) and
     its own `openGraph` (`locale: 'en_US'`, the `/en/` url).
   - No `app/en/layout.tsx` metadata that could cascade.
5. **Content gate:** an article gets an EN twin in `generateStaticParams`, the sitemap and
   `hreflang` only if `title_en` and `body_en` are both non-empty. `ArticleContent` falls back to
   RU when `body_en` is empty.
6. **RU pages:**
   - Add `alternates.languages: { ru, en, 'x-default': <ru url> }` inside the page's own
     `alternates` on `/dashboard/articles/` and per item on `/dashboard/articles/<slug>/`
     (only items that pass the content gate).
   - No `languages` on the `_` placeholder.
   - Titles, descriptions and canonicals stay untouched. No other RU page changes.
7. **`ArticleContent.tsx`:** read the slug relative to the `'articles'` segment, as
   `programs/[key]/page.tsx` does.
8. **`<html lang>`:** a post-build script, `frontend/scripts/en-html-lang.mjs`, run as
   `"build": "next build && node scripts/en-html-lang.mjs"`, rewrites `<html lang="ru"` to
   `<html lang="en"` in `out/en/**/*.html`.
9. **Sitemap** (`backend/main.py`):
   - Add `xmlns:xhtml` to `<urlset>`.
   - One helper emits both `<url>` entries of a pair (article index, each gated article). Each
     entry lists all three links (ru, en, x-default), including a link to itself.
   - URLs end with a trailing slash and match the on-page canonicals byte-for-byte.
   - No other sitemap entry changes.

### Standing constraints
- All validation must be server-side (never frontend-only).
- If this plan touches markup, styling, or a component: read `documentation/design system/Component Library (as-built).html` and `documentation/IMPLEMENTATION.md` first, use named design tokens (never a raw Tailwind step), and run `frontend/tests/design-system-parity.spec.ts` after any shared-shell/token change. The Header toggle and nav hrefs change behaviour, so update the component library's Header entry and add `/en/dashboard/articles/` to `NAV_PAGES`.
- Add autotest coverage for the new feature and run the relevant suite(s) as part of Validation.

## Implementation
- [x] 1. `frontend/scripts/seo-snapshot.mjs` — extracts title, description, canonical and hreflang from every `out/**/index.html`, excluding `out/en/**`. On the branch start, **before any change**, build with the same backend and data up (`DEV` unset) and save a snapshot to `temp_files/screenshots/plan_48c_en-seo/ru-seo-baseline.json`. `--diff <baseline>` fails on any change other than added hreflang links, and fails on hreflang added to any page outside `/dashboard/articles/`.
- [x] 2. Baseline Playwright failures → `temp_files/screenshots/plan_48c_en-seo/baseline-failures.txt`.
- [x] 3. `frontend/lib/useLang.ts` (Requirement 1); `useLocalHref` and the twin rule (Requirement 2); `components/Header.tsx` (Requirement 3).
- [x] 4. `ArticlesList.tsx` and `ArticleContent.tsx` — links through `useLocalHref`, segment-relative slug parsing, RU fallback (Requirements 2, 5, 7).
- [x] 5. `frontend/app/en/dashboard/articles/**` (Requirement 4) with the content gate (Requirement 5).
- [x] 6. RU article metadata: add `languages` (Requirement 6).
- [x] 7. `frontend/scripts/en-html-lang.mjs` and the `build` script (Requirement 8).
- [x] 8. `backend/main.py` sitemap (Requirement 9).
- [x] 9. Docs:
  - `documentation/seo.md`: replace "Metadata is always Russian" with the `/en/` article mechanism and its rules (the alternates-replace trap, the content gate, reciprocity, x-default = RU, exact-match twin rule), and the articles-only decision with its why (clustering risk on near-duplicate pages).
  - `documentation/articles-seo.md`: "Only the Russian version is indexed" → EN twin exists per article; an article without `body_en` gets none.
  - The component library's Header entry.
  - `design-system-parity.spec.ts` `NAV_PAGES`: add `/en/dashboard/articles/`.
- [x] 10. `frontend/tests/en-seo-routes.spec.ts` checks:
  - `/en/dashboard/articles/<slug>/` prerenders EN (`<h1>` and body in the raw HTML), and a stored `fluent_lang='ru'` doesn't flip it.
  - With an empty `localStorage`, visiting `/en/dashboard/articles/` stores `en`; a stored `ru` is left alone.
  - On `/en/dashboard/articles/`, every article link starts with `/en/`, and clicking a theme chip keeps the URL under `/en/` (with `?category=`).
  - On an EN article, the back link and links to other articles start with `/en/`; a link to `/programs/…` or `/pricing/` does not.
  - The Header «Articles» link on an `/en/` page goes to `/en/dashboard/articles/`; the other nav links go to RU paths and the UI stays EN when nothing was stored before.
  - The active pill shows on `/en/dashboard/articles/`.
  - The toggle goes RU ↔ EN twin on an article and on the index; on `/dashboard/lists/` it just reloads.
  - An EN twin has a self-canonical and all three hreflang links; its RU twin lists the same set.
  - `/en/dashboard/articles/<slug-not-in-build>` loads the right article.
  - `useLocalHref` unit cases: `/dashboard/articles/`, `/dashboard/articles/<slug>/`, `/dashboard/articles/?category=x` get `/en/`; `/`, `/pricing/`, `/programs/`, `/programs/regitra/`, `/programs/custom/<token>`, `/dashboard/lists/`, `/dashboard/phrases/12/`, `/dashboard/practice/` stay RU.
- [x] 11. `backend/tests/test_sitemap_hreflang.py`:
  - Every `hreflang="en"` href is itself a `<loc>` whose entry links back to its RU twin.
  - Every entry with hreflang has x-default.
  - A slug with Lithuanian letters (e.g. `būdvardžiai-linksniavimas`) is encoded identically in `<loc>`, every `xhtml:link` href, and the on-page canonical/hreflang of both twins (byte-for-byte; compare against the built `out/` HTML in the frontend check of item 12).
  - No `/en/` URL other than the article index and articles.
  - An article with an empty `body_en` gets no twin.
- [x] 12. Build-output check inside `en-seo-routes.spec.ts` (reads files):
  - `out/en/dashboard/articles/index.html` and `out/en/dashboard/articles/<known-slug>/index.html` exist; `out/en/` has nothing else besides `_next`-style assets.
  - They have an EN `<title>`, a self-canonical, hreflang and `<html lang="en"`.
- [x] 13. `frontend/tests/plan48c-screenshots.spec.ts` — RU and EN × 1280 and 375, into `temp_files/screenshots/plan_48c_en-seo/`, for:
  - `/en/dashboard/articles/` and `/en/dashboard/articles/<slug>/`
  - their RU twins, showing they are unchanged

Rollout (manual)
- [ ] 14. Deploy, then **deploy a second time**: the build reads the live `/api/articles` through the cache (`documentation/articles-seo.md`). *(manual)*
- [ ] 15. **Before** touching GSC: open 3 `/en/dashboard/articles/<slug>/` URLs on prod and check each has its own EN title and a self-canonical (not the placeholder's index canonical). Check `/sitemap.xml` on prod. *(manual)*
- [ ] 16. Resubmit the sitemap in GSC and URL-inspect 3 `/en/` URLs via the `/seo` skill. Record in `documentation/seo-log.md`; check back in ~3 weeks, comparing RU article clicks/positions and the Google-chosen canonical of 3–5 RU articles. *(manual)*

## Review
- [x] Code review passed (round 4)
- Note: the EN gate exists twice (Python `_has_en` in `backend/main.py`, SQL + helper in `backend/routers/articles.py`); no test asserts they agree.
- Note: `markRuOnly` mutates a module-level Set during render; idempotent, read only in click handlers. A toggle clicked before the article loads still goes to `/en/` — accepted.
- Note: known limit — Markdown links to a *different* RU-only article still get `/en/` (documented in `documentation/seo.md`).

## Validation
- [x] RU SEO unchanged: `cd frontend && npm run build && node scripts/seo-snapshot.mjs --diff ../temp_files/screenshots/plan_48c_en-seo/ru-seo-baseline.json`
- [x] Routes: `cd frontend && npx playwright test tests/en-seo-routes.spec.ts --reporter=list`
- [x] Backend: `cd backend && .venv/bin/python -m pytest -q`
- [x] Types: `cd frontend && npx tsc --noEmit`
- [x] Guard + parity: `cd frontend && npx playwright test tests/no-hardcoded-russian.spec.ts tests/design-system-parity.spec.ts --reporter=list`
- [x] Screenshots: `cd frontend && npx playwright test tests/plan48c-screenshots.spec.ts --reporter=list`, then look at every shot *(looking is manual)*
- [x] Full suite: no new failures vs `baseline-failures.txt`

## Definition of Done

```bash
cd backend && .venv/bin/python -m pytest -q
cd frontend && npx tsc --noEmit
cd frontend && npm run build && node scripts/seo-snapshot.mjs --diff ../temp_files/screenshots/plan_48c_en-seo/ru-seo-baseline.json
cd frontend && npx playwright test tests/en-seo-routes.spec.ts tests/no-hardcoded-russian.spec.ts tests/design-system-parity.spec.ts tests/plan48c-screenshots.spec.ts --reporter=list
```

User-facing checks: **both languages (RU + EN)**, **mobile at 375px**, **screenshots proving each**
in `temp_files/screenshots/plan_48c_en-seo/`. The RU SEO diff is empty, and the component library
Header entry is updated.

## Notes
- 2026-10-03: scope cut to articles only (see Context). Next step, if RU traffic holds after
  ~3–4 weeks: a follow-up plan for the remaining public pages, reusing the twin rule.
