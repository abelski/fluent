# Issue #90 — /dashboard/lists/155/study

**Reported:** 2026-05-22 17:39:28
**Status:** open
**Description:** trum*pa*laikė *nuo*ma

DAIKTAVARDIS

краткосрочная аренда Bold not rendered

## Root cause
`renderAccented()` in [frontend/app/dashboard/components/QuizSession.tsx:24-28](frontend/app/dashboard/components/QuizSession.tsx#L24-L28) splits the accented string on `*` and only wraps `<strong>` when the split produces **exactly 3 parts** — i.e. a single `*pair*`. The reported word `trum*pa*laikė *nuo*ma` has two stress markers (5 split parts), so the function falls back to rendering the raw text including asterisks.

This affects **236 words** in production (`SELECT COUNT(*) FROM word WHERE accented LIKE '%*%' AND LENGTH(accented) - LENGTH(REPLACE(accented, '*', '')) > 2` returns 236). Examples: `*vai*kų *dar*želis`, `pre*ky*bos *cent*ras`, `*juo*da *duo*na`, `ameri*kie*tis / ameri*kie*tė`.

The `accented` field is used in two render sites: lines 822 and 844 of `QuizSession.tsx` (flashcard front + answer reveal).

## Fix plan
1. Rewrite `renderAccented` in [frontend/app/dashboard/components/QuizSession.tsx:24-28](frontend/app/dashboard/components/QuizSession.tsx#L24-L28) to walk the asterisk-delimited segments and wrap every odd-indexed segment in `<strong>`. Use a unique React key per segment (e.g. the index).
   ```tsx
   function renderAccented(text: string): React.ReactNode {
     const parts = text.split('*');
     if (parts.length < 3) return text;
     return (
       <>
         {parts.map((part, i) =>
           i % 2 === 1 ? <strong key={i}>{part}</strong> : <span key={i}>{part}</span>
         )}
       </>
     );
   }
   ```
2. Guard against malformed input with an odd number of asterisks (even-length `parts` array) — fall back to plain text in that case to avoid leaving a dangling unclosed `*`.
3. No backend, schema, or data changes required — only the renderer is wrong.

## Tests
1. Write a Playwright test in `frontend/tests/` that reproduces and verifies the fix for this issue.
   - Seed or visit a list containing word id 6800 (`trumpalaikė nuoma`, accented `trum*pa*laikė *nuo*ma`) or 3200 (`vaikų darželis`, accented `*vai*kų *dar*želis`).
   - On the flashcard, assert that the displayed text contains no literal `*` characters and that at least two `<strong>` elements are present with the expected syllables (e.g. `pa` and `nuo`).
2. Rebuild the frontend and restart the local server.
3. Run the new Playwright test and confirm it passes.
4. Leave the local server running so the user can manually verify the fix in the browser.

## Confirm resolution
Ask the user: "Issue #90 — trum*pa*laikė *nuo*ma — bold not rendered for multi-stress words. Mark as resolved?"
Only if the user confirms:
1. Run `UPDATE mistake_report SET status = 'resolved' WHERE id = 90;` and report success.
2. Move the plan file to `plans/triage/implemented/` and add the `IMPLEMENTED-` prefix (i.e. `plans/triage/implemented/IMPLEMENTED-issue-90-multi-stress-bold-not-rendered.md`).
