# Admin — current behavior

## Purpose
The operator-facing control surface of Fluent: user/role/premium management, moderation queues,
outbound communications (email, in-app broadcasts, leaderboard rewards), and content authoring for
every learning surface (word lists, grammar, practice tests, the constitution exam, phrase
programs, articles, news). Two privilege tiers gate it: `is_admin` (content + moderation) and
`is_superadmin` (adds user deletion, role grants, email sending, and broadcast composition).
Called by the authenticated admin dashboard (`/dashboard/admin` and its sub-pages) over REST with
a bearer JWT; every endpoint re-checks the caller's role server-side regardless of what the
frontend shows. Most admin content lives directly in `admin.py`; some admin-gated capabilities
live inside the same router file as their public/student-facing counterpart (reports, feedback,
inbox, news, articles, grammar sentences/programs vs. lesson-taking, practice categories/tests/
questions vs. exam-taking, constitution questions vs. exam-taking, phrase programs vs. phrase
study) — those are summarized here at a high level; their non-admin behavior is spec'd in their
own files (`specs/reports.md`, `specs/feedback.md`, `specs/inbox.md`, `specs/news.md`) or lives
outside this documentation pass entirely.
Backed by: `backend/routers/admin.py` (mounted at `/api/admin`), plus admin/superadmin-gated
endpoints found in `backend/routers/reports.py`, `feedback.py`, `inbox.py`, `news.py`,
`articles.py`, `constitution.py`, `practice.py`, `phrases.py`, `custom_programs.py`,
`extension.py`, `phrase_lists.py`, `word_lists.py`, `grammar.py`, `words.py`.
`frontend/app/dashboard/admin/` (`page.tsx`, `layout.tsx`, `grammar/page.tsx`, `articles/page.tsx`,
`articles/[slug]/edit/page.tsx`).

## Scenarios

### Access control

```gherkin
Scenario: A non-admin loads the admin dashboard
  Given an authenticated user whose is_admin is false
  When the dashboard's initial data load returns 401 or 403 from /api/admin/users
  Then the frontend redirects them to /dashboard/lists rather than rendering the admin UI
```

```gherkin
Scenario: A logged-out visitor loads the admin dashboard
  Given no token in localStorage
  When the admin page mounts
  Then it redirects to /login without calling the API
```

```gherkin
Scenario: An admin-but-not-superadmin calls a superadmin-only endpoint
  Given a caller with is_admin=true, is_superadmin=false
  When they call an endpoint gated by _require_superadmin (user deletion, role grants, email
    sending, message templates, auto-send toggles, leaderboard tooling, inbox composer)
  Then the request is rejected with 403 "Forbidden", independent of what the UI exposes
```

### User management

```gherkin
Scenario: An admin lists all users
  Given an admin caller
  When they GET /api/admin/users
  Then every user is returned with tier, today's session count vs. daily limit, last login,
    inactivity flag (30+ days since last activity), and a deletion-warning flag/date computed from
    whether a "sent" PreparedMessage older than 7 days exists with no login since it was sent
```

```gherkin
Scenario: An admin searches, filters, and sorts the user table
  Given the loaded user list
  When the admin types a search term or picks an activity filter (all/active/inactive/deletion) or
    clicks a sortable column header
  Then filtering, sorting, and pagination (20/page) all happen client-side against the already
    fetched list — no additional API calls
```

```gherkin
Scenario: An admin views one user's learning progress
  Given an admin caller and a target user id
  When they GET /api/admin/users/{id}/progress
  Then known/learning/new word counts, mistake count, a computed day-streak, session totals,
    grammar lessons passed (best score > 75%, excluding the internal "remind" sentinel lesson), and
    practice exams completed are returned in one response
  Then a 404 is returned if the target user doesn't exist
```

```gherkin
Scenario: An admin grants or revokes Premium
  Given a target user and an admin caller
  When they PATCH /api/admin/users/{id}/premium with is_premium and an optional premium_until
  Then the user's premium fields are updated directly (no billing/Stripe interaction)
  And if this transitions the user from not-actively-premium to actively-premium, an inbox welcome
    message is sent — re-granting or extending an already-active Premium user does not re-send it
```

```gherkin
Scenario: An admin sets a premium expiry in the past
  Given an admin caller granting Premium with a premium_until date
  When that date is not strictly in the future
  Then the request is rejected with 400 "premium_until must be in the future"
```

```gherkin
Scenario: A superadmin grants or revokes the admin role
  Given a superadmin caller and a target user who is not a superadmin
  When they PATCH /api/admin/users/{id}/set-admin
  Then the target's is_admin flag is updated
  Then attempting this on a superadmin target is rejected with 400 "Cannot change superadmin role"
```

```gherkin
Scenario: An admin grants or revokes the redactor (content-author) role
  Given an admin caller and any target user
  When they PATCH /api/admin/users/{id}/set-redactor
  Then the target's is_redactor flag is updated — this is admin-only, not superadmin-only, unlike
    set-admin
```

```gherkin
Scenario: A superadmin permanently deletes a user
  Given a superadmin caller and a target user id that isn't their own
  When they DELETE /api/admin/users/{id}
  Then every row referencing that user_id across progress/session/enrollment/message tables is
    deleted, their owned custom phrase lists (and phrases) are deleted, content they authored
    (word lists, custom programs) has created_by nulled rather than being deleted, then the user
    row itself is deleted — all in one transaction
  Then attempting to delete themselves is rejected with 400 "Cannot delete yourself"
  Then a 404 is returned if the target doesn't exist
```

```gherkin
Scenario: A superadmin bulk-deletes users
  Given a superadmin caller and a list of user ids
  When they POST /api/admin/users/bulk-delete
  Then the same per-user deletion runs for each id, silently skipping the caller's own id and any
    id that doesn't exist, and returns the count actually deleted
```

```gherkin
Scenario: A superadmin sends an ad-hoc email to one user
  Given a superadmin caller, a target user, and a subject+body
  When they POST /api/admin/users/{id}/send-email
  Then the email is sent via the SMTP service with a Premium upsell appended if the user isn't
    already Premium
  Then a 403 is returned if the target has not consented to email (email_consent=false)
  Then a 500 is returned if the SMTP call itself fails
```

### Prepared messages (reengagement / leaderboard reward & notice drafts)

```gherkin
Scenario: A superadmin reviews draft/sent reengagement messages
  Given a superadmin caller
  When they GET /api/admin/messages, optionally filtered by message_type (dismissal/reward/notice)
  Then messages are returned newest-first with status (draft/sent/failed) and metadata
```

```gherkin
Scenario: A superadmin edits a draft message before sending
  Given a message in "draft" status
  When they PATCH /api/admin/messages/{id} with a new subject/body and optional lang
  Then the draft's content is updated
  Then editing a message that isn't a draft is rejected with 400 "Only draft messages can be
    edited"
```

```gherkin
Scenario: A superadmin sends a prepared message
  Given a draft or failed message
  When they POST /api/admin/messages/{id}/send
  Then the email is sent via SMTP and the message's status becomes "sent" with a sent_at timestamp
  And if message_type is "reward", the recipient is granted Premium via the same helper the
    automatic weekly job uses, and a mirrored copy lands in their in-app inbox
  Then sending an already-sent message is rejected with 400 "Message already sent"
  Then if the target user has no email_consent, sending is rejected with 403
  Then if SMTP fails, the message's status becomes "failed" and 500 is returned
```

```gherkin
Scenario: A superadmin deletes a prepared message
  Given any message id
  When they DELETE /api/admin/messages/{id}
  Then the row is removed regardless of status
```

```gherkin
Scenario: A superadmin manually triggers dismissal-message generation
  Given a superadmin caller
  When they POST /api/admin/messages/generate
  Then the same inactive-user draft-generation routine the nightly scheduler runs is invoked
    immediately
```

```gherkin
Scenario: A superadmin edits the reengagement email templates
  Given a superadmin caller
  When they GET/PUT /api/admin/message-templates
  Then RU/EN subject+body templates are read from (or written to) AppSetting rows, falling back to
    a generated default template when no override has been saved yet
```

### Leaderboard rewards

```gherkin
Scenario: A superadmin previews this week's reward recipients
  Given a superadmin caller
  When they GET /api/admin/leaderboard-top5
  Then the top 5 scorers for last week (the week the reward job targets) are returned with score,
    plan, and the [week_start, week_end) bounds used
```

```gherkin
Scenario: A superadmin generates reward/notice drafts for the week
  Given a superadmin caller
  When they POST /api/admin/leaderboard-rewards/generate
  Then draft PreparedMessages are created for last week's top 5 (reward) and other qualifying users
    (notice), skipping anyone who already has a draft/sent message for that week or who lacks email
    consent, and the count of newly created drafts is returned
```

### Content: word lists, subcategories, words

```gherkin
Scenario: An admin views the content-management subcategory list
  Given an admin caller
  When they GET /api/admin/subcategories
  Then every distinct subcategory key found across non-archived word lists is returned, merged with
    its SubcategoryMeta row (CEFR level, difficulty, linked article, RU/EN name, status,
    sort_order), defaulting status to "draft" when no meta row exists yet
```

```gherkin
Scenario: An admin edits subcategory metadata
  Given an admin caller and a subcategory key
  When they PATCH /api/admin/subcategories/{key} with CEFR level, difficulty, article link, and
    RU/EN names
  Then the SubcategoryMeta row is upserted (created if it didn't exist)
```

```gherkin
Scenario: An admin changes a subcategory's visibility status
  Given an admin caller
  When they PATCH /api/admin/subcategories/{key}/status with draft, testing, or published
  Then the status is upserted onto SubcategoryMeta, controlling whether students see it (see
    words.py's visibility rule: published is visible to all, testing only to admins, draft only to
    the admin who authored it)
  Then an invalid status value is rejected with 400
```

```gherkin
Scenario: An admin edits a word list's bilingual title
  Given an admin caller and a list id
  When they PATCH /api/admin/content/word-lists/{id}/meta with title_ru and/or title_en
  Then the Russian title is only overwritten if the new value is non-blank; the English title is
    cleared to null if blank
```

```gherkin
Scenario: An admin reorders subcategories or word lists
  Given an admin caller
  When they PATCH /api/admin/content/subcategories/reorder or /content/word-lists/reorder with a
    list of {key or id, sort_order} pairs
  Then every named row's sort_order is updated in one pass; unknown ids/keys are silently skipped
```

```gherkin
Scenario: An admin edits a word's content
  Given an admin caller and a word id
  When they PATCH /api/admin/content/words/{id} with lithuanian, translations, hint, star, and an
    optional accented (stress-marked) form
  Then the word is updated after validating lithuanian and translation_ru are non-blank, star is
    1/2/3 if given, and — if accented is given — that its asterisk-stripped text matches lithuanian
    exactly
  Then editing an archived or nonexistent word is rejected with 404
```

```gherkin
Scenario: An admin reorders words within a list
  Given an admin caller and a list id
  When they PATCH /api/admin/content/word-lists/{id}/words/reorder with {item_id, position} pairs
  Then each WordListItem's position is updated, ignoring any item_id that isn't actually in that
    list
```

### Content: grammar

```gherkin
Scenario: An admin manages fill-in-the-blank grammar sentences
  Given an admin caller
  When they list (optionally by case_index, including/excluding archived), create, edit, or
    archive (soft-delete) a GrammarSentence via /api/admin/grammar/sentences*
  Then creation/edit is rejected if the display text lacks a "___" blank, if answer_ending or
    full_word or russian is blank, if display ends in a parenthetical annotation like "(3, f.)"
    (guards against leaked authoring notes), or if full_word doesn't equal the sentence's blank
    stem plus answer_ending (guards the grader and the display from disagreeing)
```

```gherkin
Scenario: An admin manages grammar case rules
  Given an admin caller
  When they list rules, set a rule's status (draft/testing/published), or edit a rule's RU
    name/question/usage/endings/transform and optional linked article slug
  Then edits require a non-blank name_ru, and a linked article_slug must resolve to an existing
    Article or the request is rejected with 400
```

```gherkin
Scenario: An admin manages grammar programs (curated lesson-group bundles)
  Given an admin caller
  When they list, create, edit, or delete a GrammarProgram via /api/admin/grammar/programs*
  Then creation/edit requires a non-blank title and difficulty in {1,2,3}; deleting an unknown
    program id is rejected with 404
```

### Content: practice tests, constitution exam (admin-gated endpoints in other routers)

```gherkin
Scenario: An admin authors practice-test categories, tests, and questions
  Given an admin caller
  When they use the /api/admin/practice/categories*, /api/admin/practice/tests*, and
    /api/admin/practice/questions* endpoints in backend/routers/practice.py (list/create/edit/
    delete at each level, plus per-test JSON export/import)
  Then content is authored the same admin-gated way as grammar/vocabulary content; students only
    ever see published tests (or, for an admin, also draft/testing ones per the visibility rule
    documented in that router)
```

```gherkin
Scenario: An admin authors constitution-exam questions
  Given an admin caller
  When they use /api/admin/constitution/questions* in backend/routers/constitution.py
    (list/create/edit/delete)
  Then a question requires correct_option to be one of a/b/c/d or the request is rejected with 400
```

### Content: phrase programs (admin-gated endpoints in phrases.py)

```gherkin
Scenario: An admin authors phrase programs and their phrases
  Given an admin caller
  When they use /api/admin/phrase-programs* and /api/admin/phrases/{id} in
    backend/routers/phrases.py (list/create/edit/delete programs; list/create/edit/delete phrases
    within a program; per-program stats)
  Then this is the same admin-only CRUD shape as the other content types; every one of these routes
    checks is_admin itself (this router has no shared _require_admin helper, just inline
    `if not user.is_admin` checks)
```

### Content: articles

```gherkin
Scenario: An admin manages knowledge-base articles
  Given an admin caller on /dashboard/admin/articles or the admin dashboard's Content → Articles
    tab
  When they list, create, edit, delete, export (as Markdown), or import (from a .md file upload)
    articles via the admin-gated endpoints in backend/routers/articles.py
  Then every one of those operations requires is_admin, checked per-request via that router's own
    _require_admin helper (a separate function from admin.py's, but identical in shape)
  Note: the "welcome" screen shown to new users is itself just an Article with a fixed slug,
    authored through this same editor rather than a dedicated settings field
```

### Content: news and moderation queues (summarized; full detail in their own spec files)

```gherkin
Scenario: An admin authors news posts from the dashboard
  Given an admin caller on the Content → News tab
  When they create, edit, delete, or toggle published on a post
  Then this drives backend/routers/news.py's /api/admin/news* endpoints — see specs/news.md for
    full behavior
```

```gherkin
Scenario: An admin triages mistake reports from the dashboard
  Given an admin caller on the Reports tab
  When they filter by status and hold/resolve/reopen/delete a report
  Then this drives backend/routers/reports.py's /api/admin/reports* endpoints — see
    specs/reports.md for full behavior, including reporter notification
```

```gherkin
Scenario: An admin reviews general feedback from the dashboard
  Given an admin caller on the Feedback tab
  When they view or delete a feedback entry
  Then this drives backend/routers/feedback.py's /api/admin/feedback* endpoints — see
    specs/feedback.md for full behavior
```

```gherkin
Scenario: A superadmin composes an in-app broadcast from the dashboard
  Given a superadmin caller on the Messages → Inbox sub-tab
  When they pick an audience, write bilingual content, dry-run to preview the recipient count, then
    send, or retract a past broadcast from the history table
  Then this drives backend/routers/inbox.py's /api/admin/inbox* endpoints — see specs/inbox.md for
    full behavior
```

### Settings

```gherkin
Scenario: Anyone reads the CEFR level thresholds
  Given any caller, no auth required
  When they GET /api/admin/settings/cefr-thresholds
  Then the word-count thresholds per CEFR level are returned from a cached AppSetting row — the
    only endpoint in this router that is both public and cached, since it's read on ordinary page
    loads rather than by admins
  Then a 404 is returned if the setting was never seeded
```

```gherkin
Scenario: An admin updates the CEFR thresholds
  Given an admin caller
  When they PATCH /api/admin/settings/cefr-thresholds with all 7 levels (0, A1, A2, B1, B2, C1, C2)
  Then the setting is upserted as JSON
  Then submitting a subset of levels, or any threshold <= 0, is rejected with 400
```

```gherkin
Scenario: A superadmin toggles automatic sending
  Given a superadmin caller
  When they GET/PATCH /api/admin/settings/auto-send for auto_send_inactive_emails and
    auto_send_weekly_rewards
  Then the two booleans are read from (defaulting to true if unset) or written to AppSetting rows,
    controlling whether the nightly scheduler sends dismissal emails and generates weekly reward
    drafts without a human trigger
```

### Scattered admin bypasses in student-facing routers (not full admin CRUD — a role escape hatch)

```gherkin
Scenario: An admin's role is exposed to the frontend
  Given any authenticated caller
  When their profile/quota response is built (backend/routers/words.py)
  Then is_admin, is_superadmin, and is_redactor (true if the user holds any of the three) are
    included, which the frontend uses to decide whether to show the admin nav link at all
```

```gherkin
Scenario: An admin bypasses Premium gates that would otherwise block them
  Given an admin caller
  When they create a personal word list or phrase list (word_lists.py / phrase_lists.py), add a
    word from the browser extension (extension.py), or take a grammar lesson out of its normal
    sequential unlock order (grammar.py)
  Then each of these routers' own premium-gate check treats is_admin the same as an active Premium
    subscription — explicitly for admin support/debugging, not a documented product feature
```

```gherkin
Scenario: An admin or superadmin edits someone else's community program
  Given a CustomProgram owned by a different user (backend/routers/custom_programs.py)
  When an admin or superadmin calls the program's word-content, update, or delete endpoints
  Then the normal "must be the creator" check is bypassed for them; a plain redactor without admin/
    superadmin still cannot touch programs they didn't create
```
