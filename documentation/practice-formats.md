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
  (`validate_tfns`); move validators to a module when #62c adds a second one.
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
