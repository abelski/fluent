---
kind: feature
status: done
iteration: 3
max_iterations: 14
suggested_model: sonnet
suggested_effort: medium
confirmed_model: sonnet
confirmed_effort: medium
---

# #29 — Always show my own leaderboard score

## Context

A leaderboard already exists end-to-end: `backend/leaderboard_service.py` computes score
(words + phrases + grammar + practice points) via `LEADERBOARD_SCORE_EXPR` /
`build_leaderboard_score_joins()`, served by `GET /api/leaderboard`
(`backend/routers/words.py:1319-1369`), rendered by `frontend/components/Leaderboard.tsx` on the
landing page (`frontend/app/LandingClient.tsx`). It returns only the top 10. The widget detects
"is this me" by comparing the JWT's `picture` claim against each entry's picture and rings it —
but if the logged-in user isn't in the top 10, nothing tells them their own score at all.

User request: "I want to see how many points I have for now." Clarified with the user: smallest
change — extend the existing landing widget so it always shows the current user's rank + score
(even outside top 10), keep the week/all-time toggle as-is, no new page/route.

Rationale: mechanical extension of an existing, well-isolated pattern (reuse
`build_leaderboard_score_joins`, no new tables, one component) — sonnet/medium is enough.

## Goals

- Logged-in user always sees their own points for the selected period (week/all-time), whether or
  not they're in the top 10.
- If they have a rank (score > 0), show it; if score is 0, show 0 pts without a fake rank.

## Non-Goals

- No new dashboard page/route — landing widget only (per user's scope choice).
- No change to the admin leaderboard/reward endpoints (`admin.py` `leaderboard-top5`,
  `leaderboard-rewards/generate`) — separate consumer of the same shared SQL, untouched.
- No denormalized `points` column on `User` — score stays computed on the fly, matching the
  existing "single source of truth" rule in `leaderboard_service.py`'s docstring (issue #157).
- No caching of the per-user "my score" query — it's two cheap aggregate queries scoped to one
  user per page load, not a hot shared path like the top-10 list.

## Requirements

- `GET /api/leaderboard` response changes shape from a bare array to
  `{ entries: LeaderboardEntry[], me: { rank: number | null, score: number } }`.
  - `me.score` = current user's score for the selected period, via `LEADERBOARD_SCORE_EXPR` +
    `build_leaderboard_score_joins(bounds)` filtered to `u.id = current_user.id`.
  - `me.rank` = `null` when `me.score == 0` (not on the board); otherwise
    `COUNT(users with score > me.score) + 1`, reusing the same joins.
  - The existing cached top-10 `_load()` / `cache.get_or_load(...)` stays exactly as-is.
- `Leaderboard.tsx`: parse `{entries, me}` instead of a bare array.
  - If the current user's picture already matches a rendered entry (already in top 10), don't
    duplicate — the existing ring highlight is enough.
  - Otherwise render one extra line below the scroll row showing rank + score (or just score when
    `rank` is `null`), using the same avatar-ring visual language as top-10 entries.
- Add RU/EN i18n keys for the new line (`types.ts`, `ru.ts`, `en.ts`), following the existing
  `.replace('{n}', ...)` interpolation convention used elsewhere in the codebase (see e.g.
  `bulkDeleteSelected` in `en.ts`).

### Standing constraints

- All validation must be server-side (never frontend-only). N/A here — this is a read, no new
  user input to validate; auth is already enforced via `_require_user`.
- This touches markup/styling (`Leaderboard.tsx`): read
  `documentation/design system/Component Library (as-built).html` and
  `documentation/IMPLEMENTATION.md` first, use named tokens (never a raw Tailwind step), and run
  `frontend/tests/design-system-parity.spec.ts` after. Note: `Leaderboard.tsx` currently uses
  raw Tailwind grays (`text-gray-400`, `bg-gray-100`, etc.), not the `ink`/`muted`/`line` tokens —
  match the file's existing (pre-token) style rather than introducing a partial, inconsistent
  token migration in one component; this is a deliberate scoping call, not an oversight.
- Add autotest coverage for the new feature and run the relevant suite(s) as part of Validation.

## Implementation

- [x] 1. `backend/routers/words.py` (`get_leaderboard`, ~1319-1369) — add a `MeEntry` model
      (`rank: Optional[int]`, `score: int`) and a `LeaderboardResponse` model
      (`entries: list[LeaderboardEntry]`, `me: MeEntry`); change `response_model` accordingly.
      After building `rows` from the existing cached `_load()`, run two small queries reusing
      `joins_sql`/`params` from `build_leaderboard_score_joins(bounds)`: (a) current user's score
      (`WHERE u.id = :uid`), (b) count of users with strictly higher score (only if score > 0).
      Return `LeaderboardResponse(entries=[...], me=MeEntry(rank=..., score=...))`.
- [x] 2. `frontend/lib/i18n/types.ts` — add `leaderboardMe: string` (rank known) and
      `leaderboardMeNoRank: string` (score is 0) to the `landing` section, next to the existing
      `leaderboard*` keys (~line 788).
- [x] 3. `frontend/lib/i18n/ru.ts` / `frontend/lib/i18n/en.ts` — add matching copy, e.g.
      RU: `leaderboardMe: 'Ты: #{rank} · {score} очк.'`, `leaderboardMeNoRank: 'У тебя пока {score} очк.'`
      EN: `leaderboardMe: "You: #{rank} · {score} pts"`, `leaderboardMeNoRank: "You have {score} pts so far"`
- [x] 4. `frontend/components/Leaderboard.tsx` — update the fetch handler to read
      `{entries, me}` (state becomes `{entries: Entry[], me: {rank: number|null, score: number}}`
      or two separate state vars). After the existing `entries.map(...)` block, if no rendered
      entry has `isMe === true` and `me.score > 0` (i.e. genuinely absent from the visible list),
      render one extra row reusing the same avatar/ring markup, with the rank/score line built
      from the new i18n keys via `.replace('{rank}', ...).replace('{score}', ...)`. Keep the
      existing empty-state branch (`entries.length === 0`) but note it must not swallow the "me"
      row — check `me.score` independently of `entries.length`.
- [x] 5. `frontend/tests/leaderboard.spec.ts` — update `setupAuthPage`'s
      `page.route('**/api/leaderboard**', ...)` mock to return `{entries: [...], me: {...}}`
      instead of a bare array; adjust the 5 existing tests' fixtures accordingly (they currently
      pass `MOCK_LEADERBOARD` as the bare-array fulfill body).
- [x] 6. `frontend/tests/continue-session.spec.ts:136` and `frontend/tests/streak-calendar.spec.ts:22`
      — these mock `/api/leaderboard` with `{json: []}` only to keep the widget from erroring;
      update to `{json: {entries: [], me: {rank: null, score: 0}}}` so the new shape doesn't break
      the widget's parsing in those unrelated tests.
- [x] 7. Add 2-3 new test cases to `frontend/tests/leaderboard.spec.ts`: (a) user outside top 10
      sees their own "You: #N · S pts" line, (b) user with 0 score sees "You have 0 pts" with no
      rank, (c) user already in the rendered top 10 does NOT see a duplicate "me" row.
- [x] 8. Backend test: new `backend/tests/test_leaderboard_me.py` — hit `GET /api/leaderboard` for
      a user with 0 progress (expect `me.rank is None`, `me.score == 0`) and for a user with some
      `UserWordProgress` rows (expect `me.score > 0`, `me.rank` a positive int, consistent with
      their position if you also seed a couple of competing users).

## Validation

- [x] Backend unit: `cd backend && .venv/bin/python -m pytest tests/test_leaderboard_me.py -q`
- [x] Playwright: `cd frontend && npx playwright test leaderboard.spec.ts --reporter=list`
- [x] Regression: `cd frontend && npx playwright test continue-session.spec.ts streak-calendar.spec.ts --reporter=list`
- [ ] Smoke: log in locally with a low-progress test account, load `/`, confirm the "You: #N · S
      pts" (or "You have 0 pts") line appears below the top-10 row and updates when toggling
      week/all-time.
- [ ] Smoke: log in as a top-10 test account (or temporarily lower `LIMIT 10` locally), confirm no
      duplicate "me" row renders.
- [x] Design parity: `cd frontend && npx playwright test design-system-parity.spec.ts --reporter=list`
- [ ] News post written and published via /news-writer

## Definition of Done

```bash
cd backend && .venv/bin/python -m pytest -q
cd frontend && npx tsc --noEmit
cd frontend && npx playwright test --reporter=list
```
