---
number: 56
slug: effort-radar
status: confirmed
---

# Idea #56 — "Where your effort goes" radar on the home page

## Problem
A signed-in learner sees a streak and a leaderboard score on the home page, but not *what* the
score is made of. Most people drift into studying only words (the easiest, most rewarded
activity) and never notice that phrases and grammar are falling behind. The user wants a chart
that shows the split at a glance, like a radar/spider chart they supplied as a reference.

A static prototype was built and iterated first: `temp_files/prototypes/plan_56_effort-radar.html`
(artifact https://claude.ai/artifact/SjvD7F9yyyrrk4PTZwJzmM), plan
`plans/improvements/active/plan_56_effort-radar-prototype.md`.

## Desired outcome
Under the leaderboard on the signed-in home page (`UserHome` in `frontend/app/LandingClient.tsx`,
right 420px column on desktop; directly under the leaderboard on mobile too) a card
«Куда уходят усилия» / "Where your effort goes":
- a radar with 3 axes — Слова, Фразы, Грамматика — and two layers: **this week** (dark,
  `#0c7d54` = emerald-700) and **all time** (light, `#5cbf8f`), each the share (%) of that
  period's points per axis; square-root radial scale, rings at 10/25/50/100%;
- a one-line insight above it ("На этой неделе больше всего — Грамматика (53%). Обычно —
  Слова (79%)." or "Как обычно: больше всего — Слова (56% очков недели).");
- a legend, a hover/focus tooltip per axis (both % and points), and a small table
  (section · week % · points · all-time % · points) under the chart;
- axis labels and table rows link to the section (/dashboard/lists, /dashboard/phrases,
  /dashboard/grammar).

## Proposed spec

### specs/home.md (new component spec)
**New**
```gherkin
Scenario: effort breakdown endpoint
  Given an authenticated user
  When GET /me/effort is called
  Then the response has "week" and "all" objects, each with integer points for
    "words", "phrases" and "grammar"
  And the points use exactly the leaderboard formula per source (words 1/3 per word by
    status, phrases 1/3 by lesson stage, grammar 5 per passed lesson), the week being the
    current Mon–Sun UTC week the leaderboard widget uses
  And practice exams are not included
  And the numbers come from aggregated SQL (no per-row fetch) and are never cached
  And an anonymous caller gets 401
```

```gherkin
Scenario: effort radar on the home page
  Given a signed-in user with points this week and overall
  When they open /
  Then under the leaderboard a card «Куда уходят усилия» shows a 3-axis radar
    (Слова, Фразы, Грамматика) with a "this week" and an "all time" layer,
    each layer being that period's share (%) of points per axis
  And an insight line names the week's top section, and the usual top section when
    they differ
  And a legend, a per-axis tooltip (share and points of both layers) and a table of the
    same numbers are shown
  And each axis label and table row links to its section page
```

```gherkin
Scenario: no study this week
  Given a signed-in user with all-time points but none this week
  Then only the "all time" layer is drawn
  And a note says there is no study this week yet
  And the insight names the all-time top section
```

```gherkin
Scenario: brand-new user
  Given a signed-in user with no points at all
  Then the effort card is not shown
```

```gherkin
Scenario: effort radar on mobile and in English
  Given a 375px viewport
  Then the card sits directly under the leaderboard, fits the width without horizontal
    scroll, and the radar labels stay readable
  And in English UI all copy is English ("Where your effort goes", "This week", "All time")
```

## Scope
- In: `GET /me/effort` (reusing `leaderboard_service` per-source joins), the effort card on
  the signed-in home page, all states above, RU + EN, 375px, a new `specs/home.md`, component
  library entry for the radar card, Playwright test with mocked API + screenshots.
- Out (non-goals): practice as an axis; time tracking; changing the leaderboard formula;
  guest landing page; history beyond this week vs all time; success metrics.

## Decisions
- **Effort measure** — leaderboard points (same formula as the rating); no time tracking.
- **Axes** — 3: words, phrases, grammar. Practice removed on user request.
- **Layers** — this week vs all time.
- **Scale** — share % per layer; square-root radius so small shares stay visible (a linear scale made a spike, words are usually 60–80%).
- **Colors** — `#0c7d54` week / `#5cbf8f` all time; validated with the dataviz palette validator; contrast WARN on the light shade → numbers also shown as text (table + tooltip).
- **Empty** — no week points → all-time layer + note; no points at all → card hidden.
- **Clickable** — axis labels and table rows link to the section.
- **Placement** — under the leaderboard on desktop and on mobile (before «Продолжить занятие»).
- **Free vs Premium** — same for everyone.
- **Metric** — not measured.
- **Surroundings** — the rest of the home page is unchanged (the prototype's streak card is a replica).

## Precedents
- `backend/leaderboard_service.py` (issue #157) — one scoring formula for widget, rewards and admin; `/me/effort` must reuse `build_leaderboard_score_joins`, never re-implement it.
- #15 (`documentation/CHANGELOG.md`) — `/me/stats` egress fix: aggregate in SQL instead of fetching progress rows; same rule here (Neon is ~0.2–0.3s per round trip in prod).
- #24 — caching: progress and now-relative results are never cached (CLAUDE.md).

## Success check
Not measured (user decision). Done means the Proposed spec scenarios pass as tests.

## Open questions
- Whether `/me/effort` should be folded into `/me/stats` (one round trip for the home page) — for sdlc-feature-analyst.
