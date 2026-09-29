---
status: prototype
number: 55
---

# Plan 55 — Practice + Articles in the #53 bento style (static prototype)

## Goal
Show how `/dashboard/practice` and `/dashboard/articles` look in the layout that shipped for grammar
in #53 (hero → chips → bento → topic cards), so the top-nav pages can converge on one pattern.
Same rules as #53: layout only, Fluent tokens (flat white cards, `border-line`, 14px radius,
Inter, emerald accent), one TAK per screen, 32px/700 headings (no 900 weight).

## Scope
- One static HTML mock with real-shaped sample data (taken read-only from the DB/API on
  2026-09-28): `temp_files/prototypes/plan_55_practice-articles-bento.html`, published as a
  private artifact. The top nav switches between Практика and Статьи inside the mock.
- No app code, no branch.

## Practice (today: ProgressStatCard + 2-col category cards, empty state = text + link)
1. **Hero** — «Практика», stat "N из M тестов сдано" + bar, «Продолжить ›» (next unpassed
   test). Right: a sample exam question (Constitution: «Kokia yra Lietuvos sostinė?» with 4
   options, correct one marked) + TAK «Pasirinkime!». No programs → `0`, empty bar,
   «Начать с Конституции».
2. **Chips** — Все · Конституция 33 · Чтение 19, dot on enrolled, «Все программы ›».
3. **Bento** — featured = next test: kicker «Продолжить отсюда · Конституция», heading = LT
   title («3 pamoka: Kalba, simboliai, sostinė»), sub = EN/RU title («Урок 3: ст. 13–17»),
   meta «10 вопросов · проходной балл 60%», best score if tried, «Начать тест ›».
   Stack = other category (progress or «Добавить») + a **Final exam** card
   («Baigiamasis egzaminas», 30 questions, 75%).
4. **Topic cards** — Constitution grouped into 5 blocks (5 lessons + «Kartojimas» review
   each) + «Итоговые» (sample test, dates & numbers, final); each test is a numbered button
   (1–5, К) showing ✓ / % / untried. Reading = one card per chapter (LT chapter + RU title,
   question count, best score, «Начать»).
5. States switcher: no programs / one / all.

## Articles (today: title + segmented category pill + 3-col cards)
1. **Hero** — «Статьи», subtitle, "30 статей · 23 учебных материала", «Читать новую ›»
   (latest article). Right: top tags as a small card (глаголы 9, числа 6, грамматика 14 …)
   + TAK «Paskaitykime!». No reading progress (none is tracked).
2. **Chips** — Все 30 · Учебные материалы 23 · Адаптация 2 · Блог 5.
3. **Bento** — featured = newest article (category kicker, title, date, tags, «Читать ›»);
   stack = next 3 recent articles.
4. **Topic cards** — articles grouped by theme (Глаголы, Числа, Падежи и склонение,
   Экзамены и адаптация, С чего начать) listing article links; category chip filters them.

## Open for the user
- Grouping rules (Constitution blocks by «Kartojimas»; article themes by tag) are hand-made
  in the mock; a real build needs a server-side rule or an admin field.
- Articles page is statically rendered for SEO today; the real build must keep that.

## Definition of Done (prototype — reduced, same as #53's prototype)
- [x] Both pages render at 1280px — screenshots RU + EN
- [x] Both pages at 375px, no horizontal scroll — screenshots RU + EN
- [x] Practice: no-programs state screenshot
- [x] Screenshots in `temp_files/screenshots/plan_55_practice-articles-bento-prototype/`, looked at
- [x] Published as private artifact, link given to user
- Dropped for the prototype: autotests, CHANGELOG, component-library update, parity spec.
  They come back if promoted via `/sdlc-brainstorm` → `/sdlc-feature-analyst` (same number 55).
