---
status: prototype
number: 56
---

# Plan 56 — "Where my effort goes" radar on the home page (static prototype)

## Goal
Under the leaderboard on the signed-in home page (`UserHome` in `frontend/app/LandingClient.tsx`,
right 420px column), show a radar chart of how the user's study effort is split across
**Слова / Фразы / Грамматика**, this week vs all time. Inspired by a user-supplied
radar screenshot (two filled layers + legend).

## Decisions (grilled 2026-09-28, one question at a time)
- **Layers:** this week vs all time.
- **Axes:** 3 — words, phrases, grammar (triangle). Practice was in the first draft and removed
  on user request (2026-09-28); shares are computed over these 3 sources only, so they no
  longer add up to the leaderboard score.
- **Scale:** each layer = share (%) of that period's points per axis, so the shapes compare.
- **Empty:** no points this week → only the all-time layer + «На этой неделе ещё не
  занимались»; no points at all → widget hidden.
- **Colors:** Fluent tokens, not the screenshot's purple (purple = phrases surface). This week
  `#0c7d54` (emerald-700), all time `#5cbf8f` — validated with the dataviz palette validator
  (light: all checks pass; contrast WARN on the light shade → values shown in a table under the
  chart + hover tooltips).

- **Radial scale:** square root (`r ∝ √share`), rings at 10/25/50/100% (labels on 25/50/100 only — 10 and 25 collide). A linear scale made
  the shape a spike: words are usually 60–80% of points, squashing the other axes.

## Data (for the real build, not the mock)
Points per source already exist in `backend/leaderboard_service.py`
(`build_leaderboard_score_joins`, all-time or week bounds): words 1/3, phrases 1/3,
grammar 5 per passed lesson, practice 5 per exam. A per-user breakdown endpoint would reuse it.

## Mock
`temp_files/prototypes/plan_56_effort-radar.html` — home page replica (streak card, leaderboard,
radar card under it), sample profiles via a prototype switcher: balanced, "grammar week"
(shape shifts), empty week, new user (widget hidden). RU/EN toggle. Radar in inline SVG,
hover tooltip per axis, legend, a one-line insight, and a compact table of the percentages.

## Definition of Done (prototype — reduced)
- [x] Renders at 1280px and 375px, RU + EN — screenshots
- [x] Each profile screenshotted at least once
- [x] Screenshots in `temp_files/screenshots/plan_56_effort-radar-prototype/`, looked at
- [x] Published as private artifact, link given to user
- Dropped for the prototype: backend endpoint, autotests, CHANGELOG, component library.
