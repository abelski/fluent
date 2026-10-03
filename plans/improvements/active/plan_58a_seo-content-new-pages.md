---
kind: feature
status: approved
iteration: 0
max_iterations: 22
suggested_model: opus
suggested_effort: medium
confirmed_model: null
confirmed_effort: null
---

# #58a — SEO content gaps, batch 1: greetings + days/months pages

Batch 2 — titles for cases/numbers, Sėkmės description, Regitra questions, and a back-link from
`numbers-05-age-dates-years` to the new days/months article — is a separate `plan_58b`, written
after batch 1 has been live 2–3 weeks.

## Context

Idea: `plans/ideas/idea_58_seo-content-gaps.md` (confirmed). GSC and Yandex show fluent.lt for greetings
queries («добрый вечер на литовском», «привет по литовски», «спасибо по литовски», EN «basic
lithuanian phrases», «cheers in lithuanian») and «дни недели на литовском», mostly on page 2, with no
page of ours that answers them. Batch 1 adds the two missing articles plus a study target for each.

**Timing gate:** nothing from this plan goes to prod before the ~24 Oct #48c RU-traffic check
(`documentation/seo-log.md`). Implementation can happen before; the Rollout steps wait.

**The local DB is the production Neon DB.** No Validation/Implementation step may write to it —
including "dry-runs" that flush (`import_phrase_programs.run()` calls `session.flush()`, which
INSERTs before rolling back). Every DB write is a Rollout step run by the user.

Existing mechanisms reused:
- **Articles:** admin import of a `.md` file parsed by `_parse_markdown_article`
  (`backend/routers/articles.py:357`): frontmatter `slug/title_ru/title_en/tags/category/published`,
  RU body, `---EN---`, EN body. Import doesn't set `theme` (`ARTICLE_THEMES`); the user sets it in the
  editor. Sources go in `temp_files/articles/` (existing convention, git-ignored). `/en/` twin only
  if `title_en` + `body_en` are non-empty (#48c).
- **Meta description** = `articleMetadata` in `frontend/app/dashboard/articles/[slug]/articleSeo.tsx`
  over the **whole body**: drop the leading `# …` line, strip `#*` `` ` `` `[]`, collapse whitespace,
  `.slice(0,160).trim()`. So the opening text must make the first 160 chars end on a full sentence
  (plan_37 technique: a sentence ending at ~char 159–160), contain no link (`(url)` is not stripped)
  and no emoji (UTF-16 vs Python length).
- **Phrase program:** `backend/scripts/import_phrase_programs.py --in <json>` — non-destructive
  (matches program by title, phrases by text, never deletes). JSON shape = `backend/data/phrase_programs.json`.
  Its docstring calls the JSON a derived artifact "not a place to author content"; we deviate
  deliberately (entering ~20 phrases by hand in admin is tedious and error-prone), and keep the
  source next to the article in `temp_files/articles/`, not under `backend/data/`. The script prints
  counts only; the new id comes from `GET /api/phrase-programs` or the card link on
  `/dashboard/phrases/`. Phrase audio stays Premium-only (`specs/phrases.md`).
- **Word list 237** «Mėnesiai»/«Months»: subcategory `sekmes`, 12 items at positions 1–12, 21
  learners. Weekday words exist, accented: ids 3238–3244 (pirmadienis…sekmadienis), today only in
  Sėkmės ch. 4 list 190. Progress is per word, so nobody re-learns them. **No admin endpoint adds
  existing words to a curated list**, so a data script does it, following the #55 precedent
  `backend/scripts/fill_practice_sections_article_themes.py` + `backend/tests/test_fill_sections_themes.py`
  (`run(session, apply) -> counts`, `database.engine` imported only in `main()`, report-only by default,
  `--apply` only with explicit approval, one transaction).
- **Linking a list:** `/dashboard/lists/237/` is login-gated (anonymous → `/login`); `/programs/sekmes/`
  is public but shows lists as accordions without anchors and enrolls in the whole program. The
  days/months article uses both: `/programs/sekmes/` as the public link, `/dashboard/lists/237/` as
  «учить этот список» (a guest lands on login, then the list).
- **Prod cache:** scripts run in their own process, so prod's in-process cache (`backend/cache.py`,
  10 min TTL) is not cleared; lists/programs can look stale up to 10 min or until the deploy.

**Model:** opus/medium — no app code, but the Lithuanian content must be correct and SEO-shaped, and
one prod data script needs care.

## Goals
- Article «Приветствия на литовском» (slug `lithuanian-greetings`): labas, labas rytas, laba diena,
  labas vakaras, sveiki, ačiū, prašau, atsiprašau, iki, viso gero, plus «Как дела» (`kaip sekasi`,
  `kaip gyvuoji`) and «Тост» (`į sveikatą`). RU body for RU queries; EN body written for the EN
  queries, not a literal translation. Call to action: the new phrase program.
- New public phrase program «Приветствия и вежливость» / «Greetings and polite phrases», ~20 phrases
  matching the article, in 3 chapters (greetings / how are you / toast & politeness).
- Article «Дни недели и месяцы на литовском» (slug `days-and-months`), RU + EN. Dates are taught in
  `numbers-05-age-dates-years`; this article links there instead of re-teaching them, so the two pages
  don't compete. Slug is `days-and-months`, not `numbers-06-…`: days and months aren't numbers, and
  the slug can't change once indexed.
- Word list 237 gains the 7 weekday words and is renamed «Mėnesiai ir savaitės dienos» /
  «Months and days of the week».

## Non-Goals
- Batch 2 (cases/numbers titles, Sėkmės description, Regitra section, numbers-05 back-link) — `plan_58b`.
- Any app code change; free audio for the new program.
- EN twins for programs/phrases pages (#48d).
- New word rows for weekdays (reuse 3238–3244).

## Requirements
1. **Greetings article** `temp_files/articles/lithuanian-greetings.md`:
   - `title_ru` contains «Приветствия» and «на литовском»; `title_en` contains «Basic Lithuanian
     phrases» (exact query) and «greetings».
   - The meta description (transform above) of RU and EN each ends on `.`/`!`/`?` and names the main
     query words (RU: привет, доброе утро, спасибо; EN: greetings, basic phrases). No link or emoji
     before char 160.
   - Each phrase: Lithuanian, translation, short usage note (formal/informal, time of day).
   - Links: the new program `/dashboard/phrases/<id>/` (placeholder `PROGRAM_ID` until Rollout 12),
     and `/dashboard/phrases/`.
   - `category: learning_materials`; theme to set in editor: `words`.
2. **Phrase program** `temp_files/articles/greetings-program.json` — a one-element list in the
   `phrase_programs.json` shape, `is_public: true`, `difficulty: 1`, 3 chapters with
   `chapter_title`/`chapter_title_en`, positions 0…n. Phrases = the article's phrases.
   **`translation` and `translation_en` are unique within the program** (qualify repeats:
   «Привет (неформально)», «Здравствуйте (вежливо)», «До свидания (на время)» …), since phrase
   study has no translation dedupe.
3. **Days/months article** `temp_files/articles/days-and-months.md`: 7 days + 12 months with
   translations; A1 usage notes (`pirmadienį` — «в понедельник», capital letters not used); links to
   `/programs/sekmes/`, `/dashboard/lists/237/` and `numbers-05-age-dates-years` for dates. Same
   title/meta rules («дни недели», «месяцы», «на литовском»; EN «days of the week», «months»,
   «Lithuanian»). `category: learning_materials`; theme: `numbers`.
4. **List script** `backend/scripts/add_weekdays_to_months_list.py`:
   - `run(session, apply) -> counts`; `main()` imports `database.engine`.
   - Finds the list by **id 237** and aborts unless `subcategory == 'sekmes'`; finds words by
     **ids 3238–3244** and aborts unless each `lithuanian` matches the expected weekday. Abort = no
     writes (checked explicitly, not via FK errors — SQLite tests don't enforce FKs).
   - Appends only the missing word ids at `max(position)+1…`, in weekday order; sets
     `title`/`title_en` only if they differ.
   - Report-only by default; `--apply` writes in one transaction. A second run is a no-op.
5. **Import checker** `backend/scripts/check_article_import.py <file.md>…` — read-only, no DB: parses
   with `_parse_markdown_article`, requires non-empty `title_en` + `body_en` and a valid category,
   prints the RU and EN meta descriptions (Python port of the transform:
   `re.sub(r'^#.*\n+','',s,count=1)` → `re.sub(r'[#*`\[\]]','',…)` → `re.sub(r'\s+',' ',…)` →
   `[:160].strip()`) and fails unless each ends in `[.!?]`. Reusable for every future article.
6. The user reviews all Lithuanian (both articles, the JSON) before any prod step.

### Standing constraints
- All validation must be server-side (never frontend-only).
- Markup/styling: N/A — no component changes; content renders through existing pages.
- Add autotest coverage for the new feature and run the relevant suite(s) as part of Validation.

## Implementation
- [ ] 1. `temp_files/articles/lithuanian-greetings.md` (Requirement 1).
- [ ] 2. `temp_files/articles/greetings-program.json` (Requirement 2).
- [ ] 3. `temp_files/articles/days-and-months.md` (Requirement 3).
- [ ] 4. `backend/scripts/add_weekdays_to_months_list.py` (Requirement 4).
- [ ] 5. `backend/scripts/check_article_import.py` (Requirement 5).
- [ ] 6. `backend/tests/test_add_weekdays_to_months_list.py` — own in-memory engine (`sqlite://` +
  `StaticPool`, as `tests/test_fill_sections_themes.py`) with `WordList(id=237, subcategory='sekmes')`
  + 12 items and `Word` 3238–3244: first apply adds 7 items at positions 13–19 + renames; second run
  no-op; report-only writes nothing; wrong subcategory / missing word / wrong `lithuanian` aborts
  with no writes.
- [ ] 7. `backend/tests/test_check_article_import.py` — the checker on small inline fixtures (valid;
  missing `body_en`; meta description cut mid-word) — permanent, doesn't read `temp_files/`.
- [ ] 8. `frontend/tests/plan58a-screenshots.spec.ts` — mocks built from the files in
  `temp_files/articles/` (route `**/api/articles/<slug>` with the parsed article, `**/api/articles`,
  `**/api/billing/config` → `{enabled:true}`), RU + EN × 1280 / 375, into
  `temp_files/screenshots/plan_58a_seo-content-new-pages/`:
  - both articles at `/dashboard/articles/<slug>/` and `/en/dashboard/articles/<slug>/`;
  - the phrase program page `/dashboard/phrases/<id>/` mocked from the JSON (chapters, EN translations);
  - `/programs/sekmes/` with list 237 renamed and 19 words (long Lithuanian title at 375).
  Look at every shot.
- [ ] 9. `documentation/articles-seo.md` — an article's call to action can be a program/list created
  with it (#58a); `import_phrase_programs --in` for one new program (and that its "dry-run" flushes,
  so never against prod from dev); `check_article_import.py` before every import; gotcha: no admin
  endpoint adds existing words to a curated list → data-script pattern.

Rollout (manual, after the ~24 Oct #48c check)
- [ ] 10. User reviews the Lithuanian in items 1–3. *(manual)*
- [ ] 11. Record a baseline: enrollments in list 237 and (after step 12) in the new program. *(manual)*
- [ ] 12. User runs `cd backend && .venv/bin/python -m scripts.import_phrase_programs --in ../temp_files/articles/greetings-program.json`; gets the new id from `GET /api/phrase-programs`; replaces `PROGRAM_ID` in the greetings article. *(manual)*
- [ ] 13. User runs `cd backend && .venv/bin/python scripts/add_weekdays_to_months_list.py` (report), then `--apply`. Lists may look stale up to 10 min (prod cache). *(manual)*
- [ ] 14. User imports both articles at `/dashboard/admin/articles`, sets themes (`words`, `numbers`), deploys. View-source the RU and `/en/` pages: if the title is the placeholder «Статьи о литовском языке», deploy again. Check self-canonical + EN title on `/en/`. *(manual)*
- [ ] 15. `/seo`: request indexing for the 2 RU + 2 EN URLs; log the batch in `documentation/seo-log.md`; in 3–4 weeks recheck positions and program/list enrollments vs step 11. *(manual)*

## Validation
- [ ] Content check: `cd backend && .venv/bin/python scripts/check_article_import.py ../temp_files/articles/lithuanian-greetings.md ../temp_files/articles/days-and-months.md`
- [ ] JSON check: `cd backend && .venv/bin/python -c "import json;p=json.load(open('../temp_files/articles/greetings-program.json'))[0]['phrases'];t=[x['translation'] for x in p];e=[x['translation_en'] for x in p];assert len(set(t))==len(t) and len(set(e))==len(e);print(len(p),'phrases, translations unique')"`
- [ ] Backend new tests: `cd backend && .venv/bin/python -m pytest tests/test_add_weekdays_to_months_list.py tests/test_check_article_import.py -q`
- [ ] Backend full: `cd backend && .venv/bin/python -m pytest -q`
- [ ] Screenshots: `cd frontend && npx playwright test tests/plan58a-screenshots.spec.ts --reporter=list`, then look at every shot *(looking is manual)*

## Definition of Done

```bash
cd backend && .venv/bin/python scripts/check_article_import.py ../temp_files/articles/lithuanian-greetings.md ../temp_files/articles/days-and-months.md
cd backend && .venv/bin/python -m pytest -q
cd frontend && npx playwright test tests/plan58a-screenshots.spec.ts --reporter=list
```

User-facing checks: **both languages (RU + EN)**, **mobile at 375px**, **screenshots proving each**
in `temp_files/screenshots/plan_58a_seo-content-new-pages/` — both articles, the phrase program
page and `/programs/sekmes/`, RU and EN, 1280 and 375.

## Notes
- Cold review 2026-10-03: fixed — list script idempotency (lookup by id), prod writes removed from
  Validation, exact meta-description transform, git-ignored content moved out of permanent tests
  (checker script instead), unique phrase translations, chapters, link targets for list 237,
  numbers-05 overlap, program-id source, two-deploy check, prod cache note, enrollment baseline,
  extra screenshots. Kept: renaming inside the script (one step for the user) and the `--in` import
  route.
- Batch 2 = `plan_58b`, after batch 1 has been live 2–3 weeks.
