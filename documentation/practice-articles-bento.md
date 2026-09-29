# Practice & Articles bento (#55)

Plan: `plans/improvements/active/plan_55-56_bento-effort-radar.md` (Part A). Precedent: #53
(`documentation/grammar-bento.md`). Code: `frontend/app/dashboard/components/BentoParts.tsx` (shared),
`PracticeOverview.tsx` + `app/dashboard/practice/page.tsx`, `app/dashboard/articles/ArticlesList.tsx`.

## Decisions

- **Shared pieces extracted, not copied.** Three pages now use hero → chips → bento → cards. The
  markup that is identical (hero shell, chips, stack cards, section heading, confirm dialog, error line,
  featured/grid class constants) lives in `BentoParts.tsx`; grammar was switched to it with identical
  output (its specs and #53 screenshots still pass). Page-specific cards stay per page.
- **Admin fields over derived grouping.** Test sections (`practice_test.section_ru/section_en`) and the
  final-exam flag (`is_final`) and article themes (`article.theme`) are admin-set columns, not parsed
  from titles/tags. Titles are free text in two languages and tags are mixed RU/EN; parsing would break
  on the next new test. `ARTICLE_THEMES` is one fixed backend constant (validated → 422); the frontend
  owns the RU/EN labels, unknown/null renders as «Другое».
- **Section card order = each card's last test.** The Constitution's «Итоговые тесты» holds the sample
  test (sort 0) and the numbers + final tests (sort 31–32). Ordering cards by their first test would put
  it first; by last test it sits at the end, as in the approved prototype. Inside a card, tests keep
  sort order and are labelled 1..n.
- **Server Premium.** `GET /practice/tests/{id}/exam` returns `403 {"detail": {"code": "premium_required"}}`
  and no questions for a premium test unless the user is admin or `quota.is_premium_active`. The
  category page shows its existing premium wall on that 403; the old client-side check stays only as
  UX (it avoids a round trip), never as the protection.
- **Guest read.** `GET /practice/categories` and `/practice/categories/{id}/tests` use optional auth:
  anonymous → published only, `enrolled=false`, all unlocked, `best_score_pct=null`. `/dashboard/practice`
  joined `PUBLIC_PREFIXES`; the prefix also matches `[id]` and `/programs`, which keep their own
  `router.replace('/login')` guards — guests never reach them because guest test buttons are disabled
  and «Добавить»/«Начать с Конституции» go to `/login`.
- **`?test=` direct start.** A test button opens `/dashboard/practice/{catId}?test={testId}`; the
  category page starts that test once its list loads (reading text first when present). Locked or
  unknown → stays on the list. «Назад» then goes to `/dashboard/practice`, not the old list. Chosen over
  a new route: the static export already serves `[id]`, and the exam/reading/result screens are reused
  as-is.
- **Articles SEO.** `useSearchParams` makes static export bail out to client rendering up to the nearest
  `<Suspense>`, so the exported HTML is the *fallback*. The fallback now renders the full «Все» bento
  from the build-time list (the old fallback was empty, and the only `/dashboard/articles/` link in the
  HTML was the nav link — the SEO spec passed on that). `seo-public-pages.spec.ts` now counts distinct
  article slugs in the HTML.
- **Fill script.** `backend/scripts/fill_practice_sections_article_themes.py` + data
  `backend/data/en_content/practice_sections_article_themes.json` (a flat list of rows with a `table`
  key, so the existing no-Cyrillic-in-`*_en` test can read it). Natural keys (test `title_ru`, article
  `slug`), fills only empty fields, one transaction, any unmatched key aborts before writing,
  `--dry-run` default. Constitution: 5 blocks «Блок N: статьи a–b» (5 lessons + review each),
  «Итоговые тесты» for the sample, numbers and final tests, `is_final` on «Baigiamasis egzaminas».
  Reading: no sections. Articles: the 30 listed articles, themes as in the prototype mock.

## Production gates (local backend shares the prod DB)

1. `alembic upgrade head` — revision `a1b2c3d4e5f7` (parent `c9d0e1f2a3b4`): three nullable/defaulted
   columns on `practice_test`, one on `article`. `is_final` is `NOT NULL` with `server_default false`, so
   the deployed code's inserts keep working. Must run **before** any backend with the new model starts
   (`_practice_meta` and `_load_article_index` select the new columns). Result: applied 2026-09-29, prod `c9d0e1f2a3b4 -> a1b2c3d4e5f7`.
2. Fill script `--dry-run`, then `--apply` only after an explicit yes; restart the local backend after
   (in-process cache, 10-min TTL backstop). Result: applied 2026-09-29 — section_ru 33, section_en 33, is_final 1, theme 30, kept 0.

## Known first-deploy effect

The static build fetches `/api/articles` from the backend that is live at build time. The first deploy
of this change builds against the *old* backend, so the pre-rendered HTML has no `theme` → every article
sits in «Другое» until the client-side refresh replaces the list (a second later), and in the HTML until
the next deploy.
