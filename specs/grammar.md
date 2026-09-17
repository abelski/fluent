# Grammar — current behavior

## Purpose
The Grammar function teaches Lithuanian noun-case and verb-conjugation grammar through short,
auto-graded lesson exercises, grouped into enrollable "programs" (e.g. "Lithuanian Cases",
"Numbers", verb conjugation, verb-governed cases). Students browse programs, enroll, work through
lessons in sequence, and their pass/fail history unlocks the next lesson. It is called by the
Next.js dashboard grammar pages over the REST API; the same endpoints also serve the admin's
read-only view into draft/testing content (there is no separate admin content-editing router in
scope here — admin-only behavior below is limited to what `routers/grammar.py` itself branches on).
Backed by: `backend/routers/grammar.py`, `frontend/app/dashboard/grammar/`.

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
    within a program they are enrolled in
  When GET /grammar/remind/tasks is called
  Then up to 10 tasks are sampled from those eligible passed practice lessons
    (both noun and verb/verb-case lessons are eligible)
  And a daily session quota unit is consumed for the request
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
  Then only programs flagged is_public are returned
  And each program includes "enrolled": true/false, which is always false for an
    unauthenticated caller
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
  And enrolling in a missing or non-public program returns 404
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
