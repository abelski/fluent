---
kind: feature
status: done
iteration: 1
max_iterations: 16
suggested_model: opus
suggested_effort: medium
confirmed_model: opus
confirmed_effort: medium
uat_rounds: 0
max_uat_rounds: 2
---

# #63 — Instruction line on grammar and knowledge-check tasks

## Context

Follow-up to #62a (user feedback on fluent.lt, 2026-10-10). In the knowledge check
(`/dashboard/check`) and the «Проработать пробелы» run, a task shows only the sentence with a gap
and 4 options, e.g. «Sūnus į mokyklą važiuoja ___ troleibusu.» → vienuoliktos / vienuolikta /
vienuoliktu / vienuoliktais. There is no rules card there (grammar lessons have one), so the user
cannot tell what is asked. The user wants a visible line saying what to do («Выбери правильную
форму — …», «Поставь глагол в …»).

What exists:
- `backend/knowledge_check_service.py` knows each task's topic (`g:<lesson id>`, `v:<lesson id>`,
  `p:<category id>`) and strips it in `routers/knowledge_check.py` `_public()` before sending.
- `backend/data/grammar/lessons.json` `cases`: case id → [Lithuanian case name, Vienaskaita /
  Daugiskaita / Skaičiai]; `LESSON_CONFIG` rows carry the case ids of each lesson.
- Verb topics already have RU/EN titles (`get_verb_lessons` `title` / `title_en`, e.g. «Прошедшее
  однократное» / "Past simple (single action)").
- `GrammarTaskRunner.tsx` renders all task types; it gets no instruction today.

Decisions (user, 2026-10-10): first "only the check and the gaps run"; **revised the same day after
the prototype — grammar lessons announce the task too.** So the text is built where grammar tasks
are generated (`backend/grammar_service.py`), and every runner of grammar tasks gets it for free:
lessons, the check, the gaps run, remind, `/dashboard/continue`.

## Goals
- Every grammar task (all levels, all callers) and every check reading task shows one short, visible
  instruction above the task card, in the UI language.

## Non-Goals
- Practice tests outside the check (they have their own question header) — unchanged.
- Changing task generation, options or grading.

## Requirements

1. **Server builds the text** as `instruction_ru` / `instruction_en` on each task:
   - `get_lesson_tasks` (noun/numeral lessons): from the lesson's case ids in `LESSON_CONFIG` /
     `lessons.json` `cases` → «<Verb> правильную форму: <падеж>, <ед. ч. / мн. ч.>» / "<Verb> the
     right form: <case>, <singular / plural>" (именительный/родительный/дательный/винительный/
     творительный/местный/звательный; nominative/genitive/dative/accusative/instrumental/locative/
     vocative). Several cases → joined with « / ». Numeral lessons (`Skaičiai`) → «… форму
     числительного: <падеж>» / "… form of the numeral: <case>".
   - `get_verb_lesson_tasks`: `verb_conjugation` → «<Verb> форму глагола: <tense title>» / "<Verb>
     the verb form: <tense title_en>"; `verb_case` → «<Verb> правильный падеж после глагола» /
     "<Verb> the right case after the verb".
   - `<Verb>`: «Выбери» / "Pick" when the task has `options` (Basic MC), else «Впиши» / "Type".
   - Knowledge-check reading tasks (`knowledge_check_service._build_choice`) → «Прочитай текст и
     выбери: верно или неверно» / "Read the text and choose: true or false".
   - Unknown → no field.
2. **Runner.** Optional `instruction_ru` / `instruction_en` on every `Task`; when present, the runner
   shows it right above the task card: `text-sm sm:text-base font-semibold text-ink`, centred, in the
   UI language (as in the prototype). Absent → nothing rendered.
3. Old open checks (started before the deploy, no instruction in `tasks_json`) still run — just
   without the line.

### Standing constraints
- All validation must be server-side (never frontend-only).
- If this plan touches markup, styling, or a component: read `documentation/design system/Component Library (as-built).html` and `documentation/IMPLEMENTATION.md` first, use named design tokens (never a raw Tailwind step), and run `frontend/tests/design-system-parity.spec.ts` after any shared-shell/token change. Cards are flat `border border-line rounded-[14px]`, no shadow; Inter only; green accent `emerald-600`.
- Add autotest coverage for the new feature and run the relevant suite(s) as part of Validation.

## Prototype (phase 0 — visuals before implementation)

`temp_files/prototypes/plan_63_check-task-instructions.html`, copied from the #62a prototype's check
runner (`temp_files/prototypes/plan_62a_knowledge-check-gap-widget.html`); only the instruction line
is new. States: noun task, numeral task (the user's «Sūnus į mokyklą važiuoja ___ troleibusu»),
verb task, reading task, a grammar lesson task with its rules card (Advanced, «Впиши…»); RU/EN; 1280 and 375. Screenshots into
`temp_files/screenshots/plan_63_check-task-instructions-prototype/`, private artifact link, the
user's verdict recorded below.

### Approved decisions
**2026-10-10 — approved** (prototype v2, https://claude.ai/artifact/9ZE3C7eFGQceb7JZWEDZTP):
- **Changed:** scope widened from "check + gaps only" to every grammar task (lessons included) —
  already in Context/Goals/Req 1.
- **Kept as prototyped:** one bold centred line (`text-sm sm:text-base font-semibold text-ink`)
  directly above the task card, below TAK; in lessons the rules card stays above everything;
  «Выбери…» for option tasks, «Впиши…» for typed ones.

## Implementation

- [x] 0. **Prototype** per `## Prototype`. **STOP — user step:** no product code before approval.
- [x] 1. `backend/grammar_service.py` — one helper `_instruction(kind, detail, has_options)`
  (RU/EN case-name maps keyed by the Lithuanian names in `lessons.json` `cases`); attach
  `instruction_ru`/`instruction_en` in `get_lesson_tasks` and `get_verb_lesson_tasks` (Req 1).
  `backend/knowledge_check_service.py` — the reading line in `_build_choice`.
- [x] 2. Tests: `backend/tests/test_grammar_instructions.py` (new) — a noun basic lesson's tasks say
  «Выбери» + the case; an advanced lesson says «Впиши»; a numeral lesson says «числительного»; a verb
  conjugation lesson carries the tense title; a verb_case lesson the case line.
  `test_knowledge_check.py` — every check task has both fields.
- [x] 3. `frontend/app/dashboard/components/GrammarTaskRunner.tsx` — optional fields on `Task`, the
  line above the card (Req 2). `frontend/lib/api.ts` types.
- [x] 4. `frontend/tests/knowledge-check.spec.ts` + one grammar lesson spec — mocked tasks carry instructions; assert the line
  shows in RU and EN and is absent when the field is missing; screenshots.
- [x] 5. Docs: `specs/knowledge-check.md` (instruction scenario), `documentation/knowledge-check.md`
  (why server-built, why not in lessons), component library runner entry, CHANGELOG #63.

## Review

- [x] Code review passed (round 1)
- note: the instruction line uses `-mb-8` to offset the parent's `gap-12` — fine while the gap stays.
- note: «Выбери»/«Впиши» is inferred from `options` on the task dict.

## Validation

- [x] Backend: `cd backend && .venv/bin/python -m pytest -q tests/test_knowledge_check.py`
- [x] Full backend suite: `cd backend && .venv/bin/python -m pytest -q`
- [x] Types: `cd frontend && npx tsc --noEmit`
- [x] Playwright (after `npm run build` — the specs hit the static build on :8000):
  `cd frontend && npx playwright test tests/knowledge-check.spec.ts tests/grammar-remind.spec.ts tests/grammar*.spec.ts tests/design-system-parity.spec.ts --reporter=list`
- [x] Screenshots in `temp_files/screenshots/plan_63_check-task-instructions/` looked at: noun,
  numeral, verb, reading task, grammar lesson task — RU + EN, 1280 + 375; they match the approved prototype.

## Definition of Done

```bash
cd backend && .venv/bin/python -m pytest -q
cd frontend && npx tsc --noEmit
cd frontend && npm run build && npx playwright test tests/knowledge-check.spec.ts tests/grammar*.spec.ts tests/design-system-parity.spec.ts --reporter=list
ls temp_files/screenshots/plan_63_check-task-instructions/ | grep -c png   # expect >= 20 (5 tasks x RU/EN x 1280/375)
```

User-facing checks (must be evidenced by the screenshots above): **both languages RU + EN**,
**mobile at 375px**, **screenshots proving each**.

## Release

Nothing to publish; goes live with the deploy. Rollback = revert the merge.
