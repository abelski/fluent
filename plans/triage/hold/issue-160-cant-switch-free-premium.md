---
kind: bugfix
status: draft
iteration: 0
max_iterations: 20
suggested_model: sonnet
suggested_effort: low
confirmed_model: null
confirmed_effort: null
---

# Issue #160 — /pricing/

**Reported:** 2026-08-22 13:13:32
**Status:** open
**Description:** не могу перейти на бесплатный Premium (can't switch to free Premium)

## Root cause
There is no self-service "get Premium" flow — Premium is only ever granted by an admin, either
manually via `PATCH /admin/users/{id}/premium` (`backend/routers/admin.py:704-724`) or automatically
as a weekly leaderboard reward (`backend/routers/admin.py:310-318`). The Premium card's only CTA
(`frontend/app/pricing/PricingClient.tsx:93-98`) is a bare `mailto:artyrbelski@gmail.com` anchor with
no in-app fallback or success feedback: on any device/browser without a configured default mail
client (common on mobile, Chromebooks, sandboxed/webview browsers), clicking it does nothing visible
at all — indistinguishable from "broken." This is compounded by the beta banner
(`frontend/lib/i18n/ru.ts:74` / `en.ts:74`) telling users the platform is "completely free," setting
an expectation of an easy self-serve switch that the actual "email us and wait 24h" flow doesn't
meet. The app already has a working, admin-visible, anonymous request mechanism
(`POST /api/feedback`, `backend/routers/feedback.py:27-46`, surfaced via the admin Feedback tab and
an existing `frontend/components/FeedbackModal.tsx` pattern) that can be reused verbatim instead of
inventing anything new.

suggested_model/suggested_effort reason: purely additive frontend change (one new small component
mirrored from an existing one, a handful of i18n string additions/edits, one CTA swap) that reuses an
already-existing, already-admin-visible backend endpoint verbatim — zero backend, auth, or payment
logic touched, and no ambiguity remains after the planning pass.

## Fix plan
- [ ] 1. Add new i18n keys (`requestButton`, `requestTitle`, `requestSubtitle`, `requestNotePlaceholder`, `requestSending`, `requestSent`, `requestError`) to the `pricing` block in `frontend/lib/i18n/types.ts`.
- [ ] 2. Add matching Russian copy for those keys to `frontend/lib/i18n/ru.ts` (e.g. `requestButton: 'Запросить Premium'`, `requestTitle: 'Запрос Premium-доступа'`, `requestSubtitle: 'Оставьте email — мы активируем доступ вручную в течение 24 часов.'`), and update the `contactUs` label from `'Написать нам'` to `'Запросить Premium'`. Keep `contactNote` as-is.
- [ ] 3. Add matching English copy for those keys to `frontend/lib/i18n/en.ts`, and update `contactUs` from `'Contact us'` to `'Request Premium'`.
- [ ] 4. Create `frontend/components/PremiumRequestModal.tsx` modeled on `frontend/components/FeedbackModal.tsx`: required email input, optional short note textarea, POST to `${BACKEND_URL}/api/feedback` with `email` and a `message` built from a fixed marker prefix (e.g. `"[Premium] Запрос доступа."` / `"[Premium] Access request."`) plus the optional note appended, inline success/error state (no page navigation), same visual style (`border-gray-900`, `rounded-2xl`) as `FeedbackModal`.
- [ ] 5. In `frontend/app/pricing/PricingClient.tsx`, replace the `mailto:` anchor (~lines 93-98) with a `<button>` that opens `PremiumRequestModal` (`useState` toggle), keeping the existing className/visual language (this page is a documented "heavy-border, left alone" deviation — do not migrate it to newer design tokens). Remove the mailto link entirely so there's a single unambiguous CTA.
- [ ] 6. Verify `POST /api/feedback` accepts the new `[Premium]`-prefixed message with no backend code changes, and that submissions appear correctly in `/dashboard/admin` → Feedback tab.
- [ ] 7. Manually smoke-test both locales (ru/en): submit the new Premium request form and confirm the inline success state appears without depending on a mail client being configured.
- [ ] 8. Confirm the three existing `FeedbackModal` call sites (`Footer.tsx`, `PhraseSession.tsx`, `dashboard/admin/page.tsx`) remain unaffected.

## Tests
- [ ] Write a Playwright test in `frontend/tests/` that reproduces and verifies the fix for this issue: `/pricing` renders a "Request Premium" button (not a `mailto:` link), clicking it opens the modal, submitting with a valid email shows the inline success state, and no navigation away from `/pricing` occurs.
- [ ] Run it: `cd frontend && npx playwright test <path-to-new-test> --reporter=list`

## Definition of Done

```bash
cd frontend && npx playwright test --reporter=list
```

## Confirm resolution
Ask the user: "Issue #160 — не могу перейти на бесплатный Premium. Mark as resolved?"
Only if the user confirms:
1. Run `UPDATE mistake_report SET status = 'resolved' WHERE id = 160;` and report success.
2. Move the plan file to `plans/triage/implemented/` and add the `IMPLEMENTED-` prefix.
