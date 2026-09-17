# Billing — current behavior

## Purpose
Handles Stripe-based subscription billing for Fluent Premium: starting
checkout, opening the Stripe customer portal, and — the only writer of
entitlement — processing Stripe webhook events into each user's `is_premium` /
`premium_until` / `subscription_status` state. Called over REST by the
`/pricing` page (see `frontend/app/pricing/PricingClient.tsx`) and by Stripe
itself (the webhook). Entitlement is also read by every quota-gated feature via
`quota.is_premium_active()`, and can be granted manually by an admin or by the
weekly leaderboard reward — both outside this router but sharing its
`premium_until` field and its max()-only-extends convention. For what the
Settings page shows about a user's own plan, see `specs/settings.md`; that page
has no billing UI of its own today — plan management lives entirely on
`/pricing`.

Backed by: `backend/routers/billing.py`, `backend/stripe_service.py`,
`frontend/app/pricing/PricingClient.tsx`, `frontend/app/dashboard/settings/`
(no billing content today, see Purpose).

## Scenarios

```gherkin
Scenario: Billing is not configured (no Stripe keys locally)
  Given STRIPE_SECRET_KEY, STRIPE_PRICE_ID, or STRIPE_WEBHOOK_SECRET is unset
  When GET /billing/config is called
  Then it returns {"enabled": false} and any call to create-checkout-session
    or portal-session is rejected with 503 "Billing is not configured"
  And the pricing page falls back to a mailto "contact us" CTA instead of a
    real checkout button

Scenario: Which Stripe mode is used is decided by the secret key alone
  Given there is no separate test/live mode flag anywhere in config
  When the backend calls any Stripe API
  Then it operates in whichever mode the configured secret key belongs to
    (test key locally, live key in production) — STRIPE_PRICE_ID must be the
    matching mode's price id or checkout creation fails

Scenario: Student starts checkout
  Given a logged-in student without an already-active premium entitlement
  When POST /billing/checkout-session is called
  Then a Stripe customer is created and persisted on first use (or reused if
    already present), a subscription Checkout Session is created with that
    student's id as client_reference_id, and the hosted checkout URL is
    returned for the browser to redirect to
  And a student whose premium is already active is rejected with 409
    "Premium is already active"

Scenario: Student opens the billing portal
  Given a logged-in student who already has a Stripe customer id on file
  When POST /billing/portal-session is called
  Then a Stripe Customer Portal session is created and its URL returned
  And a student with no stripe_customer_id yet is rejected with 400 "No
    billing account for this user"
  And a portal-creation failure (e.g. the Customer Portal was never activated
    in the Stripe dashboard for this mode) is logged and surfaced as 502
    "Could not open billing portal"

Scenario: Checkout return screen never trusts the browser
  Given the student is redirected back to /pricing/?checkout=success after
    paying
  Then the frontend does not treat that URL as proof of payment — it polls
    GET /me/quota (every 2s, up to 5 attempts) until premium_active becomes
    true, showing "activating" while it waits and a "this is taking a while"
    message if the poll budget runs out before the webhook lands
  And the actual entitlement grant only ever happens inside the webhook
    handler below, never from this redirect being visited

Scenario: Webhook signature is invalid or missing
  Given a POST to /billing/webhook whose Stripe-Signature header does not
    verify against the configured webhook secret
  Then the request is rejected with 400 "Invalid signature" and no user state
    is touched
  And the raw request body is used for verification, never a re-serialized
    parsed body (re-serializing would change the bytes and always fail
    verification)

Scenario: An unhandled event type arrives
  Given the webhook receives an event type outside the fixed handled set
    (checkout.session.completed, invoice.paid, customer.subscription.updated,
    customer.subscription.deleted, invoice.payment_failed)
  Then it responds 200 {"received": true, "handled": false} and changes
    nothing — returning a non-2xx for an unhandled type would make Stripe
    retry it forever

Scenario: No matching user for a webhook event
  Given the event's Stripe customer id does not match any user row, and (for
    checkout.session.completed only) client_reference_id also does not
    resolve to a user
  Then the webhook still responds 200 {"received": true, "handled": false}
    rather than erroring, so Stripe stops retrying a delivery that can never
    be matched (e.g. a customer created by hand in the Stripe dashboard, or a
    deleted account)

Scenario: First-ever checkout links the Stripe customer to the user
  Given checkout.session.completed fires and the customer id is not yet on
    any user row
  When client_reference_id on the session resolves to an existing user with
    no stripe_customer_id set
  Then that user is linked to the Stripe customer id before granting premium

Scenario: checkout.session.completed grants premium
  Given a completed checkout for a matched user
  Then subscription_status is set to "active", is_premium to true, the
    subscription id is stored, and premium_until is extended to the
    subscription's own current paid-through date (fetched from Stripe); a
    failure to retrieve that subscription is logged and left for
    customer.subscription.updated to fill in moments later, without failing
    the webhook
  And a Telegram admin notification is sent after the commit

Scenario: invoice.paid extends or confirms premium
  Given an invoice.paid event for a matched user with a resolvable
    subscription id
  Then premium_until is extended to that subscription's current period end,
    is_premium set true, subscription_status set "active"
  And a Telegram notification is only sent when billing_reason is
    "subscription_cycle" (a true renewal) — the first invoice of a brand-new
    subscription is not re-announced, since checkout.session.completed
    already did

Scenario: customer.subscription.updated reconciles status without notifying
  Given this event overlaps invoice.paid on every renewal and also fires for
    trial/plan/dunning changes with no payment involved
  When status is "active" or "trialing"
  Then subscription_status becomes "active", is_premium true, and
    premium_until is extended (same max()-forward rule)
  When status is "past_due", "unpaid", or "incomplete"
  Then subscription_status becomes "past_due" and nothing else changes
  When status is "canceled"
  Then subscription_status becomes "canceled" and nothing else changes
  And no Telegram notification is ever sent for this event type

Scenario: customer.subscription.deleted revokes nothing immediately
  Given a subscription is deleted/canceled in Stripe
  Then subscription_status is set to "canceled" and the stored subscription
    id is cleared, but premium_until and is_premium are left untouched — the
    student keeps the time already paid for, and is_premium_active() lapses
    them automatically once premium_until passes; there is no separate expiry
    job
  And a Telegram notification is sent

Scenario: invoice.payment_failed does not change entitlement
  Given a failed renewal charge
  Then subscription_status is set to "past_due" only; premium is left active
    until Stripe's own dunning retries are exhausted and a later event (or
    the natural premium_until lapse) changes it, and a Telegram notification
    with the failed amount is sent

Scenario: premium_until is never moved backwards by a paid event
  Given any handler that would set premium_until from a subscription's period
    end
  When the computed new end date is earlier than or equal to the currently
    stored one
  Then premium_until is left unchanged (a max()-style clamp) — this exists
    because the same field is also advanced by 7 days on a weekly leaderboard
    win, and a plain overwrite on the next renewal would silently erase those
    reward days

Scenario: Stripe redelivers a webhook
  Given there is no processed-event dedupe table
  When Stripe redelivers the same event id (its own retry behavior, or two
    events that both touch entitlement, e.g. invoice.paid and
    customer.subscription.updated on the same renewal)
  Then re-applying the same handler is harmless because every entitlement
    write is idempotent (absolute date with max(), not an increment) — but a
    Telegram notification or the inbox "premium welcome" message can be sent
    more than once; this is accepted, not solved

Scenario: Premium welcome runs strictly after the entitlement commit
  Given checkout.session.completed just granted premium
  When the entitlement commit succeeds
  Then the inbox "premium welcome" notification is sent in its own separate
    transaction afterward; if that insert fails it is rolled back and logged
    but the webhook still returns 200 — a failure there must never be able to
    roll back the premium grant itself

Scenario: Admin manually grants or revokes premium
  Given PATCH /users/{id}/premium (admin-only, outside this router in
    admin.py) with is_premium and an optional premium_until
  When premium_until is provided and is in the past
  Then the request is rejected with 400
  When premium_until is omitted (null) alongside is_premium=true
  Then the grant is unlimited — is_premium_active() treats a null
    premium_until as always-active — and the pricing page's manage/upgrade CTA
    is hidden entirely for such a user (nothing to buy, nothing to manage)
    since they have no Stripe billing account
  And the inbox premium-welcome message is sent only on an inactive → active
    transition, not on a re-grant of an already-active user

Scenario: Weekly leaderboard reward extends premium without downgrading a
    permanent grant
  Given a top-3 leaderboard finisher is due a fixed number of reward days
  When the user already holds an unlimited grant (is_premium true,
    premium_until null)
  Then the reward is skipped entirely (0 days granted) rather than replacing
    the null with a dated window
  Otherwise premium_until is rolled to a fixed now+N-day window (not added on
    top of the existing date) — a user already covered past that window keeps
    their later date and gains nothing extra
```
