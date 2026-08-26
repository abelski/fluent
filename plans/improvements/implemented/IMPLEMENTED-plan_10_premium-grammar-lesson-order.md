---
kind: feature
status: done
iteration: 1
max_iterations: 30
suggested_model: opus
suggested_effort: high
confirmed_model: opus
confirmed_effort: high
---

# Premium: skip grammar lesson order (no lock)

## Context

Grammar lessons (case lessons id<200 via `GET /grammar/lessons`, verb lessons id≥200 via
`GET /grammar/verb-lessons`) lock lesson N until lesson N-1's best score > 75%
(`backend/routers/grammar.py:50-108` `_annotate_lesson_progress`, and an inline loop at
`grammar.py:293-309` for verb lessons).

**Pre-existing gap found during investigation:** `is_locked` is only list-endpoint metadata — the
task-fetch endpoints (`grammar.py:128-146`, `314-331`) never check it, so anyone can already open
a locked lesson by ID today; the frontend button-disable is the only real gate. Scope for this
plan (confirmed with user) is to both add the premium bypass *and* close this gap, so the lock
becomes real for free users and the bypass is meaningful for premium.

Premium check pattern to reuse: `user.is_admin or is_premium_active(user)` →
`backend/routers/word_lists.py:36-43`. `is_premium_active` lives in `backend/quota.py:13-19`.

**Design decision:** no new frontend premium fetch needed — once the bypass is server-side,
`is_locked === true` only ever means "free authenticated user," so the existing
`page.tsx:134` `locked` variable already drives both "premium sees no lock" and "only show upsell
on a real lock."

Model/effort: opus/high — touches a paywall gate end-to-end (backend + a new 403 contract +
frontend error handling).

## Goals

- Premium/admin: every lesson (case + verb) fully unlocked in UI, and actually fetchable
  out-of-order via the API.
- Free users: unchanged 75% sequential lock, now a real 403 server-side (not just cosmetic), plus
  a small upsell hint linking to `/pricing` on locked lessons.
- Unauthenticated: unaffected.
- Fix `startLesson`'s silent-failure bug (no status check today — a non-200 response, including
  the existing 429 quota case, silently traps the user on an infinite spinner) since the new 403
  hits that same code path.

## Non-Goals

- No change to the 75% threshold/lock rule itself, no Stripe/payment integration, no changes to
  quota rules beyond ordering (lock-check before quota-increment so a rejected attempt doesn't
  burn quota), no frontend `/api/me/quota` fetch on this page, no `continue-session` code changes
  (it inherits the bypass for free via reuse of `_annotate_lesson_progress`), no unrelated grammar
  fixes.

### Standing constraints

- All validation must be server-side (never frontend-only).
- Touches markup on `/dashboard/grammar` lesson cards only (not shared shell) — use named tokens;
  `design-system-parity.spec.ts` should still pass unmodified.
- Add autotest coverage; run it as part of Validation.

## Implementation

- [x] 1. `backend/routers/grammar.py` — import `is_premium_active as _is_premium_active` from `quota`.
- [x] 2. `_annotate_lesson_progress` (lines 50-108) — add `bypass = user is not None and (user.is_admin or _is_premium_active(user))`, OR into the per-lesson unlock condition (100-106).
- [x] 3. Extract `list_verb_lessons`'s inline lock loop (293-309) into `_annotate_verb_lesson_progress(lessons, user, session)` (same shape as #2, no program-enrollment case), same bypass; `list_verb_lessons` calls it.
- [x] 4. `lesson_tasks` (128-146) — before `_quota_check_and_increment`, for a non-admin/non-premium authenticated user: resolve lock via `get_lessons()` + `_annotate_lesson_progress()`, `raise HTTPException(403, "Lesson is locked...")` if locked.
- [x] 5. `verb_lesson_tasks` (314-331) — same pattern; resolve owning list via `get_verb_lessons(session, "verbs")` then fallback `"verb_cases"` (disjoint id ranges, `grammar_service.py:389-393`), then `_annotate_verb_lesson_progress`.
- [x] 6. `frontend/app/dashboard/grammar/page.tsx` `startLesson` (308-323) — add `r.status` check: `403` → "locked" blocked-state, `429` → "quota" blocked-state (fixes pre-existing silent hang); render a small message + back-to-list action instead of the bare spinner.
- [x] 7. Same file, near lock icon (149-153) — add small upsell hint when `locked`, linking to `/pricing`, `amber-600`/`700` tokens matching `lists/page.tsx:408-416` / `practice/[id]/page.tsx:390-393`. Leave the padlock icon itself untouched (functional glyph). No new premium fetch.
- [x] 8. `frontend/lib/i18n/en.ts` / `ru.ts` — add copy for the upsell hint + the two blocked-state messages, near `premiumBadge`/`premiumLocked` (`en.ts:211-212`); reuse an existing quota-limit string if one exists rather than duplicating.
- [x] 9. `backend/tests/test_grammar_premium_lock.py` (new) — premium: `is_locked=false` everywhere + 200 on out-of-order tasks (both families); free: 403 on out-of-order tasks (both families), no quota consumed; admin bypasses; unauthenticated unchanged.
- [x] 10. `frontend/tests/grammar-premium-lesson-order.spec.ts` (new) — premium: no lock icon, out-of-order click opens lesson; free: lock icon + upsell hint render, link to `/pricing`; mocked 403 → blocked message, not a hang.
- [x] 11. `documentation/` — short note on the gap closed, the bypass design, and why no frontend quota fetch here.
- [x] 12. `documentation/CHANGELOG.md` — append `#10` (latest is `#9`, 2026-08-25).

## Validation

- [x] `cd backend && .venv/bin/python -m pytest backend/tests/test_grammar_premium_lock.py -q`
- [x] `cd backend && .venv/bin/python -m pytest -q`
- [x] `cd frontend && npx tsc --noEmit`
- [x] `cd frontend && npx playwright test grammar-premium-lesson-order.spec.ts --reporter=list`
- [x] `cd frontend && npx playwright test --reporter=list`
- [ ] Smoke: toggle a test user premium via admin panel → no lock icons, out-of-order lesson opens; toggle back to free → lock icon + upsell hint render, lesson stays inaccessible. (manual — left for user)
- [ ] News post written and published via /news-writer. (user declined — "no news needed")

## Definition of Done

```bash
cd backend && .venv/bin/python -m pytest -q
cd frontend && npx tsc --noEmit
cd frontend && npx playwright test --reporter=list
```
