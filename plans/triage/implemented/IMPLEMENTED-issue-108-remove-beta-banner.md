# Issue #108 — /dashboard/lists/

**Reported:** 2026-06-01 10:41:31
**Status:** open
**Description:** "нужно убрать лейбл сайт находится в бета тестировании"
(Remove the "This site is in beta" banner/label shown site-wide.)

## Root cause

`BetaBanner` is a standalone component rendered unconditionally in the root layout:
- `frontend/components/BetaBanner.tsx` — renders the amber strip using `tr.nav.beta`
- `frontend/app/layout.tsx` line ~10 imports `BetaBanner`, line ~61 renders `<BetaBanner />` between `<Header />` and main content

No DB flag or feature gate controls it — it is always shown.

## Fix plan

1. **Remove from layout** — `frontend/app/layout.tsx`:
   - Remove the `import BetaBanner` line
   - Remove the `<BetaBanner />` JSX element

2. **Delete the unused component** — delete `frontend/components/BetaBanner.tsx`

3. **Optional i18n cleanup** — remove `beta` and `betaBanner` keys from `nav` in `en.ts` and `ru.ts` if no other component references them (verify with grep first; `betaNotice` in grammar page is unrelated — leave it)

## Tests
1. Write a Playwright test in `frontend/tests/` that reproduces and verifies the fix for this issue.
2. Rebuild the frontend and restart the local server.
3. Run the new Playwright test and confirm it passes.
4. Leave the local server running so the user can manually verify the fix in the browser.

## Confirm resolution
Ask the user: "Issue #108 — Beta banner removed site-wide. Mark as resolved?"
Only if the user confirms:
1. Run `UPDATE mistake_report SET status = 'resolved' WHERE id = 108;` and report success.
2. Move the plan file to `plans/triage/implemented/` and add the `IMPLEMENTED-` prefix.
