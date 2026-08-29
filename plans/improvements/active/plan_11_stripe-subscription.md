---
kind: feature
status: done
iteration: 1
max_iterations: 30
suggested_model: opus
suggested_effort: high
confirmed_model: opus
confirmed_effort: high
---

# #11 — Stripe recurring subscription for Premium

Self-serve €4.50/month Premium via Stripe Checkout + Customer Portal. Local development runs
against Stripe **test** keys; production runs against **live** keys. Same code, different env.

---

## PART 0 — What the user must create (manual, outside this repo)

Nothing in the checklist below can be done from code. Implementation can be written without it,
but **cannot be verified** until section 0.C exists. Everything in 0.B–0.D must be done **twice**:
once with the dashboard's Test/Live toggle on **Test**, once on **Live**. Object IDs do not cross
between modes — a `price_…` created in test mode does not exist in live mode.

### 0.A — Stripe account (once)

1. Create an account at https://dashboard.stripe.com/register.
2. Complete business onboarding for live payments (test mode works immediately without it):
   - legal entity type (sole trader / UAB) + registered address
   - tax ID / personal code
   - IBAN for payouts
   - identity verification document
   - a public business URL (`https://fluent.lt`) and support contact
3. Install the Stripe CLI locally — needed for webhooks in development:
   `brew install stripe/stripe-cli/stripe && stripe login`

### 0.B — Product and price (per mode: test, then live)

4. Products → **Add product**: name `Fluent Premium`.
5. Add a **recurring** price: `4.50 EUR`, billing period **monthly**.
6. Copy the price ID (`price_…`) → this becomes `STRIPE_PRICE_ID`.
   **Record both the test and live values separately — they differ.**
7. Decide whether €4.50 is VAT-inclusive or VAT is added at checkout (see 0.F).

### 0.C — API keys and webhook secrets (per mode)

8. Developers → API keys → copy the **secret key** (`sk_test_…` / `sk_live_…`) → `STRIPE_SECRET_KEY`.
   The *publishable* key is **not** needed — this integration uses hosted Checkout redirects, so
   Stripe.js never loads in our frontend.
9. Webhook signing secret (`STRIPE_WEBHOOK_SECRET`), obtained differently per environment:
   - **Local:** run `stripe listen --forward-to localhost:8000/api/billing/webhook`. It prints a
     `whsec_…` on start. This value is **ephemeral** — it changes each time you start a new
     `listen` session, so `backend/.env` must be updated when it does. The CLI must stay running
     for local webhooks to arrive at all.
   - **Production:** Developers → Webhooks → **Add endpoint** →
     `https://fluent.lt/api/billing/webhook`, subscribed to exactly these events:
     `checkout.session.completed`, `customer.subscription.updated`,
     `customer.subscription.deleted`, `invoice.paid`, `invoice.payment_failed`.
     Copy the endpoint's signing secret.

### 0.D — Customer Portal (per mode)

10. Settings → Billing → **Customer portal** → activate it, and enable: cancel subscription,
    update payment method, invoice history. **If this is never activated,
    `billing_portal.Session.create` fails at runtime** — there is no code-side workaround.

### 0.E — Environment variables

11. `backend/.env` (local, **test** values):
    ```
    STRIPE_SECRET_KEY=sk_test_…
    STRIPE_PRICE_ID=price_…          # the TEST-mode price id
    STRIPE_WEBHOOK_SECRET=whsec_…    # from `stripe listen`, re-copy each session
    ```
12. Render dashboard (production, **live** values): the same three keys with live values.
    They are also added to `render.yaml` with `sync: false` in this plan's checklist, but
    `sync: false` only declares them — **the values still have to be pasted into Render by hand.**

### 0.F — Legal / tax, required before charging real money

13. Publish a **Terms of Service** and a **refund / cancellation policy** reachable from the site.
    Stripe requires these for live activation, and the current beta copy on `/pricing` explicitly
    promises "платежи не принимаются" — that copy has to change in the same release that goes live.
14. Decide EU VAT handling for B2C digital services (VAT is owed in the *customer's* country; the
    OSS scheme covers it). Either enable **Stripe Tax** (paid add-on, automatic) or handle it
    manually. This is a business decision, not a code one, but it must be settled before live keys
    are used — retrofitting VAT onto existing subscriptions is painful.

---

## Context

Premium already exists as an entitlement and is fully wired into the product. What is missing is
**any way for a user to buy it**.

- Entitlement is two columns on `User` — `is_premium` and `premium_until`
  (`backend/models.py:25-26`), read through one helper, `is_premium_active(user)`
  (`backend/quota.py:13-19`): false if `is_premium` is false, true if `premium_until` is null,
  otherwise true only while `premium_until` is in the future.
- That helper already gates: the daily session quota (`backend/quota.py:22-40`), personal word and
  phrase lists (`routers/word_lists.py:36-43`, `routers/phrase_lists.py:41`), the Chrome extension
  (`routers/extension.py:632`), and grammar lesson ordering (`routers/grammar.py:56`).
- Premium is granted **only** by an admin today: `PATCH /api/admin/users/{id}/premium`
  (`routers/admin.py:700-728`), or automatically as a weekly leaderboard reward
  (`scheduler.py:230-243`), which *extends* `premium_until` by 7 days.
- `/pricing` shows €4.50/month (`frontend/lib/i18n/ru.ts:70`) but its only CTA is a `mailto:`
  anchor (`frontend/app/pricing/PricingClient.tsx:93-98`).

**The key consequence for this plan:** because expiry already flows through `is_premium_active`,
Stripe does not need to build any entitlement machinery. It only needs to keep `premium_until`
pointing at the end of the paid period. Nothing downstream changes.

Model/effort: opus/high — money, a new unauthenticated public endpoint, and a webhook contract.

## Goals

- A logged-in user on `/pricing` can click one button, pay by card, and have Premium active within
  seconds, with no admin involvement.
- An existing subscriber can cancel, change card, and download invoices themselves.
- Renewals extend Premium automatically; a cancelled subscription runs to the end of the period
  already paid for and then lapses on its own.
- Local development can exercise the entire flow end-to-end with Stripe test cards.

## Non-Goals

- No annual plan, no coupons, no trials, no proration handling, no multi-currency.
- No custom card form — no Stripe.js, no Elements, no card data touching our frontend.
- No cancellation / invoice / payment-method UI of our own (the Stripe Customer Portal is it).
- No changes to what Premium *unlocks*, to `DAILY_LIMIT`, or to any `is_premium_active` call site.
- The admin manual-grant endpoint and the weekly leaderboard reward stay exactly as they are —
  they remain the support fallback and the reward mechanism.
- No refund automation (refunds are issued from the Stripe dashboard by hand).

### Standing constraints

- All validation server-side.
- Never log secrets, tokens, or webhook payloads.
- `/pricing` is a documented "heavy-border pages left alone" deviation in the component library
  (`documentation/design system/Component Library (as-built).html:750`) — keep its existing
  `border-gray-900` / `rounded-2xl` visual language, do **not** migrate it to the newer tokens as
  part of this change.
- Only one backend and one frontend dev server at a time.

## Design decisions

**1. Hosted Checkout + hosted Customer Portal, not Stripe Elements.**
Card data never reaches our origin (keeps us in the lightest PCI scope), the static Next export
gains no new client-side Stripe dependency, and cancel / update-card / invoice-history UI comes for
free from the portal instead of being three more screens to build and test.

**2. The webhook is the *only* writer of entitlement. `success_url` grants nothing.**
The browser's return from Checkout is attacker-controllable — anyone can navigate to
`/pricing/?checkout=success`. The success page only *polls* `/api/me/quota` to reflect state the
webhook already wrote.

**3. Webhooks set `premium_until` to an absolute value, never `+= 1 month`.**
Stripe retries and redelivers events; an incrementing handler double-extends on redelivery. Writing
`premium_until = subscription.current_period_end` is idempotent by construction, which is why this
plan needs **no processed-event table** and no dedup bookkeeping. It also makes handler overlap
harmless (`invoice.paid` and `customer.subscription.updated` both firing on a renewal is fine).

**4. …but clamped with `max()`, to protect gifted time.**
The weekly leaderboard reward adds 7 days to `premium_until` (`scheduler.py:235-241`). A plain
overwrite would silently delete a subscriber's reward days at the next renewal. So:
`premium_until = max(existing_premium_until, stripe_period_end)`. Still idempotent.

**5. Cancellation does not revoke anything.**
On `customer.subscription.deleted` we clear the subscription id and mark the status, but leave
`premium_until` untouched — the user keeps the time they paid for and `is_premium_active` lapses
them automatically when that date passes. No expiry job, no revocation code path.

**6. Reuse `/api/me/quota` instead of adding a subscription endpoint.**
It already returns `is_premium`, `premium_until`, `premium_active` (`routers/words.py:1204-1229`)
and is already fetched by the frontend. Adding two fields there costs one round trip fewer than a
new `/api/me/subscription`.

**7. Return to `/pricing/?checkout=success`, not a new `/pricing/success/` route.**
Under `output: 'export'` + `trailingSlash: true`, every `success_url` path must correspond to a
statically exported directory or it 404s on Render. A query param on the page that already exists
avoids that class of bug entirely.

## Implementation

### Backend

- [x] 1. Add `stripe>=11.0` to `backend/requirements.txt`.
- [x] 2. Add three nullable columns to `User` in `backend/models.py`: `stripe_customer_id:
      Optional[str]` (indexed), `stripe_subscription_id: Optional[str]`, `subscription_status:
      Optional[str]` (`'active' | 'past_due' | 'canceled'`, null = never subscribed).
- [x] 3. Add an Alembic revision under `backend/migrations/versions/` adding those three columns +
      the index on `stripe_customer_id`, following the existing revisions' style.
- [x] 4. Create `backend/stripe_service.py`: reads `STRIPE_SECRET_KEY` / `STRIPE_PRICE_ID` /
      `STRIPE_WEBHOOK_SECRET` from env at call time (not import time, so tests and a keyless local
      run don't crash on import); exposes `is_configured()`, `get_or_create_customer(user)`,
      `create_checkout_session(user, success_url, cancel_url)`, `create_portal_session(user,
      return_url)`, and `verify_event(payload_bytes, signature_header)`. Keep every direct `stripe.`
      call inside this module so the router stays transport-only.
- [x] 5. Create `backend/routers/billing.py` with four routes:
      - `POST /billing/checkout-session` — `require_user`; 409 if already active premium; creates or
        reuses the Stripe customer, persists `stripe_customer_id`, returns `{"url": …}` for the
        frontend to redirect to. Pass `client_reference_id=user.id` so the webhook can map back to a
        user even if the customer record is somehow new.
      - `POST /billing/portal-session` — `require_user`; 400 if the user has no
        `stripe_customer_id`; returns `{"url": …}`.
      - `POST /billing/webhook` — **no auth**. Must read the **raw body** via `await request.body()`
        and verify it against the `Stripe-Signature` header. Parsing into a Pydantic model first
        re-serializes the JSON and breaks the signature check — this is the single most common way
        to get a permanently-failing webhook. Return 400 on a bad signature, 200 on any event we
        don't handle.
      - `GET /billing/config` — public, returns `{"enabled": is_configured()}` so the frontend can
        fall back to the current CTA when Stripe env vars are absent (e.g. a fresh local checkout).
- [x] 6. Implement the five webhook handlers in `billing.py`, all resolving the user by
      `stripe_customer_id` (falling back to `client_reference_id` on
      `checkout.session.completed`), and all applying decisions 3–5 above:
      - `checkout.session.completed` → store `stripe_subscription_id`, `is_premium=True`,
        `subscription_status='active'`, `premium_until = max(current, period_end)`
      - `invoice.paid` → same clamp on renewal, `subscription_status='active'`
      - `customer.subscription.updated` → sync `subscription_status`, same clamp
      - `customer.subscription.deleted` → `subscription_status='canceled'`,
        `stripe_subscription_id=None`, **`premium_until` untouched**
      - `invoice.payment_failed` → `subscription_status='past_due'`, no entitlement change
      Unknown event types: log the type only (never the payload) and return 200.
- [x] 7. Register the router in `backend/main.py` next to the others:
      `app.include_router(billing_router, prefix="/api")`. Confirm `/api/billing/webhook` resolves
      to the router and is not shadowed by the static-file catch-all.
- [x] 8. Extend `GET /api/me/quota` (`backend/routers/words.py:1220-1229`) with
      `"subscription_status": user.subscription_status` and
      `"has_billing_account": user.stripe_customer_id is not None`.
- [x] 9. Surface `subscription_status` in the admin users list (`routers/admin.py:100-112`, beside
      the existing `premium_active`) so support can see why someone lost access.
- [x] 10. Add the three keys to `render.yaml` `envVars` with `sync: false`.

### Frontend

- [x] 11. Add i18n keys to `frontend/lib/i18n/types.ts` + `ru.ts` + `en.ts` under `pricing`:
      `upgradeButton`, `manageButton`, `loginToUpgrade`, `activating`, `activated`, `checkoutError`,
      `cancelledNote`, `renewsOn`, `pastDue`.
- [x] 12. Rewrite the beta banner copy (`ru.ts:74`, `en.ts:74`) — it currently states payments are
      not accepted and the platform is entirely free, which becomes false the moment live keys are
      set. Coordinate with step 0.F.
- [x] 13. Make `PricingClient.tsx` stateful: on mount, `getToken()` + fetch `/api/me/quota` and
      `/api/billing/config`. Replace the `mailto:` anchor (lines 93-98) with one CTA that resolves
      to exactly one of four states — logged out → login link; Stripe not configured → today's
      existing contact CTA; premium active → "Manage subscription" → `POST /billing/portal-session`
      → redirect; otherwise → "Upgrade" → `POST /billing/checkout-session` → redirect. Keep the
      existing `bg-gray-900 … rounded-xl` button styling (standing constraint).
- [x] 14. Handle `?checkout=success` on `/pricing/`: show an "activating…" state and re-poll
      `/api/me/quota` every 2s for up to 10s, switching to the success state once `premium_active`
      is true, and to a "this can take a minute" note otherwise. The webhook is normally faster than
      the redirect, but it is not guaranteed to be, and a flat "success" that shows a still-free
      account reads as a broken payment. Handle `?checkout=cancelled` as a neutral dismissible note.

## Tests

- [x] 15. `backend/tests/test_billing_webhook.py` (TestClient + in-memory SQLite per
      `backend/conftest.py`), with the Stripe signature verification monkeypatched to return
      fixture event dicts:
      - a bad/missing signature → 400 and **no** DB mutation
      - `checkout.session.completed` → premium active, ids stored
      - **the same event delivered twice → identical `premium_until`** (decision 3)
      - a user with a leaderboard-gifted `premium_until` further out than the Stripe period end →
        `invoice.paid` does **not** shorten it (decision 4)
      - `customer.subscription.deleted` → status `canceled`, `premium_until` unchanged, and
        `is_premium_active` still true until that date passes
      - `invoice.payment_failed` → status `past_due`, entitlement unchanged
      - unknown event type → 200, no mutation
- [x] 16. `backend/tests/test_billing_endpoints.py`: `checkout-session` and `portal-session` both
      401 without a token; `portal-session` 400s without a `stripe_customer_id`; `checkout-session`
      409s for an already-premium user; `/billing/config` reports `enabled: false` with no env set.
- [x] 17. `frontend/tests/stripe-checkout-cta.spec.ts`: with `/api/me/quota` and
      `/api/billing/config` stubbed via `page.route`, assert `/pricing` renders the Upgrade CTA for
      a free user, the Manage CTA for a premium user, the fallback CTA when Stripe is disabled, and
      that no `mailto:` anchor remains in the Stripe-enabled states.
- [ ] 18. Manual end-to-end against Stripe **test** mode, with `stripe listen` running: pay with
      `4242 4242 4242 4242`, confirm Premium activates and the daily quota cap disappears; then
      cancel via the portal and confirm access persists to the period end. Also exercise the decline
      card `4000 0000 0000 0002`.

## Definition of Done

```bash
cd backend && python -m pytest tests/ -q
cd frontend && npx playwright test --reporter=list
cd frontend && npx tsc --noEmit
```

## Documentation

- [x] 19. Write `documentation/stripe-subscriptions.md`: the event → column mapping, decisions 1–7
      above with their reasoning, the "raw body or the signature check fails" gotcha, the
      "`whsec_` from `stripe listen` rotates every session" gotcha, the "price IDs and portal
      config are per-mode" gotcha, and the local run recipe (`stripe listen --forward-to
      localhost:8000/api/billing/webhook`).
- [x] 20. Cross-reference it from `documentation/grammar-lesson-lock-and-premium.md`, which
      currently describes premium as admin-granted only.
- [x] 21. Append entry `#11` to `documentation/CHANGELOG.md`.
- [x] 22. No component-library update expected — `/pricing` keeps its documented deviation and no
      shared component changes. If step 13 ends up touching anything shared, update the library in
      the same change and run `frontend/tests/design-system-parity.spec.ts`.

## Rollout

Production stays on the current CTA until `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID` and
`STRIPE_WEBHOOK_SECRET` are set in Render — `/billing/config` reports `enabled: false` without
them and step 13's fallback state renders. So this can ship to production before the Stripe account
is live, and go live later by pasting three env values (plus step 12's copy change and 0.F's legal
pages). Rolling back is the same three variables in reverse; already-created subscriptions keep
billing in Stripe, so a rollback longer than a billing cycle needs those subscriptions cancelled
from the dashboard.
