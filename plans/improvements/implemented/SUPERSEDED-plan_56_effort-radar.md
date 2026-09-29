---
kind: feature
status: approved
iteration: 0
max_iterations: 30
suggested_model: sonnet
suggested_effort: high
confirmed_model: null
confirmed_effort: null
---

# Plan 56 — "Where your effort goes" radar on the home page


## Context

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

## Goals
- A «Куда уходят усилия» / "Where your effort goes" card under the leaderboard: 3-axis radar (Слова, Фразы,
  Грамматика), "this week" vs "all time" layers as share %, insight line, legend, tooltip, table, axis links.
- Correct empty states: no week points → all-time layer + note; no points → card hidden.
- RU + EN, desktop + 375px.

## Non-Goals
- Practice as an axis; time tracking; any change to the leaderboard formula or `leaderboard_service.py`
  behaviour; guest landing; folding into `/me/stats`; caching; metrics.
- Changing anything else on the home page.

## Requirements

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

## Implementation

- [ ] 1. `backend/routers/words.py` — `GET /me/effort` per Requirement 1 (import `build_leaderboard_score_joins`, `current_week_bounds` as `/leaderboard` does).
- [ ] 2. `backend/tests/test_effort.py` (new) — pattern of `test_leaderboard_me.py`, but the autouse wipe also deletes the test users' `UserPhraseProgress`, `GrammarLessonResult` and `PracticeExamResult` rows (shared SQLite engine, no FK enforcement — leftovers would pollute other suites). Dates relative to now: in-week rows `datetime.utcnow()`, before-week rows `current_week_bounds()[0] - timedelta(days=1)`. Cases: anonymous → 401; zero progress → all zeros; words known=3 / learning=1, phrases stage≥2 = 3 / stage 1 = 1 / stage 0 not counted, grammar passed=5 / failed=0; a `PracticeExamResult` changes no value; before-week rows count in `all` only; `all` sum equals `/api/leaderboard?period=all` `me.score` and `week` sum equals `/api/leaderboard?period=week` `me.score` for a user with no practice; not cached — add a row between two calls and the second call reflects it.
- [ ] 3. `frontend/lib/api.ts` — `EffortBreakdown` + `getEffort()`.
- [ ] 4. `frontend/tailwind.config.js` — `effort-all` token (week uses existing `emerald-700`; Requirement 3).
- [ ] 5. `frontend/lib/i18n/types.ts`, `ru.ts`, `en.ts` — `landing.effort*` keys.
- [ ] 6. `frontend/components/EffortRadar.tsx` (new) — Requirement 4.
- [ ] 7. `frontend/app/LandingClient.tsx` — place `<EffortRadar />` under `<Leaderboard />` (Requirement 5).
- [ ] 8. `frontend/tests/effort-radar.spec.ts` (new, mocked `/api/me/effort`, `/api/me/stats`, `/api/me/quota`, `/api/news**`, `/api/leaderboard**`, `/api/me/activity-calendar`, `/api/billing/config`) — one test per Proposed-spec scenario: card visible with 3 axis links (hrefs checked) and 2 legend items; shares in the table match the mock (e.g. 62/28/20 → 56/25/18%); insight "shift" vs "same" wording; week all-zero → note + one legend item + table without week column; all-zero → card absent; tooltip appears on hover and on keyboard focus with both values, and on tap at 375px; anonymous → card absent; 375px → card directly after the leaderboard in DOM order, `scrollWidth <= 375`, and every axis link's bounding box inside the card; EN copy.
- [ ] 9. `frontend/tests/plan56-screenshots.spec.ts` (new) — mocked API; saves to `temp_files/screenshots/plan_56_effort-radar/`: states `shift` and `empty-week` × RU/EN × 1280/375, plus `usual` and `no-points` (card absent) at RU 1280; asserts no horizontal overflow.
- [ ] 10. `documentation/design system/Component Library (as-built).html` — "Effort radar" entry (card, colours, sqrt scale, states); `documentation/IMPLEMENTATION.md` — token → `EffortRadar.tsx` mapping; `documentation/effort-radar.md` (new) — decisions: points not time (weights skew to words), practice excluded, sqrt scale and why, validated colours, one-round-trip UNION query, no caching, and why a separate `/me/effort` instead of folding into `/me/stats` (keeps `/me/stats` lean and its egress fix from #15 untouched; one extra request, fired in parallel with the others on the home page). (`specs/home.md` is written by `sdlc-spec-writer` at close-out — `sdlc-feature-analyst` Phase 6 step 0 is the gate; nothing moves to `implemented/` until it passes.)

## Validation

- [ ] Backend: `cd backend && .venv/bin/python -m pytest tests/test_effort.py -q`
- [ ] Backend full: `cd backend && .venv/bin/python -m pytest -q`
- [ ] Types: `cd frontend && npx tsc --noEmit`
- [ ] Static export builds: `cd frontend && npm run build`
- [ ] New spec: `cd frontend && npx playwright test tests/effort-radar.spec.ts --reporter=list`
- [ ] Home regressions: `cd frontend && npx playwright test tests/leaderboard.spec.ts tests/streak-calendar.spec.ts tests/continue-session.spec.ts --reporter=list`
- [ ] Parity: `cd frontend && npx playwright test tests/design-system-parity.spec.ts --reporter=list`
- [ ] Screenshots: `cd frontend && npx playwright test tests/plan56-screenshots.spec.ts --reporter=list`, then open every shot: RU and EN, 1280 and 375, labels not clipped, no overflow, one TAK on screen.
- [ ] Full suite: `cd frontend && npx playwright test --reporter=list`
- [ ] Manual: `/` logged in on the local server — card shows real numbers that match the leaderboard score minus practice; axis links work. (Run against `localhost:8000`, not `127.0.0.1` — the build bakes `localhost` and 127.0.0.1 causes CORS failures.)
- [ ] News post via /news-writer (after merge, if the user wants).

## Definition of Done

User-facing change — all three checks are required: **both languages (RU + EN)**, **mobile at 375px**,
**screenshots proving each** (in `temp_files/screenshots/plan_56_effort-radar/`, reviewed).

```bash
cd backend && .venv/bin/python -m pytest -q
cd frontend && npx tsc --noEmit
cd frontend && npm run build
cd frontend && npx playwright test tests/design-system-parity.spec.ts --reporter=list
cd frontend && npx playwright test tests/effort-radar.spec.ts tests/plan56-screenshots.spec.ts --reporter=list
cd frontend && npx playwright test --reporter=list
```

UAT section skipped: the states need a mocked API (local runs share the production DB, so real states
can't be set up safely by a black-box tester).

## Cold review (fixed / rejected)
Fixed: `label` token doesn't exist → `muted`/`faint` + the library's `#5b6067`; test wipe must cover phrase/
grammar/practice rows and use dates relative to now (the leaderboard test's fixed 2026-01-05 is outside the
week); week-sum parity with `/leaderboard?period=week`; a not-cached test; tap tooltip + label-inside-card check
at 375px; `/me/stats` fold decision recorded in the doc; `effort-week` dropped for the existing `emerald-700`;
placement uses the existing column div; line number 1407 and "live" wording corrected; screenshot set trimmed.
Rejected: a separate checkbox for `specs/home.md` — `sdlc-feature-analyst` Phase 6 step 0 already gates it
(nothing moves to `implemented/` until the spec-writer pass succeeds), same as #53.
