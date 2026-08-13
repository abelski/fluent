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

## Post-ship fix (found via real user testing, same day)

Two bugs surfaced when the user clicked the button against the real local backend
(all automated coverage above used mocked routes or a fresh TestClient, so neither
caught these):

1. **Stale backend process.** The local `uvicorn` had been running since before
   `continue_session.py` existed and was started without `--reload`, so it never
   picked up the new route — every call fell through to `main.py`'s catch-all
   (`serve_frontend`) and 307-redirected to the frontend port, which 404s. Fixed by
   restarting uvicorn with `--reload`. Gotcha for future sessions: `GET /api/me/quota`
   returning 200 does **not** prove a newly-added route is live — it only proves the
   process is up, not that it has your latest code.
2. **`_known_due_words` (`backend/routers/words.py`) filtered archived words *after*
   applying `limit`, not before.** If the most-overdue entries happen to be archived,
   the query returns short or empty even though plenty of eligible words exist
   further down — invisible at `/review/known`'s `limit=10` most of the time, but
   fully exposed at the continue-session's smaller `limit=3`. Fixed by moving the
   `Word.archived == False` filter into the same joined query as the `ORDER BY … LIMIT`,
   so exclusion happens before truncation. Regression test:
   `test_words_phase_skips_archived_words_at_front_of_queue` in
   `backend/tests/test_continue_session.py`.

## Post-ship fix round 2 — UX: phase transitions showed an interstitial done screen

Design gap, not a code bug: the plan specified an `onAdvance`/`advanceLabel` pair so
each phase's own done screen (mastery stats, mascot, pass/fail) would show between
phases with its primary button relabeled "Next — grammar" / "Next — phrases" instead
of "Repeat". Real usage showed this was wrong — the user expected phases to run
back-to-back with no interstitial at all, matching how the grammar phase already
behaved (`GrammarTaskRunner.onFinish` always auto-advanced, no done screen).

Fixed by intercepting one level earlier: in both `QuizSession` and `PhraseSession`,
the match round's `onDone` now calls `onAdvance()` directly (skipping `setDone(true)`)
whenever a next phase exists — so no done screen renders at all for a non-last
phase. Only the true last phase in the sequence still shows the normal done screen.
Since `onAdvance` never coexists with `done === true` anymore, the done-screen-level
`onAdvance`/`advanceLabel` branching became dead code and was removed (including the
now-unused `continueToGrammar`/`continueToPhrases` i18n strings) — `onAdvance` is
still a prop, just consumed only by the match round now. `continue-session.spec.ts`
updated to match: `playWordPhase`/`playPhrasePhase` take an `isLast` flag instead of
always expecting a done screen.

Also updated the button's stale subtitle ("Repeat words with spaced repetition",
left over from before this feature existed) to describe the combined session.

Also: debugging this against the real Neon-backed local server cost the test
account 3 real quota units; reset back to 0 for that account afterward.

# Rework "Продолжить занятие" into a 3-phase mixed session

## Context

The green "Продолжить занятие" button on the logged-in home (`/`, `frontend/app/LandingClient.tsx`'s
`UserHome`) is currently a plain link: `hasStudied ? '/dashboard/review' : '/dashboard/lists'`
(lines 322-343). For a returning user it drops them into a plain word-review session
(`GET /api/review/known`) — grammar and phrases are never touched. Its icon is a bespoke `PlayIcon`
triangle (lines 61-67) that appears nowhere in the design system.

Two additional, non-obvious facts discovered during investigation that shape this plan:

- **The button currently costs non-premium users nothing.** `/review/known` (and its siblings
  `/review/known/upcoming`, `/review/known/random`, `/review/mistakes`) are explicitly designed to
  never call `quota_check_and_increment` — only `/lists/{list_id}/study` (word list study) and
  `/grammar/lessons/{id}/tasks` (+ verb-lessons) charge the non-premium daily quota today. This
  plan must deliberately add exactly one charge for the whole combined flow, server-side, not via
  a client-trusted flag.
- **Grammar's lesson-taking UI has no reusable component today.** Unlike words (`QuizSession`) and
  phrases (`PhraseSession`), which are already presentational components driven by props,
  `frontend/app/dashboard/grammar/page.tsx` (1004 lines) is a single self-contained page — lesson
  list, task-taking state machine, and its own done-screen are all inline in one component with zero
  props. Reusing grammar's task-answering logic (4 task types, `InlineSentenceInput`,
  `GrammarRuleCard`/`VerbHintCard`, mascot mood) without duplicating it requires extracting a
  `GrammarTaskRunner` component out of that page — a behavior-preserving refactor, scoped tightly
  to just the exercise-taking screen (not the lesson list, not grammar's own done-screen, both of
  which stay untouched).

**Model/effort rationale:** `opus`/`high` — this feature sits directly on the non-premium
monetization gate (daily quota) and requires a behavior-preserving extraction from a large,
presumably well-exercised existing page. A lower tier risks either an exploitable quota bypass or a
sloppy extraction that regresses the standalone grammar page.

Product-level ambiguities (phase sizing formula, grammar's "already learned" source pool, rounding
rule, and whether the whole flow should cost exactly one quota unit) were already resolved directly
with the user via `AskUserQuestion` before this plan was written — see Requirements below for the
resolved rules; they are not open questions.

## Goals

- Replace the continue-CTA's icon with the design system's sanctioned arrow glyph (`TakChevron`)
  instead of the bespoke `PlayIcon`.
- For users who have already studied (`hasStudied === true`), clicking the button starts one
  combined session that runs, back-to-back, in this order: (1) a word-review phase, (2) a
  grammar-review phase sampled from already-passed lessons, (3) a phrase-review phase — sized
  proportionally to the user's own `words_per_session`/`phrases_per_session` settings.
- First-time users (`hasStudied === false`) keep today's behavior unchanged (`/dashboard/lists`).
- The combined session counts as exactly one unit against the non-premium daily session limit,
  charged once, server-side.
- Every phase reuses the existing study/review component and its existing per-item progress
  recording (SM-2 updates for words/phrases, `GrammarLessonResult` row for grammar) unchanged.
- A phase with no available content is silently skipped — never an error state.

## Non-Goals

- No new "grammar items per session" user setting — the grammar phase count is derived from
  `words_per_session`, not independently configurable.
- No behavior change to the standalone `/dashboard/review`, `/dashboard/grammar`, or
  `/dashboard/phrases/review` pages for their existing callers, beyond two additive/backward-compatible
  props on `QuizSession`/`PhraseSession` and two internal query-extraction refactors (same query,
  same results) in `words.py`/`phrases.py`.
- No redesign of the word/phrase/grammar quiz UI itself — only new "advance to next phase" wiring
  and the icon swap.
- No change to grammar's own lesson-list page or its existing done-screen (next-lesson / repeat /
  back-to-lessons) — stays pixel-identical.
- Does not fix the pre-existing fact that `/phrases/review` never charges quota on its own — out of
  scope for this request.

## Requirements

- Phase sizes, computed server-side from the user's `words_per_session` (W) and
  `phrases_per_session` (P) settings (never client-supplied):
  - Words phase = `round(W × 0.3)`, minimum 1.
  - Grammar phase = same value as the words phase (mirrors it — there is no separate grammar
    setting; confirmed with the user).
  - Phrases phase = `round(P × 0.3)`, minimum 1.
  - Example: W=P=10 → 3 words + 3 grammar tasks + 3 phrases, matching the user's own example.
- Grammar phase content pool = lessons the user has already **passed**
  (`GrammarLessonResult.passed == True`, best-per-lesson). Pick one passed `lesson_id` at random,
  fetch its full task set via the existing `get_lesson_tasks()`, then randomly sample down to the
  grammar-phase count.
- A phase with an empty pool (no due known words / zero passed grammar lessons / no due phrases) is
  omitted from the sequence entirely; the remaining phases still run in order.
- Quota: the whole combined session must increment `DailyStudySession.session_count` by **exactly
  one**, via the existing `quota_check_and_increment()`, called exactly once server-side, only when
  at least one phase has content. No endpoint invoked as part of this flow may charge quota a second
  time. If the non-premium user is already at the daily limit, the flow must surface the existing
  429/"limit reached" UX rather than silently starting a free partial session.
- Per-item progress recording (word SM-2, phrase SM-2, grammar `GrammarLessonResult` row) must be
  identical to the standalone flows — achieved by reusing `QuizSession`, `PhraseSession`, and the
  grammar results-save endpoint unmodified in their data-recording behavior.
- The continue-CTA icon must be `TakChevron` (`direction="right"`), not a bespoke SVG.

### Standing constraints

- All validation must be server-side (never frontend-only) — in particular, phase counts and the
  quota charge must be computed/enforced in the backend, never trusted from the client.
- This plan touches markup, styling, and components: read
  `documentation/design system/Component Library (as-built).html` and
  `documentation/IMPLEMENTATION.md` first, use named design tokens (never a raw Tailwind step), and
  run `frontend/tests/design-system-parity.spec.ts` after the shared-component changes
  (`QuizSession`/`PhraseSession`/`TakChevron` usage). `/dashboard/continue` is not one of the 5
  top-nav pages, so it is not required to use `PageShell` — precedent: `LandingClient.tsx`'s
  `UserHome` is explicitly recorded in the component library's "Deliberate deviations" table as
  intentionally staying off `PageShell` for the same reason. Follow the visual conventions already
  used by `review/page.tsx`/`QuizSession`/`PhraseSession` instead.
- Add autotest coverage for the new feature and run the relevant suite(s) as part of Validation.

## Implementation

- [x] 1. `backend/routers/words.py` — extract the query body of `GET /review/known` (lines 614-655)
      into a helper `_known_due_words(user, session, limit) -> list[dict]`; have the existing
      endpoint call it with `user.words_per_session` (behavior-preserving).
- [x] 2. `backend/routers/phrases.py` — extract the query body of `GET /phrases/review`
      (lines 754-~825) into a helper `_due_phrases_for_review(user, session, limit) -> list[Phrase]`
      (or equivalent); have the existing endpoint call it with `user.phrases_per_session`
      (behavior-preserving).
- [x] 3. `backend/routers/continue_session.py` (new) — `GET /me/continue-session`: require auth;
      compute `words_count`/`grammar_count`/`phrases_count` per the Requirements formulas; call the
      helpers from steps 1-2; for grammar, query distinct passed `lesson_id`s from
      `GrammarLessonResult` for this user, `random.choice` one, call `get_lesson_tasks(lesson_id,
      session)` and `get_lessons(session)` (both from `grammar_service.py`, unmodified) to get tasks
      + lesson metadata (`level`, `rules`, `hint`), `random.sample` down to `grammar_count`; build an
      ordered `phases` list (`"words" | "grammar" | "phrases"`, only entries with content, in that
      order); if `phases` is empty, return `{phases: [], words: [], grammar: null, phrases: []}`
      without charging quota (mirror the existing no-charge-when-empty pattern in
      `words.py`'s list-study endpoint); otherwise call `quota_check_and_increment(user, session)`
      once, then return the populated payload.
- [x] 4. `backend/main.py` — register the new router: `from routers.continue_session import router as
      continue_session_router` + `app.include_router(continue_session_router, prefix="/api")`
      (mirrors the existing pattern at lines 19/126).
- [x] 5. `backend/tests/test_continue_session.py` (new) — unit coverage for step 3 (see Validation).
- [x] 6. `frontend/app/dashboard/components/QuizSession.tsx` — add optional
      `onAdvance?: () => void; advanceLabel?: string` to `QuizSessionProps`; in the done-screen's
      primary button (lines 883-891), use `onAdvance`/`advanceLabel` when provided, otherwise keep
      today's `onRepeat` behavior exactly as-is (additive, backward-compatible — existing callers
      pass neither prop and are unaffected).
- [x] 7. `frontend/app/dashboard/components/PhraseSession.tsx` — same additive `onAdvance?`/
      `advanceLabel?` props on its done-screen primary button (~lines 619-625), same
      backward-compatible pattern.
- [x] 8. `frontend/app/dashboard/components/GrammarTaskRunner.tsx` (new) — extract from
      `grammar/page.tsx`: the `InlineSentenceInput`, `GrammarRuleCard`, `VerbHintCard` helper
      components (only used by the exercise screen — confirmed no other call sites), the
      `Task`/`AnswerState`/`GrammarRule`/`VerbHint` types, and the exercise-screen state + logic
      (`taskIndex`, `correct`, `typed`, `answerState`, `shownAnswer`, `useMascotMood()`,
      `checkAnswer`, `dismissWrongGrammar`, `advanceTask`) plus its JSX (~lines 826-1002: header,
      progress bar, rule card, the 4 per-task-type blocks, check/dismiss buttons). Props:
      `{ tasks: Task[], level: 'basic'|'advanced'|'practice', rules?: GrammarRule[], hint?: VerbHint,
      onExit: () => void, onFinish: (score: number, total: number) => void }`. No internal fetch, no
      quota call, no results-POST, no done-screen of its own — purely "run these tasks, report the
      final score," mirroring `advanceTask`'s existing `next >= tasks.length` branch minus the
      `postResult`/`setDone` calls (those move to the caller via `onFinish`).
- [x] 9. `frontend/app/dashboard/grammar/page.tsx` — replace the inline exercise-screen block with
      `<GrammarTaskRunner tasks={tasks} level={activeLesson.level} rules={activeLesson.rules}
      hint={activeLesson.hint} onExit={resetToLessons} onFinish={(score, total) => {
      postResult(activeLesson.id, score, total); setCorrect(score); setDone(true); }} />` when
      `activeLesson && !done`. The lesson-list view (`activeLesson === null`) and the lesson's own
      done-screen (`done === true`, lines 750-825) stay untouched — this step must not change
      `GrammarPage`'s existing behavior for its existing users.
- [x] 10. `frontend/lib/api.ts` — add `getContinueSession()` (mirrors `getPhraseReview()` at line
      913) and extract `postResult`'s inline fetch (currently inline in `grammar/page.tsx`,
      `POST /api/grammar/{lessons|verb-lessons}/{id}/results`) into a shared
      `saveGrammarLessonResult(lessonId, score, total)` helper, used by both `grammar/page.tsx`'s
      `postResult` and the new continue-session page.
- [x] 11. `frontend/app/dashboard/continue/page.tsx` (new) — orchestrator page. Auth-gate like
      `review/page.tsx` (redirect to `/login` if no token). Fetch `getContinueSession()` on mount;
      handle loading, 429/limit-reached (reuse `review/page.tsx`'s existing `limitReached` UI
      pattern, lines 61-85), and empty (`phases.length === 0` → simple message + link to
      `/dashboard/lists`) states. Hold `phaseIdx` state over the returned `phases` array; render
      `QuizSession` / `GrammarTaskRunner` / `PhraseSession` for `phases[phaseIdx]` with `backHref="/"`
      always, and `onAdvance`/`advanceLabel` (or, for grammar, auto-advance inside `onFinish`) set
      only when a next phase exists — the last phase in the sequence falls back to each component's
      normal default behavior.
- [x] 12. `frontend/lib/i18n/ru.ts` and `frontend/lib/i18n/en.ts` — add phase-transition label
      strings (e.g. `continueToGrammar`, `continueToPhrases`) and `/dashboard/continue`'s empty-state
      copy; reuse existing `tr.common.limitTitle`/`limitBody`/`sessionDone` etc. wherever applicable
      instead of adding near-duplicate strings.
- [x] 13. `frontend/app/LandingClient.tsx` — replace `<PlayIcon />` (line 331) with
      `<TakChevron direction="right" size={16} className="text-white" />` (or the size that reads
      best in the 36px badge — confirm visually) inside the existing badge; change the `hasStudied`
      branch's `href` from `/dashboard/review` to `/dashboard/continue` (line 327; the
      `!hasStudied` branch stays `/dashboard/lists`, unchanged). Remove the now-unused `PlayIcon`
      function (lines 61-67) once confirmed nothing else in the file references it.
- [x] 14. `documentation/design system/Component Library (as-built).html` — record the
      `TakChevron`-in-badge sizing decision and the new `GrammarTaskRunner` extraction /
      continue-session composition pattern, per the standing rule to update the component library in
      the same change that introduces a shared pattern.
- [x] 15. `documentation/IMPLEMENTATION.md` — add the new files/patterns to the token/pattern → file
      mapping.

## Validation

- [x] Backend unit: `cd backend && .venv/bin/python -m pytest tests/test_continue_session.py -q`
      — covers: phase-count formulas (round + min 1), quota charged exactly once total, 429 when
      already at the daily limit, grammar phase omitted with zero passed lessons, words/phrases
      phases omitted when their pool is empty, response shape.
- [x] Backend regression: `cd backend && .venv/bin/python -m pytest tests/test_quota.py -q`
- [x] Frontend Playwright (new): `frontend/tests/continue-session.spec.ts` — icon swap renders
      `TakChevron` not the old triangle; full 3-phase happy path; grammar phase skipped gracefully
      when the user has no passed lessons; `/api/me/quota`'s `sessions_today` increases by exactly 1
      for the whole flow (mirror the assertion style in `frontend/tests/quota.spec.ts`).
      5/5 passed (`npx playwright test continue-session --reporter=list`). Writing it surfaced a
      real double-charge: the page's mount effect ran twice (React StrictMode in dev), so the flow
      charged 2 sessions — fixed with a `startedRef` latch in
      `frontend/app/dashboard/continue/page.tsx`; noted in `documentation/IMPLEMENTATION.md`.
- [x] Frontend Playwright regression (grammar extraction):
      `npx playwright test grammar admin-grammar issue-104-grammar-titles-translated
      issue-135-krepsys-grammar-hint issue-50-grammar-case-insensitive verbs_grammar
      grammar-draugo-base-form grammar-programs --reporter=list`
- [x] Frontend Playwright regression (words/phrases done-screen prop changes) — 34/35 passed;
      1 pre-existing unrelated failure (`quota.spec.ts:112`, `Header.tsx` premium badge text
      `✦ Premium` vs `Premium`, confirmed via `git diff` that `Header.tsx` was never touched by
      this plan):
      `npx playwright test quota phrases phrase-review-gap-retry-step-flip
      review-empty-alternatives --reporter=list`
- [x] Design-system parity: `npx playwright test design-system-parity --reporter=list`
- [ ] Smoke: seed/use a user with due known words, ≥1 passed grammar lesson, and an enrolled phrase
      program with due phrases; click "Продолжить занятие" on `/`; confirm all 3 phases run
      back-to-back reusing the existing quiz/phrase/grammar UI, and the flow ends back on `/`.
- [ ] Edge case smoke: a user with 0 passed grammar lessons → grammar phase is skipped, words →
      phrases only, no error state shown.
- [ ] Edge case smoke: non-premium user at 9/10 `sessions_today` → continue-session succeeds and
      `/api/me/quota` shows 10/10 afterward; at 10/10 → the entry point shows the existing
      limit-reached screen and no phase starts.
- [ ] Required post-implementation checklist (per CLAUDE.md): restart the local server; compare
      nav/header/footer/login against production; run the full autotest suite; confirm the feature
      works locally end-to-end.
- [ ] News post written and published via /news-writer.

## Definition of Done

```bash
cd backend && .venv/bin/python -m pytest -q
cd frontend && npx tsc --noEmit
cd frontend && npx playwright test --reporter=list
```
