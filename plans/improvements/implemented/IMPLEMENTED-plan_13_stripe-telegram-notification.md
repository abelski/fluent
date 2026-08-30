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

# #13 — Telegram notification on Stripe payment events

## Context

Fluent already has both halves of this feature built independently, just not wired together:

- **Stripe webhook**: `backend/routers/billing.py` `POST /billing/webhook` (lines 156–248) already
  verifies signatures, resolves the paying `User`, and mutates entitlement (`is_premium`,
  `premium_until`, `subscription_status`) across 5 handled event types (`HANDLED_EVENTS`,
  lines 46–52): `checkout.session.completed`, `invoice.paid`, `customer.subscription.updated`,
  `customer.subscription.deleted`, `invoice.payment_failed`.
- **Telegram push**: `backend/telegram_service.py` — a single `send_telegram(text)` function,
  already called from 5 other places (feedback, mistake reports, admin "mail user", scheduler,
  startup ping). It no-ops silently if `TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID` are unset and
  swallows its own exceptions, so callers never need try/except.

`billing.py` currently never imports or calls `telegram_service` — that's the entire gap. This
plan wires the two together so the admin gets a Telegram ping on payment-lifecycle events,
without touching entitlement logic at all.

Two non-obvious issues surfaced during design review (a Plan-agent critique of the draft) that
change the implementation from "just add a `send_telegram()` call":

1. **`stripe_webhook` is `async def`; every existing `send_telegram` caller is sync.**
   `send_telegram()` does a blocking `httpx.post(..., timeout=5)`. Calling it directly from an
   `async def` route would stall the single asyncio event loop for up to 5s per notifying
   delivery — on every other concurrent async request in the app (other webhook deliveries,
   `auth.py`'s OAuth callback, `articles.py`'s import endpoint) — and risks pushing the
   webhook's own response time toward Stripe's delivery timeout, which triggers Stripe retries.
   Fix: dispatch via `await asyncio.to_thread(telegram_service.send_telegram, notify_text)`.
2. **Tests will silently start making real network calls.** `backend/.env` already has real
   `TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID` values, `database.py` calls `load_dotenv()` at import
   time, and `send_telegram()` reads env vars at call time — so the moment `billing.py` gains a
   `send_telegram` call, all 8 existing `test_billing_webhook.py` tests that exercise those
   branches (using fake emails like `checkout@example.com`) start POSTing to the real Telegram
   Bot API unless something patches it first. Fix: an **autouse** spy fixture in
   `backend/conftest.py` (protects this and every other test file, present and future — 4 of
   the 5 existing `send_telegram` call sites also have no dedicated tests today).

**suggested_model/effort rationale:** `billing.py` is the one file in the codebase whose own
docstring calls out strict, easy-to-get-wrong invariants (webhook-only entitlement writes,
absolute vs. incrementing `premium_until`, no processed-event table). This change adds no new
entitlement mutations, but it does touch that same file's control flow and an `async` route, and
getting the blocking-call and test-isolation issues above wrong would be easy to miss without
careful review — hence `opus`/`high` over a cheaper tier.

## Goals

- Send one Telegram message per Stripe webhook delivery that represents a payment-lifecycle
  event worth an admin's attention: new subscriber, renewal, failed payment, cancellation.
- Message includes: user email, amount + currency (where applicable), "Fluent Premium" (the
  app's only product/plan), and the Stripe event id (for pasting into the Stripe dashboard).
- Zero behavior change to entitlement logic (`is_premium`/`premium_until`/`subscription_status`
  writes are untouched).
- Zero real network calls from the test suite.

## Non-Goals

- No new Telegram bot / new chat — reuses the existing configured bot and admin chat id.
- No notification-delivery guarantee, retry, or dedup infrastructure for Telegram itself. Stripe
  webhook redelivery (rare; mostly an admin manually clicking "Resend" in the Stripe dashboard
  while debugging) can in theory produce a duplicate Telegram ping — this is accepted, not
  solved, consistent with the module's existing stance that there's no processed-event table
  because entitlement writes are idempotent by construction. Documented inline, not built around.
- No notification for `customer.subscription.updated` — see Requirements for why.
- No new DB table (no Payment/Order model) — the app sells one product; there's nothing to look
  up beyond what's already on the Stripe event payload.
- No user-facing news post via `/news-writer`. This is an internal/admin ops notification with
  no visible product surface — publishing a public news post about backend Telegram alerting
  would be irrelevant/confusing to end users. The feature-analyst flow's Phase 5 news-post step
  is deliberately skipped for this plan; flagged here rather than silently applied.

## Requirements

- **`checkout.session.completed`** → send: new-subscriber message with email, amount (`amount_total`)
  + currency, "Fluent Premium", Stripe event id.
- **`invoice.paid`** → send a renewal message **only when** `billing_reason == "subscription_cycle"`
  (a true renewal). When `billing_reason` is anything else (notably `subscription_create`, which
  fires for the *same* first payment `checkout.session.completed` already announces — Stripe
  creates and immediately pays the first invoice of a new subscription), send nothing, to avoid
  a misleading "renewed" ping on day one and a duplicate message for one purchase.
- **`invoice.payment_failed`** → send a payment-failed message with `amount_due` + currency,
  email, event id.
- **`customer.subscription.deleted`** → send a cancellation message (no amount — nothing was
  paid at cancellation time).
- **`customer.subscription.updated`** → send nothing. It overlaps with `invoice.paid` on every
  renewal (the module's own docstring already calls this pairing "harmless" for entitlement) and
  also fires on trial transitions, quantity/plan edits, and dunning status changes with no new
  failed invoice — none of those are "a payment happened." The real payment-lifecycle signals
  are fully covered by the other four branches.
- **Any event outside `HANDLED_EVENTS`** (already ack'd 200 and ignored) → send nothing.
- Telegram dispatch happens **after** the existing shared `session.commit()` (line 247) succeeds,
  not inline per-branch — so a DB write failure never produces a misleading "success" ping. This
  also naturally caps a single webhook delivery to at most one Telegram message.
- Telegram dispatch must not block the event loop: `await asyncio.to_thread(telegram_service.send_telegram, notify_text)`.

### Standing constraints

- All validation must be server-side (never frontend-only). N/A beyond this — no user input is
  being validated here, this is outbound-only.
- Design system / markup / styling: **N/A** — this plan is backend-only, no frontend files touched.
- Add autotest coverage for the new feature and run the relevant suite(s) as part of Validation.

## Implementation

- [x] 1. `backend/routers/billing.py` — add `import asyncio` and `import telegram_service` to the top import block, alongside the existing `import stripe_service`.
- [x] 2. `backend/routers/billing.py` — add a `_field(obj, key)` helper near `_customer_id` (~line 91), mirroring its existing dict-or-object shim (`obj.get(key) if isinstance(obj, dict) else getattr(obj, key, None)`), for reading `amount_total` / `amount_paid` / `amount_due` / `currency` / `billing_reason` off event objects and `id` off the top-level event.
- [x] 3. `backend/routers/billing.py` — add a `_money(amount_cents, currency)` helper near it: `f"{amount_cents / 100:.2f} {str(currency).upper()}"` when both are present, else a plain fallback string (e.g. `"amount unknown"`) — check `amount_cents is None` explicitly, not falsy, since `0` is a theoretically valid amount.
- [x] 4. `backend/routers/billing.py` — right before the `if event_type == "checkout.session.completed":` chain (~line 195), capture `event_id = _field(event, "id")` and declare `notify_text: Optional[str] = None`.
- [x] 5. `backend/routers/billing.py` — in the `checkout.session.completed` branch, after the existing entitlement mutation, set `notify_text = f"💳 New Premium subscriber\n{user.email}\n{_money(_field(obj, 'amount_total'), _field(obj, 'currency'))} — Fluent Premium\nEvent: {event_id}"`.
- [x] 6. `backend/routers/billing.py` — in the `invoice.paid` branch, after the existing entitlement mutation, set `notify_text` to the renewal message **only if** `_field(obj, "billing_reason") == "subscription_cycle"`: `f"🔄 Premium renewed\n{user.email}\n{_money(_field(obj, 'amount_paid'), _field(obj, 'currency'))} — Fluent Premium\nEvent: {event_id}"`.
- [x] 7. `backend/routers/billing.py` — in the `invoice.payment_failed` branch, set `notify_text = f"⚠️ Payment failed\n{user.email}\n{_money(_field(obj, 'amount_due'), _field(obj, 'currency'))} — Fluent Premium\nEvent: {event_id}"`.
- [x] 8. `backend/routers/billing.py` — in the `customer.subscription.deleted` branch, set `notify_text = f"🚫 Subscription canceled\n{user.email}\nFluent Premium\nEvent: {event_id}"`.
- [x] 9. `backend/routers/billing.py` — leave `customer.subscription.updated` untouched (no `notify_text` assignment).
- [x] 10. `backend/routers/billing.py` — after the existing `session.commit()` (line 247) and before `return {"received": True, "handled": True}`, add: `if notify_text:\n    await asyncio.to_thread(telegram_service.send_telegram, notify_text)`. Add a one-line comment noting that Stripe redelivery can duplicate this ping and that's accepted, not solved (per Non-Goals).
- [x] 11. `backend/conftest.py` — import `telegram_service` and add an autouse fixture: `@pytest.fixture(autouse=True)\ndef _telegram_spy(monkeypatch):\n    sent = []\n    monkeypatch.setattr(telegram_service, "send_telegram", lambda text: sent.append(text))\n    return sent` — protects every test in the suite (present and future) from real Telegram network calls; tests that care about content depend on it by name.
- [x] 12. `backend/tests/test_billing_webhook.py` — add a new `# ── 6. Telegram notifications ──` section with: (a) `checkout.session.completed` → asserts one message containing email/amount/"Fluent Premium"/event id; (b) `invoice.paid` with `billing_reason="subscription_cycle"` → renewal message sent; (c) `invoice.paid` with `billing_reason="subscription_create"` → zero messages; (d) `invoice.payment_failed` → payment-failed message sent; (e) `customer.subscription.deleted` → cancellation message sent; (f) `customer.subscription.updated` → zero messages; (g) unhandled event type → zero messages (extend `test_unhandled_event_type_is_acknowledged_without_mutation`).
- [x] 13. `backend/.env.example` — add `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID`, `STRIPE_WEBHOOK_SECRET`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` placeholder lines (pre-existing gap: real `.env` has all five, `.env.example` has none of them — cheap to fix while in this neighborhood).
- [x] 14. `documentation/stripe-subscriptions.md` — add a short "Telegram notifications" section: which of the 5 handled events notify and which don't (and why `customer.subscription.updated` and non-`subscription_cycle` `invoice.paid` are silent), the `asyncio.to_thread` reason, and the accepted-not-solved redelivery-duplicate tradeoff.
- [x] 15. `documentation/CHANGELOG.md` — append entry `#13` describing this change, per repo convention.

## Validation

- [x] Targeted: `cd backend && .venv/bin/python -m pytest tests/test_billing_webhook.py -q`
- [x] Full backend suite: `cd backend && .venv/bin/python -m pytest -q` — confirms the autouse spy doesn't break unrelated tests and no other test file starts leaking a real Telegram call.
- [x] Edge case: a single simulated new-subscriber signup (`checkout.session.completed` then `invoice.paid` with `billing_reason=subscription_create`) produces exactly one Telegram message total, not two.
- [x] Edge case: `customer.subscription.updated` and an unhandled event type each produce zero Telegram messages.
- [ ] Manual smoke (local, real Telegram): with the backend running locally and real `.env` Stripe test-mode + Telegram vars set, use the Stripe CLI (`stripe listen --forward-to localhost:8000/api/billing/webhook` + `stripe trigger checkout.session.completed`) or an equivalent signed test event, and confirm a real message lands in the admin Telegram chat with correct email/amount/event id.

## Definition of Done

```bash
cd backend && .venv/bin/python -m pytest -q
```
