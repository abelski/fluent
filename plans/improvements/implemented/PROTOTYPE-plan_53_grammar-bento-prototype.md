---
status: prototype
number: 53
---

# Plan 53 — Grammar page bento layout (static prototype)

## Goal
See how `/dashboard/grammar` feels with the layout of https://saunuole.lt/study:
hero banner → filter chips with counts → bento grid (one big featured card + stacked small cards).

Layout only. Fluent tokens stay: emerald accent, flat white cards (`border-line`, 14px radius, no
shadow), Inter, `.page` 1180px, one TAK mascot per screen. No pastel gradients or 3D art.

## Scope
- One static HTML file with fake data: `temp_files/prototypes/plan_53_grammar-bento.html`,
  published as a private artifact for review.
- No app code touched. No branch needed (nothing under `frontend/` or `backend/` changes).

## Layout
1. **Hero card** — title, subtitle, overall progress (passed / total, bar), primary CTA
   «Продолжить» (next unpassed lesson) + secondary «Напомни что я забыл». TAK on the right.
2. **Chips** — «Все N», one chip per enrolled program with its lesson count, plus «Программы +»
   link chip. Active chip = ink fill, white text (the saunuole pattern, in Fluent ink).
3. **Bento grid** — featured card (the program with the next lesson: big title, progress,
   next lesson name, «Продолжить»), right column stacked smaller program cards.
   Below it, the selected program's lesson groups as compact cards (group title, n/total, status).
4. Mobile 375px: everything one column, chips wrap.
5. RU/EN toggle in the mock so both languages can be judged.

## Enrollment states
Today a user with no enrolled program sees one line of text and a «Все программы» button.
In the bento layout the same page doubles as onboarding:
- **No programs** — hero keeps its full shape for continuity: "0 уроков пройдено", empty bar,
  primary button «Начать с падежей» (enrolls cases) in the «Продолжить» slot; remind hidden;
  subtitle says "add a program".
  Chips list all programs. Featured card = program preview (LT name big, description,
  lessons/topics count, «Добавить программу»). Stack = other programs with «Добавить».
  Topics grid = "What's inside" preview, no scores. Remind card hidden.
- **Some programs** — enrolled ones behave as above (progress, continue); the rest show
  description + «Добавить» in the stack. A dot on the chip marks enrolled programs.
  Hero stats count enrolled lessons only.
- **All programs** — as originally designed.
Enroll uses the existing `enrollGrammarProgram` endpoint; no backend change.
The mock has a dashed prototype-only switcher to flip between the three states.

## Mapped to today's data
Programs = `GrammarProgramSummary` (enrolled). Lessons grouped by title as in `SubcategoryGroup`.
Pass = `best_score_pct > 0.75`. Remind stays gated on a passed practice lesson.
Nothing new needed from the backend for this layout.

## Definition of Done (prototype — reduced, confirmed by user: "static HTML mock")
- [x] Mock renders at desktop 1280px — screenshot, RU + EN
- [x] Mock renders at 375px, no horizontal scroll — screenshot, RU + EN
- [x] Screenshots in `temp_files/screenshots/plan_53_grammar-bento-prototype/`, looked at
- [x] Published as private artifact, link given to user
- Dropped for the prototype: autotests, CHANGELOG, component-library update, parity spec.
  These come back if the user promotes it via `/sdlc-feature-analyst` (same number 53).
