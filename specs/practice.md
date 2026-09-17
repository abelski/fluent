# Practice — current behavior

## Purpose
The Practice function hosts multiple-choice knowledge tests organized into categories (e.g. a
category might bundle several tests on one topic, optionally with a linked source URL and an
optional short reading passage shown before a test). Students enroll in categories, then work
through that category's tests in order; a test unlocks once the previous test in the category is
passed at its own pass threshold. Admins author categories, tests and questions, and can export or
import a test (with all its questions) as JSON. It is called by the Next.js dashboard practice pages
over the REST API, plus the admin panel's practice-content editor.
Backed by: `backend/routers/practice.py`, `frontend/app/dashboard/practice/`.

## Scenarios

```gherkin
Scenario: student lists practice categories
  Given an authenticated, non-admin user
  When GET /practice/categories is called
  Then every category is returned with a published-test count and an "enrolled" flag
  And tests with status "testing" or "draft" are not counted for this user
```

```gherkin
Scenario: admin lists practice categories
  Given an authenticated admin
  When GET /practice/categories is called
  Then tests with status "testing" or "draft" (from any admin, not just the caller) are
    also counted toward each category's test_count
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
  Given an authenticated user viewing a category's test list
  When GET /practice/categories/{category_id}/tests is called
  Then the first test in sort order is always unlocked
  And each later test is locked until the student's best score on the immediately
    preceding test meets or exceeds that preceding test's own pass_threshold
    (thresholds can differ per test, unlike grammar's fixed 75%)
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
Scenario: premium gating on a test is enforced only by the frontend
  Given a test flagged is_premium = true and a free (non-premium) authenticated user
  When that user calls GET /practice/tests/{test_id}/exam directly for that test_id
  Then the exam questions are returned normally — the endpoint does not check is_premium
    or consume any quota; the dashboard UI is what shows a "premium wall" card and
    withholds the Start button for such tests before this call is ever made
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
```

```gherkin
Scenario: admin manages tests
  Given an authenticated admin
  When creating, updating, or deleting a test via the /admin/practice/tests endpoints
  Then title_ru is required on create, status must be one of draft/testing/published,
    and deleting a test cascades to delete all of its questions first
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
