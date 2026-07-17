# Issue #52 — /dashboard/grammar/

**Reported:** 2026-04-15 19:56:43
**Status:** open
**Description:** Jonas neša krep_ _ _ — пропущена š в конце? (The display shows 3 underscores but the expected answer is only 2 characters — user confused about whether the display is correct)

## Root cause
Confirmed in DB:
- `grammar_sentence` row: `display = "Jonas neša krep___."`, `answer_ending = "šį"`, `full_word = "krepšį"`
- The display shows 3 underscores (`krep___`) but the actual answer `šį` is only 2 characters
- The 3-underscore placeholder is hardcoded in all `display` values regardless of answer length

Root cause: In `backend/grammar_service.py`, the task dict passes `row.display` verbatim without adjusting placeholder length. The DB always stores `___` (3 underscores) as the canonical placeholder format.

This is the same root cause as issue #51 and should be fixed together.

## Fix plan
Same as issue #51 backend fix — in `backend/grammar_service.py`, replace `___` with `'_' * len(row.answer_ending)` when building task dicts:

```python
placeholder = '_' * len(row.answer_ending)
dynamic_display = row.display.replace('___', placeholder)
tasks.append({
    "type": "sentence",
    "display": dynamic_display,
    "answer": row.answer_ending,
    ...
})
```

For `krepšį` with `answer_ending = "šį"` (2 chars), the display will become `Jonas neša krep__.` (2 underscores) instead of 3.

Also update `_extract_stem()` at line ~79 of `grammar_service.py`:
- Old: `r'(\w+)___'`
- New: `r'(\w+)_+'`

**Recommended:** Implement together with issue #51 as a single backend change.

## Tests
1. Write a Playwright test in `frontend/tests/` that opens the grammar exercise, finds the `Jonas neša krep` sentence, and verifies it shows 2 underscores (matching `šį` length) not 3.
2. Rebuild the frontend and restart the local server.
3. Run the new Playwright test and confirm it passes.
4. Leave the local server running so the user can manually verify the fix in the browser.

## Confirm resolution
Ask the user: "Issue #52 — Grammar placeholder count now matches actual answer length. Mark as resolved?"
Only if the user confirms:
1. Run `UPDATE mistake_report SET status = 'resolved' WHERE id = 52;` and report success.
2. Move the plan file to `plans/triage/implemented/` and add the `IMPLEMENTED-` prefix.
