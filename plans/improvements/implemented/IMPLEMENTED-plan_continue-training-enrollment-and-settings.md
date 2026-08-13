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

# Combined training: enrollment gate + dedicated settings

## Context

Builds on the already-shipped "Продолжить занятие" combined-training feature
(`plans/improvements/implemented/IMPLEMENTED-plan_continue-session-rework.md`,
backend `GET /api/me/continue-session` in `backend/routers/continue_session.py`,
frontend `frontend/app/dashboard/continue/page.tsx`). Real usage surfaced two gaps:

1. **No enrollment check.** Today a phase with nothing eligible (e.g. zero passed
   grammar lessons) is silently omitted from the sequence — including when the
   *reason* is that the user was never enrolled in any program for that category at
   all, not just "hasn't gotten around to it yet." The user wants that distinguished:
   zero enrollment in a category should block the whole session with a prompt to
   subscribe, not silently produce a 1- or 2-phase session.
2. **No dedicated settings.** Phase sizes are currently derived
   (`round(words_per_session × 0.3)`, mirrored for grammar, same formula off
   `phrases_per_session` for phrases) with no way to set them directly, and every
   phase is review-only (known words, already-passed grammar, due phrases) with no
   way to mix in new/unseen content.

Decisions already confirmed with the user via `AskUserQuestion`:
- **Hard gate**: if the user has zero enrollment in *any* of the three categories
  (words/grammar/phrases — `UserProgram`, `UserGrammarProgram`,
  `UserPhraseProgramEnrollment` respectively), combined training does not start at
  all. One combined screen names every missing category with a link to go enroll;
  there is no "skip and continue with fewer phases" option.
- **New settings tab** on the existing `/dashboard/settings` page (alongside the
  current "Слова"/"Фразы"/"Другое" tabs), not a separate route.
- **One global "include new content" toggle** (not per-category).
- **Defaults to ON.** Existing users get new content mixed in immediately once this
  ships, not just review — a deliberate behavior change, confirmed with the user.

Reuse found during exploration (all direct extensions of existing, working code):
- New/review mixing pattern to copy: `get_phrase_study_session`
  (`backend/routers/phrases.py:634-708`) already splits a program's phrases into
  due-vs-new and blends them via `new_phrases_ratio` — same shape as what the
  combined words/phrases phases need, just sourced across *all* enrolled programs
  instead of one.
- Grammar's lock/progression state is already fully computed by `get_lessons()`
  (`backend/grammar_service.py:119`, consumed in `backend/routers/grammar.py:50-112`)
  — `is_locked` + `best_score_pct` per lesson. "New" grammar content for this
  feature is just widening `_grammar_phase`'s candidate pool
  (`backend/routers/continue_session.py:44-83`) from "passed" to "passed OR
  (unlocked and not yet passed)" — no new locking logic needed.
- Enrollment listing/picking already exists per category and needs no new UI:
  words → `/dashboard/lists`, grammar → `/dashboard/grammar/programs`
  (`frontend/app/dashboard/grammar/programs/page.tsx`), phrases → `/dashboard/phrases`.
  The gate screen links out to these rather than rebuilding a picker inline.
- Settings page tab pattern to copy exactly: `frontend/app/dashboard/settings/page.tsx`
  — tab bar (`tabs` array + `data-testid="tab-*"`), per-tab card
  (`bg-white border border-gray-900 rounded-2xl p-6 flex flex-col gap-8`), slider
  markup (`data-testid="session-size-slider"` style), save button + saved-message
  pattern. A fourth tab is an additive change to that same file.

**Model/effort rationale:** `opus`/`high` — same class of risk as the original plan:
a hard product gate that can block a shipped feature entirely if the enrollment
check is wrong, plus new cross-program content-sourcing logic in three different
subsystems (words/grammar/phrases) that must not regress the quota-once guarantee
or the existing review-only behavior when the new toggle is off.

## Goals

- Combined training refuses to start (one clear screen, links to enroll, no partial
  session) when the user has zero enrollment in any of words/grammar/phrases.
- A new "Комбо-тренировка" tab on `/dashboard/settings` lets the user set each
  phase's item count directly (words/grammar/phrases, independently) and toggle
  whether new/unseen content can be mixed in alongside review content.
- When the toggle is on, each phase blends new + review content (words and phrases
  via each category's existing `new_*_ratio` setting; grammar via widening the
  eligible-lesson pool to include the next unlocked-but-unpassed lesson).
- When the toggle is off, every phase behaves exactly as it does today (review-only).
- The one-quota-unit-for-the-whole-session guarantee is preserved unchanged.

## Non-Goals

- No per-category "include new" toggles (one global toggle, per the user's choice).
- No inline enrollment picker on the gate screen — it links to each category's
  existing programs page rather than duplicating that UI.
- No change to how enrollment/programs work in the standalone words/grammar/phrases
  flows — `UserProgram`/`UserGrammarProgram`/`UserPhraseProgramEnrollment` and their
  existing endpoints are read, never modified in shape.
- No change to the phase-transition UX shipped in the previous round (no
  interstitial done screen between phases) — untouched by this plan.
- No skip-and-continue option for the hard gate (explicitly rejected by the user).

## Requirements

- `GET /api/me/continue-session` must check enrollment *before* anything else
  (before computing phase content, before charging quota). If the user has zero
  rows in `UserProgram` (words), zero in `UserGrammarProgram` (grammar), or zero in
  `UserPhraseProgramEnrollment` (phrases) for any of the three, return
  `needs_enrollment: [...]` listing exactly which are missing, with `phases: []` and
  no quota charge — never a partial session in this case.
- New `GET`/`PATCH /me/continue-settings`: `continue_words_count`,
  `continue_grammar_count`, `continue_phrases_count` (each an independent integer,
  default 3, server-validated range e.g. 1–20 — no longer derived from
  `words_per_session`/`phrases_per_session`), `continue_include_new` (bool, default
  `true`). Validation server-side only, mirroring `/me/settings`'s pattern
  (`backend/routers/words.py:509-544`).
- With `continue_include_new = true`:
  - Words phase mixes new (no `UserWordProgress` row at all, sourced from
    `WordList`s under the user's enrolled `UserProgram.subcategory_key`s) with
    review (today's `_known_due_words`), split via `user.new_words_ratio` — same
    fill-gaps-from-the-other-pool behavior as the existing per-list study endpoint.
  - Phrases phase mixes new (no `UserPhraseProgress` row, sourced from enrolled
    programs) with review (today's `_due_phrases_for_review`), split via
    `user.new_phrases_ratio`.
  - Grammar phase's candidate-lesson pool becomes passed lessons **plus** any
    lesson that is unlocked (per `get_lessons()`'s existing `is_locked`) and not
    yet passed — picked at random same as today, just from the wider pool.
- With `continue_include_new = false`: identical output to the currently-shipped
  behavior (review-only) — this must not regress.
- Frontend: `/dashboard/continue` checks `needs_enrollment` first on load; if
  present, renders a blocking screen (not the loading spinner, not the phase UI)
  naming each missing category with a link to its existing enroll/browse page, and
  a retry action that re-fetches.

### Standing constraints

- All validation must be server-side (never frontend-only) — counts, the
  include-new toggle, and the enrollment gate are all read from the user's saved
  settings/enrollment rows server-side, never trusted from client input.
- This plan touches markup, styling, and a component: read
  `documentation/design system/Component Library (as-built).html` and
  `documentation/IMPLEMENTATION.md` first, use named design tokens, and run
  `frontend/tests/design-system-parity.spec.ts` after the change (the settings page
  and `/dashboard/continue` are both outside the 5 top-nav pages, so `PageShell` is
  not required — match each page's own existing established style instead, per the
  precedent already recorded for `LandingClient.tsx`).
- Add autotest coverage for the new feature and run the relevant suite(s) as part
  of Validation.

## Implementation

- [x] 1. `backend/models.py` — add `continue_words_count`, `continue_grammar_count`,
      `continue_phrases_count` (`Optional[int]`, default `None`, treated as 3 when
      unset) and `continue_include_new` (`bool`, default `True`) to `User`.
- [x] 2. `backend/routers/continue_session.py` — new `GET`/`PATCH
      /me/continue-settings` endpoints for the four fields above, validated
      server-side (counts 1–20), mirroring `/me/settings`'s request/response shape
      (`backend/routers/words.py:491-544`).
- [x] 3. `backend/routers/continue_session.py` — add `_enrollment_gaps(user,
      session) -> list[str]`: returns the subset of `["words", "grammar",
      "phrases"]` where the user has zero `UserProgram` / `UserGrammarProgram` /
      `UserPhraseProgramEnrollment` rows respectively.
- [x] 4. `backend/routers/continue_session.py` — add `_new_words_pool(user,
      session) -> list[Word]`: words with no `UserWordProgress` row for this user,
      drawn from `WordList`s whose `subcategory` is one of the user's enrolled
      `UserProgram.subcategory_key`s.
- [x] 5. `backend/routers/continue_session.py` — add `_new_phrases_pool(user,
      session) -> list[Phrase]`: phrases with no `UserPhraseProgress` row for this
      user, drawn from the user's enrolled `UserPhraseProgramEnrollment.program_id`s.
- [x] 6. `backend/routers/continue_session.py` — extend `_grammar_phase` (or add a
      variant) so that when `include_new` is true, its candidate `lesson_id` pool
      is passed lessons **union** unlocked-and-not-yet-passed lessons from
      `get_lessons(session)`, instead of passed-only.
- [x] 7. `backend/routers/continue_session.py` — rewrite `get_continue_session()`:
      call `_enrollment_gaps` first and short-circuit with `needs_enrollment` (no
      quota charge) if non-empty; otherwise read the four settings from step 1/2
      (defaulting counts to 3, `include_new` to `True`) and use them instead of the
      old `_phase_size`/`PHASE_RATIO` derivation; when `include_new`, blend each
      phase's new/review pools per the Requirements section using each category's
      existing `new_words_ratio`/`new_phrases_ratio`; keep the single
      `quota_check_and_increment` call exactly as today, only after phases are
      known to be non-empty.
- [x] 8. `backend/tests/test_continue_session.py` — extend with: enrollment-gate
      coverage (each single missing category, all three missing, none missing);
      `continue-settings` GET/PATCH + validation bounds; `include_new=false`
      reproduces today's exact behavior (regression); `include_new=true` can return
      a brand-new word/phrase/lesson when one is available; grammar's widened pool
      never includes a locked lesson.
- [x] 9. `frontend/lib/api.ts` — add `ContinueSettings` type +
      `getContinueSettings()`/`updateContinueSettings()`; extend the
      `getContinueSession()` response type with `needsEnrollment?: string[]`.
- [x] 10. `frontend/app/dashboard/continue/page.tsx` — check `needsEnrollment`
      first (before the existing `phases.length === 0` empty state); render a
      blocking screen listing each missing category with a link to its existing
      programs page (`/dashboard/lists`, `/dashboard/grammar/programs`,
      `/dashboard/phrases`) and a retry button that re-calls `load()`.
- [x] 11. `frontend/app/dashboard/settings/page.tsx` — add a fourth tab (e.g.
      `'combined'`) to the `Tab` type and `tabs` array; new tab body with three
      count sliders (words/grammar/phrases, same markup pattern as the existing
      `session-size-slider`) and one checkbox (`continue_include_new`, same pattern
      as the existing `timer-checkbox`), its own save button following the
      per-tab save pattern already used for the phrases tab.
- [x] 12. `frontend/lib/i18n/ru.ts`, `en.ts`, `types.ts` — strings for the gate
      screen (per-category message + link label, retry button) and the new
      settings tab (tab label, three slider labels/hints, toggle label/hint).
- [x] 13. `documentation/design system/Component Library (as-built).html` and
      `documentation/IMPLEMENTATION.md` — record the new settings tab and gate
      screen if they introduce anything not already covered by the existing
      tab/slider/card documentation.

## Validation

- [x] Backend: `cd backend && .venv/bin/python -m pytest tests/test_continue_session.py -q`
- [x] Backend regression: `cd backend && .venv/bin/python -m pytest -q` (full suite) — 278 passed
- [x] Frontend Playwright: extend `frontend/tests/continue-session.spec.ts` with the
      enrollment-gate scenarios (missing one category, missing all three, none
      missing → normal flow unaffected)
- [x] Frontend Playwright: new coverage for the settings tab (renders, sliders
      change values, save persists, `include_new` checkbox toggles) — added to
      `frontend/tests/user-settings.spec.ts`
- [x] Design-system parity: `npx playwright test design-system-parity --reporter=list` — 12/12
- [x] Edge case: `continue_include_new=false` for a user who previously had new
      content mixed in still gets exactly today's shipped review-only behavior —
      `test_include_new_false_never_surfaces_a_new_word` +
      `test_all_three_phases_in_order_with_expected_counts` in
      `backend/tests/test_continue_session.py`
- [x] Edge case: a user enrolled in all three categories but with a locked next
      grammar lesson never sees that lesson's tasks even with `include_new=true` —
      `test_locked_lesson_never_selected_even_with_include_new`
- [ ] Smoke: left for the user to verify manually against a real account — local
      dev points at the shared production Neon DB (no isolated test DB), so, as
      with the previous round, this plan does not fabricate real enrollment/seed
      state against it
- [ ] News post written and published via /news-writer

## Definition of Done

```bash
cd backend && .venv/bin/python -m pytest -q
cd frontend && npx tsc --noEmit
cd frontend && npx playwright test --reporter=list
```
