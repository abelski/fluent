# Custom programs — current behavior

## Purpose
Custom programs are community-created, structured vocabulary programs (e.g. a
TAKAS-style B1 program): a titled, optionally bilingual (RU/EN) collection of
one or more word sets, each word set being an ordered flashcard list. Any user
with `is_redactor` (or an admin) can author a program; any logged-in user can
browse the published community catalogue and enroll. Enrolling links the
program's underlying word lists into the student's own vocabulary the same way
any personal word list does — studying an enrolled program's words happens
through the existing word-list study flow, not through a program-specific
study endpoint. Served over REST from the dashboard (program creation/editing
under the redactor-only `/dashboard/programs/new` and `/dashboard/programs/[id]/edit`
pages) and from the top-level `/programs` page's "Сообщество"/community tab and
`/programs/custom/[token]` detail page, which handle browsing, enrolling, and
unenrolling for any logged-in student.

Backed by: `backend/routers/custom_programs.py`, `frontend/app/dashboard/programs/`
(create/edit UI), `frontend/app/programs/` (community browse/enroll UI).

## Scenarios

```gherkin
Scenario: Non-redactor tries to create or edit a program
  Given a logged-in user without is_redactor, is_admin, or is_superadmin
  When they call POST /me/custom-programs, PUT /me/custom-programs/{id}, or
    DELETE /me/custom-programs/{id}
  Then the request is rejected with 403 "Redactor role required"
  And the /dashboard/programs/new page itself checks the same flag client-side
    (via GET /me/quota's is_redactor field) and shows an access-denied screen
    instead of the form when it is false

Scenario: Redactor creates a program
  Given a redactor submits a title and at least one word set with at least one
    non-empty word pair
  When POST /me/custom-programs is called
  Then a CustomProgram row is created with a fresh share_token (UUID) and
    is_published = true, one WordList (private, owned by the creator) per word
    set, a Word row per non-empty word pair, and CustomProgramList rows linking
    the lists to the program in order
  And a blank word pair (all three fields empty) is silently skipped rather
    than saved
  And the creator is auto-enrolled in their own program so it shows in their
    own word lists immediately
  And a missing/blank title, or zero word sets, is rejected with 422 before
    any row is created

Scenario: A program is published the moment it is created, permanently
  Given is_published defaults to true on the CustomProgram model
  When a program is created
  Then it is immediately visible in the public community catalogue and
    enrollable by any user
  And no endpoint in this router (or elsewhere in the backend) ever sets
    is_published back to false — there is currently no unpublish/draft path

Scenario: Redactor edits their own program's word sets
  Given a PUT to /me/custom-programs/{id} includes a new word_sets array
  When the update is applied
  Then every word list the same user previously created for this program is
    deleted first (its WordListItem rows, then the WordList itself, then any
    UserWordProgress rows referencing its words, then the Word rows — in that
    FK-safe order) and replaced by freshly created word lists from the
    submitted word_sets
  And a word list created by a *different* user for this program (not
    expected in normal use, but not filtered out either) is left untouched by
    the delete step since the ownership check is by created_by

Scenario: Redactor edits only metadata
  Given a PUT to /me/custom-programs/{id} omits word_sets
  When the update is applied
  Then only the provided title/title_en/description/description_en/lang_ru/
    lang_en fields are changed; existing word sets are left alone
  And a blank (whitespace-only) title is rejected with 422; a blank title_en/
    description/description_en clears that field to null instead of erroring

Scenario: Admin or superadmin edits/deletes someone else's program
  Given the caller is not the program's creator
  When they call PUT or DELETE on that program and are is_admin or
    is_superadmin
  Then the request proceeds instead of being rejected with 403 "Not your
    program" (a plain redactor who is not the creator is rejected)

Scenario: Deleting a program cascades
  Given DELETE /me/custom-programs/{id} by the owner (or an admin)
  When the delete runs
  Then every word list/word the creator made for it is removed via the same
    ownership-scoped cascade used by edit, every UserCustomProgramEnrollment
    row for the program is removed, and the CustomProgram row itself is deleted

Scenario: Student browses the published community catalogue
  Given any request (auth optional) to GET /programs/community
  Then every program with is_published = true is returned, newest first, each
    with its list_ids, total word_count, enrollment_count, and author_name —
    all computed in a fixed number of queries regardless of how many programs
    or word lists exist

Scenario: Student opens a program via its share link
  Given a logged-in user calls GET /programs/community/{share_token} or its
    /word-sets sibling
  When the token matches an unpublished or nonexistent program
  Then the request is rejected with 404 "Program not found" — an unpublished
    program's link is not viewable, not even by its own author, through this
    endpoint

Scenario: Student enrolls in a community program
  Given POST /me/custom-program-enrollments with a share_token
  When the token resolves to a published program the student is not already
    enrolled in
  Then a UserCustomProgramEnrollment row is created and {"already_enrolled":
    false} is returned
  And enrolling again returns {"already_enrolled": true} without creating a
    duplicate row
  And a token for an unpublished or nonexistent program is rejected with 404

Scenario: Student unenrolls
  Given DELETE /me/custom-program-enrollments/{program_id}
  When a matching enrollment row exists for the current user
  Then it is deleted; when none exists the call is a silent no-op (still 204)

Scenario: Listing my enrollments skips programs that became unpublished
  Given GET /me/custom-program-enrollments for a student with existing
    enrollment rows
  When one of those programs no longer exists or has is_published = false
  Then that enrollment is silently omitted from the response instead of
    erroring or returning a broken entry

Scenario: Author fills in only one content language and the other is auto-translated
  Given the create/edit form's language checkboxes have only one of RU/EN
    checked (at least one must always stay checked)
  When the author clicks save
  Then the title, description, and each word's translation are machine-
    translated client-side into the unchecked language before the POST/PUT
    is sent, so the stored program still has both back_ru and back_en (or a
    title/title_en pair) populated
  And when both checkboxes are checked, nothing is auto-translated and
    exactly what the author typed in each field is sent as-is

Scenario: A word set left untitled gets a language-neutral default
  Given the create/edit forms start every new word set with an empty title
    field (placeholder-only, e.g. "Word set 1"/"Набор 1" depending on UI
    language) rather than pre-filling it
  When the word set is submitted with a blank title
  Then the backend stores a fixed Russian default ("Набор {n}", 1-based
    position) for that WordList's title regardless of the program's content
    languages or the UI language the form was filled in
  And any page that later displays that title (the community detail page,
    the edit form's placeholder) recognizes the "Набор {n}" pattern and
    renders it through the current UI language's own template instead of
    showing the stored Russian text verbatim; a title the author actually
    typed is shown as-is in any language

Scenario: Word content endpoints enforce ownership vs. open access differently
  Given GET /me/custom-programs/{id}/word-sets (creator-only route) versus
    GET /programs/community/{share_token}/word-sets (any authenticated user)
  When a non-owner, non-admin user calls the creator-only route for a program
    they did not create
  Then it is rejected with 403 "Not your program", while the community route
    for the same program's published share token succeeds for that same user
```
