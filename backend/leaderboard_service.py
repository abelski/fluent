"""Shared leaderboard/reward scoring SQL.

Score = words + phrases + grammar lessons + practice exams, so the same
formula drives the user-facing leaderboard widget, the admin reward preview,
and the weekly reward generator — they must never compute "who is winning"
differently (see issue #157).

Callers embed `LEADERBOARD_SCORE_EXPR` in their own SELECT/WHERE/ORDER BY and
splice `build_leaderboard_score_joins(bounds)`'s SQL fragment in right after
`FROM "user" u`, merging its params into their `session.execute(...)` call.
"""

from datetime import datetime, timedelta, timezone

# Total score across all 4 sources; usable in SELECT, HAVING, and WHERE once the
# `w`, `p`, `g`, `x` join aliases below are present in the query.
LEADERBOARD_SCORE_EXPR = "COALESCE(w.pts, 0) + COALESCE(p.pts, 0) + COALESCE(g.pts, 0) + COALESCE(x.pts, 0)"


def current_week_bounds(now: datetime | None = None) -> tuple[datetime, datetime]:
    """Return `[Mon 00:00, next Mon 00:00)` (UTC-naive) of the *in-progress* ISO
    week containing `now`. This is deliberately the mirror image of
    `scheduler.previous_week_bounds`: the user-facing leaderboard widget
    promises "points earned this week (Mon–Sun)" and must keep showing the
    week that is currently running, never the last completed one — see
    documentation/reward-vs-leaderboard-week.md.
    """
    if now is None:
        now = datetime.now(timezone.utc).replace(tzinfo=None)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    this_week_start = today_start - timedelta(days=today_start.weekday())
    next_week_start = this_week_start + timedelta(days=7)
    return this_week_start, next_week_start


def build_leaderboard_score_joins(
    bounds: tuple[datetime, datetime] | None = None,
) -> tuple[str, dict]:
    """Build the 4-source scoring LEFT JOIN chain (aliased `w`, `p`, `g`, `x`).

    Pass `bounds=(start, end)` to score only that half-open UTC window
    (e.g. "this week" or "last week"); omit for all-time.

    Returns `(sql_fragment, params)` — splice `sql_fragment` directly after
    `FROM "user" u` in the caller's query text and merge `params` into the
    caller's `execute()` params.
    """
    if bounds is not None:
        week_start, week_end = bounds
        word_filter = "AND uwp.last_seen >= :week_start AND uwp.last_seen < :week_end"
        phrase_filter = "AND upp.last_seen >= :week_start AND upp.last_seen < :week_end"
        grammar_filter = "AND glr.created_at >= :week_start AND glr.created_at < :week_end"
        practice_filter = "AND per.created_at >= :week_start AND per.created_at < :week_end"
        params = {"week_start": week_start, "week_end": week_end}
    else:
        word_filter = phrase_filter = grammar_filter = practice_filter = ""
        params = {}

    sql = f"""
            LEFT JOIN (
                SELECT uwp.user_id, SUM(CASE WHEN uwp.status = 'known' THEN 3 ELSE 1 END) AS pts
                FROM   user_word_progress uwp
                WHERE  1=1 {word_filter}
                GROUP  BY uwp.user_id
            ) w ON w.user_id = u.id
            LEFT JOIN (
                SELECT upp.user_id, SUM(CASE WHEN upp.lesson_stage >= 2 THEN 3 ELSE 1 END) AS pts
                FROM   user_phrase_progress upp
                WHERE  upp.lesson_stage > 0 {phrase_filter}
                GROUP  BY upp.user_id
            ) p ON p.user_id = u.id
            LEFT JOIN (
                SELECT glr.user_id, COUNT(*) * 5 AS pts
                FROM   grammar_lesson_result glr
                WHERE  glr.passed = true {grammar_filter}
                GROUP  BY glr.user_id
            ) g ON g.user_id = u.id
            LEFT JOIN (
                SELECT per.user_id, COUNT(*) * 5 AS pts
                FROM   practice_exam_result per
                WHERE  1=1 {practice_filter}
                GROUP  BY per.user_id
            ) x ON x.user_id = u.id
    """
    return sql, params


# --- Weekly reward entitlement (#31) --------------------------------------
# Rank → days of Premium granted when the reward email is sent.
#
# Tiered rather than a flat week for all three. A weekly grant of N days covers
# N/7 of the calendar, so only N = 7 keeps pace with the week — at 4 and 2 days
# the 2nd- and 3rd-place winners meet the paywall 3 and 5 days a week instead of
# never. Measured before the change: 48 grants had gone to 12 users, 4 of whom
# took 36 of them, and none of the 12 had ever paid.
REWARD_DAYS = {1: 7, 2: 4, 3: 2}


def grant_reward_premium(user, rank: int, now: datetime | None = None) -> int:
    """Roll `user`'s Premium window out to `now + REWARD_DAYS[rank]`. Returns days granted.

    Deliberately **not** additive. The previous `premium_until += 7 days` let repeat
    winners bank Premium: the top-3 set is near-stable week to week, so the same few
    accounts accrued faster than the calendar burned and never saw the paywall at all.
    Rolling to a fixed window instead means a winner is covered for exactly their prize
    and no longer.

    This is the opposite of `billing._extend_premium`, which uses max() so a *paid*
    renewal never moves the date backwards, and the two must stay separate: paid time is
    bought, reward time is granted. A user who is already covered past the new window
    keeps the later date and gains nothing — correct for a Stripe subscriber who also
    wins, who is not owed a second entitlement.

    Returns 0 for an unrewarded rank, and for a user on an unlimited grant
    (`is_premium` with `premium_until IS NULL`) — writing a date there would *downgrade*
    an admin's permanent grant to a few days.
    """
    days = REWARD_DAYS.get(rank, 0)
    if not days:
        return 0
    if user.is_premium and user.premium_until is None:
        return 0
    if now is None:
        now = datetime.now(timezone.utc).replace(tzinfo=None)
    window_end = now + timedelta(days=days)
    if user.premium_until is None or user.premium_until < window_end:
        user.premium_until = window_end
    user.is_premium = True
    return days
