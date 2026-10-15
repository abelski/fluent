# Грамматика & Практика overview pages (#66)

Plan: `plans/improvements/active/plan_66_grammar-practice-overview.md` (design record:
`plan_66_grammar-practice-overview-prototype.md`, prototype
`temp_files/prototypes/plan_66_grammar-practice-overview.html`). Visual spec: component library,
«Overview pages (#66)».

## Shape

- **Overview** (`/dashboard/grammar`, `/dashboard/practice`): hero with the page's only
  «Продолжить» → «В процессе» (cards) → «Завершённые» (rows) → «Другие программы» (catalogue).
- **Program page** (`?program=<id>` on the same route): switcher, compact header with the one
  button, «Осталось N» (what is left), «Пройдено N» (folded while in progress).
- Code: shared pieces in `app/dashboard/components/ProgramOverview.tsx`; grammar model + rows in
  `GrammarOverview.tsx`; practice model + rows in `PracticeOverview.tsx`; data, state and the
  `?program=` param in each `page.tsx`.

## Decisions and why

- **Program page on `?program=<id>`, not a new route.** The frontend is a static export; a
  `/dashboard/grammar/[id]` route needs a `_` placeholder page plus `resolveListId`-style URL
  parsing and a backend static-resolver entry. A query parameter on the existing page needs none of
  that, keeps the lesson runner (which lives on the grammar page) one component away, and Back works
  through `router.push`. `useSearchParams` needs a `<Suspense>` boundary under static export (same
  as `inbox/page.tsx`). A `?program=` for a program the user is not enrolled in falls back to the
  overview.
- **`last_result_at` per program**, not a separate endpoint: one more field on
  `GET /grammar-programs` (authenticated only) and `GET /me/practice-categories`. It drives
  «последний раз N дней назад», «Пора повторить» (≥ 7 days) and which program the hero continues
  (the one practised last). Grammar: one grouped query (`max(created_at)` per lesson) mapped to
  programs through `_program_lesson_ids()`; practice: computed from the results query the endpoint
  already ran. Progress — never cached. Dates are naive UTC in the DB and go out with a `Z`.
- **`last_result_at` excludes the remind sentinel (lesson 0).** A «Повторить» run is saved against
  `REMIND_LESSON_ID = 0` (#26), which can't be attributed to a program — it may draw from several.
  So a review run does not reset «Пора повторить»; a real lesson in the program does.
- **Grammar review is scoped and weakest-first.** `GET /grammar/remind/tasks?program_id=` draws
  only from that program's passed «Смешанный» lessons, lowest best score first (ties random), so
  the copy «сначала слабое» is true. Unknown program → 404, not enrolled → 403
  `not_enrolled`, nothing eligible → 404 `no_passed_practice`; all before the quota charge.
  Without the parameter the #26 behaviour is unchanged.
- **Practice review reopens the weakest passed test** — no new endpoint, no daily session (user,
  2026-10-15). The button says what it opens: «Повторить · 6 вопросов».
- **Free vs Premium unchanged**: locks still come from the server (`is_locked`). Premium simply has
  no locked topics, so the same list rule (next + started + two more, rest folded) produces the
  Premium variant; free users get the locked tail and the Premium link.
- **Which exam a practice category prepares for** is derived: the category with a final exam
  (`is_final`) is the citizenship test, the rest are A2. There is no category field for it; add one
  if a second exam gets a final test.
- **Constitution and Reading titles**: `title_ru` / `title_en` are UI-language titles and the
  Lithuanian original lives in the new nullable `practice_test.title_lt` (migration
  `a9b0c1d2e3f4`), shown as a sub-line. The data fix is
  `backend/scripts/fix_practice_titles_66.py` (idempotent, `--dry-run` default, `--apply` is the
  user's step on prod — the migration must be applied first; see `plans/reminders.md`).
- **The `/programs` catalogue pages were deleted**; «Другие программы» replaces them and
  `/dashboard/continue`'s enrol link now points at `/dashboard/grammar`.

## Gotchas

- The local backend shares the production DB. Until migration `a9b0c1d2e3f4` is applied there,
  every endpoint that selects `practice_test` fails locally with `UndefinedColumn title_lt` — the
  Playwright specs mock the API, so they are unaffected.
- `<details open>` in React: pass `open={x || undefined}` so React sets it once and leaves the
  user's toggling alone.
- Carets inside nested `<details>` use named Tailwind groups (`group/fold`, `group/passed`, …);
  a plain `group-open:` would follow any open ancestor.

## Tests

- `frontend/tests/overview-pages.spec.ts` — every page state × RU/EN × 1280/375, each asserted and
  shot to `temp_files/screenshots/plan_66_grammar-practice-overview/`; at 375×667 the page's main
  button must be on the first screen.
- `grammar-bento.spec.ts` / `practice-bento.spec.ts` — the details (wording, lock reasons, folds,
  review scoping, retake). Mocks: `tests/helpers/grammarBento.ts` / `practiceBento.ts` (stateful
  enrol/unenrol, `lastResult` for `last_result_at`).
- Older specs that start a grammar lesson open `/dashboard/grammar?program=<id>` first — the
  level cells only exist on the program page.
- `design-system-parity.spec.ts` — the compact phone hero on all five top-nav pages.
