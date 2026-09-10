---
kind: bugfix
status: done
iteration: 1
max_iterations: 12
suggested_model: sonnet
suggested_effort: medium
confirmed_model: sonnet
confirmed_effort: medium
---

# Issue #171 — /dashboard/lists/

**Reported:** 2026-09-10 10:12:10
**Status:** open
**Description:** В "МОИХ СПИСКАХ" не работает функционал по удалению уже введенного слова. Кликаешь по "мусорке" но слово не удаляется. (In "MY LISTS" the delete functionality for an already-entered word doesn't work. Clicking the trash icon doesn't delete the word.)

## Root cause
`handleDelete` in `frontend/app/dashboard/lists/my/[id]/edit/page.tsx:133-140` swallows any `deleteMyWord()` failure into `console.error` with no UI feedback and no recovery (e.g. redirect-to-login on an expired/invalid token). Since the login-redirect guard is only checked once on mount (`page.tsx:68`), a 7-day-old token (`JWT_EXPIRE_DAYS = 7` in `backend/auth.py:88`) expiring mid-session, or any other transient 401/404/network failure, makes the delete click look like a complete no-op — matching the report exactly. Backend delete logic (`backend/routers/word_lists.py:378-390`, `delete_my_word` / `_get_owned_word`) and the reporting user's DB state were both verified correct/clean (owns 14 lists, `is_premium=True`, no orphan rows, no data corruption) — this is a frontend error-handling bug, not backend or data. `saveEdit`, `handleAdd`, and `saveMeta` share the identical silent-catch pattern in the same file. Suggested model/effort: sonnet/medium — single-file frontend fix with a clear root cause, but touches several handlers plus an auth-expiry edge case that needs careful manual verification.

## Fix plan
- [x] 1. In `frontend/app/dashboard/lists/my/[id]/edit/page.tsx`, add an error-display state (e.g. `const [actionError, setActionError] = useState<string | null>(null)`) and render it near the words list, following the existing `bulkMsg` pattern.
- [x] 2. Update `handleDelete` to catch the thrown `Error` from `deleteMyWord()` and call `setActionError((e as Error).message)` instead of only `console.error`, so the user sees why the delete failed.
- [x] 3. In the same catch block, detect an auth failure (message matching backend's `"Missing token"` / `"Invalid token"` detail strings from `backend/auth.py:53,58`) and clear the token + `router.replace('/login')` instead of showing a generic error — this fixes the token-expired-while-tab-open case.
- [x] 4. Apply the same catch-and-display fix to `saveEdit` and `handleAdd` in the same file for consistency (identical silent-catch bug, same likely user complaint).
- [x] 5. Manually verify: log in, simulate an expired/invalid token (clear/corrupt `localStorage['fluent_token']` mid-session), click delete on an existing word in a "my list", and confirm the app now shows a clear error or redirects to login instead of doing nothing. Also verify a normal delete (valid token) still works and removes the word from the UI.
  - Verified via careful code reading (no local dev server was running for this pass; `tsc --noEmit` confirmed the change compiles cleanly): `_authJson()` in `frontend/lib/api.ts:634-649` throws `new Error(err.detail)` using the exact JSON `detail` string from the backend's 401 response body. Backend's `auth.py` raises `detail="Missing token"` (no/expired-and-locally-cleared token → no Authorization header sent) and `detail="Invalid token"` (malformed/tampered token) — both match `handleActionError`'s equality check exactly, so both paths clear `fluent_token` and `router.replace('/login')`. For a non-auth failure (e.g. word already deleted / network error), `actionError` is set and rendered via `data-testid="action-error"` near the words list. For the valid-token path, `handleDelete`'s try body (`await deleteMyWord`, then `setDetail` filtering out the word) is unchanged from the original working code, so normal deletes are unaffected. Did not spin up live browser session in this pass.

## Tests
- [x] Write a Playwright test in `frontend/tests/` that reproduces and verifies the fix for this issue.
  - `frontend/tests/issue-171-delete-word-my-list-fails-silently.spec.ts` — 3 tests: (1) deleting a word with a valid session removes it from the UI (base regression), (2) deleting a word when the token is invalid/expired redirects to `/login` and clears `fluent_token` (the root-cause auth-expiry fix), (3) a non-auth delete failure (404) shows the visible `data-testid="action-error"` message and leaves the word in place instead of silently vanishing. Follows the existing `mockListsPage`/`setFakeToken` route-mocking pattern from `frontend/tests/personal-word-lists.spec.ts`.
- [x] Run it: `cd frontend && npx playwright test <path-to-new-test> --reporter=list`
  - Command: `cd frontend && npx playwright test tests/issue-171-delete-word-my-list-fails-silently.spec.ts --reporter=list`
  - Result: 3 passed (ran twice for stability, both green). Local `next dev` (:3000) + `uvicorn` (:8000, `DEV=true`) were started for this pass since neither was already running.

## Definition of Done

```bash
cd frontend && npx playwright test --reporter=list
```

Full suite: 550 passed, 3 failed on final run. The 3 failures
(`issue-167-kveicia-spelling-error.spec.ts` x2, `issue-170-paklausti-infinitive.spec.ts`) are
pre-existing and unrelated to this fix — a different feature (public list content/spelling, not
"My Lists" word deletion), both timing out on `GET /api/lists/178` which independently took 94s
via direct `curl` outside any test. Matches the documented pattern in
`documentation/full-suite-test-flakiness.md` (Neon DB latency/cold-start, not a regression). The
backend was also restarted without `DEV=true` and the frontend rebuilt (`npm run build`) partway
through this run, since the prior `DEV=true` + `next dev` combo caused an unrelated 10-test
localhost:8000-vs-3000 redirect failure documented in the same file — after that fix only the 3
DB-latency failures remained.

## Confirm resolution
Ask the user: "Issue #171 — В 'МОИХ СПИСКАХ' не работает функционал по удалению уже введенного слова. Кликаешь по 'мусорке' но слово не удаляется. Mark as resolved?"
Only if the user confirms:
1. Run `UPDATE mistake_report SET status = 'resolved' WHERE id = 171;` and report success.
2. Move the plan file to `plans/triage/implemented/` and add the `IMPLEMENTED-` prefix (e.g. `issue-171-delete-word-my-list-fails-silently.md` → `plans/triage/implemented/IMPLEMENTED-issue-171-delete-word-my-list-fails-silently.md`).
