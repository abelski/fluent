# Balance nudge — current behavior

## Purpose
Learners who fully drop words, phrases or grammar get a short tip (inbox always, email if they
consented) at most once per 14 days, pointing them to the dropped section and the research-backed
article on how to split effort. The effort radar on the home page links the same article.
Backed by: `backend/balance_service.py`, `backend/scheduler.py::send_balance_tips_job`,
models `BalanceTip` / `BalanceTipOptOut`, `GET|PATCH /me/settings` (`balance_tips`),
`GET|PATCH /admin/settings/auto-send` (`auto_send_balance_tips`). Design notes:
`documentation/balance-tips.md`.

## Scenarios

```gherkin
Scenario: daily balance check finds a dropped direction
  Given the admin setting "auto_send_balance_tips" is on
  And a user has more than 0 points in total across words, phrases and grammar over the last 14 days
    (leaderboard scoring: word 1/3, phrase 1/3, passed grammar lesson 5; practice excluded)
  And the user has balance tips enabled (no balance_tip_opt_out row)
  And no balance tip was sent to that user with sent_on after today - 14 days
  When the daily scheduler job runs (09:30 UTC)
  Then the user is flagged if any of these hold over the 14-day window:
    | reason   | condition                                                     |
    | grammar  | grammar points = 0 and the user has more than 150 known words |
    | phrases  | phrase points = 0 and the user has more than 150 known words  |
    | words    | word points = 0                                               |
  And the flagged set comes from one SQL query for all users
  And a flagged user gets exactly one inbox message listing every reason that holds
  And, if the user's email_consent is true, the same content by email
  And the send is recorded as a balance_tip row (user, sent_on, reasons, the three 14-day shares,
    emailed)

Scenario: nothing is sent while the admin switch is off
  Given the admin setting "auto_send_balance_tips" is off or unset (the default)
  When the daily job runs
  Then no inbox message and no email is sent

Scenario: a user is never tipped twice within 14 days
  Given a balance tip with sent_on 13 days ago
  Then the user gets nothing today, whatever their balance
  Given the last tip's sent_on is 14 days ago
  Then the user can be tipped again
  And two app instances running the job at the same time still produce at most one tip per user
    per day: UNIQUE(user_id, sent_on) plus a savepoint per user; the loser skips that user

Scenario: claims are durable before any email leaves
  Given flagged users
  When the job runs
  Then phase 1 inserts each balance_tip and its inbox message, then commits
  And phase 2 sends the emails and sets emailed=true per success, then commits
  And an SMTP failure is logged, leaves emailed=false, and keeps the inbox message and the claim
    (no resend on the next run)
  And a Telegram summary "⚖️ Balance tips: inbox=N email=M failed=K" is sent when N > 0

Scenario: inactive and new learners are not tipped
  Given a user has 0 points in all three directions over the last 14 days
  Then they get no balance tip (the inactive-user email covers them)
  Given a user has 150 or fewer known words and 0 grammar or 0 phrase points
  Then they are not flagged for grammar or phrases

Scenario: balance tip content
  Given a flagged user with language L (user.lang, ru or en; anything else falls back to ru)
  Then the subject names the dropped direction ("Don't forget grammar" / «Не забывайте про
    грамматику», likewise phrases, words), or "A couple of directions are waiting for you" /
    «Пара направлений ждёт вас» when there is more than one reason
  And the body shows the user's 14-day shares (words X%, phrases Y%, grammar Z%, round(100*part/total))
  And one line per reason says why that direction matters now
  And the inbox message carries both RU and EN copy and a CTA button to the section of the first
    reason in order grammar → phrases → words (/dashboard/grammar, /dashboard/phrases,
    /dashboard/lists; «К грамматике» / "Go to grammar", etc.)
  And the email instead has a line "Open grammar: https://fluent.lt/dashboard/grammar/" (etc.)
  And both link "Why balance matters" to https://fluent.lt/dashboard/articles/how-to-learn-lithuanian-order/
  And both end with "Don't want these tips? Turn them off in Settings:
    https://fluent.lt/dashboard/settings/?tab=other"
  And the email (not the inbox message) carries the generic Premium upsell for non-Premium users

Scenario: Premium and admins are treated like everyone else
  Given a Premium user or an admin who is flagged
  Then they get the tip like any other user (no upsell in a Premium user's email)
```
