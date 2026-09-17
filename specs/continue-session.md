# Continue session — current behavior

## Purpose
The "Продолжить занятие" (continue) feature runs one combined study session that
chains three phases back-to-back — words, then grammar, then phrases — from a
single API call, so a student can do a quick daily refresher across every
category they study without leaving one screen. It is reached from the
logged-in home's continue CTA and serves the `/dashboard/continue` page. Per-item
progress recording (word SM-2, grammar lesson result, phrase SM-2) reuses the
same standalone components and endpoints as the dedicated study pages; only the
content fetch and the daily-quota charge are combined.

Backed by: `backend/routers/continue_session.py`, `frontend/app/dashboard/continue/page.tsx`.

## Scenarios

```gherkin
Scenario: Student has never enrolled in one of the three categories
  Given the student has zero rows in UserProgram, UserGrammarProgram, or
    UserPhraseProgramEnrollment for at least one of words/grammar/phrases
  When GET /me/continue-session is called
  Then the endpoint returns immediately with "needs_enrollment" naming every
    missing category, all phase content empty, and phases: []
  And no daily-quota unit is charged
  And the page shows an enrollment-gate screen with a link per missing
    category (to /dashboard/lists, /dashboard/grammar/programs, or
    /dashboard/phrases) plus a retry button

Scenario: Student is enrolled everywhere but nothing is due or new
  Given the student is enrolled in at least one program per category
  And each phase's content pool (due words, eligible grammar lessons, due
    phrases, plus new items when enabled) is empty
  When GET /me/continue-session is called
  Then phases, words, grammar, and phrases all come back empty
  And needs_enrollment is empty
  And no daily-quota unit is charged
  And the page shows an empty-state screen distinct from the enrollment gate

Scenario: Student has content in at least one phase
  Given the enrollment gate passes and at least one phase produces content
  When GET /me/continue-session is called
  Then the daily quota is checked and incremented exactly once for the whole
    request (429 with the usual daily_limit_reached detail if a non-premium
    student is already at their daily limit)
  And the response's "phases" array lists only the categories that ended up
    with content, in words → grammar → phrases order
  And the per-phase endpoints used by the standalone pages (/review/known,
    /phrases/review) are never called during this flow

Scenario: Words phase blends due reviews with unseen words
  Given the student's continue_include_new setting is true and count > 0
  When the words phase is built
  Then known due words and never-seen words (from the word lists of the
    student's enrolled subcategories only) are pooled, deduplicated by
    translation across both pools, and split new-first then review using the
    student's own new_words_ratio, backfilling from whichever pool has spare
    capacity when the other runs short

Scenario: Words phase is review-only
  Given continue_include_new is false
  When the words phase is built
  Then only known words due for review are returned, with no new words mixed in

Scenario: Grammar phase picks one random eligible lesson
  Given the grammar phase count is > 0
  When the grammar phase is built
  Then a lesson is chosen at random from the student's already-passed lessons,
    plus (when continue_include_new is true) any lesson unlocked for the
    student but not yet passed — a locked lesson is never eligible regardless
  And up to `count` of that lesson's tasks are sampled at random
  And the phase is omitted entirely (grammar: null) when no lesson is
    eligible or the chosen lesson has no tasks

Scenario: Phrases phase blends due reviews with unseen phrases
  Given continue_include_new is true and count > 0
  When the phrases phase is built
  Then due-for-review phrases and never-seen phrases (from the student's
    enrolled phrase programs) are split review-first then new using the
    student's own new_phrases_ratio, with the same backfill-from-the-other-pool
    rule as the words phase
  And extra unseen phrases beyond the phase's own slot count are over-fetched
    purely to give stage-1 multiple-choice distractors a pool to draw from

Scenario: Per-phase sizes come from the student's own saved settings
  Given the student has saved continue_words_count / continue_grammar_count /
    continue_phrases_count / continue_include_new (or never has, in which case
    each count defaults to 3)
  When GET /me/continue-session runs
  Then those stored counts are used verbatim to size each phase
  And the client never sends a size — the session endpoint reads it from the
    user row only

Scenario: Student updates their combined-training settings
  Given a PATCH to /me/continue-settings with new per-phase counts and the
    include-new flag
  When each count is outside 1–20
  Then the request is rejected with 422 naming the offending field
  Otherwise the four fields are saved to the user row and echoed back

Scenario: Duplicate mount does not double-charge
  Given the /dashboard/continue page mounts (e.g. under React StrictMode's
    double-invoke in development)
  When the page's load effect would otherwise fire twice
  Then a mount-latch ref ensures the session-fetching GET runs only once per
    real navigation to the page — the "repeat" buttons at the end of a phase
    still call load() directly to intentionally start (and pay for) a fresh
    session

Scenario: Daily limit already reached
  Given a non-premium student who has already used their daily session quota
  When GET /me/continue-session responds 429
  Then the frontend shows a "limit reached" screen with a Premium upsell link,
    without ever reaching the phase-runner UI

Scenario: Phase sequencing and hand-off inside the runner
  Given the session has more than one non-empty phase
  When the student finishes the current phase's own end-of-round screen
  Then the runner advances to the next phase in order instead of showing that
    phase component's own "done" screen
  And only the last phase in the sequence shows its component's own
    end-of-session screen
```
