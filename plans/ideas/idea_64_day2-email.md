---
number: 64
slug: day2-email
status: confirmed
---

# Idea #64 — Day-2 email: bring learners back after their first session

## Problem
Half of new learners never come back after day one. Prod, 2026-10-11: of 90 users who studied in
the last 30 days, 41 studied exactly one day. September cohort: 80 signups → 57 studied → 17 studied
3+ days → 9 paid. Paying users buy after 2–12 study days, so retention, not price, is the
bottleneck. Today the only win-back email fires after 30 days of inactivity — far too late.
Of 64 all-time one-day users, 43 touched words (median 4 words), 4 touched phrases, 0 grammar, and
~21 have no progress at all (opened a session and left).

## Desired outcome
24 hours after their first study session, a learner who has not come back gets one short, personal,
positive email from Artur: "How many of your 4 words do you remember? One review today and they're
yours for good" with a link straight into a ~2-minute review. Learners with no words get a "start
your first 5 words, 2 minutes" variant. A P.S. asks for first impressions via the app's feedback
form.

## Proposed spec

### specs/day2-email.md (new)
**New**
```gherkin
Scenario: a learner who did not return gets the day-2 email
  Given the admin setting "auto_send_day2_email" is on
  And a user's first study session was 24–25 hours ago
  And the user has had no study activity since that first session's day
  And the user's email_consent is true and the user is not an admin
  And the user has never been sent a day-2 email
  When the hourly scheduler job runs
  Then the user gets one email, Russian on top and English below in the same body
  And the subject asks how many of their N words they remember (correct RU plural for N)
  And the body says one review today makes the words stick, with a link that opens a review session
  And a P.S. asks for first impressions with a link that opens the feedback form
  And the email is signed by Artur personally, not "The Fluent Team"
  And it carries no Premium footer or offer
  And it ends with a one-click "don't send me emails" link that sets email_consent to false
  And the send is recorded so it is never repeated

Scenario: a learner with no learned words gets the start variant
  Given the same conditions but the user has no word progress
  Then the email invites them to learn their first 5 words in 2 minutes, linking to a first session
  And keeps the same P.S., signature and unsubscribe link

Scenario: a learner who returned on their own gets nothing
  Given the user studied again within 24 hours of the first session
  Then no day-2 email is sent

Scenario: nothing is sent while the admin switch is off
  Given "auto_send_day2_email" is off or unset (the default)
  Then no day-2 email is sent

Scenario: the scheduler summarises the run
  When the job sends at least one email
  Then Telegram gets "day-2 email: sent N"
```

### specs/feedback.md
**New**
```gherkin
Scenario: a link opens the feedback form directly
  Given a user opens /dashboard?feedback=1
  Then the feedback modal opens on load
```

### specs/settings.md
**New**
```gherkin
Scenario: one-click unsubscribe from an email link
  Given a user opens the unsubscribe link from an email
  Then their email_consent becomes false without logging in
  And they see a short RU + EN confirmation page
```

## Scope
- In: one day-2 email (two variants), hourly scheduler job, admin auto-send toggle (default off),
  Telegram summary, send log, `?feedback=1` deep link, one-click unsubscribe link.
- Out (non-goals): email chains (day 3, day 7), inbox copy, Premium upsell, feedback source tagging,
  moving sending off the Gmail account to a fluent.lt domain, A/B testing.

## Decisions
- **Hook** — positive: "how many of N words do you remember? one review and they're yours", no "you'll forget" fear.
- **Spam risk** — one email per user ever, personal data, one-click unsubscribe; still sent from the Gmail account (domain move is separate).
- **Feedback** — via the existing FeedbackModal (deep link), not email replies.
- **Feedback source tag** — none; plain feedback row.
- **Timing** — 24h after the first session, if no return.
- **Zero-word users** — separate "first 5 words" variant, not skipped.
- **Premium** — not mentioned; no #18 footer.
- **Language** — RU + EN in one body (`user.lang` is unreliable: 175/185 are `en`); precedent: report notices.
- **Inbox copy** — no; only people who already came back see the inbox.
- **Rollout** — admin toggle, default off; user turns it on after deploy.
- **Signature** — Artur, personally.

## Precedents
- `backend/scheduler.py::generate_inactive_messages` — 30-day win-back: consent check, `PreparedMessage` log, custom template; reuse the job shape.
- `plans/improvements/implemented/IMPLEMENTED-plan_57_balance-nudge.md` — auto-send key defaulting off, Telegram summary, UNIQUE + savepoint race guard.
- `plans/improvements/implemented/IMPLEMENTED-plan_18_premium-email-upsell.md` — upsell footer; this email deliberately opts out.

## Success check
After 4 weeks on: share of recipients who study again within 3 days of the email vs. today's
baseline (~50% of first-day learners return). Target 60%+. Secondary: count of feedback rows from
recipients.

## Open questions
- Exact copy (RU + EN, both variants) — draft in the plan, user approves word by word.
- Unsubscribe link auth (signed token) — analyst decides.
