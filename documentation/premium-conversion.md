# Premium conversion — the funnel, and why the free limit is 5

Feature #25. Code: `backend/constants.py` (`DAILY_LIMIT`),
`frontend/app/dashboard/components/DailyLimitBanner.tsx`.
Tests: `backend/tests/test_quota.py`, `frontend/tests/daily-limit-banner.spec.ts`.
Plan: `plans/improvements/active/plan_25_paywall-offer.md`.
How Premium is sold: `documentation/stripe-subscriptions.md`. What it unlocks:
`documentation/grammar-lesson-lock-and-premium.md`.

## The funnel as measured (production, read-only, 2026-09-13)

| Step | Count |
| --- | --- |
| Users | 148 |
| Ever studied | 111 |
| Studied on 3+ separate days | 41 |
| Hit the daily wall at least once (at the old limit of 10) | 31 |
| Ever reached Stripe Checkout (`stripe_customer_id` set) | 5 |
| **Paying** (`subscription_status = 'active'`) | **3** |

Checkout itself is not the problem — 3 of the 5 who opened it bought. The losses are before it.

## Why the limit moved 10 → 5

Daily session counts for non-premium users: **p50 = 3, p75 = 9, p90 = 10**. Half of all free
study-days are 1–2 sessions, so at 10 the wall almost never fired.

Distinct free users blocked at least once in a 90-day window (75 free users were active in it):

| Limit | Users hit | Day-rows hit |
| --- | --- | --- |
| 3 | 37 | 93 |
| **5 (chosen)** | **27** | **69** |
| 7 | 23 | 57 |
| 10 (previous) | 16 | 44 |

5 is the knee. The **median** free day (3 sessions) still never meets a paywall, so a casual or
first-day user is untouched, while users who meet the wall rise 16 → 27.

**3 was rejected deliberately.** It blocks the median day, and day-1 retention is already the
weakest part of the funnel — 57 of the 111 users who ever studied studied on exactly one day.
Squeezing day 1 would cost more retention than the extra wall-hits are worth.

`DAILY_LIMIT` is the single source of this number: the backend tests import it rather than
hardcoding, so re-tuning it is a one-line change. The user-facing copy deliberately does **not**
name the number (`common.limitBody`, previously "all 10 free sessions") — only
`pricing.freeFeatures[0]` does, because the pricing table has to state it.

## Why the wall became an offer card

At 0 remaining the free user used to see: greyed-out "Learn" buttons with a `title` tooltip, plus
one thin line of text with a small `Get Premium` text link. No price, no statement of what Premium
unlocks, no button. **28 users hit that wall and never once reached Checkout.**

`DailyLimitBanner` now renders a real offer at 0 remaining — title, three unlocks, and one
full-strength button carrying the price. At **exactly 1 remaining it is unchanged** (the thin
nudge): that user can still study, so a full upsell there is an interruption, not an offer.

`/dashboard/grammar` already had a proper blocked screen with a CTA (see
`grammar-lesson-lock-and-premium.md`) and was left alone.

The card is the existing banner grown — same `border border-line rounded-[14px]`, no shadow,
`emerald-600` accent — so it introduces no new component-library pattern. It keeps
`data-testid="daily-limit-banner"`; the button and price line are `daily-limit-banner-cta` and
`daily-limit-banner-price` — #32 moved the card into the shared `PremiumOfferCard`, which derives
both from its root id, so every surface that sells Premium names them the same way.

The perk list is its own copy key (`lists.wallPerks`), **not** a slice of
`pricing.premiumFeatures`. That array leads with items the free tier also has ("All dictionaries
and topics", "Progress tracking"), which read as nothing on a wall; indexing into it by position
would also break silently if the pricing copy is ever reordered.

## The bigger leak, not yet addressed

**The weekly leaderboard reward gives Premium away to exactly the people who would buy it.**
`scheduler.send_weekly_rewards()` grants the top 3 seven days of Premium. The top of a
leaderboard this size is the same handful of daily-active users every week, so the grant renews
indefinitely and never expires.

Measured: 15 users hold Premium, only 3 paid. Of the 15 most active users by days studied, **12
hold Premium and 9 of them have no Stripe customer at all** — they have never seen a payment
screen and have no reason to.

Fixing it means making the weekly reward something that is not the paid product (a badge, a streak
freeze, a cosmetic), and grandfathering current holders so nobody feels robbed. Deferred — the
user chose the wall work first.

## The weekly leaderboard reward (#31, 2026-09-16)

### What it was giving away

Measured from `prepared_message` where `message_type = 'reward'`: **48 grants, 12 distinct
winners, and 4 of those users took 36 of the 48.** `norpus1` won 11 of roughly 17 weeks. None of
the 12 had ever reached Stripe. Five of the ten most active users in the previous 30 days held
Premium and had never paid.

Two mechanisms caused it:

1. **A flat 7 days for all three places.** A weekly grant of N days covers N/7 of the calendar, so
   7 days a week is *continuous* Premium for anyone who holds a top-3 spot — and the top 3 is a
   near-stable set.
2. **The grant was additive** (`premium_until += 7 days`). Repeat winners banked runway on top of
   coverage they already had, so they drifted further from the paywall every week.

### What it does now

`leaderboard_service.REWARD_DAYS = {1: 7, 2: 4, 3: 2}` is the single source of the number, read by
both the grant and the email copy so the promise cannot drift from the entitlement.

`leaderboard_service.grant_reward_premium()` rolls `premium_until` out to `now + days` and never
further — a window, not a running total. Both send paths use it (`scheduler.send_weekly_rewards`
and `admin.send_prepared_message`), so the manual and automatic paths cannot diverge.

**This is deliberately the opposite of `billing._extend_premium`**, which uses `max()` so a paid
Stripe renewal never moves the date backwards. Paid time is bought and must be honoured; reward
time is granted and must expire. Keep the two functions separate — merging them would either let
rewards bank again or let a renewal shorten a subscription.

One guard worth knowing: a user with `is_premium` and `premium_until IS NULL` holds an admin's
*unlimited* grant. `grant_reward_premium` returns 0 and touches nothing there — writing a 7-day
date would silently downgrade a permanent grant to a week.

At 7 days, first place is still continuously covered for as long as they hold the spot. That was a
deliberate product call (2026-09-16), not an oversight; 5 days was proposed and rejected.

### The double-grant

On 2026-09-14 all three winners received **two** reward rows each, created 0.6s apart at exactly
10:00. `norpus1` and `Satti Preetham` were granted 14 days instead of 7. Two app instances ran the
weekly job together — Render overlaps instances during a deploy, and each runs its own APScheduler.
`generate_weekly_reward_messages`'s `already_generated` check is a read-then-write race: both
instances read an empty set and both inserted.

The fix is a partial UNIQUE index on `(user_id, message_type, rewarded_week)`, declared both in the
migration and in `PreparedMessage.__table_args__` (`database.py` builds the schema from model
metadata via `create_all()`, so a migration-only index would be missing from a fresh DB and from
the test suite). The generator wraps its insert in a savepoint and skips on `IntegrityError`, so
the loser of the race drops its row without poisoning the batch.

Historical rows were left with `rewarded_week` NULL rather than backfilled, and the two
over-granted users were **not** clawed back — a decision, not an oversight.

### Reading the numbers

Track `subscription_status = 'active'`. **Never** `is_premium`: it is never reset when a grant
lapses (`billing.py` has no expiry job by design — `is_premium_active()` lapses users at read
time), so it counts expired rewards as subscribers. On 2026-09-16 the admin panel showed 15
Premium users; 3 had ever reached Stripe and **2 were paying**.
