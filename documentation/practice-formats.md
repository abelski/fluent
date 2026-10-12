# Practice exam formats (#62)

Formats that mirror the reading part of the Lithuanian A2 exam, each as its own Practice category.
#62c–#62e append their sections here.

## #62b — "Верно / Неверно / Не сказано" (True / False / Not stated)

- **Format.** 10 tests, each an A2 text (400–1200 chars) plus 6 statements answered Tiesa / Netiesa /
  Nepasakyta (`option_a/b/c`, `option_d` ""). Every test has at least one of each answer. Content:
  `backend/data/practice/tfns.json` (written for Fluent — no openly licensed A2 texts exist).
- **One statement per screen**, like every practice test — no table layout. The text stays reachable
  during the questions in a collapsible `<details>` block (closed by default, capped at 40vh), because
  "not stated" needs re-reading the text, as in the real exam. Applies to every test with a text.
- **Separate category from "Чтение".** "Чтение" (id 2) is the 2-option Teisingas/Neteisingas format;
  mixing 3-option tests into it would change its meaning. The user chose a separate category.
- **Empty categories are hidden** from non-admins (#62a rule in `list_categories`), so a category can
  be seeded with only `testing` tests and nobody but admins sees it.
- **Insert-only seed, no `--reset`.** `backend/scripts/seed_practice_category.py <data.json>`
  validates (`--dry-run` stops there and never loads the DB engine), then inserts category + tests +
  questions in one transaction, or does nothing if a category with the same `name_ru` exists.
  Older seeds (`seed_skaitymas_new.py`) had `--reset`, which deletes tests — on Postgres that fails as
  soon as any `practice_exam_result` references them (FK; SQLite tests don't enforce it). Later
  fixes go through the admin editor. The JSON's `"format"` key picks the validator
  (`validate_tfns`, `validate_dialogue` since #62c) and the `seed()` branch; both still live in the
  one script — two short validators don't earn a module yet.
- **Staged rollout, safe at every step.** 1) seed into prod: tests are `testing`, so the category is
  hidden from users and out of the knowledge-check pool; 2) deploy this code (text block, llms.txt);
  3) release = publish the tests in the admin panel. Rollback = set them back to `testing`.
- **Knowledge check** picks the category up by itself once a free test is published (pool rule
  from #62a); its 3 non-empty options become a 3-option `reading` task.
- **Practice stays noindex** (`practice/layout.tsx` robots, `Disallow: /dashboard/practice/`, not in
  the sitemap): test pages are thin, login-gated quiz screens. Discovery for AI crawlers comes from the
  dynamic `## Exam-format practice` section in `/llms.txt`; search traffic comes from the A2-prep
  article (#62e).

## Gotcha: seed vs. the practice cache

`_practice_meta` is cached in-process (`backend/cache.py`, 10-min TTL). The seed runs as a separate process, so a running server keeps the old category list for up to 10 minutes after a seed — admins don't see the new category. Restart the local server (or wait 10 min; prod catches up by TTL).

## #62c — "Диалоги" (Dialogues)

- **Format.** 10 tests, one scene each (pharmacy, shop, …), 5 turns. A turn = one question:
  `question_lt` is the other speaker's line as `**Name:** text`, `option_a`–`d` four candidate replies.
  Content: `backend/data/practice/dialogues.json` (`"format": "dialogue"`, each turn carries a
  `source` the validator requires and the seed drops).
- **`practice_test.kind`** (`VARCHAR(20)`, server default `choice`; values in `TEST_KINDS` in
  `routers/practice.py`). Only `choice` tests are sampled and shuffled by `/exam`; every other kind is
  served whole, in `(sort_order, id)` order, because a dialogue is a story — a random subset in random
  order makes no sense. `_load_exam` always orders now; harmless for `choice` (sampled afterwards).
- **The transcript shows the correct reply**, not the student's pick, so the conversation stays
  coherent after a mistake; the mistake already shows in the red/green feedback and the result review
  (approved in the prototype, 2026-10-11).
- **«Jūs» is not translated** — it is part of the Lithuanian dialogue content, like the speaker names.
- **Knowledge check:** `PRACTICE_TASK_BUILDERS["dialogue"]` builds the same transcript as the
  passage, keyed by the test's `kind`; options keep their stored order.

## #62d — "Текст с пропусками" (Gap text)

- **Format.** 8 texts (`backend/data/practice/gap_text.json`, `"format": "gap_text"`), 10 gaps each.
  `lesson_text_lt` holds markers `{1}`…`{N}`, each once and in order; one question per gap with
  `question_lt` = `question_ru` = its marker (`"{3}"`) — ties the row to its gap explicitly, not just by
  order — `option_a` = the correct word, `option_b` = one distractor, `option_c`/`option_d` = `""`,
  `correct_option` `a`. `validate_gap_text` in the seed enforces all of it, plus: no distractor equals
  any gap's answer in the same text, text 600–1400 chars.
- **Bank = every gap's answer + one distractor per gap.** With only the answers, the last gap is
  always forced and the rest is elimination; one distractor per gap keeps every choice a real choice
  without turning the bank into a wall of words at 375px.
- **Tap-to-place, not drag.** Drag and drop is unreliable on phones (scroll vs. drag conflict) and
  inaccessible from the keyboard; chips and gaps are plain buttons. A per-gap dropdown was also
  rejected (the idea's non-goal) — it hides the shared-bank exam format.
- **The client posts the score** to the existing `POST /practice/tests/{id}/results`, as every other
  practice test does; the server only checks `0 ≤ score ≤ total`. Practice results gate nothing
  valuable, so server-side regrading was not worth a new endpoint.
- **Sticky bank needs `overflow-x: clip` on html/body.** `globals.css` had `overflow-x: hidden`, which
  makes `body` a scroll container and silently disables every `position: sticky`. Changed to `clip`
  (same clipping, no scroll container).
- **Knowledge check:** `PRACTICE_TASK_BUILDERS["gap_text"]` — both chosen gaps are blank in each
  passage (`___` for its own, `(…)` for the other), so one task never answers the other.
