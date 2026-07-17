# Issue #111 — /dashboard/lists/

**Reported:** 2026-06-03 10:05:33
**Status:** open
**Description:** Koks jūsų vardas? - прошел несколько раз и вижу что слово застряло в инпрогресе. Так же было бы хорошо в списке видеть список слов которые уже выучил с какой-то отметкой

## Root cause

The word progression logic is correct — a word that failed Stage 3 rightfully stays "learning". The user confusion comes from two gaps:

1. **No visibility on the list page** — there's no indication per word whether it's new/learning/known, so the user can't tell at a glance why a word keeps appearing.
2. **New words are not prioritized in lessons** — the session queue doesn't surface new (never-seen) words first, so a lesson may feel repetitive without making obvious progress.

## Fix plan

### 1. Per-word status indicators on the list detail page

Include progress status in the existing list fetch — one request instead of two.

**Backend** (`backend/routers/words.py`): Modify `GET /api/lists/{list_id}` to accept an optional `Authorization` header. When present and valid, join `UserWordProgress` and attach a `status` field (`'new'` | `'learning'` | `'known'`) to each word in the response. When unauthenticated, return words as before with no `status` field.

**Frontend** (`frontend/app/dashboard/lists/[id]/page.tsx`):
1. Add `status?: 'new' | 'learning' | 'known'` to the `Word` interface.
2. Pass the auth token in the existing list fetch: `fetch(..., { headers: { Authorization: \`Bearer ${token}\` } })`.
3. Render a small status badge per word row:
   - "known" → green checkmark (✓)
   - "learning" → amber dot or clock icon
   - no `status` field → no indicator (new/unseen)

### 2. New words first in lesson queue

**Backend** (`backend/routers/words.py` or the endpoint that returns words for a study session): When building the word batch for a lesson, sort so that words with no `UserWordProgress` record (never seen) come before words with status `'learning'`. This ensures a user who hasn't encountered a word yet will see it in the lesson, making progress visible.

Locate the endpoint that serves words for `GET /api/lists/{list_id}/study` (or equivalent), find where words are selected/ordered, and add ordering: `new` (no progress record) first, then `learning`, then `known`.

## Tests
1. Write a Playwright test in `frontend/tests/` that reproduces and verifies the fix for this issue.
2. Rebuild the frontend and restart the local server.
3. Run the new Playwright test and confirm it passes.
4. Leave the local server running so the user can manually verify the fix in the browser.

## Confirm resolution
Ask the user: "Issue #111 — list page status indicators + new words first in lesson. Mark as resolved?"
Only if the user confirms:
1. Run `UPDATE mistake_report SET status = 'resolved' WHERE id = 111;` and report success.
2. Move the plan file to `plans/triage/implemented/` and add the `IMPLEMENTED-` prefix (e.g. `issue-111-word-stuck-in-progress.md` → `plans/triage/implemented/IMPLEMENTED-issue-111-word-stuck-in-progress.md`).
