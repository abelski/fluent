# Issue #51 — /dashboard/grammar/

**Reported:** 2026-04-15 19:53:50
**Status:** open
**Description:** User retracts issue #50 (understood that only the ending is checked), but suggests improving the exercise format: instead of showing a partial word with underscores (e.g. `krep___`), show the full blank with the base word in brackets: `Jonas skaito ____ (knyga)`. Also notes that 3 placeholder underscores mislead users into thinking 3 letters are expected when the actual answer may be shorter.

## Root cause
The grammar exercise currently shows the sentence with a partial word and fixed 3 underscores (e.g. `Jonas neša krep___.`), regardless of actual answer length. The UX is confusing because:
1. The placeholder count doesn't match the actual answer length
2. Users don't know if they should type the full word or just the ending

The exercise data flows through:
- DB `grammar_sentence.display`: stores the sentence with exactly `___` (3 underscores hardcoded)
- `backend/grammar_service.py` line ~247: passes `row.display` verbatim
- `frontend/app/dashboard/grammar/page.tsx` lines 675-688: renders `task.display` verbatim

## Fix plan

### Backend fix (grammar_service.py)
In `backend/grammar_service.py`, at the point where sentence tasks are built, replace the 3-underscore placeholder with one sized to match the actual answer length:
```python
placeholder = '_' * len(row.answer_ending)
dynamic_display = row.display.replace('___', placeholder)
tasks.append({
    "type": "sentence",
    "display": dynamic_display,
    ...
})
```
Also update `_extract_stem()` regex from `r'(\w+)___'` to `r'(\w+)_+'` to handle variable-length placeholders.

### Frontend fix (grammar/page.tsx)
In the `sentence` task rendering (lines 672-690), update both branches to show:
1. The sentence with the correctly-sized blank (from backend fix)
2. The base nominative form in brackets as a hint: `(krepšys)`

New rendering pattern:
```tsx
<p className="text-2xl font-mono tracking-tight mb-2">{task.display}</p>
{task.base_lt && (
  <p className="text-gray-500 text-sm">({task.base_lt})</p>
)}
```

This achieves the `Jonas neša ____ (krepšys)` format the user requested.

## Tests
1. Write a Playwright test in `frontend/tests/` that opens the grammar exercise, checks that:
   - The sentence displays correctly-sized underscores matching the answer length
   - When `base_lt` is present, the base word appears in parentheses
   - The correct answer (e.g. `šį`) is accepted
2. Rebuild the frontend and restart the local server.
3. Run the new Playwright test and confirm it passes.
4. Leave the local server running so the user can manually verify the fix in the browser.

## Confirm resolution
Ask the user: "Issue #51 — Grammar exercise format improved: placeholder length matches answer, base word shown in brackets. Mark as resolved?"
Only if the user confirms:
1. Run `UPDATE mistake_report SET status = 'resolved' WHERE id = 51;` and report success.
2. Move the plan file to `plans/triage/implemented/` and add the `IMPLEMENTED-` prefix.
