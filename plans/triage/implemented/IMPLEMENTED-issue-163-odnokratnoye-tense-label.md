---
kind: bugfix
status: done
iteration: 1
max_iterations: 12
suggested_model: haiku
suggested_effort: low
confirmed_model: haiku
confirmed_effort: low
---

# Issue #163 — /dashboard/grammar/

**Reported:** 2026-08-26 10:10:50
**Status:** open
**Description:** Прошедшее картинное - odnokratnoye

## Root cause
The Lithuanian tense "būtasis kartinis laikas" was mistranslated: "kartinis" (from *kartas* = "occurrence/time", i.e. "single-occurrence past") was rendered as "картинное" ("pictorial", from *kartina* = "picture") instead of the correct "однократное" ("single-occurrence"). The error was baked independently into three source locations, while the tense's own description text (`verb_lessons.json` line 37) and an article's own body text already correctly use "однократное" — confirming the fix target and that this is a pure label bug with no logic implications. The sibling tense `indicative_past_habitual` is correctly labeled "Прошедшее многократное" everywhere, confirming the "Прошедшее <adjective>" naming pattern to follow.

Reason for suggested_model/suggested_effort: well-scoped, unambiguous, mechanical string fix across three known source files plus one already-published DB row correctable via an existing admin endpoint — no new logic, no schema change, no auth/data-integrity risk.

## Fix plan
- [x] 1. `backend/grammar_service.py:48` — change `"indicative_past_simple":   "Прошедшее картинное",` → `"indicative_past_simple":   "Прошедшее однократное",`
- [x] 2. `backend/data/grammar/verb_lessons.json` lines 6-8 — replace all three occurrences of `"Прошедшее картинное"` (lesson rows 202, 203, 221) with `"Прошедшее однократное"`. Leave the `indicative_past_simple` key and the `tense_hints` description at line 37 untouched — it's already correct.
- [x] 3. `backend/scripts/seed_verb_articles.py:169` — change `"title_ru": "Прошедшее время: картинное и многократное",` → `"title_ru": "Прошедшее время: однократное и многократное",` (keeps the ARTICLES list consistent with its own article body text at line 173, and correct for any future `--reset` reseed of a fresh DB).
- [x] 4. Correct the already-published `article` row (`slug = 'verb-past-tenses'`) in production, since the seed script is insert-only and skips existing rows (`seed_verb_articles.py` ~line 532-534) — editing step 3's source text alone will not touch this row. Set `title_ru` to `"Прошедшее время: однократное и многократное"` via the existing admin endpoint `PUT /api/admin/articles/verb-past-tenses` (or the admin panel UI at `/dashboard/admin`) — not a new ad-hoc script.

No frontend changes needed — `GrammarTaskRunner.tsx` renders `task.tense_label` live from the API response; no server-side caching beyond process memory, so a normal backend restart/redeploy picks up steps 1-2.

## Tests
- [x] Write a Playwright test in `frontend/tests/` that reproduces and verifies the fix for this issue.
  - Suggested: extend `frontend/tests/verbs_grammar.spec.ts` (follow the existing pattern around line 55-68) with a request to `GET http://localhost:8000/api/grammar/verb-lessons/202/tasks` (basic `indicative_past_simple` lesson) asserting `res.status() === 200`, `tasks[0].tense_label === 'Прошедшее однократное'`, and explicitly asserting the label does **not** contain `'картинное'` as a regression guard. Optionally repeat for lessons `203` (advanced) and `221` (practice).
- [x] Run it: `cd frontend && npx playwright test frontend/tests/verbs_grammar.spec.ts --reporter=list`

## Definition of Done

```bash
cd frontend && npx playwright test --reporter=list
```

## Confirm resolution
Ask the user: "Issue #163 — Прошедшее картинное - odnokratnoye. Mark as resolved?"
Only if the user confirms:
1. Run `UPDATE mistake_report SET status = 'resolved' WHERE id = 163;` and report success.
2. Move the plan file to `plans/triage/implemented/` and add the `IMPLEMENTED-` prefix (`issue-163-odnokratnoye-tense-label.md` → `plans/triage/implemented/IMPLEMENTED-issue-163-odnokratnoye-tense-label.md`).
