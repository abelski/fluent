# Knowledge check + "Work on mistakes" (#62a)

## Purpose
A free 16-task multiple-choice check on home that finds weak topics; Premium turns them into
a lesson and enrollment recommendations. Code: `backend/knowledge_check_service.py`,
`backend/routers/knowledge_check.py`, `frontend/app/dashboard/check/`, `frontend/components/GapWidget.tsx`.
Background: `documentation/knowledge-check.md`.

## Scenarios

```gherkin
Scenario: auth
  When any /api/me/knowledge-check* endpoint is called without a valid token
  Then it returns 401

Scenario: topics
  Then a topic is "g:<basic LESSON_CONFIG id>" for published noun/numeral lessons,
    "v:<id>" for verb tenses 200/202/204/206/208/210, or "p:<category_id>" for a
    Practice category with at least one free published test, except Конституция (id 1)
  And a new category joins the pool as soon as it has a free published test, with no code change

Scenario: composition
  When POST /api/me/knowledge-check builds a check
  Then it has 16 tasks: 5 noun topics × 2, 2 verb topics × 2, 1 practice topic × 2
  And every grammar task carries 4 options; a topic yielding < 2 MC tasks is swapped for another
  And the practice tasks come from one random free published test, share its passage,
    and stay one contiguous block in builder order at a random position
  And with no practice pool a 6th noun topic takes its place

Scenario: start gating
  Given the user has a completed check and is not Premium (Premium = admin or active premium)
  Then POST returns 403 {"code": "premium_required"}
  And an open (unsubmitted) check is returned as is instead of writing a new row
  And the response carries tasks with "answer" but without "topic"

Scenario: submit
  When POST /api/me/knowledge-check/{id}/answers {"responses": [...]} is called
  Then the server grades response == answer and stores per-topic {correct, total, weak}
  And a topic is weak when its score is not > 75%
  And another user's check → 404, an already completed check → 409, a wrong list length → 422
  And no daily quota is spent and no GrammarLessonResult is written

Scenario: state
  When GET /api/me/knowledge-check is called
  Then it returns the latest completed result (or null) and is_premium
  And "recommendations" only for Premium: public grammar programs containing a weak topic's
    basic lesson and the weak Practice category, deduplicated, with "enrolled" and the reasons

Scenario: close the gaps
  When GET /api/me/knowledge-check/gaps/tasks is called
  Then free → 403 premium_required, no completed check → 404 no_check, no weak topic → 404 no_gaps
  And otherwise ≤ 10 tasks from the 5 weakest topics (weakest first), practice as an ordered block
  And no enrollment is required; the client saves the run via POST /grammar/lessons/0/results

Scenario: task instruction line (#63)
  Then every grammar task (lessons, check, gaps run, remind, continue) carries instruction_ru /
    instruction_en built in grammar_service: «Выбери…»/"Pick…" with options, else «Впиши…»/"Type…",
    plus the case and number, the numeral case, the verb tense title, or "the right case after the verb"
  And every check reading task carries «Прочитай текст и выбери: верно или неверно» / "Read the text and choose: true or false"
  And the runner shows it bold and centred right above the task card, in the UI language
  And a task without the fields (an old open check) shows no line
```
