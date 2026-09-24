---
kind: feature
status: approved
iteration: 0
max_iterations: 26
suggested_model: opus
suggested_effort: high
confirmed_model: null
confirmed_effort: null
---

# #48c — English coverage, part 3: indexable English pages

## Context

Idea: `plans/ideas/idea_48_full-english-coverage.md`. This is part 3 of 3. It starts only after
48a and 48b are merged, **deployed, and the 48b content is applied in prod**, so no `/en/` page
goes live with Russian content. It ships as its own deploy, so any change in GSC can be traced to it.

Today the static export has one URL per page. The language is a client-side `localStorage`
toggle (`frontend/lib/useLang.ts`), so crawlers only see the RU build (`documentation/seo.md`,
"Metadata is always Russian"). All 34 articles have `title_en`/`body_en`, but there is no English
URL for a search result to land on.

Code facts (from the cold review):
- `Header` and `LangSync` sit in the root layout and stay mounted across client navigation.
  `useLang`'s effect reads `localStorage`.
- The Header nav (`Header.tsx:99-146`), the logo (`:161`) and about 33 hardcoded links on the
  public pages point to RU paths. The active-pill logic (`:90-95`) uses
  `pathname.startsWith('/dashboard/…')`.
- `app/page.tsx` and `app/pricing/page.tsx` already carry **English** metadata at page level.
  `pricing` has no `layout.tsx`.
- Next's metadata merge replaces a child's `alternates` wholesale. The `_` placeholders
  (`[slug]/layout.tsx:24`, `[key]/layout.tsx:27`) inherit the index canonical.
- `generateStaticParams` lives in `layout.tsx` for articles, programs and phrases.
- `dashboard/phrases/[id]` builds only `{id:'_'}` and inherits canonical `/dashboard/phrases/`.
  Its sitemap entries are already canonicalised away in RU.
- `ArticleContent.tsx:14` reads the slug as `parts[2]`, which breaks under `/en`. It also uses
  `body_en` with no fallback. The other pathname parsers are segment-relative already.
- The backend `_` fallback (`main.py:379-385`) resolves `/en/dashboard/articles/<new-slug>` correctly.
- `<html lang="ru">` is hardcoded in `app/layout.tsx:52`, with `suppressHydrationWarning`.
- The sitemap is at `main.py:149-226`. `robots.txt` needs no change (`Allow: /`), and neither does
  `PUBLIC_PREFIXES` (`/en/dashboard` isn't under `app/dashboard`).

**Model:** opus/high. It is SEO-critical routing, with a hard constraint not to hurt RU rankings.

## Goals
- `/en/...` twins of the public pages, prerendered in English, self-canonical, and linked with
  reciprocal `hreflang`.
- RU pages keep their URL, title, description and canonical byte-for-byte. They only gain
  `hreflang` links.
- An English visitor stays in English while browsing.

## Non-Goals
- An `/en/dashboard/phrases/[id]/` twin, which would be a thin duplicate with no per-id
  metadata. Fixing the existing RU phrase-detail canonical is also out: note it in `seo.md`.
- EN twins of pages behind login. Route groups to vary `<html lang>` at the framework level.
- Making EN the `x-default`: RU stays the default, to protect the current audience.

## Requirements
1. **`useLang`:**
   - It derives `forced = pathname === '/en' || pathname.startsWith('/en/') ? 'en' : null` on
     **every render** and returns `forced ?? lang`.
   - The `localStorage` effect doesn't override a forced value.
   - On an `/en/` path, it writes `fluent_lang='en'` **only when nothing is stored yet**, so a
     user who already chose RU keeps that choice.
2. **`useLocalHref(path)`:** a one-line helper that prefixes `/en` when the current path is EN
   and `path` has a twin. It is applied to the Header nav and logo, the Footer, and the card links
   on the landing page and the articles, programs and phrases index pages. The list of twin
   prefixes lives in one constant, next to `PUBLIC_PREFIXES`.
3. **Header:**
   - The active-pill checks strip the `/en` prefix first.
   - The toggle calls `setLang` and then does a full navigation (`window.location.href`) to the
     twin, built from the real `window.location.pathname`.
   - On pages with no twin, it keeps today's reload.
4. **Routes** under `app/en/`, 10 twins:
   - `/` and `/pricing/`: an own `page.tsx` that renders `LandingClient` / `PricingClient` with EN
     page-level metadata. No re-export of the RU page's `metadata`, and no home metadata in
     `app/en/layout.tsx`, since it would cascade.
   - `/dashboard/grammar/`, `/dashboard/lists/`, `/dashboard/articles/`, `/programs/`,
     `/dashboard/phrases/`, `/extension/`: a `page.tsx` re-exporting only `default`, plus a
     `layout.tsx` with EN metadata.
   - `/dashboard/articles/[slug]/`, `/programs/[key]/`: the EN `layout.tsx` re-exports
     `generateStaticParams` and has its own `generateMetadata`. The article twin gets a
     `lang`-aware JSON-LD (`title_en`, `/en/` url).
   - Every EN metadata block sets its own `alternates` (a self-canonical plus `languages`) and
     its own `openGraph` (`locale: 'en_US'`, the `/en/` url).
5. **Content gate:** an item gets an EN twin in `generateStaticParams`, the sitemap and `hreflang`
   only if its EN fields are non-empty (article `title_en` + `body_en`; program `name_en`).
   `ArticleContent` falls back to RU when `body_en` is empty.
6. **RU pages:**
   - Add `alternates.languages: { ru, en, 'x-default': <ru url> }`, placed inside each page's own
     `alternates`: per item for `[slug]` / `[key]`, and in `page.tsx` for `/` and `/pricing/`.
   - No `languages` on the `_` placeholders.
   - Titles, descriptions and canonicals stay untouched. That includes `/` and `/pricing/`, which
     keep their current EN titles.
7. **`ArticleContent.tsx`:** read the slug relative to the `'articles'` segment, as
   `programs/[key]/page.tsx:53` does.
8. **`<html lang>`:** a post-build script, `frontend/scripts/en-html-lang.mjs`, run as
   `"build": "next build && node scripts/en-html-lang.mjs"`, rewrites `<html lang="ru"` to
   `<html lang="en"` in `out/en/**/*.html`.
9. **Sitemap:**
   - Add `xmlns:xhtml` to `<urlset>`.
   - One helper emits both `<url>` entries of a pair. Each entry lists all three links (ru, en,
     x-default), including a link to itself.
   - URLs end with a trailing slash and match the on-page canonicals byte-for-byte.
   - The content gate from Requirement 5 applies.
   - No `/en/` twins of `/dashboard/phrases/<id>/`.

### Standing constraints
- All validation must be server-side (never frontend-only).
- If this plan touches markup, styling, or a component: read `documentation/design system/Component Library (as-built).html` and `documentation/IMPLEMENTATION.md` first, use named design tokens (never a raw Tailwind step), and run `frontend/tests/design-system-parity.spec.ts` after any shared-shell/token change. The Header toggle and nav hrefs change behaviour, so update the component library's Header entry and add one `/en/` URL to `NAV_PAGES`.
- Add autotest coverage for the new feature and run the relevant suite(s) as part of Validation.

## Implementation
- [ ] 1. `frontend/scripts/seo-snapshot.mjs` — extracts title, description, canonical and hreflang from every `out/**/index.html`, excluding `out/en/**`. On the branch start, **before any change**, build with the same backend and data up (`DEV` unset) and save a snapshot to `temp_files/screenshots/plan_48c_en-seo/ru-seo-baseline.json`. `--diff <baseline>` fails on any change other than added hreflang links.
- [ ] 2. Baseline Playwright failures → `temp_files/screenshots/plan_48c_en-seo/baseline-failures.txt`.
- [ ] 3. `frontend/lib/useLang.ts` (Requirement 1); `useLocalHref` and the twin-prefix constant (Requirement 2); `components/Header.tsx` and the Footer (Requirement 3).
- [ ] 4. `ArticleContent.tsx` — segment-relative slug parsing and the RU fallback (Requirements 5 and 7).
- [ ] 5. `frontend/app/en/**` — the 10 twins (Requirement 4) with the content gate (Requirement 5).
- [ ] 6. RU metadata: add `languages` (Requirement 6).
- [ ] 7. `frontend/scripts/en-html-lang.mjs` and the `build` script (Requirement 8).
- [ ] 8. `backend/main.py` sitemap (Requirement 9).
- [ ] 9. Docs:
  - `documentation/seo.md`: replace "Metadata is always Russian" with the `/en/` mechanism and its rules (the alternates-replace trap, the content gate, reciprocity, x-default = RU). Note the existing RU phrase-detail canonical problem.
  - The component library's Header entry.
  - `design-system-parity.spec.ts` `NAV_PAGES`: add one `/en/` URL.
- [ ] 10. `frontend/tests/en-seo-routes.spec.ts` checks:
  - `/en/dashboard/lists/` prerenders EN (the `<h1>` in the raw HTML), and a stored `fluent_lang='ru'` doesn't flip it.
  - With an empty `localStorage`, visiting `/en/` stores `en`; a stored `ru` is left alone.
  - After clicking a Header link on an `/en/` page, the destination starts with `/en/` where a twin exists, and the UI stays EN on a non-twin page when nothing was stored before.
  - The active pill shows on `/en/dashboard/lists/`.
  - The toggle goes RU ↔ EN twin.
  - An EN twin has a self-canonical and all three hreflang links; its RU twin lists the same set.
  - `/en/dashboard/articles/<slug-not-in-build>` loads the right article.
  - On `/en/dashboard/articles/`, every article link starts with `/en/`.
- [ ] 11. `backend/tests/test_sitemap_hreflang.py`:
  - Every `hreflang="en"` href is itself a `<loc>` whose entry links back to its RU twin.
  - Every entry has x-default.
  - There are no `/en/dashboard/phrases/<id>/` entries.
  - An article with an empty `body_en` gets no twin.
- [ ] 12. Build-output check inside `en-seo-routes.spec.ts` (reads files):
  - `out/en/dashboard/articles/<known-slug>/index.html` and `out/en/programs/<known-key>/index.html` exist.
  - They have an EN `<title>`, a self-canonical, hreflang and `<html lang="en"`.
- [ ] 13. `frontend/tests/plan48c-screenshots.spec.ts` — RU and EN × 1280 and 375, into `temp_files/screenshots/plan_48c_en-seo/`, for:
  - `/en/`, `/en/pricing/` (with `/api/billing/config` mocked to `{enabled:true}`)
  - `/en/dashboard/articles/<slug>`, `/en/programs/<key>`
  - one RU twin of each, showing it is unchanged

Rollout (manual)
- [ ] 14. Deploy, then **deploy a second time**: the build reads the live `/api/articles` through the cache (`documentation/articles-seo.md`). Check `/sitemap.xml` on prod. *(manual)*
- [ ] 15. Resubmit the sitemap in GSC and URL-inspect 3 `/en/` URLs via the `/seo` skill. Update the SEO memory note with a check-back date about 3 weeks out. *(manual)*

## Validation
- [ ] RU SEO unchanged: `cd frontend && npm run build && node scripts/seo-snapshot.mjs --diff ../temp_files/screenshots/plan_48c_en-seo/ru-seo-baseline.json`
- [ ] Routes: `cd frontend && npx playwright test tests/en-seo-routes.spec.ts --reporter=list`
- [ ] Backend: `cd backend && .venv/bin/python -m pytest -q`
- [ ] Types: `cd frontend && npx tsc --noEmit`
- [ ] Guard + parity: `cd frontend && npx playwright test tests/no-hardcoded-russian.spec.ts tests/design-system-parity.spec.ts --reporter=list`
- [ ] Screenshots: `cd frontend && npx playwright test tests/plan48c-screenshots.spec.ts --reporter=list`, then look at every shot *(looking is manual)*
- [ ] Full suite: no new failures vs `baseline-failures.txt`

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
