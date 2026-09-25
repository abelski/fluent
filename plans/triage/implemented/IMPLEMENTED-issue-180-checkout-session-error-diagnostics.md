---
kind: bugfix
status: done
iteration: 3
max_iterations: 20
suggested_model: opus
suggested_effort: medium
confirmed_model: opus
confirmed_effort: medium
---

# Issue #180 — /pricing/

**Reported:** 2026-09-25 08:45:12 UTC
**Status:** open
**Description:** Не удалось открыть оплату. Попробуйте ещё раз.
💳
Premium оформляется через Stripe — оплата картой, отменить можно в любой момент.

## Root cause

**Test-mode Stripe ids are stored in the prod DB for the two launch-day accounts.** Live Stripe
doesn't know those ids, so every call fails with a 502. The frontend then shows the same generic
`checkoutError` text for both paths.

| Account | Stored ids | Button shown | Failing call |
| --- | --- | --- | --- |
| alexshag82 (reporter) | `cus_VACOTsL5gezbNP`, no sub | Upgrade | `POST /api/billing/checkout-session` → `Session.create(customer=…)` |
| artyrbelski (admin) | `cus_VABO22Rqwges80`, `sub_1U9s…` active | Manage | `POST /api/billing/portal-session` → `billing_portal.Session.create(customer=…)` |

Evidence (prod DB, read-only, 2026-09-25):
- **Launch-day timing.**
  - The Stripe code first landed in `eae20f3` at 2026-08-29 19:03 UTC.
  - The admin's subscription started 2026-08-29 19:33 UTC (`premium_until` is 2026-09-29 19:33).
  - The reporter's customer id comes right after the admin's in Stripe's time-ordered id sequence.
    These are the two oldest customer ids in the DB.
  - That matches local testing with an `sk_test_` key while the local backend was pointed at the
    prod Neon DB.
- **New accounts work.** The user confirmed that a different account opens Stripe fine. Two new
  customers (`cus_VK95…`, `cus_VK96…`) were created at 08:47–08:48 today. Live subscriptions also
  succeeded on 09-20 through 09-24. So the price, key, URLs and deploy are fine. The only pricing
  diff since the last good checkout is i18n text (`cce02e8`).
- **The other error paths are ruled out:**
  - 401: the report itself needed a valid token (`reports.py` `require_user`), and it arrived with a
    `user_id`.
  - 409: the reporter is not Premium.
  - 503: the button only renders when `/billing/config` is enabled.

Still to confirm, in the Stripe Dashboard in **live** mode: search both `cus_` ids. "No such
customer" confirms it. If the admin's customer does exist in live, the portal failure is instead
"Customer Portal not activated in live mode" (Settings → Billing → Customer portal), which has no
code fix.

Diagnosis took this long because `billing.py` logs only the exception class name.

Model: opus / medium. The change clears Stripe linkage on the billing path (data-integrity risk),
but the diff is small.

## Fix plan

**Scope shipped on `fix/180-stripe-error-alerts` (user directive, 2026-09-25):** steps 2 and 7, plus the backend tests below. The reporter's data fix (step 8) is left for the user to run. Update: the user then said "start fixing", so steps 3–6 are in scope now. They only trigger on Stripe's `resource_missing`/`customer` error, so they are safe whatever the Stripe dashboard shows.

- [x] 1. (User-owned, not a code step. The Telegram alert confirms it after deploy.) Ask the user to confirm in the Stripe Dashboard (live mode) that both `cus_VACOTsL5gezbNP`
  and `cus_VABO22Rqwges80` are missing. Record the result here.
- [x] 2. `backend/routers/billing.py`: add a `_report_stripe_failure(what, user, exc)` helper (logs **and** sends a Telegram alert with email, customer id and Stripe detail) and use
  it in the checkout-session and portal-session `except` blocks.
  - For `stripe.StripeError`, log the class name, `code`, `param`, `http_status` and `request_id`.
  - Never log the api key, headers, or `str(exc)` of non-Stripe exceptions.
- [x] 3. `backend/stripe_service.py`: add a helper `_is_missing_customer(exc)`. It is true for
  `stripe.InvalidRequestError` with `code == "resource_missing"` and `param == "customer"`.
- [x] 4. `stripe_service.create_checkout_session`: self-heal a missing customer.
  - On a missing customer, log a warning and clear `stripe_customer_id`, `stripe_subscription_id`
    and `subscription_status`. A subscription can't exist without its customer, so clearing them is
    safe.
  - Then commit, call `get_or_create_customer` again, and retry `Session.create` once.
  - Leave `is_premium` and `premium_until` alone.
- [x] 5. Portal endpoint: on a missing customer, clear the same three fields, commit, and return 409
  (`"Billing account not found"`) instead of 502.
- [x] 6. `frontend/app/pricing/PricingClient.tsx` `go()`: on 409, re-fetch the quota and clear busy.
  - This makes the CTA re-render: Upgrade for the reporter, and nothing for the admin, whose
    admin-granted premium has nothing to manage.
  - Everything else keeps `checkoutError`.
- [x] 6b. (User feedback, 2026-09-25: "clearing isn't reversible — log it somewhere.") Add a
  `StripeLinkageAudit` table (`stripe_linkage_audit`, created by startup's create_all). In the same
  commit as the clear, `clear_stripe_linkage` stores the old customer id, sub id and status there,
  and sends Telegram a restore `UPDATE`. Tests assert the audit row and the restore SQL.
- [x] 7. Stop it recurring. Add a short "local backend + `sk_test_` key + prod DB writes test-mode
  ids into prod" gotcha to `documentation/stripe-subscriptions.md`, next to "Price ids and
  Customer Portal config are per-mode". Name the self-heal as the safety net.
- [x] 8. (Handed to the user, 2026-09-25. Not for the implementer.) Data fix. Ask the user first, and never auto-run a write on prod.
  - With steps 4–5 shipped, both accounts heal on their next click.
  - Decided 2026-09-25: steps 4–5 are deferred, so the user runs both writes by hand. Claude's prod
    writes are blocked by the permission classifier.
  - Reporter: clear the stale customer id.
    `UPDATE "user" SET stripe_customer_id = NULL WHERE id = '6c5fc379-8a2f-4a6a-af96-b5c9d609aa98' AND stripe_customer_id = 'cus_VACOTsL5gezbNP' AND stripe_subscription_id IS NULL;`
  - Admin: permanent admin premium (the user chose NULL).
    `UPDATE "user" SET premium_until = NULL WHERE email = 'artyrbelski@gmail.com' AND is_admin;`
  - The admin's stale `cus_VABO…`/`sub_1U9s…` stay for now. Leave them until the Telegram alert
    (after deploy) shows what the portal failure really is.

## Tests
- [x] `backend/tests/test_billing_endpoints.py`:
  - (a) Checkout with a missing customer: `Session.create` raises `resource_missing/customer` once,
    then succeeds. Expect a 200 with a url, the DB holding the new `cus_…`, and the old sub id and
    status cleared.
  - (b) Checkout where `Session.create` keeps failing for another reason: expect a 502, and `caplog`
    holding `code` and `request_id` but no `sk_`.
  - (c) Portal with a missing customer: expect a 409 and the three fields cleared, with `is_premium`
    and `premium_until` unchanged.
- [x] Run it: `cd backend && .venv/bin/python -m pytest tests/test_billing_endpoints.py -q`
- [x] `frontend/tests/stripe-checkout-cta.spec.ts`, reusing `login`, `stubBilling` and `stubQuota`:
  - (a) A 502 on checkout shows `checkout-error` and re-enables the button. This reproduces #180.
  - (b) A 409 on portal-session re-fetches the quota, and the CTA changes (stub the second quota
    call as FREE, then expect `premium-cta-upgrade`).
- [x] Run it: `cd frontend && npx playwright test tests/stripe-checkout-cta.spec.ts --reporter=list`

## Review
- [x] Code review passed (round 3)

## Definition of Done

```bash
cd frontend && npx playwright test --reporter=list
cd backend && .venv/bin/python -m pytest -q
```

User-facing change: the pricing error and the CTA re-render after a 409. Evidence screenshots go in
`temp_files/screenshots/issue-180-checkout-session-error-diagnostics/`. Mock `/api/billing/config`
as `{"enabled": true}`.
- RU + EN: the error state and the post-409 CTA.
- Mobile at 375px and desktop.
- Screenshots of each.

## Confirm resolution
Ask the user: "Issue #180 — Не удалось открыть оплату (Stripe checkout on /pricing/). Mark as resolved?"
Only if the user confirms:
1. Run `UPDATE mistake_report SET status = 'resolved' WHERE id = 180;` and report success.
2. Move the plan file to `plans/triage/implemented/` and add the `IMPLEMENTED-` prefix
   (`plans/triage/implemented/IMPLEMENTED-issue-180-checkout-session-error-diagnostics.md`).
