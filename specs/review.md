# Spaced-repetition review — current behavior

## Purpose
The scheduling and cross-list/cross-program review surfaces that sit on top of the SM-2 spaced-
repetition algorithm: which learned words or phrases are due again, in what order, and how
answering one reschedules it. Distinct from a single list's or program's own study session (which
mixes in *new* material) — review pools only ever draw from material the student has already
started. Reached from the dashboard's dedicated review pages, over the REST API. There is no
dedicated router; the endpoints live inside the words/phrases routers alongside list and program
CRUD.
Backed by: `backend/routers/words.py` (`/review/known`, `/review/known/upcoming`, `/review/known/random`, `/review/mistakes`), `backend/routers/phrases.py` (`/phrases/review`), `frontend/app/dashboard/review/`, `frontend/app/dashboard/phrases/review/`.

## Scenarios

### SM-2 scheduling

```gherkin
Scenario: A correct answer grows the review interval
  Given a word or phrase progress row with sm2_reps reviews already logged
  When an answer is recorded with quality >= 3
  Then sm2_reps increments and the next interval is: 1 day on the first success, 6 days on the
    second, and round(previous_interval * ease_factor) after that — capped at 365 days for words
    (uncapped for phrases) — with the ease factor nudged by the quality score and floored at 1.3;
    next_review is set to today plus that interval
```

```gherkin
Scenario: A missed answer resets progress to due tomorrow
  Given any word or phrase progress row
  When an answer is recorded with quality < 3
  Then sm2_reps resets to 0, interval resets to 1, and next_review becomes tomorrow — regardless
    of how much interval growth had accumulated before the miss
```

### Word review pools

```gherkin
Scenario: Reviewing due known words
  Given a signed-in student
  When they open the "due" review mode
  Then up to their configured words-per-session count of status="known" words with next_review
    null or <= today are returned, most-overdue first (nulls first), deduplicated so two words
    sharing one translation never both appear
```

```gherkin
Scenario: Nothing is due today
  Given a student whose due-review pool is empty
  When the review page loads
  Then it shows an empty state offering two alternative pools instead of a scheduling error:
    "upcoming" (known words with next_review in the future, soonest first) and "random" (any known
    word, unordered) — neither alternative reflects or affects the actual schedule
```

```gherkin
Scenario: Reviewing past mistakes
  Given a signed-in student
  When they open the "mistakes" review mode
  Then up to their configured session size of words with mistake_count > 0 are returned, ordered
    by mistake_count descending — this pool is driven by error history, not by next_review at all
  And a correct answer in this mode also clears the word's mistake_count back to 0
```

```gherkin
Scenario: A mature word is typed, not flashed, at the start of review
  Given a word whose progress is status "known" with at least 3 consecutive successful reviews
  When it opens in any review session
  Then the session starts directly on the "type it" step; missing it (or an explicit "I forgot")
    drops the word into the full flashcard → multiple-choice → assemble → type chain for the rest
    of that session — the same rule the list study session uses for mature words
```

```gherkin
Scenario: Review sessions are never charged against the daily quota
  Given a signed-in non-premium student who has already used all 5 of today's study sessions
  When they open any of the four word review modes (due, upcoming, random, mistakes)
  Then the pool is still served — none of these endpoints call the daily-quota check that gates
    list/program study sessions — even though the review page's frontend still contains a
    quota-exceeded screen wired to a 429 response that these endpoints can never actually produce
```

### Phrase review pool

```gherkin
Scenario: Reviewing due phrases across every enrolled program at once
  Given a signed-in student enrolled in one or more phrase programs
  When they open the phrase review page
  Then phrases due (next_review <= today) or in-progress (lesson_stage < 2, not yet due) from
    *all* enrolled programs are pooled together, sorted most-overdue first (in-progress phrases
    with no next_review sort as oldest), and capped at the student's phrases-per-session count —
    unlike a program's own study session, which only draws from that one program
```

```gherkin
Scenario: Review still works after leaving every program
  Given a student who has unenrolled from every phrase program but still has phrase progress rows
    with items due
  When they open the phrase review page
  Then those still-due phrases are served anyway, sourced directly from the student's progress
    rows rather than from any program's phrase list
```

```gherkin
Scenario: Nothing is due for phrase review
  Given a student with no due or in-progress phrase due for review
  When they open the phrase review page
  Then the request returns 404 and the page shows a single "nothing to review" message with no
    alternative pools — unlike the word review page, there is no "upcoming" or "random" fallback
    for phrases
```
