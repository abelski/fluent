# Issue #23 — /dashboard/admin/

**Reported:** 2026-03-19 10:49:11
**Status:** open
**Description:** in admin panel some parts did not translate from russian when i switched to english

## Root cause
The admin panel has a language switcher, but some UI strings (labels, headings, button text, table column headers, or status values) are hardcoded in Russian rather than using a translation key or locale-aware string. When the user switches to English, those hardcoded strings remain in Russian.

Likely locations:
- Admin panel React components that render static Russian text literals directly in JSX
- Server-rendered labels or status values returned from the API (e.g. `status` field values like "открыт"/"решён")
- Any dropdown options, table headers, or section titles that were not wired to a translation system

## Fix plan
1. Open `frontend/app/dashboard/admin/` and identify all components rendered in the admin panel.
2. Grep for Russian Cyrillic strings hardcoded in JSX/TSX files: search for Unicode Cyrillic characters (`[\u0400-\u04FF]`) in `frontend/app/dashboard/admin/`.
3. For each hardcoded Russian string found:
   a. Replace with the English equivalent (since the app is Russian-only for end users but the admin panel should support English for admin users).
   b. If a language-switching mechanism exists, wire the string to it; otherwise hardcode in English (admin panel is typically English-only).
4. Check API responses for Russian-only status/label values and add English equivalents or map them in the frontend.
5. Verify the language switcher actually triggers a re-render of all affected components (check state/context propagation).
6. Rebuild the frontend: `cd frontend && npm run build`.

## Tests
1. Write a Playwright test in `frontend/tests/` that:
   - Logs in as admin.
   - Navigates to `/dashboard/admin/`.
   - Switches language to English.
   - Asserts that key UI elements (headings, column headers, button labels) are in English, not Russian.
2. Rebuild the frontend and restart the local server.
3. Run the new Playwright test and confirm it passes.
4. Leave the local server running so the user can manually verify the fix in the browser.

## Confirm resolution
Ask the user: "Issue #23 — admin panel parts not translated to English. Mark as resolved?"
Only if the user confirms:
1. Run `UPDATE mistake_report SET status = 'resolved' WHERE id = 23;` and report success.
2. Rename the plan file by adding the `IMPLEMENTED-` prefix (e.g. `issue-23-admin-panel-not-translated.md` → `IMPLEMENTED-issue-23-admin-panel-not-translated.md`).
