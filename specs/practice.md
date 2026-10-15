# Practice — current behavior

## Purpose
The Practice function hosts multiple-choice knowledge tests organized into categories (e.g. a
category might bundle several tests on one topic, optionally with a linked source URL and an
optional short reading passage shown before a test). Anyone, including a signed-out visitor, can
browse categories and their tests; only signed-in users can enroll, track progress, and sit an
exam. Once enrolled, a student works through a category's tests in order; a test unlocks once the
previous test in the category is passed at its own pass threshold. `/dashboard/practice` (#66)
presents this as an overview — hero (overall progress, the page's one «Продолжить») → «В процессе»
→ «Завершённые» → «Другие программы» (the catalogue, grouped by exam) — and, on `?program=<id>`,
a program page listing the tests that are left as whole-row links. Admins author categories, tests and questions,
group tests into named sections, flag one test per category as the final exam, and can export or
import a test (with all its questions) as JSON. It is called by the Next.js dashboard practice
pages over the REST API, plus the admin panel's practice-content editor.
Backed by: `backend/routers/practice.py`, `frontend/app/dashboard/practice/`,
`frontend/app/dashboard/components/PracticeOverview.tsx`,
`frontend/app/dashboard/components/ProgramOverview.tsx`.

## Scenarios

```gherkin
Scenario: anyone lists practice categories
  Given any caller, authenticated or not
  When GET /practice/categories is called
  Then every category with at least one test the caller may see is returned with a
    published-test count (#62a — a category with nothing visible is omitted for
    non-admins, guests included; admins get every category)
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
  And for a non-admin an enrolled category with no visible test is omitted (#62a)
  And each category carries "last_result_at" (#66): the ISO 8601 UTC time of the user's latest
    result in any of its visible tests, or null — computed from the same single results query,
    never cached
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
  And each test carries title_lt (#66): the Lithuanian original of the title, or null —
    title_ru / title_en hold the UI-language titles
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
  Then for a test of kind "choice" up to question_count active questions are chosen at random
    from that test's active question pool, and the test's lesson_text_lt (if any) is returned alongside
  And for any other kind (#62c: "dialogue", #62d: "gap_text") every active question is returned in stored
    (sort_order, id) order, never sampled or shuffled
  And the response's test object carries kind, as does every summary from
    GET /practice/categories/{id}/tests
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
Scenario: practice page doubles as onboarding for a user in no category (#66)
  Given a signed-in user enrolled in zero categories, or a signed-out visitor
  When they open /dashboard/practice
  Then they are not redirected to /login
  And the hero shows 0 passed with an empty progress bar and two buttons: «Начать с Конституции»
    and an outline «Начать с чтения (A2)»
  And below it there is only the catalogue «Программы», grouped by exam: «Тест по Конституции —
    гражданство и ПМЖ» (the category with a final exam) and «Языковой экзамен A2» (the rest),
    with «Можно готовиться к обоим экзаменам.»
  And each catalogue card shows the name, test count, description, «Что внутри ▾» (a format line
    «Тесты по 10 вопросов, проходной балл 60–75%. Открываются по порядку.» and the contents:
    the sample test, the blocks with their test counts and the exam for the Constitution;
    the test titles otherwise) and «Добавить»
  And the A2 group offers «Добавить все части (N)» when it holds more than one category
  When an anonymous visitor presses any start or «Добавить» button
  Then they are sent to /login (no enrollment call is made without a token)
```

```gherkin
Scenario: enrolling from the practice page (#66)
  Given a logged-in user
  When they press a hero start button or a catalogue «Добавить»
  Then POST /me/practice-categories/{id} is called and the program page
    /dashboard/practice?program=<id> opens with «✓ «X» — теперь в твоих программах · Отменить»
  When they press «Добавить все части (N)»
  Then every category of that group is enrolled and the overview stays open
```

```gherkin
Scenario: practice overview mirrors grammar (#66)
  Given the user is enrolled in at least one category
  Then «В процессе» holds a card per category with tests left: «d/n тестов», a bar,
    «Дальше — <test> — <state>»; the whole card opens its program page
  And «Завершённые» holds a row per fully passed category: ✓, N/N, «Пора повторить» when its
    last_result_at is 7+ days old, «последний раз N дней назад · слабее всего: <test> — ✓ 78%»
  And «Другие программы» is the catalogue of categories not enrolled yet
  And the hero holds the page's only «Продолжить ›» with «Дальше — <category>: <test> — <state>»,
    opening the next test (first unlocked, not passed, in sort order) of the in-progress
    category practised last
  And states read: new «нужно 60%», tried below the pass mark amber «лучший 45%» · «нужно 60%»,
    passed green «✓ 90%», the sample test (pass mark 0) «без проходного балла» — never «нужно 0%»
  And test titles are in the UI language (title_en ?? title_ru), with title_lt as a second line
```

```gherkin
Scenario: finished category review button reopens the weakest test (#66)
  Given every test in a practice category is passed
  Then «Повторить · <N вопросов>» (hint «Пройти заново тест, где результат слабее всего») opens
    the lowest-scoring passed test (the sample test excluded) as a normal retake
  And no new backend endpoint and no daily session is involved
  And with every enrolled category complete, the hero says «✓ Все тесты пройдены» and offers the
    same retake for the most overdue category
```

```gherkin
Scenario: practice program page (#66)
  Given the user opens /dashboard/practice?program=<id> for an enrolled category
  Then a back link «Практика» and «Перейти:» chips for their other categories are shown
  And the header shows the name with a ⋯ menu («Убрать программу»), «N из M тестов пройдено»,
    a bar, «Дальше — <test> — <state>» and the page's one button «Продолжить ›» / «Начать ›»
  And «Осталось N тестов» rows open their test (the whole row, ›), each showing the title,
    title_lt, «10 вопросов · <state>», an «Экзамен» pill on the final exam and a «Premium» tag
    for a premium test when the viewer has no active premium
  And the sample test (pass mark 0, locks nothing) comes first as «Начни здесь»,
    «Формат как на настоящем экзамене»
  And a category with sections keeps its blocks: the current block open with every test it
    has left, the others one line each with passed/total, a segmented strip and
    «Откроется после «Блок 1…»» (naming the block before, never a test inside itself)
  And a category without sections lists open tests, then two locked ones, the rest folded
    under «Ещё N тестов — откроются по порядку»
  And the first locked row says «Откроется после «<previous test>» — нужно 60%»; tapping any
    locked row shows its reason
  And the final exam is pinned last, its lock saying «Откроется, когда пройдены все блоки и
    итоговые тесты»
  And passed tests sit under «Пройдено N тестов · слабее всего: X ✓ 78%» (collapsed in
    progress, starting with the retake button; open when complete), weakest first, the
    sample test last, each with its block name
  When an unlocked row is pressed
  Then the app navigates to /dashboard/practice/{category_id}?test={test_id}, which starts
    that test immediately once the category's test list has loaded (reading screen first if
    the test has lesson_text_lt), skipping the intermediate test-list screen
  And from that test's reading/question/result screens, "back" returns to
    /dashboard/practice instead of the category's test list, because it was opened via ?test=
```

```gherkin
Scenario: the /dashboard/practice/programs page is gone (#66)
  Then the catalogue lives in «Другие программы» on the overview and nothing links to it
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
Scenario: admin sets a practice test's Lithuanian original title (#66)
  Given an authenticated admin creating, updating or importing a practice test
  Then they can set title_lt (optional; the admin form field «Оригинал на литовском (LT)»)
  And the value is trimmed, an empty value is stored as NULL, and a value over 200 characters
    is rejected (422 on create/update, 400 on import)
  And on update title_lt is only touched when the request sends it ("" clears it)
  And export includes title_lt and import reads it back
```

```gherkin
Scenario: removing a practice category from the practice page (#66)
  Given the user is on an enrolled category's program page
  When they open the ⋯ menu, press «Убрать программу» and accept the confirmation dialog
  Then DELETE /me/practice-categories/{id} is called and the overview opens, the category
    back in the catalogue
```

```gherkin
Scenario: compact hero on phones (#66)
  Given a viewport of 375 px
  Then the hero title is full width, TAK sits beside the numbers, the buttons are full width
  And desktop is unchanged
```

```gherkin
Scenario: reading view before a test
  Given a test whose lesson_text_lt is set
  When the student opens that test in the dashboard
  Then a reading screen renders the lesson text (dialogue lines get speaker styling)
    before the student can proceed to the question screen
  And during the questions the text stays available in a collapsible block above the question
    (native <details>, closed by default; the summary shows a chevron, the label «Текст» and a
    «· показать текст» hint that disappears once open; the body is capped at 40vh with inner scroll)
  And a test with no lesson_text_lt skips straight to the question screen
```

```gherkin
Scenario: true / false / not-stated statement 
  Given a published test in the "Верно / Неверно / Не сказано" category
  When the student answers one of its statements
  Then the options are Tiesa / Netiesa / Nepasakyta and exactly one of them is correct
  And the empty option_d row is not rendered
```

```gherkin
Scenario: insert-only category seed 
  Given backend/scripts/seed_practice_category.py <data.json>
  When it runs with --dry-run
  Then it validates the JSON (format "tfns": 10 tests, 400–1200-char texts, 6 statements each,
    each of a/b/c at least once, no duplicates, RU + EN titles) and touches no database
  When it runs without --dry-run
  Then it inserts the category, tests (status testing) and questions in one transaction,
    or, if a category with the same name_ru exists, prints its id and changes nothing
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
Scenario: admin sets a test's kind (#62c)
  Given an authenticated admin
  When creating or updating a test with kind outside {choice, dialogue, gap_text}
  Then the response is 400
  And both admin test lists return kind, and an update that omits kind keeps the stored one
  And the admin test form shows a "Тип теста" / "Test type" select, so saving a dialogue
    never resets it to choice
```

```gherkin
Scenario: dialogue test (#62c)
  Given a test of kind "dialogue" whose questions are the other speaker's lines as
    "**Name:** text" with 4 candidate replies
  When a student runs it
  Then every turn is shown in stored order, one per screen, with the conversation so far
    rendered by DialogueText above the options: each earlier line followed by
    "**Jūs:** <its correct reply>" — the correct one even after a wrong pick — then the current line
  And the result review renders each turn with DialogueText, so no raw "**" is visible
  And «Jūs» is Lithuanian content, not translated in the English UI
```

```gherkin
Scenario: gap-text test (#62d)
  Given a published test of kind "gap_text" whose lesson_text_lt holds markers {1}…{N} and whose
    N questions are "{n}" with option_a = the gap's word, option_b = its distractor
  When the student starts it
  Then there is no reading screen and no collapsible text block — the gap screen opens directly
  And they see the text with numbered gaps (the first one active) and one shared word bank
    (every gap's word plus its distractor, shuffled once per run), sticky at the bottom of the screen
  And tapping a word fills the active gap and the next empty gap becomes active; the used chip
    stays in place greyed and struck through; tapping a filled gap returns its word to the bank
    and makes that gap active
  And "Проверить" / "Check" is enabled only when every gap is filled, and grades every gap at once:
    correct gaps green, a wrong gap shows the picked word red and struck through, then the right word
  And the score is the number of correctly filled gaps, posted to POST /practice/tests/{id}/results
  And each gap is a button with aria-label "Пропуск n, пустой" / "Gap n, empty" or "Пропуск n: word"
```

```gherkin
Scenario: question with an image (#62e — "Вывески и объявления" / "Signs and notices")
  Given a practice question whose image_url is set
  When it is shown
  Then the image is rendered above the question, with the question text as its alt text
    (natural aspect, max-h-[320px] max-w-full, rounded-[10px] border border-line)
  And when image_credit is set ("<author>, <licence>"), one centred muted line under the image shows it
    with the localized prefix «Фото:» / "Photo:" (i18n practice.photoCredit)
  And the admin question editor, export and import carry image_url and image_credit, and sending
    "" or null clears them
  And image_url must be null or a site-relative path matching ^/img/[a-z0-9/_-]+\.(webp|png|jpe?g)$
    (no external URLs), image_credit ≤ 200 chars — otherwise create / update / import returns 400
  And the "signs" category has 5 choice tests (6/6/5/6/6 questions — the parking test has 5),
    each question 3–4 options and no lesson text, at level A2–A2+: a real-life task about the photo
    (when open, how much, what is forbidden, what to do); "what is this place?" is asked only when the
    photo does not name the place and it must be inferred
```

```gherkin
Scenario: signs seed validation and in-place text update (#62e)
  Given backend/scripts/seed_practice_category.py <signs.json> (format "signs")
  When it runs (with or without --dry-run)
  Then it requires 5 tests of 5–6 questions each, 3–4 distinct non-empty options, a correct_option that
    points at an option, and an image_url that is unique across the whole category
  And every image must exist under frontend/public, be ≤ 200 KB and (webp) carry no EXIF; a non-CC0
    photo needs image_credit and source_url; image_credit must not start with «Фото»/"Photo"
  And a 3-option question is stored with an empty option_d
  When it runs with --update-text on an existing signs category
  Then each stored question is matched by image_url and its text, options and correct answer are
    rewritten in place (ids and results untouched); stored questions missing from the file are
    deactivated (never deleted) and each test's question_count is synced; an image_url with no stored question aborts with an
    error, and --update-text on any other format exits with 2
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
  Then the test (including kind, lesson_text_lt and title_lt) and all its questions are returned as a
    downloadable JSON file
  When POST /admin/practice/tests/import is called with a JSON file
  Then a brand-new test is always created (status "draft"), never merged into an
    existing test with the same title, and any question in the file whose
    correct_option isn't a/b/c/d is silently skipped rather than rejecting the import
  And kind and lesson_text_lt are read back; a file without kind imports as "choice", an
    unknown kind returns 400
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
