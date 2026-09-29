# Practice — current behavior

## Purpose
The Practice function hosts multiple-choice knowledge tests organized into categories (e.g. a
category might bundle several tests on one topic, optionally with a linked source URL and an
optional short reading passage shown before a test). Anyone, including a signed-out visitor, can
browse categories and their tests; only signed-in users can enroll, track progress, and sit an
exam. Once enrolled, a student works through a category's tests in order; a test unlocks once the
previous test in the category is passed at its own pass threshold. `/dashboard/practice` presents
this as a hero (overall progress) → category chips → a bento pair (a featured "next test" or
category-preview card plus a stack of other categories and any final-exam card) → section cards
grouping that category's tests for direct start. Admins author categories, tests and questions,
group tests into named sections, flag one test per category as the final exam, and can export or
import a test (with all its questions) as JSON. It is called by the Next.js dashboard practice
pages over the REST API, plus the admin panel's practice-content editor.
Backed by: `backend/routers/practice.py`, `frontend/app/dashboard/practice/`,
`frontend/app/dashboard/components/PracticeOverview.tsx`.

## Scenarios

```gherkin
Scenario: anyone lists practice categories
  Given any caller, authenticated or not
  When GET /practice/categories is called
  Then every category is returned with a published-test count
  And "enrolled" is false for an anonymous caller
  And tests with status "testing" or "draft" are not counted unless the caller is an admin
```

```gherkin
Scenario: admin lists practice categories
  Given an authenticated admin
  When GET /practice/categories is called
  Then tests with status "testing" or "draft" (from any admin, not just the caller) are
    also counted toward each category's test_count
  And "enrolled" reflects the admin's own enrollments, same as any signed-in user
```

```gherkin
Scenario: student's enrolled-categories view
  Given an authenticated user with zero or more category enrollments
  When GET /me/practice-categories is called
  Then only enrolled categories are returned, each annotated with tests_passed and
    tests_total computed from the user's best score per visible test versus that
    test's own pass_threshold
  And a user with no enrollments gets an empty list without querying tests at all
```

```gherkin
Scenario: enrolling and unenrolling in a category
  Given an authenticated user
  When POST /me/practice-categories/{category_id} is called for an existing category
  Then an enrollment is created if one doesn't already exist (idempotent), and a
    non-existent category_id returns 404
  When DELETE /me/practice-categories/{category_id} is called
  Then the enrollment is removed, but calling it when not enrolled returns 404
    (unlike grammar-program unenrollment, which is silently idempotent)
```

```gherkin
Scenario: listing tests within a category with sequential lock
  Given any caller viewing a category's test list
  When GET /practice/categories/{category_id}/tests is called
  Then each test carries its section_ru, section_en and is_final alongside the fields below
  And for an authenticated user the first test in sort order is always unlocked, each later
    test is locked until the student's best score on the immediately preceding test meets or
    exceeds that preceding test's own pass_threshold (thresholds can differ per test, unlike
    grammar's fixed 75%), and best_score_pct reflects that user's best attempt
  And for an anonymous caller only published tests are returned, every one unlocked, and
    best_score_pct is null for all of them
  And a non-existent category_id returns 404
```

```gherkin
Scenario: general test list has stricter draft visibility than the category view
  Given an authenticated user
  When GET /practice/tests is called
  Then published tests are visible to everyone, "testing" tests only to admins, and
    "draft" tests only to the admin who created them
  And this is stricter than /practice/categories/{id}/tests and /practice/categories,
    which show any admin all "testing" and "draft" tests regardless of creator
```

```gherkin
Scenario: starting an exam
  Given an authenticated user and a test_id that is visible to them (per the same
    published/testing/draft-by-creator rule as the general test list)
  When GET /practice/tests/{test_id}/exam is called
  Then up to question_count active questions are chosen at random from that test's
    active question pool, and the test's lesson_text_lt (if any) is returned alongside
  And a test_id that doesn't exist, or isn't visible to this user, returns 404
```

```gherkin
Scenario: premium gating on a test is enforced by the server
  Given a test flagged is_premium = true and an authenticated, non-admin user without
    active premium
  When GET /practice/tests/{test_id}/exam is called for that test_id
  Then the response is 403 with code "premium_required" and no questions are returned
  And the dashboard reacts to that 403 by returning to the test list and showing the
    Premium wall, rather than showing it pre-emptively before the call
  And an admin, or a user with active premium, gets the exam questions as before
  And no quota is consumed either way — this endpoint never did
```

```gherkin
Scenario: practice page doubles as onboarding for a user in no category
  Given a signed-in user enrolled in zero categories, or a signed-out visitor
  When they open /dashboard/practice
  Then they are not redirected to /login
  And the hero shows 0 passed with an empty progress bar and a "start with the first
    category" action instead of "continue"
  And the featured card previews the first category (name, description, test count) with
    an "add" button
  And the other categories are stacked as add-cards
  And the section cards under the featured category show its tests as preview buttons,
    disabled, with no lock/score state
  When an anonymous visitor presses the featured "add" button or a stack "add" button
  Then they are sent to /login (no enrollment call is made without a token)
```

```gherkin
Scenario: practice featured card shows the next test to continue
  Given the user is enrolled in at least one category
  Then when the "Все" chip is selected, the featured card shows the first not-yet-passed,
    unlocked test (in sort order) of the first enrolled category that has one
  And its heading is that test's title in the current UI language (falling back to the
    other language's title per the usual *_en ?? *_ru rule — not always the Lithuanian
    title), with the title in the *other* language shown as a sub-heading when it differs,
    the question count, the pass mark, the best score badge if attempted, and a "start
    test" button
  And the hero's "continue" action opens the same test
  And when a selected category has nothing left to continue, its featured card instead
    shows a category preview (if not yet enrolled) or a "all done" summary (if enrolled and
    every test passed)
```

```gherkin
Scenario: practice tests grouped into section cards
  Given a category's visible tests
  Then tests sharing the same section_ru are grouped into one card, in test sort order,
    titled with the section label (section_en when the UI is English and set, else
    section_ru), and cards are ordered by the position of their last test in the list
  And a test with no section_ru gets its own single-test card, titled with that test's own
    title (and sub-heading), instead of a section label
  And within a card, each test renders as a button: numbered when the card groups several
    tests, otherwise a single "start" label; it shows a checkmark when passed, the best
    percentage when attempted but not passed, a lock icon and disabled state when locked,
    and a "Premium" tag when the test is premium and the viewer has no active premium
  And for an unenrolled category (preview) every button is disabled regardless of lock state
  When an unlocked, non-preview test button is pressed
  Then the app navigates to /dashboard/practice/{category_id}?test={test_id}, which starts
    that test immediately once the category's test list has loaded (reading screen first if
    the test has lesson_text_lt), skipping the intermediate test-list screen
  And from that test's reading/question/result screens, "back" returns to
    /dashboard/practice instead of the category's test list, because it was opened via
    ?test=
```

```gherkin
Scenario: final exam card
  Given an enrolled category has a test flagged is_final
  Then the stack includes a dedicated final-exam card for it, showing a fixed title, the
    test's own title, its question count and pass mark, and a lock icon plus disabled state
    when that test is still locked
  When it is pressed while unlocked
  Then it opens and starts that test the same way a section-card button does
```

```gherkin
Scenario: admin sets a practice test's section and final flag
  Given an authenticated admin creating or updating a practice test
  Then they can set section_ru and section_en (each optional free text) and is_final
    (boolean, default false)
  And a section value is trimmed, an empty/whitespace-only value is stored as NULL, and a
    value over 120 characters is rejected with 422
  And on update, section_ru/section_en/is_final are only touched when the request actually
    sends that field (unset fields are left alone; sending "" or null explicitly clears a
    section)
```

```gherkin
Scenario: removing a practice category from the practice page
  Given the user has an enrolled category open (its featured or stacked card selected)
  Then an "unenroll" control appears next to the section-cards heading for that category
  When it is pressed and the confirmation dialog is accepted
  Then DELETE /me/practice-categories/{id} is called and that category's cards switch to
    the not-enrolled (preview/add) state without a full page reload
```

```gherkin
Scenario: reading view before a test
  Given a test whose lesson_text_lt is set
  When the student opens that test in the dashboard
  Then a reading screen renders the lesson text (dialogue lines get speaker styling)
    before the student can proceed to the question screen
  And a test with no lesson_text_lt skips straight to the question screen
```

```gherkin
Scenario: saving an exam result
  Given an authenticated user who just finished an exam with a score and total
  When POST /practice/tests/{test_id}/results is called
  Then a PracticeExamResult row is stored as-is (no pass/fail flag is computed
    server-side, unlike grammar lesson results)
  And total <= 0, score < 0, or score > total is rejected with 400
  And a non-existent test_id returns 404
```

```gherkin
Scenario: admin manages categories
  Given an authenticated admin
  When creating, updating, or deleting a practice category via the /admin/practice/categories
    endpoints
  Then name_ru is required on create, all fields are optional (partial) on update, and
    deleting a category unlinks its tests (sets their category_id to null) rather than
    deleting or cascading to them
  And description_en is normalized on both create and (when the field is actually sent) update:
    an empty or whitespace-only string is stored as NULL rather than "", so it keeps falling
    back to description_ru instead of rendering blank; name_en gets no such normalization, so
    a saved empty string for name_en is stored and shown as-is, not treated as "no translation"
```

```gherkin
Scenario: admin manages tests
  Given an authenticated admin
  When creating, updating, or deleting a test via the /admin/practice/tests endpoints
  Then title_ru is required on create, status must be one of draft/testing/published,
    and deleting a test cascades to delete all of its questions first
  And title_en and description_en are stored exactly as sent, with no empty-to-null
    normalization (unlike the category endpoints' description_en)
```

```gherkin
Scenario: English UI falls back to Russian content per field
  Given the dashboard is rendered in English and a category, test title, or test description
    has no *_en value
  When that name/title is displayed, it falls back to the *_ru value only when the *_en field
    is exactly null (`name_en ?? name_ru`, `title_en ?? title_ru`)
  And a description falls back to *_ru whenever *_en is falsy — null or an empty string
    (`(lang === 'en' && description_en) || description_ru`) — while the RU UI always shows the
    *_ru value regardless of what *_en holds
```

```gherkin
Scenario: admin manages questions
  Given an authenticated admin
  When creating or updating a question under a test
  Then correct_option must be one of a/b/c/d (400 otherwise), and creating a question
    under a non-existent test_id returns 404
```

```gherkin
Scenario: admin exports and imports a test
  Given an authenticated admin
  When GET /admin/practice/tests/{test_id}/export is called
  Then the test and all its questions are returned as a downloadable JSON file
  When POST /admin/practice/tests/import is called with a JSON file
  Then a brand-new test is always created (status "draft"), never merged into an
    existing test with the same title, and any question in the file whose
    correct_option isn't a/b/c/d is silently skipped rather than rejecting the import
```

### Constitution exam — citizenship exam-prep sub-feature (`/practice/constitution/...`)

This is a distinct, self-contained sub-feature for Lithuanian-citizenship constitution exam
preparation, not general language practice — it uses its own question bank and result table
(`ConstitutionQuestion`, `ConstitutionExamResult`), separate from the generic PracticeTest/Category
system above. It has no dashboard page of its own: only its admin CRUD endpoints are wired into
the admin panel's content editor; the student-facing exam/results endpoints exist and work over
the API but no page in `frontend/app/dashboard/` currently calls them.

```gherkin
Scenario: fetching a constitution exam
  Given an authenticated user (any role)
  When GET /practice/constitution/exam is called
  Then up to 20 active constitution questions are returned in random order
  And there is no premium check and no daily quota consumed
```

```gherkin
Scenario: saving a constitution exam result
  Given an authenticated user who finished a constitution exam
  When POST /practice/constitution/results is called with score and total
  Then a ConstitutionExamResult row is stored (no pass/fail flag computed server-side)
  And total <= 0, score < 0, or score > total is rejected with 400
```

```gherkin
Scenario: admin manages the constitution question bank
  Given an authenticated admin
  When listing, creating, updating, or deleting constitution questions via
    /admin/constitution/questions endpoints
  Then correct_option must be one of a/b/c/d, and a non-admin caller is rejected with 403
```
