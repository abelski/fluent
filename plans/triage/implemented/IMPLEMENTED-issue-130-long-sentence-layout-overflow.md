# Issue #130 — /dashboard/grammar/

**Reported:** 2026-06-20 10:47:54
**Status:** open
**Description:** Длинные предложения. Верстка выезжает за пределы экрана в каждом втором упражнении

## Root cause

The `InlineSentenceInput` component in `frontend/app/dashboard/grammar/page.tsx` has three compounding layout issues:

1. **`whitespace-pre` on the "before" text span (line ~143)** prevents the text before the blank from wrapping. A sentence like "Egzaminas šimtas penkiasdešimt aštunt___" has 38+ chars that force horizontal overflow on mobile.
2. **Font size too large for mobile** (`text-2xl` = 24px monospace). A 38-char monospace string at 24px needs ~547px -- well beyond a 320-375px mobile viewport.
3. **No `overflow-wrap`** on the `<p>` container. The `inline-flex flex-wrap` layout doesn't break text within child spans.

## Fix plan

All changes in **one file**: `frontend/app/dashboard/grammar/page.tsx`

1. **Line ~142**: Change the `<p>` wrapper from `inline-flex flex-wrap items-baseline justify-center gap-0` to a regular flowing `<p>` with `break-words` and responsive font sizing (`text-lg sm:text-2xl md:text-3xl`).
2. **Line ~143**: Remove `whitespace-pre` from the "before" span.
3. **Line ~149**: Update mirror span font sizes to match (`text-lg sm:text-2xl md:text-3xl`).
4. **Line ~165**: Add `maxWidth: '100%'` to the input's inline style.
5. **Line ~166**: Update input font sizes to match (`text-lg sm:text-2xl md:text-3xl`).
6. **Line ~938**: Add `break-words` to the declension `prompt_lt` paragraph.
7. **Lines ~958, ~978**: Add `overflow-hidden` to sentence and verb_conjugation task card wrappers.

## Tests
1. Write a Playwright test in `frontend/tests/` that reproduces and verifies the fix for this issue (test with longest sentence at 320px viewport width).
2. Rebuild the frontend and restart the local server.
3. Run the new Playwright test and confirm it passes.
4. Leave the local server running so the user can manually verify the fix in the browser.

## Confirm resolution
Ask the user: "Issue #130 — Long sentences overflow layout on grammar page. Mark as resolved?"
Only if the user confirms:
1. Run `UPDATE mistake_report SET status = 'resolved' WHERE id = 130;` and report success.
2. Move the plan file to `plans/triage/implemented/` and add the `IMPLEMENTED-` prefix (e.g. `issue-130-long-sentence-layout-overflow.md` → `plans/triage/implemented/IMPLEMENTED-issue-130-long-sentence-layout-overflow.md`).
