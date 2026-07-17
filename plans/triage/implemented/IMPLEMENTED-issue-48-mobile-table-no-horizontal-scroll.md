# Issue #48 — /dashboard/articles/veiksmažodžiai-asmenuojama/

**Reported:** 2026-04-14 19:41:15
**Status:** open
**Description:** При использовании с телефона: в таблицах видны только первые 3-4 столбца, далее невозможно протянуть горизонтально, поэтому слова последних столбцов не видны частично или полностью (On mobile, tables only show first 3-4 columns and can't be scrolled horizontally)

## Root cause
The article markdown is rendered in `frontend/app/dashboard/articles/[slug]/ArticleContent.tsx`. The `ReactMarkdown` component (with `remarkGfm`) generates raw `<table>` elements inside a `<article className="prose ...">` wrapper.

Two problems combine to cause the issue:
1. `globals.css` sets `overflow-x: hidden` on `html, body`, suppressing page-level horizontal scroll.
2. There is no `overflow-x-auto` wrapper around tables — they simply clip at the viewport edge on mobile.

## Fix plan
1. Edit `frontend/app/dashboard/articles/[slug]/ArticleContent.tsx`:
   - Add a custom `table` renderer to `ReactMarkdown` that wraps each table in a scrollable div:
     ```tsx
     components={{
       table: ({ children }) => (
         <div className="overflow-x-auto w-full my-8">
           <table>{children}</table>
         </div>
       ),
     }}
     ```
   - Add `prose-table:my-0` to the `<article>` className to avoid doubled margins (the wrapper div now owns vertical spacing).

2. Example of the full updated `ReactMarkdown` call:
   ```tsx
   <ReactMarkdown
     remarkPlugins={[remarkGfm]}
     components={{
       table: ({ children }) => (
         <div className="overflow-x-auto w-full my-8">
           <table>{children}</table>
         </div>
       ),
     }}
   >
     {body}
   </ReactMarkdown>
   ```

3. Rebuild the frontend.
4. Test on mobile viewport (or browser DevTools mobile emulation) — open `/dashboard/articles/veiksmažodžiai-asmenuojama/` and verify tables can be scrolled horizontally.

## Tests
1. Write a Playwright test in `frontend/tests/` that opens the veiksmažodžiai article, finds a table's wrapper div, and checks it has `overflow-x-auto` (or that scrollWidth > clientWidth at a narrow viewport).
2. Rebuild the frontend and restart the local server.
3. Run the new Playwright test and confirm it passes.
4. Leave the local server running so the user can manually verify the fix in the browser.

## Confirm resolution
Ask the user: "Issue #48 — Article tables now scroll horizontally on mobile. Mark as resolved?"
Only if the user confirms:
1. Run `UPDATE mistake_report SET status = 'resolved' WHERE id = 48;` and report success.
2. Move the plan file to `plans/triage/implemented/` and add the `IMPLEMENTED-` prefix.
