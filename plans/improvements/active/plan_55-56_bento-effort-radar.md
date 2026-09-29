---
kind: feature
status: done
iteration: 2
max_iterations: 30
suggested_model: opus
suggested_effort: high
confirmed_model: opus
confirmed_effort: high
---

# Plan 55+56 — Practice & Articles bento + home effort radar (one run)

Delivered together in one `sdlc-ralph-implement` run on branch **`feat/55-56-bento-effort-radar`**
(user decision, 2026-09-28). Part A = #55, Part B = #56. Each part keeps its own idea file and number;
one CHANGELOG row per number at close-out.

- Idea A: `plans/ideas/idea_55_practice-articles-bento.md` (confirmed) — prototype `temp_files/prototypes/plan_55_practice-articles-bento.html`
- Idea B: `plans/ideas/idea_56_effort-radar.md` (confirmed) — prototype `temp_files/prototypes/plan_56_effort-radar.html`
- Part B was approved on its own as `plan_56_effort-radar.md` (now `plans/improvements/implemented/SUPERSEDED-plan_56_effort-radar.md`) (cold-reviewed); it is copied here unchanged apart
  from heading levels and `B`-numbered items.

Model/effort: opus/high — Part A has 3 additive migrations applied to the **production** DB (local runs share it),
a server-side Premium check, and a large UI rewrite; Part B is small.

## ⚠ Production gates (the implementer must STOP and ask the user)
Local backend and prod share one Neon database. Following #48b:
1. `alembic upgrade head` for A2 — **ask the user first**. Before it: `alembic heads` (expect one head) and
   `alembic current` against prod (must be the new revision's parent). New columns are additive; `is_final` is
   NOT NULL with `server_default=sa.false()` so existing rows and the deployed code's inserts keep working.
   A2 must run before the local backend loads the new model (`_practice_meta` selects every column and would
   crash on missing ones). Render never runs alembic — this gate is the only path. Never run a downgrade.
2. `backend/scripts/fill_practice_sections_article_themes.py --apply` for A7 — run `--dry-run` first, show the
   user its report, and **apply only after an explicit yes**. Restart the local backend afterwards (the
   in-process cache only sees its own writes; 10-min TTL backstop).
3. No manual step writes to prod beyond these two: manual checks that would change content or results
   (admin edits, finishing a test) are proven by mocked Playwright tests and pytest instead.
Everything else is local code and mocked-API tests.

# Part A — #55 Practice & Articles in the bento layout

## A. Context
Precedent: #53 (`plans/improvements/implemented/IMPLEMENTED-plan_53_grammar-bento.md`,
`documentation/grammar-bento.md`, `frontend/app/dashboard/components/GrammarOverview.tsx`,
`frontend/tests/helpers/grammarBento.ts`, `frontend/tests/grammar-bento.spec.ts`).

Current code:
- `frontend/app/dashboard/practice/page.tsx` — `ProgressStatCard` + 2-col category cards from
  `GET /api/me/practice-categories`; guests `router.replace('/login')`. `frontend/app/dashboard/layout.tsx`
  `PUBLIC_PREFIXES` lacks `/dashboard/practice`, so guests are also bounced to `/` there.
- `frontend/app/dashboard/practice/[id]/page.tsx` — category page: tests list → reading (`lesson_text_lt`) →
  questions → result; id via `resolvePracticeId(_id)`; premium wall only client-side (`test.is_premium &&
  !isPremiumUser`, line ~253, testid `practice-premium-wall`).
- `backend/routers/practice.py` — `GET /practice/categories` and `GET /practice/categories/{id}/tests`
  both `_require_user`; `GET /practice/tests/{id}/exam` never checks `is_premium`
  (`specs/practice.md` "premium gating … enforced only by the frontend"). Admin `TestIn`/`TestUpdate`
  (~line 657/702). `_practice_meta` cache (#24) and `_TEST_COLUMNS` from the model (new columns flow into the
  exam cache automatically).
- Premium helper: `quota.is_premium_active` (used by `routers/grammar.py:_lock_bypassed`).
- `frontend/app/dashboard/articles/page.tsx` (server, build-time fetch of `/api/articles`) →
  `ArticlesList.tsx` (client, `?category=` filter, segmented pill + 3-col grid). `Article` model has `tags`
  (mixed RU/EN) and `category`; admin create/update is `ArticleBody` via `POST`/`PUT /admin/articles/{slug}`
  (PUT is a **full replace**).
- Admin UI: practice test form in `frontend/app/dashboard/admin/page.tsx` (~line 1400, `editingTest`);
  article editor `frontend/app/dashboard/admin/articles/[slug]/edit/page.tsx`.
- Migrations: `backend/migrations/versions/` (Alembic; check `alembic heads` for the current head).

## A. Goals
- Practice: hero (N из M тестов сдано, bar, «Продолжить», static sample question, TAK «Pasirinkime!») → category
  chips (dot on enrolled, «Все программы ›») → bento (featured next test / category preview; stack = other
  categories + «Итоговый экзамен» card) → section cards with test buttons that open the test directly.
  Guests see the preview; «Добавить»/«Начать с Конституции» → `/login`.
- Premium enforced by the server on the exam endpoint.
- Articles: hero (count, «Читать новую», popular-themes card, TAK «Paskaitykime!») → category chips → bento
  (newest + next 3) → theme cards; still build-time rendered for SEO.
- Admin can set a test's section (RU/EN) and «итоговый» flag, and an article's theme.
- RU + EN, desktop + 375px, same look as #53.

## A. Non-Goals
- Reading tracking; `/dashboard/practice/programs`; restyling the exam/reading/result screens; the category
  page's own list (kept for old links); Слова and Фразы pages; metrics; sitemap/robots changes.

## A. Requirements
1. **Migration** (one Alembic revision): `practice_test.section_ru VARCHAR(120) NULL`,
   `practice_test.section_en VARCHAR(120) NULL`, `practice_test.is_final BOOLEAN NOT NULL` with `server_default=sa.false()`,
   `article.theme VARCHAR(20) NULL`. Model fields added in `backend/models.py`.
2. **Themes** fixed list in one backend constant `ARTICLE_THEMES = ("verbs","numbers","cases","words","life","start")`;
   `ArticleBody.theme: Optional[str] = None` validated against it (422 otherwise). Because `PUT` is a full
   replace, the admin editor must always send the current `theme` (load it, show a select incl. "—", send it
   back). `GET /articles` (and the build-time list) returns `theme` — add `Article.theme` to the explicit column list in
   `_load_article_index` (`articles.py:44-66`); `GET /admin/articles/{slug}` returns it too, or the editor can't
   load it and every PUT wipes it. Frontend labels RU/EN per key;
   unknown/None → «Другое».
3. **Practice test fields**: `section_ru/section_en` (strip; empty → None; max 120, 422 over) and `is_final`
   on `TestIn`/`TestUpdate`, returned by `/practice/categories/{id}/tests` and the admin list. Admin form gets
   two text inputs + a checkbox. Update only fields present in `model_fields_set` (the #48b rule).
4. **Anonymous read**: `GET /practice/categories` and `GET /practice/categories/{id}/tests` use
   `_try_get_user`-style optional auth: anonymous → published only, `enrolled=false`, tests all unlocked,
   `best_score_pct=null`; authenticated behaviour unchanged. `/me/*` and exam/result endpoints stay auth-only.
5. **Server Premium**: `GET /practice/tests/{id}/exam` → `HTTPException(403, detail={"code": "premium_required"})`
   (repo convention, `grammar.py:326`) and no questions, when `test.is_premium` and the user is neither admin nor `is_premium_active`. The category page shows its
   existing premium wall on 403 (no client-only gate left as the only protection).
6. **Direct start**: `/dashboard/practice/{id}?test={testId}` — the category page, once tests load, finds the
   test and calls its existing `startTest` (reading first if `lesson_text_lt`); locked/unknown test → stays on
   the list. Back from the result goes to `/dashboard/practice` when the page was opened with `?test=`.
7. **Practice page** (`frontend/app/dashboard/practice/page.tsx`) in the #53 layout, states none / some / all /
   guest, built from `GET /practice/categories` + per-category `/tests`. Reuse #53 pieces: extract the shared
   presentational bits (hero shell, chips, featured card shell, stack card, confirm dialog, error line) from
   `GrammarOverview.tsx` into `frontend/app/dashboard/components/BentoParts.tsx` and use them from grammar,
   practice and articles; grammar output must not change (its specs + screenshots prove it).
   - Chips: «Все» selected by default; a category chip switches the featured card and the sections to that
     category (same as grammar #53).
   - Next test = first unlocked, not-passed test (sort order) in the first enrolled category; passed =
     `best_score_pct >= pass_threshold`. The hero «Продолжить ›» opens that test via
     `/dashboard/practice/{catId}?test={testId}`.
   - Nothing left to continue → the featured card previews a category the user isn't enrolled in (with
     «Добавить»), or shows a completion summary when every category is enrolled; hero «Продолжить» hidden.
   - None enrolled or guest → section cards are a "what's inside" preview: test buttons **disabled**, no scores.
   - Featured heading (**deliberate change vs the idea's "LT title" wording**; record it in the idea's Proposed spec at close-out) = the test title in the UI language (`lang==='en' ? title_en ?? title_ru : title_ru`,
     same rule as the category page); sub-heading = the other title when it differs (in the DB, Constitution
     `title_ru` is Lithuanian and Reading `title_en` is Lithuanian — show both, invent nothing); meta = question
     count · pass mark · best score.
   - Section cards: group tests by `section_ru` (RU/EN label, RU fallback) in sort order; a test without a
     section is its own card. Test buttons: number in section (or short title), ✓ / % / lock / «Premium»,
     `min-h-11` at <860px, `data-testid="practice-test-button"`.
   - Stack: other categories (progress or «Добавить») + «Итоговый экзамен» card for the `is_final` test of an
     enrolled category.
   - «Убрать» next to the sections heading with the confirm dialog → `DELETE /me/practice-categories/{id}`
     (404 when not enrolled — handle as success-no-op in UI).
   - Static sample question (Vilnius ✓, hidden <860px) + TAK «Pasirinkime!»; one mascot on screen.
8. **Guest access**: add `/dashboard/practice` to `PUBLIC_PREFIXES` so the practice page renders for guests;
   the page drops its own `router.replace('/login')`. `/dashboard/practice/[id]` and `/programs` keep their own
   auth guards (the prefix also matches them) — guests never reach them because guest test buttons are
   disabled and «Добавить» goes to `/login`.
9. **Articles page**: `ArticlesList.tsx` in the #53 layout — hero (total, learning-materials count,
   «Читать новую ›» to the newest, popular-themes card → scrolls to theme card, hidden <860px), category chips
   with counts (same `?category=` URL behaviour), featured newest + stack of next 3, theme cards (fixed order,
   «Другое» last). Everything rendered from `initialArticles` first (SEO), then refreshed.
10. **Fill script** `backend/scripts/fill_practice_sections_article_themes.py`: data in
    `backend/data/en_content/practice_sections_article_themes.json` keyed by natural keys (test `title_ru`,
    article `slug`), fills only empty fields, one transaction, aborts on any unmatched key, `--dry-run`
    (default) prints a report, `--apply` writes. Constitution: 5 blocks «Блок N: статьи a–b» / "Block N:
    articles a–b" (5 lessons + review each), «Итоговые тесты» for sample/numbers/final, `is_final` on
    «Baigiamasis egzaminas». Reading: no sections. Articles: themes as in the prototype mock.
11. **i18n** RU/EN for all new strings (practice + articles + admin labels).

### Standing constraints
- All validation must be server-side (never frontend-only) — Premium (Req 5), section length and theme (Req 2–3) are server-side.
- Read `documentation/design system/Component Library (as-built).html` and `documentation/IMPLEMENTATION.md` first; named tokens only; run `frontend/tests/design-system-parity.spec.ts` (practice + articles are in its `NAV_PAGES`).
- Add autotest coverage and run the suites as part of Validation.

## A. Implementation
- [x] A1. `backend/models.py` + new Alembic revision in `backend/migrations/versions/` — Requirement 1.
- [x] A2. **Production gate 1** — ask the user, then `cd backend && .venv/bin/alembic upgrade head`; record the result here. — **Done 2026-09-29** on user request: prod `c9d0e1f2a3b4 -> a1b2c3d4e5f7`.
- [x] A3. `backend/routers/articles.py` — `ARTICLE_THEMES`, `theme` on `ArticleBody` (validated) and in list/detail responses.
- [x] A4. `backend/routers/practice.py` — Req 3 (fields), Req 4 (anonymous read), Req 5 (403 premium).
- [x] A5. `backend/tests/test_practice_bento.py` (new) — anonymous categories/tests (published only, unlocked, no scores); authenticated unchanged (lock rule); section/is_final returned; admin PATCH sets/clears section and is_final, section >120 → 422, PATCH without section keeps it; exam 403 for free user on premium test, 200 for premium and admin; exam 403 returns no `questions`. Wipe all rows the tests create. Article theme tests go into the existing `backend/tests/test_articles.py`: valid → saved, invalid → 422, `PUT` without `theme` sets None (full-replace, documented — the editor always sends it), `GET /articles` and `GET /admin/articles/{slug}` include theme.
- [x] A6. `backend/scripts/fill_practice_sections_article_themes.py` + data JSON — Requirement 10; test `backend/tests/test_fill_sections_themes.py` (dry-run changes nothing, unmatched key aborts, fills only empty fields).
- [x] A7. **Production gate 2** — run `--dry-run`, show the report to the user, `--apply` only after a yes; record counts here. — **Done 2026-09-29** after user OK: section_ru 33, section_en 33, is_final 1, theme 30, kept 0.
- [x] A8. `frontend/app/dashboard/components/BentoParts.tsx` (new) extracted from `GrammarOverview.tsx`; grammar switched to it with identical output.
- [x] A9. `frontend/lib/api.ts` — practice types gain `section_ru/section_en/is_final`; `ArticleSummary` gains `theme`.
- [x] A10. `frontend/app/dashboard/layout.tsx` — `/dashboard/practice` in `PUBLIC_PREFIXES`.
- [x] A11. `frontend/app/dashboard/practice/page.tsx` (data + state) + `frontend/app/dashboard/components/PracticeOverview.tsx` (presentational, like `GrammarOverview.tsx`) — Requirement 7.
- [x] A12. `frontend/app/dashboard/practice/[id]/page.tsx` — `?test=` direct start, back target, 403 → premium wall.
- [x] A13. `frontend/app/dashboard/articles/ArticlesList.tsx` — Requirement 9.
- [x] A14. Admin: `frontend/app/dashboard/admin/page.tsx` test form (section RU/EN, is_final); `frontend/app/dashboard/admin/articles/[slug]/edit/page.tsx` theme select (always sends current theme).
- [x] A15. i18n `types.ts`/`ru.ts`/`en.ts` — Requirement 11.
- [x] A16. Migrate existing specs that relied on old practice/articles markup (grep `frontend/tests` for `stats-card-practice`, practice card links, article category pill, `practice-premium-wall`); known: `seo-public-pages.spec.ts:14` (move `/dashboard/practice` out of `PRIVATE_PAGES`), `design-system-parity.spec.ts:63` (practice `needsAuth: false`), `practice-enrollment.spec.ts:117-120` (old category cards). Behaviour assertions stay.
- [x] A17. `frontend/tests/practice-bento.spec.ts` + `frontend/tests/articles-bento.spec.ts` (new, mocked API incl. `/api/billing/config`, helper in `frontend/tests/helpers/`) — one test per Proposed-spec scenario in idea #55 (practice onboarding + guest → /login, featured next test, section cards + button states + `?test=` navigation, final exam card, «Убрать» confirm → DELETE, exam 403 → premium wall; hero «Продолжить» → `?test=` URL, nothing-left preview/summary, disabled buttons in preview, chip selection; articles layout, chips filter via `?category=`, theme cards incl. «Другое», popular-themes scroll); 44px buttons at 375px; EN copy. SEO: extend `seo-public-pages.spec.ts` (article links in the built HTML) instead of a copy.
- [x] A18. `frontend/tests/plan55-screenshots.spec.ts` — `temp_files/screenshots/plan_55-56_bento-effort-radar/practice-articles/`: practice none/some/all/guest/nothing-left, enroll-error line, premium wall after 403, `?test=` reading view; articles all/one category/with «Другое»; admin section+final inputs and theme select (1280 RU/EN only) — × RU/EN × 1280/375; no horizontal overflow.
- [x] A19. Docs: component library (bento now shared by 3 pages — update the deviation row; practice/articles specifics), `documentation/IMPLEMENTATION.md`, `documentation/practice-articles-bento.md` (decisions: admin fields over derived grouping, server Premium, guest read, `?test=` start, fill script; the two production gates and their results; first deploy after this ships build-time article HTML without `theme` (build fetches the old live backend) — all in «Другое» until the client refresh / next deploy). (`specs/practice.md`, `specs/articles.md` via `sdlc-spec-writer` at close-out.)

# Part B — #56 effort radar (approved separately; unchanged)

### Context

Idea: `plans/ideas/idea_56_effort-radar.md` (confirmed). Prototype:
`temp_files/prototypes/plan_56_effort-radar.html` (artifact https://claude.ai/artifact/SjvD7F9yyyrrk4PTZwJzmM),
prototype plan `plans/improvements/active/plan_56_effort-radar-prototype.md`.

The signed-in home page (`UserHome` in `frontend/app/LandingClient.tsx:246`) shows a streak card and, in a
420px right column (`lg:w-[420px]`, line 308), `<Leaderboard />` (`frontend/components/Leaderboard.tsx`, which
fetches `/api/leaderboard` itself and renders only with a token). Below them: «Продолжить занятие», news, Premium.
On mobile the flex row stacks, so anything placed in the right column directly under `<Leaderboard />` is also
directly under it on mobile (the idea's placement decision) and before «Продолжить занятие».

Points per source already exist: `backend/leaderboard_service.py` — `build_leaderboard_score_joins(bounds)`
returns LEFT JOINs aliased `w` (words), `p` (phrases), `g` (grammar), `x` (practice) with a `pts` column each;
`current_week_bounds()` is the in-progress Mon–Sun UTC week the leaderboard widget uses. `get_leaderboard`
(`backend/routers/words.py:1407`) already computes one user's `me` score with `WHERE u.id = :uid` over those
joins, live (its top-10 is cached 60s; the per-user part is not). `/me/effort` reuses exactly that, selecting the three columns instead of the sum.

Tests: backend `backend/tests/test_leaderboard_me.py` shows the fixture pattern (shared SQLite `_test_engine`,
`make_token`, autouse cleanup by user id). Frontend `frontend/tests/leaderboard.spec.ts` shows the home-page
mocking pattern (`/api/me/stats`, `/api/me/quota`, `/api/news**`, `/api/leaderboard**`).

Model/effort: sonnet/high — one patterned endpoint and one self-contained SVG component; no auth/DB/migration
risk, but the chart geometry and states need care.

### Goals
- A «Куда уходят усилия» / "Where your effort goes" card under the leaderboard: 3-axis radar (Слова, Фразы,
  Грамматика), "this week" vs "all time" layers as share %, insight line, legend, tooltip, table, axis links.
- Correct empty states: no week points → all-time layer + note; no points → card hidden.
- RU + EN, desktop + 375px.

### Non-Goals
- Practice as an axis; time tracking; any change to the leaderboard formula or `leaderboard_service.py`
  behaviour; guest landing; folding into `/me/stats`; caching; metrics.
- Changing anything else on the home page.

### Requirements

1. **`GET /api/me/effort`** (in `backend/routers/words.py`, next to `/leaderboard`): `_require_user` (401 for
   anonymous). One `session.execute` round trip: a `UNION ALL` of two selects over
   `build_leaderboard_score_joins(current_week_bounds())` and `build_leaderboard_score_joins(None)`, each
   `SELECT '<period>' AS period, COALESCE(w.pts,0), COALESCE(p.pts,0), COALESCE(g.pts,0) FROM "user" u {joins}
   WHERE u.id = :uid` (params merged; the all-time fragment has none). Response
   `{"week": {"words": int, "phrases": int, "grammar": int}, "all": {...}}`. Practice (`x`) not selected.
   Never cached (progress, now-relative — CLAUDE.md caching rule). Pydantic response model.
2. **`frontend/lib/api.ts`**: `EffortBreakdown` type + `getEffort()` (token header, throws on !ok), next to the
   other `/me/*` helpers.
3. **Color token** in `frontend/tailwind.config.js`: the week layer uses the existing `emerald-700`
   (`#0c7d54`); add only `effort-all: '#5cbf8f'`, with a comment that the pair was validated by the dataviz
   palette validator (light surface; contrast WARN on `effort-all` → values also shown as text). The SVG reads
   them via `fill-*`/`stroke-*` classes or hex constants defined once — no raw hex repeated in markup.
4. **`frontend/components/EffortRadar.tsx`** (client component, like `Leaderboard.tsx`): fetches `getEffort()`
   when a token exists; renders nothing without a token, while loading, on error, or when all-time points are
   all zero. Card: `bg-white rounded-[14px] border border-line p-5` (flat, like the leaderboard),
   `data-testid="effort-radar"`.
   - Title: small uppercase label style used by the leaderboard title.
   - Shares: `round(v / sum * 100)` per layer; a layer with sum 0 is "empty".
   - Insight line (`data-testid="effort-insight"`): week empty → `allOnly(top all)`; top(week) == top(all) →
     `same(top, pct)`; else `shift(topWeek, pct, topAll, pct)`. Section names bold.
   - Week empty → note (`data-testid="effort-empty-week"`) and only the all-time layer + legend item.
   - SVG radar, viewBox as in the prototype: 3 axes starting at top, R = 110, **square-root radius**
     `r = R·√(share/100)`, grid rings at 10/25/50/100 with labels on 25/50/100 only, axis spokes, all-time polygon
     (fill 28% + 2px stroke) under week polygon (fill 22% + 2px stroke), 4.5px markers with 2px white ring.
     Grid/labels use `line`/`faint`/`muted` tokens (and `#5b6067` for axis labels, the library's small-caps label colour), never the series colour.
   - Axis labels are `<a>` links: Слова → `/dashboard/lists`, Фразы → `/dashboard/phrases`, Грамматика →
     `/dashboard/grammar`.
   - Tooltip on hover **and keyboard focus** of each axis sector (invisible wedge with `tabIndex=0`,
     `aria-label`): section, week % · points, all-time % · points.
   - Legend (both layers, or all-time only), then a table (`data-testid="effort-table"`): section (linked) ·
     week % · pts · all-time % · pts. `font-variant-numeric: tabular-nums`.
   - `role="img"` + `aria-label` summary on the SVG; `prefers-reduced-motion` respected (no animation needed).
5. **Placement**: in `UserHome`, add `<EffortRadar />` right after `<Leaderboard />` inside the existing right
   column div (`LandingClient.tsx:308`; Leaderboard already has `mb-4`). Nothing else on the page changes.
6. **i18n** `tr.landing.effort*` in `ru.ts` / `en.ts` / `types.ts`: title, week, all, axis names, table header,
   points unit, emptyWeek note, and the three insight templates with `{a}/{p}/{b}/{q}` placeholders (copy from the
   prototype, RU + EN).

### Standing constraints
- All validation must be server-side (never frontend-only). The endpoint derives the user from the JWT; no client-supplied ids.
- Read `documentation/design system/Component Library (as-built).html` and `documentation/IMPLEMENTATION.md` first; named tokens only; run `frontend/tests/design-system-parity.spec.ts`.
- Add autotest coverage and run the suites as part of Validation.

### Implementation

- [x] B1. `backend/routers/words.py` — `GET /me/effort` per Requirement 1 (import `build_leaderboard_score_joins`, `current_week_bounds` as `/leaderboard` does).
- [x] B2. `backend/tests/test_effort.py` (new) — pattern of `test_leaderboard_me.py`, but the autouse wipe also deletes the test users' `UserPhraseProgress`, `GrammarLessonResult` and `PracticeExamResult` rows (shared SQLite engine, no FK enforcement — leftovers would pollute other suites). Dates relative to now: in-week rows `datetime.utcnow()`, before-week rows `current_week_bounds()[0] - timedelta(days=1)`. Cases: anonymous → 401; zero progress → all zeros; words known=3 / learning=1, phrases stage≥2 = 3 / stage 1 = 1 / stage 0 not counted, grammar passed=5 / failed=0; a `PracticeExamResult` changes no value; before-week rows count in `all` only; `all` sum equals `/api/leaderboard?period=all` `me.score` and `week` sum equals `/api/leaderboard?period=week` `me.score` for a user with no practice; not cached — add a row between two calls and the second call reflects it.
- [x] B3. `frontend/lib/api.ts` — `EffortBreakdown` + `getEffort()`.
- [x] B4. `frontend/tailwind.config.js` — `effort-all` token (week uses existing `emerald-700`; Requirement 3).
- [x] B5. `frontend/lib/i18n/types.ts`, `ru.ts`, `en.ts` — `landing.effort*` keys.
- [x] B6. `frontend/components/EffortRadar.tsx` (new) — Requirement 4.
- [x] B7. `frontend/app/LandingClient.tsx` — place `<EffortRadar />` under `<Leaderboard />` (Requirement 5).
- [x] B8. `frontend/tests/effort-radar.spec.ts` (new, mocked `/api/me/effort`, `/api/me/stats`, `/api/me/quota`, `/api/news**`, `/api/leaderboard**`, `/api/me/activity-calendar`, `/api/billing/config`) — one test per Proposed-spec scenario: card visible with 3 axis links (hrefs checked) and 2 legend items; shares in the table match the mock (e.g. 62/28/20 → 56/25/18%); insight "shift" vs "same" wording; week all-zero → note + one legend item + table without week column; all-zero → card absent; tooltip appears on hover and on keyboard focus with both values, and on tap at 375px; anonymous → card absent; 375px → card directly after the leaderboard in DOM order, `scrollWidth <= 375`, and every axis link's bounding box inside the card; EN copy.
- [x] B9. `frontend/tests/plan56-screenshots.spec.ts` (new) — mocked API; saves to `temp_files/screenshots/plan_55-56_bento-effort-radar/effort-radar/`: states `shift` and `empty-week` × RU/EN × 1280/375, plus `usual` and `no-points` (card absent) at RU 1280; asserts no horizontal overflow.
- [x] B10. `documentation/design system/Component Library (as-built).html` — "Effort radar" entry (card, colours, sqrt scale, states); `documentation/IMPLEMENTATION.md` — token → `EffortRadar.tsx` mapping; `documentation/effort-radar.md` (new) — decisions: points not time (weights skew to words), practice excluded, sqrt scale and why, validated colours, one-round-trip UNION query, no caching, and why a separate `/me/effort` instead of folding into `/me/stats` (keeps `/me/stats` lean and its egress fix from #15 untouched; one extra request, fired in parallel with the others on the home page). (`specs/home.md` is written by `sdlc-spec-writer` at close-out — `sdlc-feature-analyst` Phase 6 step 0 is the gate; nothing moves to `implemented/` until it passes.)


# Shared Validation (A + B)

- [x] Backend new tests: `cd backend && .venv/bin/python -m pytest tests/test_practice_bento.py tests/test_articles.py tests/test_fill_sections_themes.py tests/test_effort.py -q`
- [x] Backend full: `cd backend && .venv/bin/python -m pytest -q`
- [x] Types: `cd frontend && npx tsc --noEmit`
- [x] Static export builds (articles list still embedded at build time): `cd frontend && npm run build`
- [x] New specs: `cd frontend && npx playwright test tests/practice-bento.spec.ts tests/articles-bento.spec.ts tests/effort-radar.spec.ts --reporter=list`
- [x] Grammar unchanged after extraction: `cd frontend && npx playwright test tests/grammar-bento.spec.ts tests/plan53-screenshots.spec.ts --reporter=list`
- [x] Home regressions: `cd frontend && npx playwright test tests/leaderboard.spec.ts tests/streak-calendar.spec.ts tests/continue-session.spec.ts --reporter=list`
- [x] Parity: `cd frontend && npx playwright test tests/design-system-parity.spec.ts --reporter=list`
- [x] Screenshots: `cd frontend && npx playwright test tests/plan55-screenshots.spec.ts tests/plan56-screenshots.spec.ts --reporter=list`, then open every shot: RU and EN, 1280 and 375, nothing clipped, no overflow, one TAK per screen.
- [x] Full suite: `cd frontend && npx playwright test --reporter=list` (against `localhost:8000`, not `127.0.0.1` — the build bakes `localhost`; 127.0.0.1 causes CORS failures)
- [x] Manual (read-only against prod): practice logged out (preview, «Добавить» → /login) and logged in (open a test from a section button — do not finish it); articles page and a theme card link; home effort card numbers = leaderboard score minus practice; admin forms show the filled section/final/theme values. Writes (finishing a test, admin edits, the 403 on a real premium test) are covered by mocked tests and pytest. — user confirmed locally 2026-09-29.
- [ ] News post via /news-writer (after merge, if the user wants).

## Definition of Done

User-facing change — all three checks are required for both parts: **both languages (RU + EN)**,
**mobile at 375px**, **screenshots proving each** (in `temp_files/screenshots/plan_55-56_bento-effort-radar/practice-articles/`
and `temp_files/screenshots/plan_55-56_bento-effort-radar/effort-radar/`, reviewed). Both production gates (A2, A7) done with the
user's explicit OK and recorded.

```bash
cd backend && .venv/bin/python -m pytest -q
cd frontend && npx tsc --noEmit
cd frontend && npm run build
cd frontend && npx playwright test tests/design-system-parity.spec.ts --reporter=list
cd frontend && npx playwright test tests/practice-bento.spec.ts tests/articles-bento.spec.ts tests/effort-radar.spec.ts tests/plan55-screenshots.spec.ts tests/plan56-screenshots.spec.ts --reporter=list
cd frontend && npx playwright test --reporter=list
```

UAT skipped: states need a mocked API (local runs share the production DB).

## Cold review of the combined plan (fixed / rejected)
Fixed: featured fallback, hero «Продолжить» `?test=`, disabled preview buttons, chip selection added to Req 7 +
tests; featured-heading change vs the idea flagged; Req 8 no longer claims guests see `[id]`; A16 names
`seo-public-pages`, parity `needsAuth`, `practice-enrollment`; 403 uses `detail={"code": ...}`; theme added to
`_load_article_index` and admin get; theme tests in `test_articles.py`; fill-script test named and in Validation;
screenshot states (error, premium wall, `?test=` reading, «Другое», admin) and one plan-named folder; SEO test
extends the existing spec; `PracticeOverview` decided up front; `is_final` `server_default`; prod `alembic
heads/current` check and ordering; restart after `--apply`; manual checks no longer write to prod; stale
build-time article HTML documented.
Rejected: none.

## Review
- [x] Code review passed (round 3; round 2 fixed a shadowed `select`, round 3 re-checked the plan48b spec mock fix from validation)
- note: `ARTICLE_THEMES` is duplicated in `frontend/app/dashboard/articles/types.ts` and `backend/routers/articles.py`; no parity test between them.
