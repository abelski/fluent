---
kind: feature
status: done
iteration: 4
max_iterations: 30
suggested_model: opus
suggested_effort: medium
confirmed_model: opus
confirmed_effort: medium
uat_rounds: 0
max_uat_rounds: 3
---

# #62e — Practice: "Вывески и объявления" (signs and notices) + A2 article update

## Context

Idea: `plans/ideas/idea_62_exercise-formats-map-and-gap-check.md` (confirmed). **Part 5 of 8.**
Branch `feat/62e-practice-signs-notices`. **Depends on #62a deployed** (empty categories hidden in
prod before this plan seeds) **and #62b–#62d merged — done, all three are on `main`** (the check's
`reading` task, empty categories hidden, the generic seed + validators, the Alembic chain after
#62c's migration). Last of the four Practice formats, so it also carries the **SEO article update**
that presents all four.

The A2 exam opens with short real-life texts: a sign, a notice, an opening-hours plate, a social-media
post — "what does it say / what should you do". The user placed it in Practice as its own category
(idea, Q3–Q4). The questions are ordinary multiple choice (`kind = "choice"`), so the only new
thing is **an image on a question**: `practice_question` has no image column today.

**Image source — real photos, all from open sources (2026-10-13, the user: "I can't take photos,
search the internet, we need real photos").** The 2026-10-08 plan relied on the user's own photos;
that option is dropped. A crawl of Wikimedia Commons (Lithuania sign/shop/transport/pharmacy/post
categories, ~4,900 files) and Openverse (Flickr CC) on 2026-10-13 found **34 usable real photos** with
readable Lithuanian text — list with licence, author and source URL in
`temp_files/signs-photos/candidates.md`. Licences: CC0, CC BY, CC BY-SA only; every non-CC0 photo
gets a visible credit. ~8 are weak (old Lt prices, small text, near-duplicates) and 2 Flickr shots
were taken in England (Lithuanian text) — the user decides on those in step 2. No public-domain SVG
road signs are needed. Commons has almost no social-media posts, so that theme is replaced.

Code facts: `frontend/public/*` is copied into the Next export and served by FastAPI's
`serve_frontend` (`backend/main.py`, `_static_file_response` sets cache headers by file kind).
 The student page defines its own `Question`/`ActiveTest`
types (`practice/[id]/page.tsx:16-31`). `admin_update_question` (`backend/routers/practice.py:950`)
skips fields sent as `None` (loop at ~967–971), so a field could never be cleared — #48b's pattern
(`model_fields_set`, `""` → NULL, `practice.py:575`/`827`) fixes that for `image_url`. Import
(`admin_import_test`) silently `continue`s past bad questions today; an invalid `image_url` must
instead raise 400 before anything is committed. `frontend/public/img/` does not exist yet. Pillow is
not a dependency — images are processed with `cwebp` in step 6, not inspected in Python.

**SEO.** Practice is out of search (`noindex` + `Disallow`, #62b), and exam questions need a login
(`_require_user` on the exam endpoint), so the images carry no image-search value. The search
asset for exam prep is the existing article **`prepare-for-lithuanian-a2`** («Как подготовиться к
экзамену A2 по литовскому языку», RU + EN, 2,564 chars, last edited 2026-03-16): its "## Формат
экзамена" lists the four exam parts in one line each, and "## Полезные ресурсы" mentions Fluent with
**no link at all**. It targets exactly the queries the competitor's mock test ranks for. Article
edits are the user's step in the admin editor (import rejects an existing slug with 409; memory
"Article publish is the user's step"); the meta description is the first 160 chars of the body after
the `# …` line (`documentation/seo.md`), so the edit must not touch the opening paragraph.

Model/effort: opus/medium — an additive prod migration, ~30 photos to prepare (crop, resize, strip
EXIF, blur), credits and an article update; the code change is small.

## Goals
- A new Practice category «Вывески и объявления» / "Signs and notices": 5 tests × 6 questions, each
  question showing a real photo of a sign or notice and asking about it in Lithuanian.
- Any practice question can carry an image and its credit; admins can set and clear both;
  export/import keep them.
- Sign questions can appear in the knowledge check and in "Close the gaps", image included.
- The A2 preparation article describes the four reading task types Fluent now trains and links to
  them — the SEO entry point for exam prep.
- RU + EN, desktop and 375px.

## Non-Goals
- Image upload in the admin UI (images are files in the repo; admins set the path).
- Images on other kinds (dialogue turns, gaps).
- Zoom/lightbox.
- Opening Practice to search engines; a new article (the existing one is updated).

## Requirements

1. **Schema** — `practice_question.image_url VARCHAR(300) NULL` and `practice_question.image_credit
   VARCHAR(200) NULL` (one Alembic revision, `down_revision = 'b7c8d9e0f1a2'` — #62c's `add_practice_test_kind`, the
   current head; pick a fresh revision id and grep `backend/migrations/` for it). `models.PracticeQuestion` gains both as
   `Optional[str] = Field(default=None, max_length=…)`.
   **STOP — user step** to run `alembic upgrade head` on the shared prod DB first (nullable, additive;
   old code ignores it).
2. **Server validation** — `image_url` is `None` or a site-relative path matching
   `^/img/[a-z0-9/_-]+\.(webp|png|jpe?g)$` (no external URLs: no hot-linking, no third-party
   requests from the exam). Enforced in `QuestionIn`, `QuestionUpdate` and `admin_import_test` → 400.
   `QuestionUpdate` uses `model_fields_set`: `image_url` / `image_credit` sent as `""` or `null` clear
   them. `image_credit` is plain text ≤ 200 chars.
3. **Serving** — all four places carry `image_url` and `image_credit`: `_load_exam` (~422), the admin
   questions list dict (~870–890), `admin_create_question` (~914), `admin_export_test` (~1015); import
   reads them.
4. **Question screen** (`frontend/app/dashboard/practice/[id]/page.tsx`, `Question` type gains
   `image_url`) — when set, render `<img src alt={q.question_lt ?? q.question_ru} loading="lazy">`
   above the question text, `max-w-full max-h-[320px] w-auto mx-auto` (final values from the prototype), `rounded-[10px] border border-line`, and under it, when set, the credit in one small `text-muted`
   line. The admin question form (`admin/page.tsx`) gains `image_url` and `image_credit` text fields
   that can be emptied.
5. **Knowledge check** — `_build_choice` (`backend/knowledge_check_service.py`) copies `image_url`
   into the `reading` task. Its instruction is hardcoded «Прочитай текст и выбери: верно или неверно» —
   wrong for signs: when `image_url` is set use «Посмотри на фото и ответь на вопрос» / "Look at the
   photo and answer the question". The runner's `reading` branch renders it above the question (#62a already renders no passage block for
   an empty `passage_lt`). No id to wire: the category joins #62a's pool when its tests are published.
6. **Content** — `backend/data/practice/signs.json` (`"format": "signs"`) + the image files. Category
   `name_ru` «Вывески и объявления», `name_en` "Signs and notices", `sort_order` 14. 5 tests (themes, from what
   the candidates cover: shops and opening hours; transport and timetables; parking and road;
   services, health and post; rules, warnings and notices), 6 questions each, `kind` `choice`, `question_count` 6, `pass_threshold` 0.7,
   `is_premium` false, `status` `testing` at seed. Each question: `image_url` `/img/signs/<slug>.webp`, `image_credit` + `source_url` for every
   non-CC0 photo,
   `question_lt` = `question_ru` = an A2 Lithuanian question (e.g. «Kada parduotuvė nedirba?»),
   3–4 distinct Lithuanian options, one correct. Examples of notices: «Darbo laikas I–V 9–18, VI
   10–15, VII nedirba», «Kasa. Mokamos paslaugos», «Atsargiai! Slidu», «Uždaryta dėl
   inventorizacijos», «Mokama stovėjimo aikštelė», a bus timetable, a cancelled-event post.
6a. **Question rules (2026-10-13, after two user reviews).** Level **A2–A2+**: short questions and
   answers in simple present/past, everyday vocabulary, no participles/gerunds/padalyviai, no
   `kad`-clauses; numbers and times written as on the sign (15:00, 8–20, 2,90). (1) Never ask "what is
   this place?" when the photo names it (post office saying «Paštas»); "Kur jūs esate?" is fine when the
   place must be inferred. (2) Otherwise a real-life task: when is it open/closed, how much, how far,
   what is forbidden, what to do. (3) A word from the sign may appear in the answer if the question
   still needs the text understood (e.g. which day, which time). (4) One clearly correct answer, no
   arguable distractors; distractors from the same sign where possible. (4b, 2026-10-13 user review of live tests) **No match-the-word answers**: the answer must not
   be findable by matching a word of the question to the sign (question «…iki Šilutės?» + sign «ŠILUTĖ 15»
   is too obvious). Each question needs one step of understanding — direction words, a day from «I–V»,
   an inference from a situation — and the photo must offer ≥ 2 candidate answers. (5) Language only — no
   arithmetic, geography or cultural-knowledge questions. Checked by Claude when drafting and by the
   user when reviewing `signs.json`.
7. **Image rules** — Photos: `.webp` made with `cwebp -metadata none -resize 1200 0` (strips EXIF —
   phone photos carry GPS — and caps width), ≤ 200 KB, cropped to the part the question needs (text readable at 375px; drop a photo that can't be), faces and licence plates blurred, the Lithuanian text sharp
   and readable at 375px. Commons / Flickr photos only under CC0, CC BY or CC BY-SA — no NC / ND
   (we crop and resize).
8. **Seed** — through #62b's `seed_practice_category.py`; new `validate_signs` in
   `backend/scripts/seed_practice_category.py` (next to `validate_tfns` / `validate_dialogue` /
   `validate_gap_text`, registered in `validate()`'s format dispatch): 5 tests × 6 questions; every `image_url` passes Req 2 and its file exists
   under `frontend/public`; every image is within its size cap and a `.webp` has no `EXIF` bytes in its first 4 KB; every
   Commons photo has `image_credit` and `source_url`; 3–4 non-empty, distinct options;
   valid `correct_option`; RU + EN titles. **`seed()` must handle `signs` too** — today it reads
   `t["lesson_text_lt"]` unconditionally (KeyError), falls back to `TFNS_OPTIONS` for unknown formats,
   and never writes `image_url`/`image_credit`: for `signs` use `lesson_text_lt=None`, the question's
   own `options` padded to 4, and pass both image fields through.
9. **Attribution** — each Commons photo: `image_credit` «<author>, <licence>» (no prefix; the UI
   adds a localized «Фото:» / "Photo:" via i18n `practice.photoCredit`, shown under the image, Req 4
   and in the knowledge-check runner — 2026-10-13, coordinator) and `source_url` (the Commons file page) in `signs.json` — the licence record; changes made
   ("cropped, resized") are noted once in `documentation/practice-formats.md`. CC0 photos need neither.

### SEO
- **S1 — Practice and the images stay out of the index** (#62b S1): no sitemap entry, no robots or
  metadata change; the `seo-snapshot` diff must be clean.
- **S2 — update the article `prepare-for-lithuanian-a2`** (RU and EN bodies):
  - "## Формат экзамена" / "Exam format": after the existing four-part list, a short subsection on the
    reading part's task types — true / false / not stated, choosing replies in a dialogue, a text
    with gaps and a word bank, signs and notices — one or two sentences each, with a Lithuanian
    example.
  - "## Полезные ресурсы" / "Useful resources": the Fluent line becomes links — Practice
    (`/dashboard/practice/`), Grammar (`/dashboard/grammar/`), and the free knowledge check
    («после входа» → `/login/`).
  - The title, the slug and the first 160 characters of both bodies (the meta description) stay
    byte-identical; no other section is rewritten.
  - **Timing gate:** not before the #48c RU-traffic check (~2026-10-24, `documentation/seo-log.md`) —
    like #58a. The edit bumps `updated_at`, so IndexNow re-pushes the URL at the next deploy (#59a).
- **S3 — llms.txt** lists the category automatically (#62b S2).

### Standing constraints
- All validation must be server-side (never frontend-only).
- If this plan touches markup, styling, or a component: read `documentation/design system/Component Library (as-built).html` and `documentation/IMPLEMENTATION.md` first, use named design tokens (never a raw Tailwind step), and run `frontend/tests/design-system-parity.spec.ts` after any shared-shell/token change.
- Add autotest coverage for the new feature and run the relevant suite(s) as part of Validation.

## Prototype (phase 0 — visuals before implementation)

The user reviews the look before any product code is written. A static mock,
`temp_files/prototypes/plan_62e_practice-signs-notices.html` (Tailwind from the CDN with Fluent's tokens copied from
`frontend/tailwind.config.js`), with a **state switcher** and an **RU/EN toggle**. Surrounding UI is
**copied from the real components, not sketched** (memory "prototype replicas copy real UI"); only the
new part is invented.

- **Copy from the code:** the question screen of `practice/[id]/page.tsx`; the knowledge-check runner's `reading` task (from #62a).
- **New part:** the photo above the question and the credit line under it.
- **States:** a portrait photo, a landscape photo, a credited photo, an answered question, 375px; a sign task in the knowledge-check runner.
- **Content:** 2–3 sample images from `temp_files/signs-photos/candidates.md` (e.g. «Darbo laikas», the parking «I–VI 8–20 h» sign, a train timetable), credited in the mock.
- **Decide in the prototype:** maximum height and aspect handling (crop vs letterbox), credit-line style, spacing at 375px.

**Prototype DoD (reduced, precedent #53/#55/#56):** renders at 1280px and 375px in RU and EN;
every state above screenshotted into `temp_files/screenshots/plan_62e_practice-signs-notices-prototype/` and looked at; published as a
private artifact (follow the artifact-design skill's page contract) and the link given to the user;
the user's verdict recorded below with the date. Dropped for the prototype: backend, autotests,
docs, CHANGELOG.

### Approved decisions
**2026-10-13 — approved by the user** (artifact https://claude.ai/artifact/9EyGhvM28YTkm1UZKmhByP, v2).
- Photo: natural aspect, no letterbox, `max-h-[320px] max-w-full w-auto mx-auto rounded-[10px] border border-line`.
- Credit: one centred `text-xs text-muted` line under the photo, «Фото: / Photo: <author>, <licence>»; none for CC0.
- **Readability = cropping, not zoom.** The user found the full ferry timetable unreadable even at
  1280px; a tight crop (header + first rows) fixed it. Rule for step 6: crop every photo to the part
  its question needs; a dense photo that can't be cropped to a readable part is dropped. Tap-to-zoom
  stays a Non-Goal.

## Implementation

- [x] 0. **Prototype** — build `temp_files/prototypes/plan_62e_practice-signs-notices.html` per `## Prototype`, screenshot
  every state (RU + EN, 1280 + 375) into `temp_files/screenshots/plan_62e_practice-signs-notices-prototype/`, publish it as a
  private artifact. **STOP — user step:** the user reviews; iterate until approved. Record the verdict
  under `### Approved decisions` and copy any change into the Requirements. **No product code before
  approval.**
- [x] 1. **SEO baseline** (before any code change, local backend on :8000 running):
  `cd frontend && rm -rf .next/cache/fetch-cache && npm run build && node scripts/seo-snapshot.mjs --out ../temp_files/seo/plan_62e-baseline.json`.
- [x] 2. **Done 2026-10-13** — user approved `temp_files/signs-photos/selection.md`: 29 photos (6/6/5/6/6; parking test has 5 questions), b2238 (shot in England) kept, answers may spell numbers in words. **Was: STOP — user step:** Claude downloads the 34 candidates from
  `temp_files/signs-photos/candidates.md` at full size into `temp_files/signs-photos/`, builds one
  contact sheet, and marks each keep/drop (text readable at 375px after cropping). The user approves
  the final 30 (and decides on the 2 England shots). Fewer than 30 good ones → ship fewer questions
  per test (`question_count` stays 6; drop to 4 tests if needed) rather than invent images.
- [x] 3. `backend/migrations/versions/<id>_add_practice_question_image.py` + `backend/models.py`
  (Req 1). **STOP — user step:** approve and run
  `cd backend && .venv/bin/python -m alembic upgrade head`.
- [x] 4. `backend/routers/practice.py` — Req 2, 3.
- [x] 5. `frontend/app/dashboard/practice/[id]/page.tsx` (`Question.image_url`, the image),
  `frontend/app/dashboard/admin/page.tsx` (the field), i18n for the admin field label — Req 4.
- [x] 6. Prepare the photos (crop, resize to ≤ 1200 px, `.webp`, strip EXIF, blur faces/plates) into a new
  `frontend/public/img/signs/`, write `backend/data/practice/signs.json` — Req 6, 7, 9.
- [x] 7. `backend/scripts/seed_practice_category.py` — `validate_signs` + its `validate()` dispatch, and
  the `signs` branch in `seed()` — Req 8.
- [x] 8. `backend/knowledge_check_service.py` + `frontend/app/dashboard/components/GrammarTaskRunner.tsx` (reading task type ~107 gains
  `image_url`, reading branch renders it) — Req 5.
- [x] 9. Tests:
  - `backend/tests/test_practice_signs.py` — `validate_signs` passes on `signs.json` + the images and
    fails on an external URL, a missing file, a photo over 200 KB or with EXIF bytes, a Commons photo
    without a credit or `source_url`, duplicate options; `seed()` on an in-memory session stores a
    signs question with its own options, both image fields and no passage; create/update/import with
    `image_url="https://x.com/a.png"` → 400; update with `image_url=""` / `image_credit=""` clears it;
    export→import round-trips both; the exam returns both.
  - `backend/tests/test_knowledge_check.py` — a sign question yields a `reading` task with
    `image_url`, an empty passage and the photo instruction; a "Close the gaps" run keeps `image_url`.
  - `frontend/tests/practice-signs.spec.ts` — Playwright, API mocked: the image renders above the
    question with alt text, and the credit line under a credited photo; no layout overflow at 375px;
    a question without `image_url` renders no `<img>` and no credit line; a signs test (no
    `lesson_text_lt`) skips the reading view; the admin fields set and clear the image and the credit;
    the check runner shows the image for a reading task with `image_url`. Screenshots (Validation).
- [x] 10. **SEO article draft** — `temp_files/articles/prepare-for-lithuanian-a2-62e.md`: the two
  new/changed sections in RU and EN, with the exact insertion points (S2). Verify with the
  `documentation/seo.md` transform that the first 160 chars of both bodies are unchanged.
- [x] 11. **Done 2026-10-13, category id=6.** **STOP — user step.** Ask the user to look through the images (the screenshots from step 9)
  and `signs.json`, then run
  `cd backend && .venv/bin/python scripts/seed_practice_category.py data/practice/signs.json --dry-run`
  and without `--dry-run` (prod, `testing`). Users see nothing (#62a hides the category). Until this
  plan is deployed, the old code shows these questions without their photos — don't open them on
  fluent.lt (admins only). The photos themselves ship with the deploy; the article update is a
  Release step.
- [x] 12. Docs/specs: `specs/practice.md` — the #62e scenario from the idea (image, clearing);
  `specs/knowledge-check.md` — images in reading tasks; `documentation/practice-formats.md` — the
  image source decision (real photos), the path rule and why no external URLs, the photo rules (EXIF,
  blur, no NC/ND), attribution; `documentation/seo-log.md` — dated entry for the A2 article update (what changed, to read GSC
  against later); component library — the question image; `documentation/IMPLEMENTATION.md` —
  `image_url`. Close-out: add `- <today> — release #62e: publish the signs tests once deployed
  (#62e)` and `- 2026-10-24 — #62e: A2 article update, once #62b–#62e are all released (#62e)` to
  `plans/reminders.md`.

## Review
- [x] Code review passed (round 4; rounds 3–4 covered the A2 content rewrite + `--update-text`)
- note: seeder imports the router's private `_IMAGE_URL_RE` (one rule); move to a shared module only if a third caller appears.
- note: webp EXIF check reads the first 4 KB only — seed-time sanity check.
- note: admin/page.tsx image-field grid indentation is 2 spaces off.

## Validation

- [x] Backend: `cd backend && .venv/bin/python -m pytest -q tests/test_practice_signs.py tests/test_practice_tfns.py tests/test_knowledge_check.py`
- [x] Full backend suite green: `cd backend && .venv/bin/python -m pytest -q`
- [x] Types: `cd frontend && npx tsc --noEmit`
- [x] Playwright: `cd frontend && npx playwright test tests/practice-signs.spec.ts tests/practice-tfns.spec.ts tests/practice-dialogues.spec.ts tests/practice-gap-text.spec.ts tests/design-system-parity.spec.ts --reporter=list`
- [x] Seed dry-run passes: `cd backend && .venv/bin/python scripts/seed_practice_category.py data/practice/signs.json --dry-run`
- [x] Leak check right after the real seed (2026-10-13: guest /api/practice/categories on fluent.lt lists ids 1–5 only): on fluent.lt in a private window and as a free test
  user (prod still runs the old code), the Practice page shows nothing new — the new category is invisible.
- [x] Prod schema check after the user's migration: `practice_question.image_url` exists, nullable.
- [x] SEO diff clean (DoD command); the article draft keeps the first 160 chars of both bodies.
- [ ] Smoke (local, after the seed): as admin, take one signs test end to end; the images load from
  `/img/signs/…` on the FastAPI-served build (not only `next dev`).
- [x] Screenshots in `temp_files/screenshots/plan_62e_practice-signs-notices/`, looked at and described:
  category in the list, a question with its photo, a credited photo with its credit line, the admin
  image fields, the knowledge-check runner with a sign task — each in **RU and EN**, at **1280px and
  375px**. Plus one contact sheet of all images at 1280px, checked for clipped text and wrong
  diacritics.
- [x] The built UI matches the approved prototype: the same states side by side
  (`temp_files/screenshots/plan_62e_practice-signs-notices-prototype/` vs this plan's screenshots); differences only where
  agreed in `### Approved decisions`.
- [ ] Production comparison: practice page nav, header, footer intact.
- [ ] News post written and published via /news-writer (user's call, after the Release steps).

## Definition of Done

```bash
cd backend && .venv/bin/python -m pytest -q
cd backend && .venv/bin/python scripts/seed_practice_category.py data/practice/signs.json --dry-run
cd frontend && npx tsc --noEmit
cd frontend && npx playwright test tests/practice-signs.spec.ts tests/practice-tfns.spec.ts tests/practice-dialogues.spec.ts tests/practice-gap-text.spec.ts tests/design-system-parity.spec.ts --reporter=list
cd frontend && rm -rf .next/cache/fetch-cache && npm run build && node scripts/seo-snapshot.mjs --diff ../temp_files/seo/plan_62e-baseline.json
ls temp_files/screenshots/plan_62e_practice-signs-notices/ | grep -c png   # expect >= 21 (5 states x RU/EN x 1280/375 + contact sheet)
```

User-facing checks (must be evidenced by the screenshots above): **both languages RU + EN**,
**mobile at 375px**, **screenshots proving each**.

## UAT verification

**Instrument:** Playwright MCP against `http://localhost:3000/dashboard/practice`, logged in as a
local admin test user (token in `localStorage('fluent_token')`), real local backend on :8000, after
the user has run the migration and the seed.

**Scenarios:**
1. Open Practice → «Вывески и объявления» → the first test; answer all 6 questions.
2. Switch the UI to English and open the category again; resize to 375px wide.

**Acceptance criteria:**
- [ ] Each question shows a photo of a real sign or notice above the question; photos from other
  authors show a credit line.
- [ ] The text in every picture is readable and not cut off, at 1280px and at 375px.
- [ ] Each question has 3 or 4 answers, one correct, with feedback after answering.
- [ ] Finishing shows a result screen with the score.
- [ ] Titles appear in English in the English UI; the signs and questions stay Lithuanian.
- [ ] At 375px nothing overflows horizontally.

## Release

Merging ships the code and the photos; the signs tests stay `testing` until these user steps. Every
state in between is consistent for users.

1. **Preconditions:** this plan is merged, pushed and live on Render (the photos are served from
   `/img/signs/` only after the deploy); the migration (step 3) and the seed (step 11) have run.
2. **Publish:** set the 5 signs tests to `published`.
3. **Verify** as a free user on fluent.lt at 375px: every photo loads and is readable, credited photos
   show their credit line; a new knowledge check can include a sign question with its photo.
4. **Article** — after this plan's release and the #48c timing gate (~2026-10-24): paste the step-10
   sections into the admin editor of `prepare-for-lithuanian-a2`, describing and linking **only the
   formats that are released at that moment** (all four in the normal order; drop any slice that is
   still hidden or was abandoned), check `/api/articles/prepare-for-lithuanian-a2`, add a dated line to
   `documentation/seo-log.md`. The article must never link to a format users can't open.
5. **Record:** "released YYYY-MM-DD" on the #62e row in `documentation/CHANGELOG.md`, delete the
   reminders as each step is done, then the news post.

**Rollback:** set the tests back to `testing`; if the article was already updated, revert its two
sections from the draft. **Abandon before release:** leave the category hidden or delete it; the
`image_url` / `image_credit` columns stay harmless (NULL).
