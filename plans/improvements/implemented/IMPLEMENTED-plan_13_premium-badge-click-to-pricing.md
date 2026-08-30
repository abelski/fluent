---
kind: feature
status: done
iteration: 1
max_iterations: 20
suggested_model: sonnet
suggested_effort: low
confirmed_model: sonnet
confirmed_effort: low
---

# Plan #13 — Premium badge click → /pricing

## Context

The user asked: every appearance of the "Premium" badge/word should redirect to the plans page
when clicked. A codebase audit (this session, verified by reading the actual files) found that
**most** "Premium" spots already link to `/pricing` — the real plan page with live Stripe
checkout/manage-subscription buttons (`frontend/app/pricing/PricingClient.tsx`):

- `frontend/app/dashboard/lists/page.tsx` / `phrases/page.tsx` — "🔒 Premium only" pill, already `<Link href="/pricing">`
- `frontend/app/LandingClient.tsx` — premium teaser card, already links to `/pricing`
- `tr.common.getPremium` CTA buttons (`grammar/page.tsx`, `lists/[id]/study/page.tsx`, `review/page.tsx`, `continue/page.tsx`) — already `<Link href="/pricing">`

Two gaps remain, confirmed with the user via `AskUserQuestion`:

1. **`frontend/components/Header.tsx:208-219`** — the emerald "Premium" pill next to the user's
   own avatar (this is the badge in the user's screenshot). Only rendered when `premiumUntil` is
   truthy, i.e. only for users who already have the plan. Currently a plain, non-interactive
   `<span data-testid="premium-badge">` with a hover tooltip showing the expiry date. Verified
   `/pricing` already handles the already-premium case gracefully (`PricingClient.tsx` branches on
   `premiumActive`/`has_billing_account`: shows a "Manage subscription" button hitting the Stripe
   portal-session endpoint, or renders nothing extra for admin-granted premium) — so linking this
   badge to `/pricing` is safe and doubles as a "manage your plan" entry point.

   **Constraint:** this badge sits *inside* the account-menu toggle `<button>` (`Header.tsx:191-228`
   wraps the whole avatar area). Nesting an `<a>`/`Link` inside a `<button>` is invalid HTML and
   this exact anti-pattern was already fixed elsewhere in this repo (changelog #1: "nested
   `<button>`-in-`<button>` accordion headers converted to `role="button"` divs"). Same fix shape
   here: make the badge itself a `role="button"` element with its own `onClick` (`router.push`,
   already available via `useRouter()` at `Header.tsx:37`) and `e.stopPropagation()` so clicking it
   navigates to `/pricing` instead of also toggling the dropdown, plus `onKeyDown` for Enter/Space
   and `tabIndex={0}` for keyboard access.

2. **`frontend/app/dashboard/practice/[id]/page.tsx:390-394`** — the amber "Premium" badge on a
   locked practice-test row. Plain `<span>`, not nested in any interactive element, so this one is
   a straightforward wrap in `next/link`'s `<Link href="/pricing">`.

Confirmed explicitly out of scope (admin-panel badges show *other users'* data / test config, not
the viewer's own plan — see Non-Goals).

No shared `PremiumBadge` component exists; each badge is an ad-hoc inline `<span>`. Introducing one
is unnecessary for a 2-file change — not proposed here (keeps solution minimal per repo convention).

**suggested_model/effort rationale:** mechanical, low-risk frontend-only change to 2 files following
an existing in-repo pattern (`role="button"` for a non-nestable interactive element; `Link` wrap for
the other) — no auth/payment/DB logic touched. Sonnet/low is sufficient.

## Goals

- Clicking the header's own "Premium" status pill (shown to already-premium users) navigates to `/pricing`.
- Clicking the amber "Premium" badge on a locked practice-test row navigates to `/pricing`.
- Both remain keyboard-accessible and visually signal they're clickable (cursor pointer + hover state), reusing each badge's existing color family — no new colors/tokens introduced.
- Clicking the header badge must NOT also toggle the account dropdown menu.
- No regression to existing tests that assert on `data-testid="premium-badge"` visibility/text/tooltip (`quota.spec.ts`, `stats-card-alignment.spec.ts`).

## Non-Goals

- Admin panel badges are NOT made clickable:
  - `frontend/app/dashboard/admin/page.tsx` (~1795) — status pill showing another user's premium/basic/admin role in the user-management table.
  - `frontend/app/dashboard/admin/page.tsx` (~3186) — "Premium" badge marking a test as premium-gated inside the admin test editor (sits inside an already-clickable row that opens the test editor).
- `frontend/app/dashboard/premium/page.tsx` and `frontend/app/pricing/PricingClient.tsx` headings are untouched — these are destination pages, not badges.
- The locked practice-test row's separate disabled lock-icon `<button>` (`practice/[id]/page.tsx:407-416`) stays disabled/non-functional — only the "Premium" badge itself becomes clickable. Making the whole row/lock-icon clickable is a separate, un-approved change.
- No redesign of `/dashboard/practice/[id]`'s heavy-border (`border-gray-900`) styling — the component library already documents this page as a deliberate, not-yet-migrated deviation; this change only adds interactivity, not a visual migration.
- No new shared `PremiumBadge` component.
- No backend changes — `/pricing`, Stripe checkout/portal, and entitlement logic are all pre-existing and untouched.

## Requirements

- Header badge click and keyboard activation (Enter/Space) navigate to `/pricing`; must not bubble to the parent avatar-menu button's click handler.
- Practice-page badge click navigates to `/pricing` via a real `<Link>` (so it also works with cmd/ctrl-click, matching every other premium link in the app).
- Both badges keep their current visible text, `Premium`/`t.premiumBadge` copy, and (for the header) tooltip content unchanged.

### Standing constraints
- All validation must be server-side (never frontend-only). N/A here — no server-side validation involved, this is pure client-side navigation to an existing, already-validated route.
- If this plan touches markup, styling, or a component: read `documentation/design system/Component Library (as-built).html` and `documentation/IMPLEMENTATION.md` first, use named design tokens (never a raw Tailwind step), and run `frontend/tests/design-system-parity.spec.ts` after any shared-shell/token change. Already checked: both badges' existing color classes (`emerald-50/200/700`, `amber-50/300/700`) are pre-existing, already-shipped raw-Tailwind-step usage — not introduced by this change, and `practice/[id]` is documented as a deliberate not-yet-migrated deviation, so no new deviation entry is needed. Reuse the same color families for hover states (e.g. `hover:bg-emerald-100`, `hover:bg-amber-100`); do not invent new colors. `Header.tsx` is shared across all pages, so run `design-system-parity.spec.ts` after the change even though no visual/shell pattern is being altered.
- Add autotest coverage for the new feature and run the relevant suite(s) as part of Validation.

## Implementation

- [x] 1. `frontend/components/Header.tsx` (~208-219) — convert the `premiumUntil` badge `<span data-testid="premium-badge">` into a keyboard-accessible clickable element: add `role="button"`, `tabIndex={0}`, `onClick={(e) => { e.stopPropagation(); setMenuOpen(false); router.push('/pricing'); }}`, and `onKeyDown` handling `Enter`/`Space` (`e.preventDefault()` + same navigation, since Space would otherwise scroll the page). Add `cursor-pointer` and a hover affordance reusing the existing emerald family (e.g. `hover:bg-emerald-100 transition-colors`). Keep the tooltip span/content and `data-testid="premium-badge"` unchanged so existing tests keep passing.
- [x] 2. `frontend/app/dashboard/practice/[id]/page.tsx` (~390-394) — wrap the `t.premiumBadge` `<span>` in a `<Link href="/pricing">` (import `Link` from `next/link` if not already imported in this file), add `cursor-pointer` + `hover:bg-amber-100 transition-colors`, and add `data-testid="practice-premium-badge"`.
- [x] 3. `documentation/design system/Component Library (as-built).html` — add a short note (near the existing premium-teaser-card / heavy-border-pages references) documenting that the header's own-status Premium pill and the locked practice-test Premium badge are both clickable links to `/pricing`, so the pattern is discoverable for future badges.
- [x] 4. `documentation/CHANGELOG.md` — append entry `#13` describing this change, referencing this plan file. (Deviation: a different, concurrently-completed plan claimed changelog entry `#13` first — for an unrelated Stripe/Telegram feature — before this edit was made, so this entry was filed as `#14` to keep changelog numbers unique. The plan file itself keeps its original `plan_13_premium-badge-click-to-pricing.md` name.)
- [x] 5. New Playwright spec `frontend/tests/premium-badge-click-to-pricing.spec.ts` covering:
  - Header: with a mocked premium quota response, click `getByTestId('premium-badge')` on a dashboard page → URL becomes `/pricing`, and the account dropdown menu did not open.
  - Header: keyboard activation (focus + `Enter`) also navigates to `/pricing`.
  - Practice page: with a mocked locked, `is_premium` test in the list response, click `getByTestId('practice-premium-badge')` → URL becomes `/pricing`.

## Validation

- [x] New spec passes: `cd frontend && npx playwright test premium-badge-click-to-pricing --reporter=list`
- [x] No regression in existing premium-badge tests: `cd frontend && npx playwright test quota.spec.ts stats-card-alignment.spec.ts --reporter=list`
- [x] Shared-shell regression check: `cd frontend && npx playwright test design-system-parity.spec.ts --reporter=list`
- [x] `cd frontend && npx tsc --noEmit`
- [ ] Manual smoke: run the local dev server, log in as (or mock) a premium user, confirm the header "Premium" pill shows a pointer cursor on hover, click it and land on `/pricing`, and confirm the dropdown menu did NOT open.
- [ ] Manual smoke: open a locked practice test category, confirm the amber "Premium" badge is clickable and navigates to `/pricing`.

## Definition of Done

```bash
cd frontend && npx tsc --noEmit
cd frontend && npx playwright test premium-badge-click-to-pricing quota.spec.ts stats-card-alignment.spec.ts design-system-parity.spec.ts --reporter=list
```
