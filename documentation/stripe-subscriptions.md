# Stripe subscriptions — how Premium is actually sold (#11)

Feature #11. Code: `backend/stripe_service.py`, `backend/routers/billing.py`,
`frontend/app/pricing/PricingClient.tsx`.
Tests: `backend/tests/test_billing_webhook.py`, `backend/tests/test_billing_endpoints.py`,
`frontend/tests/stripe-checkout-cta.spec.ts`.
Plan: `plans/improvements/active/plan_11_stripe-subscription.md` (Part 0 there is the dashboard
setup checklist).

## What this does and does not own

Premium as an *entitlement* predates Stripe and is unchanged: `user.is_premium` +
`user.premium_until`, read through `quota.is_premium_active()`, which gates the daily quota,
personal word/phrase lists, the Chrome extension and grammar lesson ordering.

Stripe only keeps `premium_until` pointing at the end of the paid period. Nothing downstream of
`is_premium_active()` knows Stripe exists. The two pre-existing grant paths still work untouched:
`PATCH /api/admin/users/{id}/premium` (support) and the weekly leaderboard reward
(`scheduler.py`, which *adds* 7 days).

Three nullable columns on `User` record only *why* someone has premium — never whether:
`stripe_customer_id` (indexed; every webhook resolves its user by it), `stripe_subscription_id`,
`subscription_status` (`active` | `past_due` | `canceled`; NULL = never subscribed, which is
deliberately distinguishable from "cancelled").

## Endpoints

| Route | Auth | Purpose |
| --- | --- | --- |
| `GET /api/billing/config` | public | `{enabled}` — lets the frontend fall back to the old CTA |
| `POST /api/billing/checkout-session` | JWT | returns a hosted Stripe Checkout URL |
| `POST /api/billing/portal-session` | JWT | returns a Customer Portal URL |
| `POST /api/billing/webhook` | **none** | the signature *is* the authentication |

## Decisions, and why

**Hosted Checkout + hosted Customer Portal, not Stripe Elements.** Card data never reaches our
origin (lightest PCI scope), the static Next export gains no client-side Stripe dependency, and
cancel / update-card / invoice-history UI comes free instead of being three more screens. The cost
is that the Customer Portal must be *activated in the dashboard per mode* — see gotchas.

**The webhook is the only writer of entitlement.** `success_url` grants nothing: anyone can type
`/pricing/?checkout=success`. The success screen only polls `GET /api/me/quota` for state the
webhook already wrote.

**Handlers write `premium_until` as an absolute value, never `+= 1 month`.** Stripe retries and
redelivers; an incrementing handler double-extends on redelivery. Writing the subscription's own
period end is idempotent by construction — which is why there is **no processed-event table** and
no dedup bookkeeping anywhere in this feature, and why overlapping handlers (`invoice.paid` and
`customer.subscription.updated` both fire on a renewal) are harmless. If you ever change these
handlers to do arithmetic, you must add event deduplication in the same change.

**…but clamped with `max()` (`_extend_premium`).** The weekly leaderboard reward pushes
`premium_until` 7 days out. A plain overwrite would silently delete a subscriber's reward days at
their next renewal, so the date never moves backwards.

**Cancellation revokes nothing.** `customer.subscription.deleted` clears the subscription id and
sets the status, but leaves `premium_until` and `is_premium` alone: the user keeps the period they
paid for and `is_premium_active()` expires them when it elapses. There is no expiry job and no
revocation code path — deliberately.

**`/api/me/quota` was extended rather than adding `/api/me/subscription`.** It already returned
`is_premium` / `premium_until` / `premium_active` and was already fetched by the frontend; it now
also returns `subscription_status` and `has_billing_account`. One round trip fewer.

**Return to `/pricing/?checkout=success`, not a new `/pricing/success/` route.** Under
`output: 'export'` + `trailingSlash: true` every `success_url` path must correspond to an exported
directory or it 404s in production. A query param on a page that already exists avoids that
entirely.

**`is_configured()` requires the webhook secret, not just key + price.** Checkout without a
verifiable webhook would take money and never grant premium — strictly worse than showing no
button. Missing any of the three ⇒ `/billing/config` reports `enabled:false` ⇒ the page renders
the pre-#11 contact CTA and the beta banner. This is also the rollout switch: the feature can ship
to production before the Stripe account is live and go live by pasting three env vars.

## Webhook event → effect

| Event | Effect |
| --- | --- |
| `checkout.session.completed` | link customer + subscription ids, `is_premium=True`, status `active`, extend |
| `invoice.paid` | extend to the new period end, status `active` |
| `customer.subscription.updated` | sync status; extend when `active`/`trialing` |
| `customer.subscription.deleted` | status `canceled`, clear subscription id, **`premium_until` untouched** |
| `invoice.payment_failed` | status `past_due`, **no entitlement change** (Stripe dunning retries) |

Anything else → 200 + ignored. Returning non-2xx for an unhandled type makes Stripe retry forever.
An event for an unknown customer also returns 200, for the same reason.

## Telegram notifications (#13)

The webhook pings the admin's existing Telegram chat (`telegram_service.send_telegram`, the same
bot used by feedback/reports/scheduler) on payment-lifecycle events. Message content: user email,
amount + currency where one exists, "Fluent Premium", and the Stripe **event id** — paste that into
the dashboard to find the delivery.

| Event | Notifies? |
| --- | --- |
| `checkout.session.completed` | ✅ "💳 New Premium subscriber" (`amount_total`) |
| `invoice.paid`, `billing_reason == "subscription_cycle"` | ✅ "🔄 Premium renewed" (`amount_paid`) |
| `invoice.paid`, any other `billing_reason` | ❌ silent |
| `invoice.payment_failed` | ✅ "⚠️ Payment failed" (`amount_due`) |
| `customer.subscription.deleted` | ✅ "🚫 Subscription canceled" (no amount) |
| `customer.subscription.updated` | ❌ silent |
| anything outside `HANDLED_EVENTS` | ❌ silent |

**Why `invoice.paid` is gated on `billing_reason`.** Stripe creates *and immediately pays* the
first invoice of a new subscription, so one purchase delivers both `checkout.session.completed` and
an `invoice.paid` with `billing_reason=subscription_create`. Notifying on both would send two
messages for one payment, and the second would falsely read "renewed" on day one. Only
`subscription_cycle` — a real renewal — notifies.

**Why `customer.subscription.updated` is silent.** It overlaps `invoice.paid` on every renewal (the
same pairing the entitlement handlers call harmless above) and also fires on trial transitions,
plan/quantity edits and dunning status changes where no payment happened at all. The four other
branches already cover every real payment signal.

**Dispatch is `await asyncio.to_thread(telegram_service.send_telegram, …)`, not a direct call.**
`send_telegram()` is synchronous and does a blocking `httpx.post(..., timeout=5)`, and
`stripe_webhook` is `async def` — a direct call would stall the whole event loop for up to 5s per
notifying delivery (blocking every other concurrent request) and push the webhook's own response
toward Stripe's delivery timeout, which triggers retries. Every *other* `send_telegram` caller in
the app is a sync `def`, where this does not apply.

**One message per delivery, sent after `session.commit()`.** Each branch only sets a local
`notify_text`; the single send happens after the commit succeeds, so a failed DB write can never
produce a "payment succeeded" ping. Stripe redelivery (mostly an admin clicking "Resend" while
debugging) can therefore duplicate a ping — **accepted, not solved**, consistent with there being
no processed-event table: entitlement stays correct, the admin just sees the message twice.

**Tests never hit the real Bot API.** `backend/.env` holds real Telegram credentials and
`send_telegram()` reads them at call time, so `backend/conftest.py` neutralises the function
twice: a module-level no-op assigned at import time (covers `main.py`'s startup ping, which fires
inside the *session*-scoped `client` fixture and therefore before any function-scoped fixture
exists), plus an **autouse** `_telegram_spy` fixture that swaps in a list-appender per test. Tests
that assert on message content just request `_telegram_spy` by name.

## Gotchas (each of these cost real debugging time somewhere)

**The webhook must read the RAW body.** `await request.body()` — binding a Pydantic model
re-serialises the JSON, changing the bytes, and the signature then never matches. This fails
100% of the time and looks like a Stripe-side problem.

**`stripe listen`'s `whsec_…` rotates every run.** The local webhook secret is not stable: each
new `stripe listen` session prints a different one, and `backend/.env` must be updated to match.
The CLI must stay running or no local webhooks arrive at all. The *dashboard* endpoint secret
(production) is stable.

**Price ids and Customer Portal config are per-mode.** A `price_…` created in test mode does not
exist in live mode, and the Customer Portal must be activated separately in each. `STRIPE_PRICE_ID`
therefore has to be swapped together with `STRIPE_SECRET_KEY` — a live key with a test price id
fails at checkout creation. If the portal was never activated for the mode you are in,
`billing_portal.Session.create` raises and `/billing/portal-session` returns 502; there is no
code-side workaround.

**Stripe moved two fields between API versions; we read both shapes.** `current_period_end` left
the Subscription object in `2025-03-31.basil` and now lives on each subscription *item*, and
`invoice.subscription` became `invoice.parent.subscription_details.subscription`. Rather than
pinning an API version, `stripe_service.subscription_period_end()` and
`subscription_id_from_invoice()` accept either shape, so upgrading the `stripe` package cannot
silently break entitlement. Both shapes are covered by tests.

**`stripe.error` is no longer an importable submodule** in stripe-python v12+. Use the top-level
`stripe.SignatureVerificationError`, which works on both v11 and v15.

**Stubbing `/api/me/quota` in a Playwright spec? `Header` calls it too.** `components/Header.tsx`
fetches `/api/me/quota` on mount, and `Header` is in the root layout — so on `/pricing` there are
**two** independent callers of that endpoint. A `page.route` mock that switches behaviour on an
nth-call counter ("first call free, then subscribed") therefore hands the pricing page's *first*
poll the second response: `?checkout=success` skipped the `activating` state and jumped straight to
`activated`, and the spec asserting the wait failed 100% of the time while an isolated repro of the
same effect passed. Gate such mocks on a flag the test flips explicitly, never on a call count.

**`FRONTEND_URL` must match whichever local server mode is actually running.**
`create_checkout_session`'s `success_url`/`cancel_url` are built from `FRONTEND_URL`
(`billing.py:56`), not from the incoming request's own origin. Day-to-day frontend dev
(`DEV=true` + `next dev`) runs on port 3000, so that's `.env`'s usual value — but Playwright/e2e
runs (and production) serve everything from one origin (`DEV=false`, backend on 8000). Leave
`FRONTEND_URL=http://localhost:3000` while testing Checkout against the `DEV=false` single-origin
server and the post-payment redirect lands on a dead port: Stripe's own confirmation page loads
fine, the webhook still fires and still grants Premium (delivery doesn't depend on the browser
redirect succeeding), but the browser itself dead-ends on a connection error instead of showing
`/pricing/?checkout=success`. Point `FRONTEND_URL` at whichever port is actually serving the app
before testing checkout locally.

**The Stripe CLI now provisions ephemeral, claimable "sandboxes."** `stripe login` authenticates a
*person*, not necessarily a usable API key — `stripe products list` can still fail with "You have
not configured API keys yet" right after a successful login if the authorized context has no test
key attached to it (this account's context, for instance, came back `live`-only, and mutating
commands refuse to run against it without an explicit `--live`). `stripe sandbox create
--non-interactive --from-git` provisions a temporary sandbox account with working test keys
immediately — no browser needed — but it's a **separate account from whatever you're already
logged into**, and it **expires in 7 days unless claimed** via the `claim_url` it prints (which
does need a browser, to attach it to the real account). Anything created in it (product, price,
customer, subscription) disappears with it if it's never claimed.

**Stripe's hosted Checkout page has an "I am an AI agent acting on behalf of someone else"
disclosure checkbox.** It's accessibility-only (real `<input type="checkbox">`, but positioned
off-canvas — a normal Playwright `click()` times out with "element is outside of the viewport" no
matter how it's scrolled). Toggle it with `element.click()` via `page.evaluate`, not a pointer
click. An agent driving real Checkout end-to-end should check it.

## Frontend return states

`/pricing/?checkout=success` never asserts success on its own. `PricingClient` shows `activating`,
polls `/api/me/quota` 5× at 2s, and then resolves to either `activated` (`premium_active` true) or
`activatingSlow` — "payment received, activation can take up to a minute". The third branch matters:
the webhook is normally faster than the browser redirect but is not guaranteed to be, and a flat
"success" over a still-free account reads as a broken payment, while a spinner that never resolves
reads as a lost one. `?checkout=cancelled` is a neutral "you were not charged" note.

## Running it locally

```bash
# 1. one terminal — the CLI must stay up, and it prints the whsec_ to put in backend/.env
stripe listen --forward-to localhost:8000/api/billing/webhook

# 2. backend/.env (TEST values)
STRIPE_SECRET_KEY=sk_test_…
STRIPE_PRICE_ID=price_…        # the test-mode price id
STRIPE_WEBHOOK_SECRET=whsec_…  # from the command above, re-copy each session

# 3. usual server, then visit /pricing
cd backend && uvicorn main:app --reload --port 8000
```

Test cards: `4242 4242 4242 4242` succeeds, `4000 0000 0000 0002` is declined. `stripe trigger
invoice.paid` replays a renewal without waiting a month.

The automated tests need none of this — they monkeypatch `stripe_service`, so they run with no
keys and no network.
