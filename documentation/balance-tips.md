# Balance tips (#57)

A daily job tells a learner, at most once per 14 days, when they have **fully dropped** words,
phrases or grammar. Inbox always, email only with `email_consent`. Spec:
`specs/balance-nudge.md`. Code: `backend/balance_service.py` (rule, copy, send),
`backend/scheduler.py::send_balance_tips_job` (switch + session), 09:30 UTC.

## Rule

Window = `now - 14d .. now`, leaderboard scoring via `build_leaderboard_score_joins` (practice
excluded). Eligible if words+phrases+grammar > 0, no opt-out row, and no `balance_tip` with
`sent_on > today - 14 days`. Reasons, in CTA order: grammar = 0 and known > 150; phrases = 0 and
known > 150; words = 0. `known` = all-time `user_word_progress.status = 'known'`. One SQL query for
all users; the reasons are applied in Python by `balance_reasons()` so the rule has one definition.

### Why exact zero, not the article's ranges

The article (`how-to-learn-lithuanian-order`) gives soft ranges (phrases < 10%, words < 40%, ...).
Measured on production 2026-09-29 over 14 days: those ranges flag **43 of 49** active users
(37 on phrases < 10% alone) — a message nearly everyone gets is noise. "A direction at exactly 0"
flags **13 of 49**. The ranges stay as guidance on the radar/article only.

### Why the cooldown compares `sent_on` dates

A timestamp comparison would let the job's run-time jitter (misfire grace, restarts) stretch the
period to 15 days. `sent_on` is a date: 13 days ago → skipped, 14 days ago → tipped.

## Opt-out is a table, not a `User` column

`balance_tip_opt_out(user_id PK/FK, created_at)`, row present = off. A new `User` column needs a
hand-run Alembic migration on production (Render never runs it; see local-dev-gotchas.md), while a
new table is created by `create_all()` on boot. `PATCH /me/settings` takes
`balance_tips: Optional[bool] = None` — **None leaves it unchanged**, so an older client that omits
the field can't silently flip it. Both tables are in `admin.py::_delete_user_data`.

## Send: two phases, race guard

Same shape as #31's weekly rewards, because SMTP can't be rolled back:

1. Per flagged user, inside `session.begin_nested()`: insert `BalanceTip(sent_on=today, ...)` and
   the inbox message (RU + EN copy, CTA to the first reason's section). `UNIQUE(user_id, sent_on)`
   is the cross-instance guard — two Render instances run the scheduler; the loser's savepoint gets
   `IntegrityError` and skips that user. Then **commit**, so claims are durable before any email:
   a crash can't cause a resend, and the other instance never waits on uncommitted rows during SMTP.
2. Email each claimed user with consent (`user.lang`, full `https://fluent.lt/...` URLs, generic
   Premium upsell for non-Premium), set `emailed=True` per success; a failure is logged and stays
   False. Commit. Telegram summary `⚖️ Balance tips: inbox=N email=M failed=K` when N > 0.

The inbox body carries plain `https://fluent.lt/...` URLs; `inbox/MessageView.tsx` turns them into
in-app `<Link>`s with the origin stripped (so they also work on localhost). The settings link is
`/dashboard/settings/?tab=other`, which the settings page reads on mount.

## Default-off switch

`auto_send_balance_tips` defaults to **False** both in `GET /admin/settings/auto-send` and in the
job (`_is_auto_send_enabled(..., default=False)`), unlike the older two switches that default on.
The admin reviews the copy first (`pytest -s tests/test_balance_tips.py -k print` prints the full
RU/EN emails) and the article must be live
(`curl -s -o /dev/null -w "%{http_code}" https://fluent.lt/api/articles/how-to-learn-lithuanian-order`
→ 200; not the page URL — the static `_` placeholder answers 200 for any slug).

**Never smoke-test the job against `backend/.env` as is**: it points at production Neon and real
SMTP, so a run would tip ~13 real users and block their real tips for 14 days.

## Success check (one month after the switch is on)

Share of tipped users who scored > 0 on a flagged direction in the 14 days after the tip, vs. the
same users' 14 days before it. Target: at least one third.

```sql
WITH t AS (
  SELECT bt.user_id, bt.sent_on::timestamp AS at, r.reason
  FROM balance_tip bt, unnest(string_to_array(bt.reasons, ',')) AS r(reason)
),
act AS (
  SELECT user_id, 'words' AS reason, last_seen AS ts FROM user_word_progress
  UNION ALL SELECT user_id, 'phrases', last_seen FROM user_phrase_progress WHERE lesson_stage > 0
  UNION ALL SELECT user_id, 'grammar', created_at FROM grammar_lesson_result WHERE passed
)
SELECT count(DISTINCT t.user_id) AS tipped,
       count(DISTINCT t.user_id) FILTER (WHERE EXISTS (
         SELECT 1 FROM act a WHERE a.user_id = t.user_id AND a.reason = t.reason
           AND a.ts >= t.at AND a.ts < t.at + interval '14 days')) AS returned_after,
       count(DISTINCT t.user_id) FILTER (WHERE EXISTS (
         SELECT 1 FROM act a WHERE a.user_id = t.user_id AND a.reason = t.reason
           AND a.ts >= t.at - interval '14 days' AND a.ts < t.at)) AS active_before
FROM t;
```

`last_seen` is overwritten on every review, so "returned_after" undercounts slightly for words and
phrases reviewed again later; grammar results are append-only and exact.
