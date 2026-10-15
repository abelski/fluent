# Grammar — current behavior

## Purpose
The Grammar function teaches Lithuanian noun-case and verb-conjugation grammar through short,
auto-graded lesson exercises, grouped into enrollable "programs" (e.g. "Lithuanian Cases",
"Numbers", verb conjugation, verb-governed cases). Students browse programs, enroll, work through
lessons in sequence, and their pass/fail history unlocks the next lesson. It is called by the
Next.js dashboard grammar pages over the REST API; the same endpoints also serve the admin's
read-only view into draft/testing content (there is no separate admin content-editing router in
scope here — admin-only behavior below is limited to what `routers/grammar.py` itself branches on).
The `/dashboard/grammar` screen (#66) is an overview — hero, «В процессе», «Завершённые»,
«Другие программы» — and, on `?program=<id>`, a program page listing what is left; with no
enrolled program the overview is the catalogue, so a visitor can preview and enroll without
leaving the page.
Backed by: `backend/routers/grammar.py`, `backend/grammar_service.py`,
`frontend/app/dashboard/grammar/page.tsx`,
`frontend/app/dashboard/components/GrammarOverview.tsx`,
`frontend/app/dashboard/components/ProgramOverview.tsx`,
`frontend/app/dashboard/components/GrammarTaskRunner.tsx`.

## Scenarios

```gherkin
Scenario: anonymous visitor lists lessons
  Given no Authorization header is sent
  When GET /grammar/lessons is called
  Then only lessons whose grammar-case rules are all "published" are returned
  And every lesson has is_locked = false and best_score_pct = null
```

```gherkin
Scenario: free authenticated student lists lessons
  Given a logged-in user who is not an admin and has no active premium
  When GET /grammar/lessons is called
  Then only published lessons are returned
  And lesson N is locked unless the student's best score on lesson N-1 exceeds 75%
  And the first lesson overall is always unlocked
  And the first lesson of any program the student is enrolled in is also unlocked,
    independent of that lesson's position in the full lesson order
```

```gherkin
Scenario: admin lists lessons
  Given a logged-in user with is_admin = true
  When GET /grammar/lessons is called
  Then lessons whose case rules are published, testing, or draft are all returned
  And each lesson carries a "status" field (the worst status among its case rules)
  And is_locked is false for every lesson regardless of prior scores
```

```gherkin
Scenario: premium student bypasses the lesson-order lock
  Given a logged-in user with an active (non-expired) premium subscription
  When GET /grammar/lessons or GET /grammar/verb-lessons is called
  Then every lesson has is_locked = false, even lessons past an unpassed prerequisite
```

```gherkin
Scenario: starting a locked lesson is rejected
  Given a free authenticated student for whom the target lesson is currently locked
  When GET /grammar/lessons/{lesson_id}/tasks is called
  Then the response is 403 with a message to finish the previous lesson or upgrade
  And no daily session quota is consumed for this attempt
```

```gherkin
Scenario: starting an unlocked lesson consumes the daily quota
  Given a free authenticated student for whom the target lesson is unlocked
  When GET /grammar/lessons/{lesson_id}/tasks is called
  Then a randomly generated task set for that lesson is returned
  And the student's daily study-session count is incremented
  And if the student has already reached the daily session limit, 429 is returned instead
    and the task set is not returned
```

```gherkin
Scenario: admin bypasses the lock but not the daily quota
  Given a logged-in admin without an active premium subscription
  When GET /grammar/lessons/{lesson_id}/tasks is called for a lesson that would otherwise be locked
  Then the lock check is skipped (403 never fires)
  But the daily session quota is still checked and incremented like any non-premium user,
    because the quota check only looks at premium status, not is_admin
```

```gherkin
Scenario: anonymous user fetches lesson tasks
  Given no Authorization header is sent
  When GET /grammar/lessons/{lesson_id}/tasks is called
  Then the lock check is skipped entirely (unauthenticated users have no progression)
  And no daily session quota is checked or recorded
```

```gherkin
Scenario: requesting tasks for an unknown lesson
  Given a lesson_id that does not match any configured lesson
  When GET /grammar/lessons/{lesson_id}/tasks is called
  Then the response is 404
```

```gherkin
Scenario: saving a lesson result
  Given an authenticated student who just finished a lesson attempt with a score and total
  When POST /grammar/lessons/{lesson_id}/results is called
  Then a result row is stored with passed = (score / total > 0.75)
  And a request with total <= 0, score < 0, or score > total is rejected with 400
  And an anonymous caller is rejected (authentication required)
```

```gherkin
Scenario: progress summary excludes the remind sentinel
  Given an authenticated student who has completed both real lessons and "remind" sessions
  When GET /grammar/progress is called
  Then the response maps each real lesson_id to its best score ratio
  And results saved against lesson_id 0 (the remind sentinel) are excluded from the map
```

```gherkin
Scenario: remind session builds from passed practice lessons
  Given an authenticated student enrolled in one or more programs
  And the student has passed (>75%) at least one lesson whose level is "practice"
    («Смешанный» / "Mixed") within a program they are enrolled in
  When GET /grammar/remind/tasks is called without program_id
  Then up to 10 tasks are sampled from those eligible passed practice lessons, in random order
    (both noun and verb/verb-case lessons are eligible)
  And a daily session quota unit is consumed for the request
```

```gherkin
Scenario: remind session scoped to one program (#66)
  Given GET /grammar/remind/tasks?program_id=<id>
  Then up to 10 tasks are sampled only from that program's passed "practice"-level lessons
  And the weakest lessons (lowest best score) are drawn first, ties in random order
  And without program_id behaviour is unchanged
  And an unknown or hidden program is 404, a program the student is not enrolled in is
    403 {"code": "not_enrolled"} — both before any quota is charged
  And 404 "no_passed_practice" is returned before any quota is charged when nothing is eligible
```

```gherkin
Scenario: remind session has nothing eligible
  Given an authenticated student with no passed "practice"-level lesson
    in any program they are enrolled in
  When GET /grammar/remind/tasks is called
  Then the response is 404 with code "no_passed_practice"
  And no daily session quota is consumed
```

```gherkin
Scenario: public program list
  Given any caller, authenticated or not
  When GET /grammar-programs is called
  Then only programs flagged is_public are returned (admins also get hidden ones — see below)
  And programs come in id order, so the hero's «Начать с падежей» (the first "cases" program)
    keeps picking «Литовские падежи» when more "cases" programs exist
  And each program includes is_public
  And each program includes "enrolled": true/false, which is always false for an
    unauthenticated caller
  And each program includes title_en and description_en alongside the Russian
    title/description; the frontend shows the English field only when the UI
    language is English and that field is non-null, otherwise it shows Russian
```

```gherkin
Scenario: programs report their latest result date (#66)
  When GET /grammar-programs is read by a signed-in student
  Then each enrolled program carries "last_result_at": the ISO 8601 UTC time of the student's
    latest lesson result in that program (one grouped query, mapped through the program's lessons)
  And it is null for programs with no result, for programs the student is not enrolled in,
    and for anonymous callers
  And results saved against the remind sentinel (lesson 0) never count — a review run
    can't be attributed to one program
  And «Пора повторить» and the hero's choice of program use it
```

```gherkin
Scenario: verb-case-governance programs are force-hidden from the public list
  Given a grammar program whose program_type is "verb_cases"
  When the program list is loaded (seed/bootstrap step runs on every /grammar-programs call)
  Then that program is set to is_public = false if it was ever exposed,
    so it never appears in the public program list regardless of how it was configured
```

```gherkin
Scenario: enrolling in a program
  Given an authenticated user and a program_id that exists and is public
  When POST /me/grammar-programs/{program_id} is called
  Then an enrollment is created if one does not already exist (idempotent)
  And enrolling in a missing or non-public program returns 404 (for non-admins)
```

```gherkin
Scenario: admin previews a hidden grammar program (#62f)
  Given a grammar program with is_public = false
  When an admin lists grammar programs or enrolls in it
  Then the admin sees it (with is_public = false) and can enroll; non-admins still get
    neither (it is missing from their list and enrolling returns 404)
```

```gherkin
Scenario: unenrolling from a program
  Given an authenticated user
  When DELETE /me/grammar-programs/{program_id} is called
  Then any existing enrollment for that program is removed
  And calling it again when not enrolled is a no-op that still returns ok
```

```gherkin
Scenario: verb lesson lock and progress mirror noun lessons
  Given a caller of any of the same roles above (anonymous / free / premium / admin)
  When GET /grammar/verb-lessons?program_type=verbs or ?program_type=verb_cases is called
  Then the same lock rule applies (first lesson unlocked, subsequent lessons need >75%
    on the previous one, premium/admin bypass), except program-enrollment-based
    first-lesson unlocking does not apply to verb lessons
  And conjugation lessons (ids 200-299) and case-governance lessons (ids 300-399) are
    disjoint id ranges, each locked against its own preceding lesson in its own list
```

```gherkin
Scenario: verb lesson task fetch and result save
  Given an authenticated user requesting GET /grammar/verb-lessons/{lesson_id}/tasks
  Then the same lock-then-quota sequence as noun lessons applies, and an id not present
    in either verb lesson list returns 404
  And POST /grammar/verb-lessons/{lesson_id}/results validates and stores the attempt
    using the same GrammarLessonResult table and >75% pass rule as noun lessons
```

```gherkin
Scenario: grammar rule content has an English twin, falling back to Russian
  Given a lesson's case rules loaded from the grammar_case_rule table, each of which
    has RU columns (question, name_ru, usage, endings_sg, endings_pl, transform) and
    parallel *_en columns that an admin may leave null until translated
  When GET /grammar/lessons (or /grammar/verb-lessons for case-governance lessons)
    returns those rules, and later the student's UI language is English
  Then the API always returns both the RU value and the nullable EN twin for every
    field, and the frontend shows the EN value only when it is present and the UI
    language is English, otherwise it shows the RU value
  And a rule's linked article title works the same way, except when article_title_en
    is null the frontend shows a generic "article" fallback label instead of the
    Russian title
```

```gherkin
Scenario: verb-lesson titles and hints have an English twin
  Given the verb lesson config (verb_lessons.json) and its tense_hints/tense_hints_en tables
  When GET /grammar/verb-lessons is called
  Then each lesson includes title_en (from a fixed tense-name → English label map,
    e.g. "Настоящее время" -> "Present tense", or the Russian title itself if the
    tense key is unmapped) and hint_en (looked up from tense_hints_en, or null if
    that tense has no English hint yet)
  And the frontend shows title_en/hint_en only in English UI mode and only when set,
    otherwise it falls back to the Russian title/hint
```

```gherkin
Scenario: generated tasks carry English twins of their Russian prompts
  Given a lesson or verb-lesson task set is generated (declension, sentence,
    verb_conjugation, or verb_case)
  When the tasks are returned to the client
  Then each task carries an English counterpart of its Russian text where one is
    stored (prompt_en for declension tasks; translation_en for sentence,
    verb_conjugation and verb_case tasks; tense_label_en for verb_conjugation tasks)
  And translation_en/prompt_en may be null if no English translation is stored yet,
    in which case the frontend shows the Russian text instead
```

```gherkin
Scenario: a sentence row whose stored answer disagrees with its displayed word is never served
  Given a grammar_sentence row where full_word (shown to the student as "the correct
    answer" on a wrong guess) does not equal stem(display) + answer_ending
    (what the grader actually checks), case-insensitively
  When that lesson's sentence tasks are generated
  Then the row is excluded from the pool entirely, so a student can never see a
    "wrong" verdict on an answer that matches what the UI itself displays as correct
  And a row is still accepted when full_word equals stem+answer_ending, or ends with
    it as a separate leading word (covers ordinal-number prefixes like "dvidešimt")
```

```gherkin
Scenario: basic-level tasks carry four same-paradigm options when four forms exist (#60)
  Given a lesson whose level is "basic"
  When GET /grammar/lessons/{lesson_id}/tasks or GET /grammar/verb-lessons/{id}/tasks is called
  Then a task whose answer has at least 4 distinct paradigm forms carries "options":
    4 distinct full words, exactly one equal to "answer", in shuffled order
  And "distinct" ignores only case and tone marks, so "ranka" and "ranką" can both appear
  And the distractors come from the answer's own paradigm:
    sentence tasks → other forms of the same noun (words.txt), numeral/pronoun
      (paradigms_extra.txt) or adjective (adjectives.txt, checked last, #62f); a numeral
      prefix such as "dvidešimt" stays on every option,
    verb_conjugation tasks → other persons of the same verb and tense, then the same
      person in other tenses,
    verb_case tasks → other questions from a fixed list (ką? ko? kam? kuo? į ką? …),
      skipping the answer's own question and any list entry sharing a token with it;
      words before the answer's first question word (e.g. the negation in "nerašyti ko?")
      are kept as a prefix on every option
  And a sentence task with options has the stem stripped from "display" and the full
    word as "answer", like practice
  And a task without 4 distinct forms (indeclinable numbers, ambiguous forms such as
    "drauge" that belong to two words, words missing from the tables) has no "options"
    and keeps today's typing shape, so one basic run can mix choice and typing tasks
  And a verb_case answer with no question word at all (e.g. "nesišukuoti?") gets no options
  And a verb_case answer containing a Cyrillic "о" homoglyph has it replaced by Latin "o"
    in the returned "answer"; any other Cyrillic character means corrupt data and no options
  And advanced and practice tasks never carry "options"
```

```gherkin
Scenario: student answers a basic task by choosing (#60)
  Given a basic-level run and a task with "options"
  When the task is shown
  Then the student sees the options as a single-column list of buttons (≥44px tall at
    375px; keys 1–4 pick one) instead of the text input and «Проверить»
  And a task without "options" in the same run shows the text input as before
  When the student taps an option
  Then it is graded exactly against "answer"
  And a correct pick auto-advances after 1s; a wrong pick shows it red, the correct one
    green, «Правильно: …» and "Понятно, дальше", as on the typed levels
```

```gherkin
Scenario: a wrong task comes back once at the end of the run (#60)
  Given any grammar run (basic, advanced, practice, «Напомнить», «Продолжить занятие»)
  When the student answers a task wrong
  Then that task is appended once to the end of the run, marked «Повтор» / «Retry»
  And the counter total grows by one (e.g. 1 / 11 for 10 tasks + 1 mistake)
  And a repeat answered wrong again is not appended a second time
  And a repeat's options are the same set, reshuffled
```

```gherkin
Scenario: the score counts first attempts only (#60)
  Given a run of N tasks with some repeats appended
  When the run finishes
  Then the saved result is (first-attempt correct, N) — repeats never change score or total
  And the >75% unlock threshold is judged on that score, as before
  And repeats fetch nothing and consume no extra daily session quota
```

```gherkin
Scenario: recurring characters have names that can't be read as pronouns
  Given the grammar exercises use recurring characters Jonas and Rūta
  When a sentence task about Rūta is shown in RU mode (e.g. "Rūta perka spurg___.")
  Then its Russian hint names her "Рута" (e.g. "Рута покупает пончик.")
  And no grammar_sentence uses the name "Ona", whose Russian form "Она" reads as the pronoun "she"
  And the grammar overview note names the characters "Йонас и Рута" (RU) / "Jonas and Rūta" (EN)
```

```gherkin
Scenario: grammar page with no enrolled program doubles as onboarding (#66)
  Given a user (logged in or anonymous) enrolled in no grammar program
  When they open /dashboard/grammar
  Then the hero shows "0" with no "N из M" badge and an empty progress bar
  And the hero's only button reads «Начать с падежей»
  And below the hero there is only the catalogue «Программы»: one card per public program
    (difficulty kicker, title, lesson and topic counts, description, «Что внутри ▾» with the
    format line and the topics in the UI language, «Добавить ›»), the first marked
    «С неё проще всего начать»
```

```gherkin
Scenario: enrolling from the grammar page (#66)
  Given a logged-in user on /dashboard/grammar
  When they press «Начать с падежей» or a catalogue card's «Добавить»
  Then POST /me/grammar-programs/{id} is called for that program
  And the program page /dashboard/grammar?program=<id> opens with
    «✓ «X» — теперь в твоих программах · Отменить»
  When they press «Отменить»
  Then DELETE /me/grammar-programs/{id} is called and the overview opens again
```

```gherkin
Scenario: anonymous visitor tries to enroll
  Given an anonymous visitor on /dashboard/grammar (no token in local storage)
  When they press «Начать с падежей» or any «Добавить» button
  Then no enroll request is sent; they are redirected to /login
  And because Google OAuth always redirects back to /dashboard, they do not return to
    the grammar page after signing in
```

```gherkin
Scenario: overview splits programs by state (#66)
  Given a student enrolled in programs A (in progress), B (fully passed) and not enrolled in C
  When /dashboard/grammar opens
  Then «В процессе» holds a card for A with «d/n уроков», a bar and
    «Дальше — <topic> · <level> — <state>»; the whole card opens A's program page
  And «Завершённые» holds a row for B with ✓, N/N, «последний раз N дней назад ·
    слабее всего: <topic · level> — ✓ 78%» and «Повторить · ~10 заданий»
    («Короткая сессия из пройденного, сначала слабое»); the row opens B's program page
  And «Другие программы» holds a catalogue card for C with «Что внутри» and «Добавить»
  And the hero holds the page's only «Продолжить ›» with one line naming what it opens and the
    pass mark: «Дальше — <program>: <topic> · <level> — <state>»
  And that is the next lesson (first unlocked, not passed, in program order — Premium included)
    of the in-progress program practised last (latest last_result_at; never-practised ones last)
  And the button reads «Начать» instead when nothing in that program was ever tried
```

```gherkin
Scenario: one status wording (#66)
  Then a lesson never tried reads «нужно больше 75%»
  And a lesson tried below the pass mark reads amber «лучший 45%» · «нужно больше 75%»
  And a passed lesson reads green «✓ 90%» — green means passed only
  And level 3 is called «Смешанный» / "Mixed" in the lesson list, the exercise screens and the hero
```

```gherkin
Scenario: a finished program says it is time to review (#66)
  Given a fully passed program whose last_result_at is 7 or more days ago
  Then its «Завершённые» row and its program header show «Пора повторить»
  And due rows are listed first
```

```gherkin
Scenario: every program complete (#66)
  Given every program the student enrolled in is fully passed
  Then the hero says «✓ Все уроки пройдены» and its button «Повторить пройденное» starts a review
    of the most overdue program (oldest last_result_at) that has a passed «Смешанный» lesson
```

```gherkin
Scenario: program page lists what is left (#66)
  Given a student opens /dashboard/grammar?program=<id> for a program they are enrolled in
  Then a back link «Грамматика» and «Перейти:» chips for their other programs are shown
    (a sideways-scrolling row at 375px)
  And the header shows the title with a ⋯ menu («Убрать программу»), «N из M уроков пройдено»,
    «d из t тем», a bar, the theory link once when every topic shares one article,
    «Дальше — <topic> · <level> — <state>» and the page's one button «Продолжить ›» / «Начать ›»
  And «Осталось N тем» shows a legend, the next topic first (tinted, kicker «Дальше»;
    «Начни здесь» on an untouched program), then started topics (tag «Начато»), then two more,
    the rest folded under «Ещё N тем» (open by default from 860px)
  And each topic's levels are one strip of tappable cells: level name + «✓ 90% ›» /
    «60% ›» / «не начат ›»; a locked level shows a lock
  And pressing an unlocked cell starts that lesson immediately
  And passed topics are folded under «Пройдено N тем · слабее всего: X ✓ 78%» with
    «Показать ▾» — collapsed in progress (starting with «Повторить · ~10 заданий» when a
    «Смешанный» lesson is passed), open when the program is complete; rows weakest first
  And a ?program= id the student is not enrolled in shows the overview instead
```

```gherkin
Scenario: locked topics state their reason (#66)
  Given a free student with locked lessons in the program
  Then a partly locked topic says «Продвинутый откроется после «<topic · level>» — нужно больше 75%»
  And the first fully locked topic says «Откроется после «<topic · level>» — нужно больше 75%»,
    the second is shown without a reason, the rest fold into «Ещё N тем — откроются по порядку»
  And tapping a locked row or cell shows its reason
  And the card ends with «Открыть всё сразу — с Premium ›» linking to /pricing
  And a Premium student (no locks) sees no locked tail and no Premium link
```

```gherkin
Scenario: finished program page (#66)
  Given the student opens the page of a fully passed program
  Then the header shows «✓ Все уроки пройдены», «Пора повторить» when due, «последний раз …»,
    «Слабее всего: <topic · level> — ✓ 78%» and «Повторить · ~10 заданий»
  And the button calls GET /grammar/remind/tasks?program_id=<id>
  And when nothing is eligible (404) a line «Пока нечего повторять…» is shown instead of a run
```

```gherkin
Scenario: removing a program from the grammar page (#66)
  Given the student is on an enrolled program's page
  When they open the ⋯ menu and press «Убрать программу», a confirmation dialog names the
    program and no request is sent yet
  When they confirm
  Then DELETE /me/grammar-programs/{id} is called and the overview opens
```

```gherkin
Scenario: enroll or unenroll fails
  Given a logged-in user on /dashboard/grammar
  When an enroll or unenroll request returns a non-2xx response
  Then one line reading "Не получилось — попробуйте ещё раз." in the destructive colour appears
    under the hero (overview) or above the program header
  And it is cleared on the next enroll/unenroll or lesson start
```

```gherkin
Scenario: compact hero on phones (#66)
  Given a viewport of 375 px
  Then the hero title is full width, TAK sits beside the numbers, the button is full width
  And «Продолжить» ends within the first phone screen (about 500px down)
  And desktop is unchanged
```

```gherkin
Scenario: the /dashboard/grammar/programs page is gone (#66)
  Then the catalogue lives in «Другие программы» on the overview
  And no page links to /dashboard/grammar/programs (the combined session's enrol link opens
    /dashboard/grammar)
```

```gherkin
Scenario: new grammar programs use the existing lesson pipeline (#62f)
  Given the "Прилагательные" program (lesson_filter ["Būdvardžiai"], case indices 21–26,
    lessons 106–138) is public and its six case rules are published
  Then its lessons appear at Basic / Advanced / Mixed («Смешанный») level like any noun lesson
  And Basic tasks offer 4 forms of the same adjective (its adjectives.txt line)
  And the instruction reads «Выбери/Впиши правильную форму прилагательного: <падеж>» /
    "Pick/Type the right form of the adjective: <case>"
  And while the program is hidden and its rules are `testing`, non-admins see none of its lessons
```

```gherkin
Scenario: time and quantity lessons (#62h)
  Given the "Время и количество" program (lesson_filter ["Laikas ir kiekis"], case indices 31–34,
    lessons 166–186) is public and its four case rules are published
  Then its lessons appear at Basic / Advanced / Mixed («Смешанный») level like any noun lesson
  And time blanks (31–32) are always ordinals, so Basic offers 4 forms of the same ordinal
  And quantity tasks (33–34) offer 4 forms of the same noun with «от: <nominative>»
  And while the program is hidden and its rules are `testing`, non-admins see none of its lessons
  Given a task from group "Laikas ir kiekis"
  Then the instruction reads «Выбери/Впиши правильную форму: <падеж>[, ед./мн. ч.]» /
    "Pick/Type the right form: <case>[, singular/plural]" — nominative for 31, genitive for 32–34
  And a rule card whose singular or plural endings value is «—» omits that row
```

```gherkin
Scenario: a sentence task's «от: …» hint (base_lt)
  Given a sentence task with full word W and stem S
  Then base_lt is W's noun nominative (words.txt) if unambiguous, else the dictionary form
    (first column) of W's adjectives.txt line, else the noun nominative found by stem S
```

```gherkin
Scenario: the sentence text is served as stored
  Given a sentence row whose full word also appears after the blank
    (e.g. «Tai ger___ knyga, o filmas gera.»)
  Then display is served unchanged — the old duplicate-word cleanup that deleted it was removed (#62f)
```
