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
`data-testid="daily-limit-banner"`; the button is `daily-limit-cta`.

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
