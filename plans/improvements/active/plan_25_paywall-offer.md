---
kind: feature
status: done
iteration: 1
max_iterations: 20
suggested_model: opus
suggested_effort: high
confirmed_model: opus
confirmed_effort: high
---

# #25 — Make the daily-limit wall an actual offer, and lower the free limit to 5

## Context

Goal: more **paid** Premium subscribers. Measured against the production DB on 2026-09-13
(read-only):

| Funnel step | Count |
| --- | --- |
| Users | 148 |
| Ever studied | 111 |
| Studied 3+ separate days | 41 |
| Hit the daily wall (10/day) at least once | 31 |
| Ever reached Stripe Checkout (`stripe_customer_id` set) | 5 |
| **Paying now** (`subscription_status='active'`) | **3** |

Two leaks, both measured:

1. **The wall is a dead end, not an offer.** 28 users hit the 10/day wall and never opened
   checkout. On `/dashboard/lists` and `/dashboard/phrases` the wall renders as *greyed-out
   "Learn" buttons with a `title` tooltip* plus one thin line of text with a small
   `Get Premium` text link (`DailyLimitBanner`). There is no price, no statement of what
   Premium unlocks, and no real button. (`/dashboard/grammar` already has a proper blocked
   screen with a CTA — that one is fine and is left alone.)
2. **The limit is set too high to ever bite.** For non-premium users the daily session count
   distribution is p50 = 3, p75 = 9, p90 = 10. Half of all free study-days are 1–2 sessions.

### Why 5, and not 3 or 10

Distinct free users blocked at least once in the last 90 days (75 free users were active):

| Limit | Users hit | Day-rows hit |
| --- | --- | --- |
| 3 | 37 | 93 |
| **5** | **27** | **69** |
| 7 | 23 | 57 |
| 10 (today) | 16 | 44 |

5 is the knee: the **median** free day (3 sessions) stays untouched, so the casual user never
meets a paywall, while wall-hitters rise 16 → 27 (+69%). 3 was rejected because it blocks the
median day, and activation is already the weakest part of the funnel — 57 of 111 users who ever
studied studied on exactly one day. Choking day 1 would cost more retention than it wins revenue.

**Not in this plan** (separately identified, bigger leak, user chose this one first): the weekly
leaderboard reward grants 7 days of Premium to the top 3, who are the same daily-active users
every week — 12 of the 15 most active users hold Premium and 9 of them never paid.

## Implementation

- [x] `backend/constants.py` — `DAILY_LIMIT = 10` → `5`, with a comment citing the
      p50=3 / p75=9 measurement so the number isn't re-guessed later.
- [x] `backend/tests/test_quota.py` — replace the three hardcoded `10`s with an import of
      `DAILY_LIMIT` so the limit can be re-tuned without editing tests.
- [x] `backend/tests/test_continue_session.py` — same, three hardcoded `10`s.
- [x] `frontend/lib/i18n/{en,ru}.ts` — `common.limitBody` hardcodes "all 10 free sessions";
      drop the literal number. Add `lists.wallTitle`, `lists.wallSubtitle`, `lists.wallCta`
      (CTA interpolates `{price}`). Add the three keys to `types.ts`.
- [x] `frontend/app/dashboard/components/DailyLimitBanner.tsx` — at 0 remaining, render an
      offer card: title, subtitle, the first three `pricing.premiumFeatures` entries (reused,
      not re-written), and one real full-width button to `/pricing` carrying the price.
      At exactly 1 remaining, keep today's thin nudge unchanged.
- [x] `frontend/tests/daily-limit-banner.spec.ts` — extend: at 0 remaining the card shows the
      price and a link to `/pricing`; the 1-remaining and premium cases keep their current
      behaviour.
- [x] `documentation/premium-conversion.md` — the funnel numbers, why 5, why the wall changed,
      and the leaderboard-cannibalisation finding left for later.
- [x] `documentation/CHANGELOG.md` — entry #25.

Design system: the card stays `border border-line rounded-[14px]`, no shadow, `emerald-600`
accent, Inter — it is the existing banner grown, not a new pattern, so no component-library
change is needed.

## Validation

- [x] `cd backend && python -m pytest tests/test_quota.py tests/test_continue_session.py -q`
- [x] `cd frontend && npx playwright test tests/daily-limit-banner.spec.ts`
- [x] `cd frontend && npx playwright test tests/design-system-parity.spec.ts`
