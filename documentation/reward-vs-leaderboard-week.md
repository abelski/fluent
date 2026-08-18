# Reward job vs. user-facing leaderboard: different weeks, on purpose

**Related:** issue #157, `documentation/CHANGELOG.md` #3.

## The decision

- **User-facing leaderboard** (`GET /api/leaderboard`, `routers/words.py`, `period=week`) shows
  the **current, in-progress** ISO week (Mon 00:00 UTC → next Mon 00:00 UTC, i.e. "up to now").
- **Weekly reward job** (`backend/scheduler.py: send_weekly_rewards`, cron Mondays 10:00 UTC) and
  its manual-trigger twin (`POST /api/admin/leaderboard-rewards/generate`) and its admin preview
  (`GET /api/admin/leaderboard-top5`) all score the **previous, fully-completed** week.

These are **intentionally different** and must not be unified into one "week" concept.

## Why

The leaderboard widget's copy promises "points earned this week (Mon–Sun)"
(`frontend/lib/i18n/en.ts`) — it needs to reflect what the user is doing *right now*, otherwise a
user who studies hard on Monday morning would see a leaderboard still showing last week's zeroed
state, which is confusing.

The reward job runs Monday 10:00 UTC, i.e. ~10 hours into the *new* week. If it scored "this
week" (current-week semantics, like the widget), it would grant Premium based on ~10 hours of
data from the week that just started, rather than the 7 full days that just ended — this was
exactly the bug in issue #157 ("подсчет произошел по обнуленным данным").

## Implementation

- `scheduler.previous_week_bounds(now=None) -> (week_start, week_end)` — pure function, `[Mon
  00:00, next Mon 00:00)` of the last *completed* week relative to `now`. Used by the reward
  generator and the admin top-5 preview.
- `leaderboard_service.current_week_bounds(now=None) -> (week_start, week_end)` — mirror image,
  `[Mon 00:00, next Mon 00:00)` of the *in-progress* week containing `now`. Used by the
  user-facing `/api/leaderboard?period=week` endpoint.
- Both are pure functions of an injectable `now`, so they're unit-testable without a DB or a
  running clock (`backend/tests/test_issue_157_weekly_reward_window.py`).
- The actual 4-source scoring SQL (words + phrases + grammar lessons + practice exams) is shared
  via `leaderboard_service.build_leaderboard_score_joins(bounds)` /
  `LEADERBOARD_SCORE_EXPR`, called with `current_week_bounds()`, `previous_week_bounds()`, or
  `None` (all-time) depending on the caller — so "who is winning" is computed identically
  everywhere; only *which week* differs by call site.

## Gotcha: dedup window must anchor to the rewarded week, not "now"

The reward generator's idempotency check (skip users who already got a reward/notice message)
used to be a rolling `created_at >= today - 6 days`, which is wrong on both ends: a manual
mid-week generate could silently suppress the next scheduled run (false positive — different
rewarded week), and a run delayed 8+ days could double-reward the same week (false negative). It's
now anchored to `created_at >= week_end` (the Monday 00:00 that closed the rewarded week), so a
message only suppresses another run that targets the *same* rewarded week.
