---
kind: bugfix
status: done
iteration: 1
max_iterations: 10
suggested_model: sonnet
suggested_effort: low
confirmed_model: sonnet
confirmed_effort: low
---

# Issue #176 — /pricing/

**Reported:** 2026-09-14 12:28:42
**Status:** open
**Description:** Когда кликаешь по "конверту" - часть текста в списке выезжает за экран мобильного телефона. (When you click the envelope/inbox icon, part of the text in the list overflows off the mobile phone screen.)

## Root cause
The inbox dropdown (`frontend/components/InboxMenu.tsx:144-146`) is `absolute right-0` relative to its own wrapper div (`InboxMenu.tsx:113`), sized up to 320px wide. On mobile the inbox icon is not the rightmost header control — the language toggle, avatar/premium badge, and hamburger sit to its right (`Header.tsx:177-309`), so anchoring a ~320px panel to `right-0` on that inboard trigger pushes its left edge to a negative x-coordinate on phone widths. `body { overflow-x: hidden }` (`globals.css:14`) clips that region silently instead of scrolling, cropping the leftmost part of each message row. This is global (mounted once in `frontend/app/layout.tsx`), not `/pricing`-specific — that's just where the user happened to notice it. Suggested tier: sonnet/low — single file, two small Tailwind class edits, root cause fully verified, no ambiguity.

## Fix plan
- [x] 1. In `frontend/components/InboxMenu.tsx:113`, remove `relative` from the outer wrapper div's className (keep `ref={wrapRef}` — only used for click-outside detection). With no positioned ancestor in between, the dropdown's containing block resolves to `<header>` (`Header.tsx:151`, already `relative`), which spans the full viewport width — the correct anchor.
- [x] 2. In `frontend/components/InboxMenu.tsx:144-146`, add `top-full` to the dropdown's className (no longer inherits a usable static top from the wrapper) and change `right-0` to `right-4 min-[1000px]:right-8` to mirror `Header.tsx`'s own row padding (`px-4 min-[1000px]:px-8`). Keep `mt-2` and the existing `w-[min(20rem,calc(100vw-2rem))]` width clamp.
- [x] 3. Manually verify at mobile widths (360/375/390/414px) that opening the inbox dropdown on `/pricing/` and on one `/dashboard/*` page shows the full panel on-screen with no left-side clipping, and that the badge/hamburger/avatar still render normally.

## Tests
- [x] Write a Playwright test in `frontend/tests/` that reproduces and verifies the fix for this issue (extend `frontend/tests/inbox.spec.ts` with a mobile-viewport assertion that the dropdown's bounding box stays within `[0, viewportWidth]`).
- [x] Run it: `cd frontend && npx playwright test frontend/tests/inbox.spec.ts --reporter=list`

## Definition of Done

```bash
cd frontend && npx playwright test --reporter=list
```

## Confirm resolution
Ask the user: "Issue #176 — envelope/inbox dropdown text overflows off mobile screen on /pricing/. Mark as resolved?"
Only if the user confirms:
1. Run `UPDATE mistake_report SET status = 'resolved' WHERE id = 176;` and report success.
2. Move the plan file to `plans/triage/implemented/` and add the `IMPLEMENTED-` prefix (`issue-176-inbox-dropdown-mobile-overflow.md` → `plans/triage/implemented/IMPLEMENTED-issue-176-inbox-dropdown-mobile-overflow.md`).
