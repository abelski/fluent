# Issue #45 — /dashboard/review/

**Reported:** 2026-04-14 08:02:20
**Status:** open
**Description:** Соедините каждое слово с его переводом — лучше описать: кликните по слову в правой колонке и потом по его переводу в левой (The current instruction should more specifically describe the interaction: click word in one column, then its translation in the other)

## Root cause
The matching exercise instruction text is generic ("Соедините каждое слово с его переводом"). The user wants clearer guidance on the actual UI flow.

Looking at `MatchRound.tsx` (the matching exercise component):
- Left column shows **translations** (Russian/English)
- Right column shows **Lithuanian words**
- The user must click LEFT column first (translation), then RIGHT column (Lithuanian word) to make a match

The instruction text is stored in:
- `frontend/lib/i18n/ru.ts` line 127: `matchSubtitle: 'Соедините каждое слово с его переводом'`
- `frontend/lib/i18n/en.ts` line 127: `matchSubtitle: 'Connect each word to its translation'`

It is rendered in `MatchRound.tsx` line 159 as the subtitle paragraph.

Note: The user suggested "click right column first, then left" but the actual code requires LEFT (translation) first, then RIGHT (Lithuanian). The corrected instruction should match the actual behavior.

## Fix plan
1. Edit `frontend/lib/i18n/ru.ts`, change line 127:
   - Old: `matchSubtitle: 'Соедините каждое слово с его переводом'`
   - New: `matchSubtitle: 'Сначала кликните по переводу слева, затем по литовскому слову справа'`

2. Edit `frontend/lib/i18n/en.ts`, change line 127:
   - Old: `matchSubtitle: 'Connect each word to its translation'`
   - New: `matchSubtitle: 'Click a translation on the left, then its Lithuanian match on the right'`

3. Rebuild the frontend.
4. Open `/dashboard/review/` and verify the matching exercise shows the new instruction.

## Tests
1. Write a Playwright test in `frontend/tests/` that opens the review page, starts a matching exercise, and checks that the subtitle text contains "Сначала кликните" (or equivalent in English).
2. Rebuild the frontend and restart the local server.
3. Run the new Playwright test and confirm it passes.
4. Leave the local server running so the user can manually verify the fix in the browser.

## Confirm resolution
Ask the user: "Issue #45 — Matching exercise instruction text updated to clearly describe the click order. Mark as resolved?"
Only if the user confirms:
1. Run `UPDATE mistake_report SET status = 'resolved' WHERE id = 45;` and report success.
2. Move the plan file to `plans/triage/implemented/` and add the `IMPLEMENTED-` prefix.
