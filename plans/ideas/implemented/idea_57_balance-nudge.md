---
number: 57
slug: balance-nudge
status: confirmed
---

# Idea #57 — Balance nudge: radar info button + "you dropped a direction" email/inbox

## Problem

The effort radar (#56) shows how a learner's points split between words, phrases and grammar, but
nothing explains what a good split is, and nobody is told when one direction has been dropped
entirely. Learners who never touch grammar after their first hundreds of words, or who study only
words and never phrases, stall — and they do not notice, because the radar is on the home page
only and carries no guidance.

A research-backed article now exists that gives the recipe (stages, radar ranges, correction
signals): `temp_files/articles/how-to-learn-lithuanian-order.md`, slug
`how-to-learn-lithuanian-order`, 15 DOI-verified sources. It is **not published yet**.

Measured on production (2026-09-29, rolling 14 days, leaderboard scoring):
- 49 users had any word/phrase/grammar points.
- With the article's soft ranges as triggers (phrases <10%, words <40%, grammar 0% with >150 known
  words), **43 of 49** would be flagged — mostly phrases <10% (37). Too broad for a message.
- With the chosen rule (a direction at exactly 0 points; see Decisions), **13 of 49**: grammar 0
  with >150 known 8, phrases 0 with >150 known 7, words 0 5 (overlaps).
- 47 of 49 have `email_consent = true`.

## Desired outcome

1. The radar card has an "i" info button next to its title that opens the article.
2. A learner who has completely dropped a direction they should be doing gets, at most once per
   14 days, an inbox message (and an email, if they consented to email) that shows their 14-day
   split, names the dropped direction(s), sends them to that section and links the article.
3. Learners can switch these tips off in Settings; they are on by default.

## Proposed spec

### specs/home.md
**New**
```gherkin
Scenario: effort radar info button opens the balance article
  Given the effort radar card is rendered
  Then an "i" icon button sits to the right of the card title "Where your effort goes"
  And it has a tooltip / accessible name "How to keep the balance" (RU «Как держать баланс»)
  And its tap target is at least 44×44 px
  When it is clicked
  Then the browser navigates in the same tab to /dashboard/articles/how-to-learn-lithuanian-order/
```

### specs/balance-nudge.md (new)
**New**
```gherkin
Scenario: daily balance check finds a dropped direction
  Given the admin setting "auto-send balance tips" is on
  And a user has more than 0 points in total across words, phrases and grammar over the last 14 days
    (leaderboard scoring: word 1/3, phrase 1/3, passed grammar lesson 5; practice excluded)
  And the user has balance tips enabled
  And no balance tip was sent to that user in the last 14 days
  When the daily scheduler job runs
  Then the user is flagged if any of these hold over the 14-day window:
    | reason   | condition                                             |
    | grammar  | grammar points = 0 and the user has more than 150 known words |
    | phrases  | phrase points = 0 and the user has more than 150 known words  |
    | words    | word points = 0                                       |
  And a flagged user gets exactly one inbox message listing every reason that holds
  And, if the user's email_consent is true, the same content by email
  And the send is recorded (user, time, reasons, the three 14-day shares)

Scenario: nothing is sent while the admin switch is off
  Given the admin setting "auto-send balance tips" is off (the default)
  When the daily job runs
  Then no inbox message and no email is sent

Scenario: a user is never tipped twice within 14 days
  Given a balance tip was sent to the user less than 14 days ago
  When the daily job runs
  Then that user gets nothing, whatever their balance
  And two app instances running the job at the same time still produce at most one tip per user
    per period (guarded in the database, as the weekly reward is in #31)

Scenario: inactive and new learners are not tipped
  Given a user has 0 points in all three directions over the last 14 days
  Then they get no balance tip (the inactive-user email covers them)
  Given a user has 150 or fewer known words and 0 grammar or 0 phrase points
  Then they are not flagged for grammar or phrases (stage 1 of the article)

Scenario: balance tip content
  Given a flagged user with language L (user.lang, RU or EN)
  Then the subject names the dropped direction ("Don't forget grammar" / «Не забывайте про
    грамматику», likewise phrases, words), or "A couple of directions are waiting for you" /
    «Пара направлений ждёт вас» when there is more than one reason
  And the body shows the user's 14-day shares (words X%, phrases Y%, grammar Z%)
  And one line per reason says why that direction matters now
  And one button links to the section of the first reason in order grammar → phrases → words
    (/dashboard/grammar, /dashboard/phrases, /dashboard/lists)
  And a link "Why balance matters" points to /dashboard/articles/how-to-learn-lithuanian-order/
  And a footer line "Don't want these tips? Turn them off in Settings" links to the settings Other tab
  And the email (not the inbox message) carries the standard Premium upsell for non-Premium users
    (append_premium_upsell, as every outgoing email does since #18)

Scenario: Premium and admins are treated like everyone else
  Given a Premium user or an admin who is flagged
  Then they get the tip like any other user
```

### specs/settings.md
**New**
```gherkin
Scenario: Other tab — balance tips toggle
  Given the Other tab
  Then a checkbox "Study balance tips" / «Советы по балансу занятий» sits directly under the
    email-consent checkbox, checked by default for new and existing users
  When it is toggled and saved
  Then it is persisted through the same PATCH /me/settings call as email consent
  And while it is off the user receives neither the balance-tip email nor the inbox message
```

### specs/admin.md
**New**
```gherkin
Scenario: admin switch for balance tips
  Given the admin auto-send settings, next to "auto-send inactive emails"
  Then there is an "auto-send balance tips" switch, off by default
  When it is off the daily balance job sends nothing
```

### Added during planning (shipped, not in the original proposal)
- `specs/inbox.md` — `https://fluent.lt/<path>` in a message body renders as an in-app link
  (origin stripped); `balance` is a valid message source.
- `specs/settings.md` — `/dashboard/settings/?tab=other` opens the Other tab directly (the tip's
  opt-out link points there).
- `specs/admin.md` — deleting a user also deletes their `BalanceTip` / `BalanceTipOptOut` rows.

## Scope
- In: radar info button; daily balance job (email + inbox); per-user opt-out in Settings; admin
  on/off switch; record of every sent tip; RU + EN copy; 375px layout for the button and the toggle.
- Out (non-goals): the article's soft ranges as triggers; any admin dashboard of tip stats; tips
  for completely inactive users; practice (exam) points; reading/listening (not measured by the
  radar); per-reason separate cooldowns; push notifications; retroactive tips.

## Decisions
- **Trigger** — only a fully dropped direction: grammar 0 or phrases 0 with >150 known words, or
  words 0, over a rolling 14-day window. Soft article ranges stay guidance on the radar only
  (article rules would flag 43/49; this rule 13/49).
- **Frequency** — at most one tip per user per 14 days; all reasons in one message; DB-level
  duplicate guard like #31's weekly reward.
- **Channels** — inbox message always (if tips on); email only when `email_consent` is true.
- **Sending** — daily scheduler job sends automatically; admin switch like
  `auto_send_inactive_emails`, **off by default** so the admin reviews copy before first send.
- **Content** — subject per reason (or combined), 14-day shares in numbers, one line per reason,
  one CTA to the first reason's section (grammar → phrases → words), article link, opt-out link,
  language from `user.lang`, Premium upsell in the email only.
- **Info button** — "i" icon right of the radar title, same-tab navigation to the article,
  tooltip "How to keep the balance", 44×44 px target; add to the component library if the icon
  pattern is new.
- **Audience** — anyone with >0 points in the window; free and Premium alike; admins included.
- **Opt-out** — separate "Study balance tips" setting in Settings → Other, under email consent,
  default on for everyone, switches off both email and inbox; opt-out link in every tip.
- **Success check** — manual SQL after a month; no admin dashboard.
- **Article** — user chose to insert it straight into the production DB; Claude's attempt was
  blocked by the permission system, so the user publishes it (admin import of
  `temp_files/articles/how-to-learn-lithuanian-order.import.md`, then set theme `start`). Must be
  live before the admin switch is turned on.

## Precedents
- `plans/improvements/implemented/IMPLEMENTED-plan_23_inbox.md` — `InboxMessage`/`InboxDelivery`,
  mirror messages from outbound flows; reuse for the inbox copy of the tip. New tables need no
  migration (`create_all()`); new `User` columns do (see `documentation/inbox.md`).
- `backend/scheduler.py::generate_inactive_messages` (+ #18 upsell) — daily cron, admin
  `auto_send_*` switch, `PreparedMessage` record, `email_consent`, `append_premium_upsell`; the
  tip job follows the same shape.
- `plans/improvements/implemented/IMPLEMENTED-plan_31_review-first-and-premium-leaks.md` — reach
  measured before shipping; unique index on (user_id, message_type, period) against two Render
  instances double-sending; evidence article linked from UI instead of claims in UI copy.
- `plans/improvements/implemented/IMPLEMENTED-plan_55-56_bento-effort-radar.md` — the radar and
  `/me/effort`; the job reuses `build_leaderboard_score_joins` with 14-day bounds.

## Success check
One month after the admin switch is on, a SQL query over recorded tips: among tipped users, the
share who scored >0 on a flagged direction within the 14 days after the tip, compared with the same
users' previous 14 days. Target: at least one third.

## Open questions
- Where the "balance tips" preference lives: a new `User` column (needs a hand-run Alembic
  migration on production) or a separate table (no migration, per #23's precedent). Analyst's call.
- Exact RU/EN copy of subject, reason lines and inbox message.
- **Prerequisite:** the article must be published on production before the admin switch is on;
  the Definition of Done should check the article URL returns 200.
