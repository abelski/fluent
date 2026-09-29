# home — current behavior

## Purpose
`/` (`frontend/app/LandingClient.tsx`) is the app's landing/home page. It checks for a JWT in
`localStorage('fluent_token')` and renders one of two views: a guest marketing landing, or a
signed-in dashboard-style home (`UserHome`) with a streak calendar, a leaderboard, an effort
breakdown radar, a "continue studying" CTA, recent news, and a Premium upsell. All data comes
from the FastAPI backend (`/api/me/stats`, `/api/me/activity-calendar`, `/api/leaderboard`,
`/api/me/effort`, `/api/news`) called client-side with the stored JWT as a Bearer token.

## Scenarios

### Guest vs signed-in routing

```gherkin
Scenario: no token yet, auth check in flight
  Given the page has just mounted and the token check hasn't resolved
  Then nothing is rendered, to avoid a flash of the wrong view

Scenario: guest visits home
  Given no JWT is stored
  When the page loads
  Then the guest marketing landing is shown: hero heading/subtitle, a "Sign in with Google"
    button linking to the backend OAuth start, three feature cards, and a public news section

Scenario: signed-in user visits home
  Given a valid JWT is stored
  When the page loads
  Then UserHome is shown: streak card, a right-hand column (leaderboard, effort radar), and
    continue CTA, inline news, Premium upsell card
  And on desktop (lg+) the continue/news/Premium block sits in the left column directly under
    the streak card, beside the taller right-hand column, with no empty band between them
  And on mobile everything stacks in the order: streak, leaderboard, effort radar, continue CTA,
    news, Premium
```

### Streak card

```gherkin
Scenario: streak card with activity
  Given the signed-in user has a current streak and some activity-calendar dates
  Then the card shows a month calendar with those dates marked, the streak count, a flame icon
    with a circular progress ring toward the next milestone (3/7/14/30/60/100 days), and the
    next milestone number
  And when the streak has passed the last milestone (100+), the ring is full

Scenario: no streak yet
  Given the signed-in user has a streak of 0
  Then the card shows a "start your streak" message instead of "N days!"
```

### Leaderboard

```gherkin
Scenario: leaderboard for a signed-in user
  Given a valid token
  When the leaderboard loads
  Then it fetches GET /api/leaderboard?period=week (default) with the Bearer token and renders
    up to the top entries as avatars with rank/crown (top 3) and score, plus the current user's
    own row if they are outside the shown entries
  And a week/all-time toggle re-fetches with period=all and shows different subtitle copy

Scenario: no entries for the period
  Given the leaderboard response has an empty entries list
  Then a period-specific empty message is shown (a dedicated message for "week", a dash for "all")

Scenario: leaderboard fetch fails or no token
  Given the request errors, or there is no token
  Then the leaderboard renders nothing (component returns null without a token)
```

### Effort radar ("Where your effort goes")

```gherkin
Scenario: effort breakdown endpoint
  Given an authenticated user (Bearer JWT)
  When GET /api/me/effort is called
  Then it returns {"week": {"words", "phrases", "grammar"}, "all": {"words", "phrases",
    "grammar"}}, each value an integer point total
  And the points reuse the leaderboard scoring formula exactly (build_leaderboard_score_joins,
    same per-source joins as GET /api/leaderboard's "me" score) via one SQL round trip
    (a UNION ALL of the week-bounded and unbounded queries), the week being the current
    Mon-Sun UTC week
  And practice exam points are not included (no "x" join selected)
  And the response is never cached (progress and now-relative data are excluded from caching
    per project convention)
  And an anonymous caller gets 401

Scenario: effort radar renders under the leaderboard
  Given a signed-in user with points this week and all-time
  When the home page loads
  Then a card titled "Where your effort goes" appears directly under the leaderboard card in
    the same right-hand column (and directly under it in DOM order on mobile too)
  And it draws a 3-axis SVG radar (Words / Phrases / Grammar, starting at the top, 120° apart)
    with two overlaid layers: "this week" (darker, emerald-700) and "all time" (lighter,
    effort-all token), each vertex placed at a square-root-scaled radius of that layer's share
    of points on that axis (so a small share stays visible instead of collapsing to the centre)
  And an insight line above the chart is bold-highlighted and reads one of three templates:
    "usually X" style when the week's top axis matches the all-time top axis, or a
    "this week X, usually Y" shift line when they differ
  And a legend (one swatch per layer shown) and a table (section name linked to its page,
    week % and points, all-time % and points) repeat the same numbers as text, and each axis
    label in the SVG is a link to its section page (/dashboard/lists, /dashboard/phrases,
    /dashboard/grammar)
  And hovering, focusing (keyboard tab), or tapping an axis's invisible wedge shows a tooltip
    with that axis's week and all-time share and point count

Scenario: effort radar info button opens the balance article (#57)
  Given the effort radar card is rendered
  Then an "i" icon link sits at the right end of the card's title row
  And its aria-label and title read "How to keep the balance" (RU «Как держать баланс»)
  And its tap target is at least 44x44px while the title row keeps its height (negative margin)
  When it is clicked
  Then the browser navigates in the same tab to /dashboard/articles/how-to-learn-lithuanian-order/

Scenario: no study this week
  Given the user has all-time points but the week's totals are all zero
  Then only the all-time polygon/markers are drawn (no week layer, no week legend swatch, no
    week column in the table)
  And a note explains there is no study yet this week
  And the insight line names the all-time top axis instead of comparing week vs all-time

Scenario: brand-new user, no points at all
  Given the user's all-time totals for words, phrases and grammar are all zero
  Then the effort radar card is not rendered at all

Scenario: effort radar without a token or before data loads
  Given there is no token, the fetch hasn't resolved yet, or it failed
  Then the component renders nothing (returns null)
```

### Continue-session CTA, news, Premium upsell

```gherkin
Scenario: continue studying card
  Given the signed-in user's stats show total_studied > 0
  Then the CTA links to /dashboard/continue with "continue" copy

Scenario: continue studying card, new user
  Given total_studied is 0 (or stats haven't loaded)
  Then the CTA links to /dashboard/lists with "get started" copy instead

Scenario: inline news
  Given GET /api/news?limit=20 returns at least one post
  Then up to 3 posts are shown inline (title/body/date in the active language), each body
    truncated to 120 characters with a "read more" toggle if longer, and a "show N more"
    toggle when there are more than 3 posts
  And an empty news list renders nothing

Scenario: Premium upsell
  Given the user is signed in
  Then a card with Premium title/body copy and a link to /pricing is always shown at the
    bottom of the page, regardless of current Premium status
```
