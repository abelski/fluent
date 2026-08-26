# Grammar lesson lock — how it works, and what Premium skips

Feature #10. Code: `backend/routers/grammar.py`, `frontend/app/dashboard/grammar/page.tsx`.
Tests: `backend/tests/test_grammar_premium_lock.py`, `frontend/tests/grammar-premium-lesson-order.spec.ts`.

## The rule

Grammar lessons come in two families with disjoint id ranges — case lessons (`id < 200`,
`GET /grammar/lessons`) and verb lessons (`id >= 200`, `GET /grammar/verb-lessons`, itself split
into `verbs` 200–299 and `verb_cases` 300–399 by `grammar_service.get_verb_lessons`). In both,
lesson **N is locked until lesson N-1's best score is > 75%**. The first lesson of the list — and,
for case lessons only, the first lesson of every program the user is enrolled in — is always open.

Two annotators own that rule, and nothing else may reimplement it:

- `_annotate_lesson_progress(lessons, user, session)` — case lessons. Also used by the combined
  `continue-session` endpoint, which is why it was extracted in the first place.
- `_annotate_verb_lesson_progress(lessons, user, session)` — verb lessons. Same shape minus the
  program-enrollment unlock (verb lessons aren't split across enrollable programs). Extracted from
  an inline loop in `list_verb_lessons` in #10, for the same reason: the tasks endpoint needed it.

## What Premium changes

`_lock_bypassed(user)` → `user is not None and (user.is_admin or is_premium_active(user))`. Same
premium gate as personal word lists (`routers/word_lists.py:_require_list_creator`), and admins are
included for support/debugging. When it's true, both annotators emit `is_locked: false` for every
lesson and the task endpoints skip the lock check — so a premium user can take lessons in any
order. Expired premium (`premium_until` in the past) is not active premium, so the lock returns;
that's `is_premium_active`'s existing semantics, not a separate rule.

## The gap #10 closed

Before #10, `is_locked` was *list-endpoint metadata only*. `GET /grammar/lessons/{id}/tasks` and
`GET /grammar/verb-lessons/{id}/tasks` never consulted it, so a locked lesson was served to anyone
who asked for it by id — the disabled button on `/dashboard/grammar` was the entire gate. Both task
endpoints now resolve the lesson through the annotator above and return **403** when it's locked
for that user.

Two ordering details in those endpoints that are deliberate:

- The lock check runs **before** `quota_check_and_increment`, so a rejected attempt doesn't burn one
  of the free tier's daily sessions.
- `verb_lesson_tasks` resolves the owning list by trying `program_type="verbs"` then `"verb_cases"`.
  The id ranges are disjoint, so the first list that contains the id is the one whose ordering
  defines that lesson's lock — no id-range arithmetic is duplicated in the router.

**This is not an anti-scraping control.** Unauthenticated callers see every lesson unlocked by
design (no progression to track), so the 403 only exists for authenticated free users. Dropping the
`Authorization` header is equivalent to logging out, and always was.

## Frontend: no premium fetch on this page

`/dashboard/grammar` deliberately does **not** call `/api/me/quota` (or any other endpoint) to learn
whether the user is premium. Once the bypass lives in the annotators, `is_locked === true` can only
mean "authenticated, free, hasn't passed the previous lesson" — so the existing per-lesson `locked`
variable already drives both "premium sees no lock" and "only show the upsell on a real lock". One
source of truth, one round trip.

The upsell (`data-testid="lesson-locked-upsell"`, → `/pricing`) renders *outside* the lesson card
button, not inside it: the card is a `<button disabled>` with `opacity-40`, and a link nested in a
disabled button is neither clickable nor legible. The button keeps `flex-1` so cards in a row still
stretch to equal height once one of them grows a hint underneath.

## Gotcha (fixed in #10): the tasks fetch used to send no token

`startLesson` in `frontend/app/dashboard/grammar/page.tsx` used to fetch
`/api/grammar/{lessons|verb-lessons}/{id}/tasks` **without an `Authorization` header** — it always
had, predating this feature. That meant the backend saw those calls as anonymous, so neither the
403 lock nor the daily-session 429 could ever fire from this page — the disabled button was the
only real gate, exactly the gap this feature set out to close, just one layer further down than
first expected.

Fixed by adding the same `Authorization: Bearer ${getToken()}` header `fetchLessons` already sends
two lines above it (`page.tsx`). This was a deliberate, confirmed decision, not a silent scope
expansion: it also means grammar lessons now count against the free tier's daily session quota for
the first time from this page — the endpoint's own docstring ("Counts against the daily session
quota for non-premium users") already claimed this behavior, it just wasn't reachable. Premium
users are unaffected (quota bypass already existed via `is_premium_active`).

The page handles both statuses: `startLesson` checks `r.status` (403 → locked screen, 429 →
daily-limit screen, any other non-OK → back to the lesson list). Before #10 the status was ignored
entirely and every non-200 fell through to an empty task list, which renders as a **permanent
spinner** — the user was simply stuck. Both branches are now real and exercised by
`grammar-premium-lesson-order.spec.ts`.
