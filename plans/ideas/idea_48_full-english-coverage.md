---
number: 48
slug: full-english-coverage
status: confirmed
---

# Idea #48 — Full English coverage: UI strings, DB content, EN SEO

## Problem
English-mode users still see Russian all over the app. Found while checking issue #178 on
`/dashboard/practice/1` in EN: «Завершить», «Перейти к тесту», «для сдачи», «📄 Текст», and the
category description «Подготовка к гражданству и ПМЖ». A sweep then found the problem is app-wide:
- **Hardcoded UI strings:** 191 lines with Cyrillic in 37 `.tsx` files outside admin, plus 6 in
  admin. The worst are `dashboard/programs/new` (27), `programs` (26), `programs/[id]/edit` (24),
  `dashboard/lists` (18), `programs/custom/[token]` (17) and `practice/[id]` (12). Some of these
  lines are fine already: `lang === 'en' ? … : '…'` branches, comments, SEO metadata. Separating
  those out is part of the work.
- **DB content with no EN:** `practice_category.description_ru` has no EN column (1 row).
  `practice_test.description_ru` has an EN column, but 32 of 33 rows are empty (EN hides the
  field today). `grammar_case_rule.name_ru` has no EN column (18 rows), and neither has
  `verb.translation_ru` (358 rows). The legacy `constitution_question.question_ru` table has no
  EN column (41 rows).
- **Bad EN data:** category 2 «Чтение» has `name_en = 'Skaitymas'`. That is Lithuanian, not
  English.
- **SEO:** page titles and meta descriptions are RU only. The static export gives one language
  per URL, so the English-speaking audience gets no organic search traffic.

The people affected are English-speaking learners, a growing share as Fluent opens up to the
wider wearecommunity.io ecosystem.

## Desired outcome
With the UI switched to EN, no Russian shows anywhere: user pages, public pages or the admin
panel. Lithuanian learning content stays Lithuanian. English pages can rank in search without
hurting the RU pages' current rankings.

## Scope
- In:
  - Every hardcoded RU string in the frontend moves into the i18n dictionaries (`lib/i18n`), with
    RU and EN versions. That includes plural forms like «тест/теста/тестов пройдено».
  - The admin panel (`/dashboard/admin`) too.
  - DB content: add the missing `*_en` columns (with admin fields to edit them) and fill every row
    that has RU text but no EN. That covers `practice_category.description_en`,
    `practice_test.description_en`, `grammar_case_rule.name_en`, `verb.translation_en`, and the
    legacy constitution table if it is still shown anywhere.
  - Fix `practice_category` 2 `name_en` to «Reading».
  - EN SEO: English pages that search engines can index, added so that nothing already indexed
    in RU changes.
  - A guard test: it opens the main pages in EN and fails on Cyrillic outside allowed content, so
    the next hardcoded string gets caught.
- Out (non-goals):
  - Translating Lithuanian learning content (questions, words and phrases are shown in LT on
    purpose).
  - `practice_question.question_ru`. All 509 rows have `question_lt`, which is what the UI shows
    in both languages, so RU is only a fallback that is never used.
  - Languages beyond RU and EN.

## Decisions
- **Category description in EN** — add a `description_en` column; don't hide the text in EN.
- **Scope** — app-wide sweep, not just the practice pages.
- **Guard test** — a static source check that fails on Cyrillic or `'ru-RU'` in `.ts`/`.tsx` outside an allow-list, plus a small Playwright EN smoke on 2–3 screens. This replaced the earlier "Playwright spec across screens" after plan review (2026-09-24): it's cheaper and covers every file.
- **Admin panel** — included, translated like the rest.
- **DB content without EN** — translate all of it; don't hide it.
- **Who writes the EN content** — Claude translates every row; the user spot-checks a sample before
  it goes to prod.
- **SEO** — must not break the current RU SEO, but must add English organic traffic. How to do
  that is open (see below).
- **One idea, three plans** — #48 stays one idea, implemented as `plan_48a_en-ui-strings` → `plan_48b_en-db-content` → `plan_48c_en-seo`, each on its own branch and merged in order. 48c ships as a separate deploy after the 48b content is live in prod.
- **Prod migration timing** — the 48b migration runs on prod (with approval) at the start of 48b. The local DB is prod, and the columns are nullable and additive.

## Precedents
- `plans/improvements/implemented/IMPLEMENTED-plan_32_one-premium-offer.md` — shows the testing
  pattern: an English case plus 375px in both languages in one spec (`practice-premium-wall.spec.ts`).
- `plans/improvements/implemented/plan_37_seo-quick-wins.md` — RU per-page `layout.tsx` metadata
  and sitemap `<lastmod>`. That is the SEO setup the EN pages must not disturb. See also
  `documentation/seo.md` and the memory note that `PUBLIC_PREFIXES` must stay in sync with
  `robots.txt`.
- The existing pattern for DB content: `article`/`news_post` and `practice_test.title_*` already
  use paired `_ru`/`_en` columns, with the frontend picking `lang === 'en' ? x_en ?? x_ru : x_ru`.
  The new columns follow the same pattern.

## Success check
- The guard spec passes with the UI in EN on every top-nav page, the practice flow (category →
  intro → question → result → review), the programs pages, settings and admin. It must fail if a
  hardcoded RU string is added back.
- A DB query finds 0 rows with RU text and an empty EN counterpart across the tables in scope.
- RU pages keep the same URLs, titles and meta, checked against the current sitemap. EN pages show
  up in the sitemap with `hreflang` (or whatever mechanism the plan picks), and GSC starts
  reporting EN URLs.
- Screenshots in RU and EN, at desktop and 375px, for every surface touched.

## Open questions
- **EN SEO mechanism** (for feature-analyst): separate `/en/...` static routes with `hreflang`
  alternates, or something lighter? The constraints are the static export, one Render service, and
  the existing RU URLs staying unchanged. The plan should also say whether the EN SEO part should
  ship in a later phase than the UI and content work.
- Whether the legacy `constitution_question` table is still shown to anyone. If not, drop it from
  scope.
- How to phase the work into one plan, e.g. UI strings → DB content → SEO.
