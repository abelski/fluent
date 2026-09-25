# Phrases ("Фразы") — current behavior

## Purpose
Admin-curated phrase programs (grouped into chapters) plus each student's own private phrase
lists, for practicing whole Lithuanian sentences rather than single words. Covers browsing and
enrolling in programs, running a study session that progresses a phrase through three lesson
stages (with tile-assembly and audio-pronunciation sub-steps), a cross-program due-review session,
admin CRUD on programs and phrases, and CRUD on personal phrase lists. Called from the dashboard UI
(`/dashboard/phrases`, `/dashboard/phrases/[id]`, `/dashboard/phrases/[id]/study`,
`/dashboard/phrases/review`, `/dashboard/phrases/lists/[id]/edit`,
`/dashboard/phrases/lists/[id]/study`, `/dashboard/phrases/vocabulary`) over the REST API.
Backed by: `backend/routers/phrases.py`, `backend/routers/phrase_lists.py`, `frontend/app/dashboard/phrases/`.

## Scenarios

### Programs (admin-curated)

```gherkin
Scenario: Student browses public phrase programs
  Given a signed-in student
  When they request the program list
  Then every public PhraseProgram is returned with its phrase count, whether the student is
    enrolled, and — only for programs they are enrolled in — a stage-distribution breakdown
    (how many phrases are at lesson_stage 0/1/2)
```

```gherkin
Scenario: Admin manages phrase programs
  Given a signed-in admin
  When they create, update, or delete a phrase program
  Then non-admins get 403; a missing/blank title or an out-of-range difficulty gets 422; deleting
    a program also deletes its phrases, those phrases' progress rows, and all enrollments in it
```

```gherkin
Scenario: Admin edits individual phrases in a program
  Given a signed-in admin
  When they add, update, or delete a phrase (text, translation, optional English translation,
    position, alt texts, chapter number/title)
  Then a blank text or translation is rejected with 422; on update, chapter fields are only
    overwritten when the client actually included them in the request, so an older editor that
    omits chapter fields cannot silently wipe a phrase's chapter grouping; deleting a phrase also
    deletes every student's progress row for it
```

```gherkin
Scenario: Student enrolls in and unenrolls from a phrase program
  Given a signed-in student
  When they enroll in a public program
  Then enrolling twice is a no-op (still 200); enrolling in a non-public or missing program is
    404; unenrolling removes the enrollment row (a no-op if not enrolled) but never touches
    progress, so re-enrolling resumes where they left off
```

```gherkin
Scenario: Student views a program's phrase list grouped by chapter
  Given a signed-in student (or anonymous visitor) opening a public program
  When the program detail is requested
  Then all its phrases are returned in position order, each carrying the caller's lesson_stage
    (0 when anonymous or never attempted); the frontend groups consecutive phrases by chapter
    number into collapsible sections
```

### Study sessions (admin-curated programs)

```gherkin
Scenario: Study session mixes due-for-review and new phrases
  Given a signed-in student enrolled in a program, with a phrases-per-session size and a
    new-phrase ratio setting
  When they start a study session (optionally scoped to one chapter)
  Then due phrases (next_review <= today, or in-progress with lesson_stage < 2) are combined with
    never-seen phrases using the ratio, with either pool's shortfall backfilled from the other
```

```gherkin
Scenario: Study session is blocked without enrollment
  Given a signed-in student who is not enrolled in a program
  When they request that program's study session
  Then the request is rejected with 403 "Not enrolled in this program", even if the program is
    public and its phrases are otherwise visible
```

```gherkin
Scenario: Blank-word selection favors the student's known weak spot
  Given a phrase entering lesson stage 1 (fill-the-blank)
  When the server picks which word to blank
  Then it picks the word in the phrase with the highest recorded mistake count for that student;
    if no word in the phrase has ever been missed, it picks a random word longer than one
    character (falling back to any token if the phrase has none)
```

```gherkin
Scenario: Stage 1 runs tile-assembly sub-steps before the fill-the-blank exercise
  Given a phrase entering lesson stage 1, whose text and translation are both longer than 3 words
  When the frontend renders the exercise
  Then it first has the student assemble the translation from shuffled word tiles (from-LT), then
    assemble the Lithuanian text from shuffled word tiles (to-LT) — each sub-step is skipped when
    its own text is 3 words or fewer — then a 4-option MCQ for the blanked word, then typing the
    blanked word; a mistake in any sub-step re-queues the card and re-runs the assembly sub-steps
    (never the MCQ) before landing on typing again, and the specific mistake_word is only recorded
    from the typing step
```

```gherkin
Scenario: A mistake on an already-mastered phrase (stage 2) triggers a full re-drill
  Given a student typing the full phrase in stage 2 and getting it wrong (quality < 3), with fewer
    than 2 retries used so far
  When the exercise re-queues the card
  Then it re-runs the to-LT tile-assembly sub-step first (if the text is long enough to have tiles)
    before falling through to the full-phrase typing box again
```

```gherkin
Scenario: A phrase's lesson stage only advances on a correct, matching completion
  Given a signed-in student completing a phrase exercise
  When they submit a quality score (0-5) and which stage they just completed
  Then SM-2 always runs (scheduling next_review from the quality score); lesson_stage only
    advances (capped at 2) when quality >= 3 AND the stage they completed equals their *current*
    stage — completing an already-passed or not-yet-reached stage never moves it
```

```gherkin
Scenario: Mistake words are recorded per phrase, not per session
  Given a signed-in student who got a specific word wrong during a phrase exercise
  When progress is recorded with that mistake_word
  Then it is lower-cased, stripped of surrounding punctuation, and its count in the phrase's
    persistent mistake_words_json map is incremented, so future sessions keep blanking it
```

```gherkin
Scenario: Phrase pronunciation audio is premium-gated
  Given a student in a phrase study session
  When they open stage 0 (intro) or any stage-1 sub-step
  Then a Premium/admin student sees a working speaker button (and, if autoplay is on, the phrase's
    Lithuanian audio plays automatically on each new card); a free student sees the same-shaped
    button locked, linking to the pricing page instead of playing anything
```

### Cross-program review

```gherkin
Scenario: Student reviews everything due, across all enrolled programs at once
  Given a signed-in student enrolled in one or more phrase programs
  When they open the phrases review session
  Then phrases due for review (or in-progress, lesson_stage < 2) are pulled from every enrolled
    program, sorted most-overdue first, capped at the student's phrases_per_session, and served
    with the same per-phrase shape (blank_word, distractors, tiles) as a per-program study session;
    a student who has since left every program but still has due phrases is still served them;
    if nothing is due, the request 404s
```

### Phrases-page mascot

```gherkin
Scenario: The phrases page shows a random public-program phrase in the mascot's speech bubble
  Given any visitor opening the phrases page
  When the page loads
  Then it fetches one uncached, randomly-picked phrase (text + translation) from a public program
    only — a student's own personal-list phrases are never shown this way — and displays it in the
    mascot's greeting bubble; if none exists or the request fails, the mascot's default greeting is
    shown instead
```

### Personal phrase lists

```gherkin
Scenario: Premium or admin student manages a personal phrase list
  Given a signed-in student with active premium, or an admin
  When they create, rename, add, bulk-add, edit, or delete phrases in their own list
  Then it succeeds; a non-premium, non-admin student gets 403 "Personal phrase lists are available
    on Premium." on every one of those actions except viewing and deleting the list itself, which
    only require ownership
```

```gherkin
Scenario: A personal phrase's translation is stored in the owner's UI language
  Given a student whose interface language is Russian
  When they add a phrase with one translation string
  Then it is stored only in the `translation` (Russian) column; an English-UI owner's translation
    is stored in both `translation` and `translation_en` so English study mode has native text too
```

```gherkin
Scenario: A personal phrase's complexity is auto-graded, but overridable
  Given a student adding or bulk-adding personal phrases
  When a phrase is saved
  Then its star level is derived from word count (<=3 words = 1, 4-6 = 2, 7+ = 3); editing a
    phrase afterward can set an explicit star override (1-3)
```

```gherkin
Scenario: Personal-list study session requires active premium even to review
  Given a student whose premium has lapsed but who still owns a personal phrase list
  When they try to study or record progress on that list
  Then both are rejected with 403 — unlike personal word lists, which remain studyable (though not
    editable) after premium lapses
```

```gherkin
Scenario: Personal-list study session is level-gated like the program one
  Given a student studying their own list at a chosen star_level
  When every phrase at that level is already at lesson_stage 2
  Then the response is {"phrases": [], "all_known": true} instead of an empty or missing-phrases
    error
```

```gherkin
Scenario: Phrase study sessions are never charged against the daily quota
  Given a signed-in non-premium student who has exhausted their daily word-study session limit
  When they start a phrase study session (program-curated or personal)
  Then it is still served — neither the program study endpoint nor the personal-list study
    endpoint calls the daily-quota check that gates word-list study sessions — even though the
    frontend's own quota banner visually disables the "Study" button once the free daily limit
    looks used up
```

### Vocabulary browse

```gherkin
Scenario: Student browses all their mastered phrases
  Given a signed-in student
  When they open the phrases vocabulary page
  Then every phrase with lesson_stage >= 2 is listed with its program and chapter, ordered by
    next_review ascending (soonest-due first), searchable and filterable by the same client-side
    memory-state bucketing as the word vocabulary page
```

```gherkin
Scenario: Phrases-per-session settings are validated server-side
  Given a signed-in student updating their phrase session settings
  When they submit phrases_per_session and new_phrases_ratio
  Then values outside 3-30 (count) or 0.0-1.0 (ratio) are rejected with 422
```
