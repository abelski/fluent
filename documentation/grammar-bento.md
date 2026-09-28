# Grammar lesson list — hero / chips / bento (#53)

`/dashboard/grammar`'s lesson list (`activeLesson === null` branch of
`frontend/app/dashboard/grammar/page.tsx`) renders hero → program chips → bento (featured card +
stacked program cards) → topic cards. Components: `frontend/app/dashboard/components/GrammarOverview.tsx`.
Plan: `plans/improvements/implemented/IMPLEMENTED-plan_53_grammar-bento.md`, idea: `plans/ideas/implemented/idea_53_grammar-bento.md`.

## Decisions

- **No `title_lt` API field.** The idea asked for one, but noun-case lessons already come back
  from `GET /api/grammar/lessons` with a Lithuanian `title` (`backend/data/grammar/lessons.json`,
  e.g. «Kilmininkas Vns.»), and the RU/EN case name is `rules[0].name_ru / name_en`. So heading =
  `title`, sub-heading = the case name. Verb lessons (id ≥ 200) have a RU `title` + `title_en`
  and no LT name: heading = `title_en` in EN (RU fallback), no sub-heading. No backend change.
  Gotcha: real case names repeat the LT title in parentheses («Родительный (Kilmininkas)»), so
  `caseName()` drops a trailing `(X)` when the lesson title starts with X. Numeral names keep
  theirs («Числительные: Именительный (kiek? yra)») — there the parenthetical adds meaning.
- **Guest enroll → `/login`, no return.** OAuth (`backend/auth.py`) always redirects to
  `/dashboard?token=…`; coming back to grammar would need an auth change, which the user declined.
  Guests see the same page as a user with no programs (programs are public; `GET /api/grammar-programs`
  works without a token).
- **Next-lesson rule** (featured card and hero «Продолжить»): first lesson, in list order, of the
  first enrolled program, in `programs` order, that is `!is_locked && !(best_score_pct > 0.75)`.
  Computed client-side from data the page already has — `is_locked` itself stays server-side, and
  the tasks endpoint still returns 403 for a locked lesson. Nothing left → preview of the first
  not-enrolled program; everything enrolled and nothing left → completion summary, with a
  `/pricing` link if locked lessons remain. Hero «Продолжить» always uses the «Все» pick.
- **Topics follow the featured card's program**, also under «Все», so the page never shows two
  different programs' detail at once.
- **Featured card levels are display-only**; its one action is «Начать урок ›». The level buttons
  that start lessons live on the topic cards (one click from the card).
- **Grammar-only hero** (`GrammarHero`, not `ProgressStatCard`): it has to enroll in place and
  carry the title and a declension sample; `ProgressStatCard` hides its action row at count 0.
  Recorded in the component library's "Deliberate deviations". The other 4 top-nav pages unchanged.
- **Hero stats** count unique lessons across enrolled programs (two noun programs can share lessons).
- **Unenroll confirm dialog** is copied from `lists/page.tsx`, not extracted — two uses don't
  justify a shared component.
- **Enroll/unenroll errors** show one `text-destructive` line under the chips (was only
  `console.error`); cleared on the next action.

## Gotchas

- `filterLessonsForProgram` gives *every* verb program all lessons with id ≥ 200 (both `verbs` and
  `verb_cases`) — pre-existing behaviour, kept.
- Tests: `tests/grammar-bento.spec.ts` + `tests/plan53-screenshots.spec.ts` share the mocked API in
  `tests/helpers/grammarBento.ts`. Older specs reach a lesson with `getByTestId('level-button')` or
  `[data-testid="topic-card"] button` — not `.grid button`, which now also matches the bento grid.
