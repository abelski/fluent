# Words ("Слова") — current behavior

## Purpose
Public, admin-curated vocabulary lists ("Слова") plus each student's own private word lists.
Covers browsing the catalogue, enrolling in a subject/program to unlock its lists, running a
study session against a list (new-word introduction and spaced-repetition review interleaved),
and CRUD on personal lists and words. Called from the dashboard UI (`/dashboard/lists`,
`/dashboard/lists/[id]`, `/dashboard/lists/[id]/study`, `/dashboard/lists/my/[id]/edit`,
`/dashboard/vocabulary`) over the REST API; the same endpoints are also reachable unauthenticated
for read-only browsing.
Backed by: `backend/routers/words.py`, `backend/routers/word_lists.py`, `frontend/app/dashboard/lists/`, `frontend/app/dashboard/vocabulary/`.

## Scenarios

### Catalogue and enrollment

```gherkin
Scenario: Anonymous visitor browses a public list
  Given no Authorization header is sent
  When the client requests a single word list's detail
  Then the list and its words are returned with no per-word status field
```

```gherkin
Scenario: Non-admin student fetches the list catalogue
  Given a signed-in, non-admin student
  When the client requests the full list catalogue
  Then every list whose subcategory is "published" is returned (enrollment is not a server-side
    filter here), grouped and ordered by subcategory sort order then list sort order; the
    `/dashboard/lists` page itself narrows this down client-side to only the subcategories the
    student is enrolled in, using a separate `/me/programs` call
```

```gherkin
Scenario: Admin sees unpublished subcategories too
  Given a signed-in admin
  When the client requests the full list catalogue
  Then subcategories with status "testing" are included, and "draft" subcategories are included
    only when the admin is the one who created them
```

```gherkin
Scenario: Student enrolls in a subject to unlock its lists
  Given a signed-in student not yet enrolled in a subject
  When they enroll in that subject's key
  Then an enrollment row is created and its lists become visible in the catalogue
  And enrolling a second time in the same subject returns a 400 error
```

```gherkin
Scenario: Student unenrolls from a subject
  Given a signed-in student enrolled in a subject
  When they unenroll
  Then the enrollment row is deleted but their existing word progress is left untouched
  And unenrolling from a subject they are not enrolled in returns a 404
```

```gherkin
Scenario: Custom-program lists bypass subcategory visibility
  Given a student enrolled in a community custom program
  When the client requests the catalogue
  Then the lists attached to that custom program are appended regardless of their subcategory's
    published/testing/draft status, as long as the student (or an admin) can access the list
```

### Personal word lists

```gherkin
Scenario: Premium or admin student creates a personal list
  Given a signed-in student with active premium, or an admin
  When they create a personal word list with a title and a difficulty (1-3)
  Then a private WordList row is created with is_public=false and created_by=the student
```

```gherkin
Scenario: Non-premium student is blocked from creating or editing a personal list
  Given a signed-in student without active premium and who is not an admin
  When they try to create, rename, or add/edit/delete a word in a personal list
  Then the request is rejected with 403 "Personal word lists are available on Premium."
```

```gherkin
Scenario: Student adds a single word to their personal list
  Given the owner of a personal list
  When they submit a Lithuanian word and its translation
  Then a Word row is created (mirrored into both translation_en and translation_ru), best-effort
    verb-form enrichment is attempted and silently skipped on any failure, and the word is
    appended to the list at the next position
```

```gherkin
Scenario: Student bulk-pastes words into their personal list
  Given the owner of a personal list
  When they paste a block of lines using "=", tab, or "—" as the Lithuanian/translation separator
  Then each well-formed line becomes a word appended in order; blank and malformed lines are
    skipped, and if no line parses the request is rejected with 422
```

```gherkin
Scenario: Student edits or deletes a word in their own personal list only
  Given a signed-in student
  When they try to update or delete a word that belongs to another user's personal list
  Then the request returns 404, because ownership is resolved by joining the word back to a
    WordList owned by the caller
```

```gherkin
Scenario: Deleting a personal list cascades
  Given the owner of a personal list
  When they delete the list
  Then the student's progress rows for its words are deleted first, then its list-item rows,
    then the words themselves, and only then the list row — each step flushed before the next
    so Postgres's foreign keys never reject an out-of-order delete
```

### Study sessions

```gherkin
Scenario: Study session mixes new and review words
  Given a signed-in student with a words-per-session size and a new-word ratio setting
  When they start a study session on a list
  Then the session is built as new_count = round(total * ratio) new words and the remainder from
    review (words already "learning", plus "known" words that are due), with any shortfall in one
    pool backfilled from the other so the session is never short just because one side ran out
```

```gherkin
Scenario: Two words with the same translation never appear in one session
  Given a list containing two Lithuanian words that share one displayed translation
  When a study session or any review pool is built from that list
  Then only one of the pair is included — the one needing the most work (lowest known-ness, then
    fewest reviews) — the pool is over-fetched first so the drop does not shrink the session
```

```gherkin
Scenario: Session is filtered by complexity (star) level
  Given a student studying at star level 1, 2, or 3
  When a study session is requested with that star_level
  Then only words with star <= star_level are eligible, and MCQ distractors are still drawn from
    other public lists regardless of level
```

```gherkin
Scenario: Every word at the current star level is already known
  Given a student has "known" status on every word at their current star level in a list
  When they start a study session without include_known
  Then the response is empty with all_known=true, instead of an empty or pointless review session
```

```gherkin
Scenario: New words exist only behind a higher star level
  Given a student has no new words left at their current star level, but the list has unseen
    words at a higher star level
  When they start a study session
  Then more_new_at_higher_level=true and the count of such words is returned, so the frontend can
    offer advancing the level
```

```gherkin
Scenario: Large review backlog offers a review-first choice
  Given a list where the student's due-for-review word count (learning + due known) exceeds their
    session size
  When they open the list's study page
  Then the frontend first asks /lists/{id}/progress (which does not spend a session) and, if the
    backlog exceeds the session size, shows a choice between "review" (mode=review, 100% review,
    0% new) and "learn new" (behaves exactly as if no choice screen had appeared) before fetching
    the actual session
```

```gherkin
Scenario: Anonymous visitor starts a study session
  Given no Authorization header is sent
  When a study session is requested for a list
  Then all of the list's words (deduplicated by translation) are returned in their list position
    order, all marked status "new", capped at the default session size, with no per-word
    prioritization — and no progress can be recorded, since that endpoint requires a signed-in user
```

```gherkin
Scenario: A mature word starts the session by being typed, not shown
  Given a word whose progress is status "known" with at least 3 consecutive successful SM-2
    reviews (server-computed "mature" flag)
  When it comes up in a study or review session
  Then the session opens directly on the "type it" step instead of a flashcard; a wrong answer or
    explicit "I forgot" there drops the word into the full learning chain (flashcard → multiple
    choice → assemble → type) for the rest of the session
```

```gherkin
Scenario: Recording an answer updates progress and, optionally, the SM-2 schedule
  Given a signed-in student answering a word during a session
  When the client posts a status ("learning" or "known"), whether it was a mistake, and optionally
    a quality score 0-5
  Then the student's UserWordProgress row is upserted (review_count incremented, mistake_count
    incremented on mistake or reset on clear_mistake); when a quality score is present, SM-2 runs:
    quality < 3 resets reps to 0 and sets the next interval to 1 day, quality >= 3 grows the
    interval (1 day on first success, 6 on the second, interval * ease_factor after that, capped
    at 365 days) and adjusts the ease factor, floored at 1.3
```

```gherkin
Scenario: Word list study sessions are quota-gated for free-tier users
  Given a signed-in user without active premium (admin status alone does not exempt them — the
    quota check only looks at premium) who has already started 5 study sessions today
  When they request another list's study session (a fresh one, not a repeat of an already-fetched
    session)
  Then the request is rejected with 429 {"code": "daily_limit_reached", ...}; a session that turns
    out to have zero words (all_known) is never charged; users with active premium are unlimited
```

```gherkin
Scenario: A lapsed-premium student can still study their own personal list
  Given a student who previously created a personal word list but no longer has active premium
  When they open that list's study session
  Then the session is served normally — the study/browse access check only requires ownership, not
    active premium — even though editing, adding, or bulk-adding words to that same list is blocked
```

### Mascot greeting

```gherkin
Scenario: Dashboard header greets the student with a random easy word
  Given the dashboard's stats bar loads (shown on the lists and grammar pages)
  When it fetches a random easy word
  Then one random non-archived star-1 word is returned, restricted to words that belong to at
    least one public, non-archived, predefined list (one with no owning user) — so a word that
    only lives in a personal or custom-program list is never surfaced this way — and the response
    is null (and the mascot bubble stays on its default phrase) if no such word exists; the pick
    is never cached, so a page reload can show a different word
```

### Vocabulary browse

```gherkin
Scenario: Student browses all their known words
  Given a signed-in student
  When they open the vocabulary page
  Then every word with progress status "known" is listed with the title of its first containing
    list, searchable by Lithuanian text or translation and filterable by a client-computed memory
    bucket (due: no next_review or it has passed; fading: due within 3 days; ok: further out),
    paginated 50 per page
```

```gherkin
Scenario: A word's grammatical hint is shown in the reader's UI language
  Given a word whose `hint` field holds one of a fixed set of Russian grammar labels (e.g.
    «глагол», «разг.», «ед.ч.», «мн.ч.», «где?», or the plurale-tantum note) — the value seeded in
    the database — shown on the vocabulary page, the list detail page, or during a study session
  When the reader's UI language is English
  Then that fixed label is looked up and shown in English instead; any other hint value (freeform
    text not in the lookup table) is shown exactly as stored, and Russian-language readers always
    see the stored value unchanged
```
