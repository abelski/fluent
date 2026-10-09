---
number: 62
slug: exercise-formats-map-and-gap-check
status: confirmed
---

# Idea #62 — Exercise-formats map + knowledge-check gap widget

## Problem
A competitor (a free A2-exam-prep site) has exercise formats and grammar topics that Fluent
lacks (audited 2026-10-08: their trainer, marathons, modules and all 15 mock-exam tasks). A learner
preparing for the A2 exam in Fluent cannot practise those exam formats, and nothing in Fluent tells
them *where their gaps are* and what to study next. Fluent also lacks a strong, concrete reason to
buy Premium at the moment a user discovers they are weak somewhere.

## Desired outcome
1. **A placement map** — every missing format/topic has a decided home (or is deliberately parked),
   so each becomes its own small idea → plan later without re-deciding placement.
2. **First build (#63-ish): a "Work on mistakes" widget on the home page**, directly above the effort radar.
   A new user is offered a free **knowledge check** (~15 mixed tasks). The result is a **gap
   analysis**. Free users then see a Premium upsell; Premium users get two tabs — **"Close the
   gaps"** (lessons generated for their weak topics) and **"Recommendations"** (what to enroll in) —
   plus the option to retake the check.

## Placement map

| Item (from the competitor audit) | Lives in | Plan | Notes |
| --- | --- | --- | --- |
| Knowledge check (mock A2, gap analysis) | **Home widget only** | #62a | Not a Practice category; single entry point |
| True / False / Not stated after a text | **Practice — new category "Верно / Неверно / Не сказано"** | #62b | "Чтение" is already 2-option True/False; this adds "Not stated" |
| Dialogue: pick the reply at each turn | **Practice — new category "Диалоги"** | #62c | New test kind, ordered turns |
| Long text with gaps + word bank | **Practice — new category "Текст с пропусками"** | #62d | New test kind, needs #62c's `kind` column |
| Photo of a real sign/post + question | **Practice — new category "Вывески и объявления"** | #62e | Needs an image on a question |
| Adjectives in cases | **Grammar — new program "Прилагательные"** | #62f | |
| Motion-verb prefixes (iš-, per-, nu-, par-…) | **Grammar — new program "Приставки движения"** | #62g | |
| Telling time + quantity + Genitive | **Grammar — new program "Время и количество"** | #62h | Grouped: both are numbers + Genitive; "kelintą valandą?" stays in Numbers; time follows the `numbers-03-time` article (ordinal system, no be/po yet) |
| Sentence builder (scrambled words) | **Already exists** — Phrases stage-1 word tiles | — | No work |
| Describe a picture (writing) | **Parked** | — | No way to grade free text (no AI key in our subscription) |
| Nasal vowels ą/ę/į/ų | **Parked** | — | Spelling, lowest exam impact |

Build order: #62a first — widget + knowledge check from **existing** content (Reading tests + the
public grammar programs). Then #62b → #62h, one branch each, merged in order. Each one adds content,
appends itself to the knowledge-check pool (practice) or joins it automatically (grammar lessons),
and needs no widget rework.

## Proposed spec

### specs/home.md (#62a)
**New**
```gherkin
Scenario: work-on-mistakes widget, no knowledge check taken yet
  Given a signed-in user who has never completed a knowledge check
  When home loads
  Then directly above the effort radar a "Work on mistakes" card is shown
  And it invites the user to take a free knowledge check (~15 tasks, ~10 minutes)
  And this is shown regardless of Premium status
```

```gherkin
Scenario: knowledge check run
  Given the user starts the knowledge check from the widget
  Then the server assembles ~15 tasks across topics from existing published content
    (Reading tests and the public grammar programs), different on every run
  And each task carries the topic it belongs to (a grammar program/lesson topic or a Practice category)
  And grading is server-side
  And at the end the user sees a per-topic breakdown of strong and weak topics
```

```gherkin
Scenario: widget after a check, free user
  Given a user without active Premium who has completed a knowledge check
  When home loads
  Then the widget shows their weak topics and a Premium upsell
    ("Work on mistakes is available with Premium") linking to /pricing
  And no retake button is offered
```

```gherkin
Scenario: widget after a check, Premium user
  Given a user with active Premium who has completed a knowledge check
  When home loads
  Then the widget shows two tabs: "Close the gaps" and "Recommendations"
  And a "Take the check again" action is available
```

```gherkin
Scenario: close-the-gaps lesson
  Given a Premium user on the "Close the gaps" tab
  When they start a lesson
  Then the server generates fresh tasks for their weakest topics from the last check, using the
    existing grammar task generators and Practice question pools for those topics
  And no enrollment is required
```

```gherkin
Scenario: recommendations tab
  Given a Premium user on the "Recommendations" tab
  Then it lists grammar programs and Practice categories matching their weak topics,
    each with the reason (e.g. "mistakes in Genitive") and an enroll action
  And Phrases and Words are not recommended
```

```gherkin
Scenario: retake is Premium-only, enforced server-side
  Given a user without active Premium who already completed a knowledge check
  When they request a new knowledge check via the API
  Then the server rejects it
```

### specs/practice.md (#62a — empty categories, prerequisite for #62b–#62e)
**Changed** (replaces "anyone lists practice categories" — "every category is returned")
```gherkin
Scenario: anyone lists practice categories
  Given any caller, authenticated or not
  When GET /practice/categories or GET /me/practice-categories is called
  Then every category with at least one test the caller may see is returned, with a published-test count
  And a category with no visible test is omitted for non-admins (admins still see it, with its testing/draft tests)
  And "enrolled" is false for an anonymous caller
```

### specs/practice.md (#62b — True / False / Not stated)
**New**
```gherkin
Scenario: true / false / not-stated statement
  Given a published test in the "Верно / Неверно / Не сказано" category
  When the student answers one of its statements
  Then the options are Tiesa / Netiesa / Nepasakyta and exactly one of them is correct
```
**Changed** (replaces "reading view before a test")
```gherkin
Scenario: reading view before a test
  Given a test whose lesson_text_lt is set
  When the student opens that test
  Then the reading screen renders the text before the first question, as today
  And during the questions the text stays available in a collapsible block above the question
```

### specs/practice.md (#62c — Dialogues)
**New**
```gherkin
Scenario: dialogue test
  Given a published test of kind "dialogue"
  When the student starts it
  Then all its turns are served in their stored order (never sampled or shuffled)
  And each turn shows the conversation so far, the other speaker's line and the candidate replies
  And after answering, the correct reply joins the conversation, whatever the student picked
```
```gherkin
Scenario: admin sets a test's kind
  Given an admin editing a practice test
  Then they can set its kind to choice or dialogue (gap_text from #62d), validated server-side
  And export / import keep the kind
```

### specs/practice.md (#62d — Gap text)
**New**
```gherkin
Scenario: gap-text test
  Given a published test of kind "gap_text"
  When the student starts it
  Then they see the text with numbered gaps and one shared word bank (each gap's word plus its distractor)
  And tapping a word fills the active gap, tapping a filled gap returns the word to the bank
  And "Check" grades every gap at once; the score is the number of correctly filled gaps
```

### specs/practice.md (#62e — Signs and notices)
**New**
```gherkin
Scenario: question with an image
  Given a practice question whose image_url is set
  When it is shown
  Then the image is rendered above the question, with the question text as its alt text
  And when image_credit is set, the credit is shown in one line under the image
  And the admin question editor, export and import carry image_url and image_credit, and can clear them
```

### specs/grammar.md (#62f / #62g / #62h — new programs)
**New**
```gherkin
Scenario: new grammar programs use the existing lesson pipeline
  Given the "Прилагательные", "Приставки движения" or "Время и количество" program is public
    and its case rules are published
  Then its lessons appear at Basic / Advanced / Practice level like any noun lesson
  And Basic tasks offer 4 options from the same paradigm (4 forms of one adjective; 4 motion prefixes;
    4 forms of one numeral or noun)
```

**New** (#62f — shared groundwork)
```gherkin
Scenario: admin previews a hidden grammar program
  Given a grammar program with is_public = false
  When an admin lists grammar programs or enrolls in it
  Then the admin sees it (with is_public) and can enroll; non-admins still get neither (404 on enroll)
```

### specs/seo.md (#62a, #62b, #62f)
**New**
```gherkin
Scenario: the knowledge-check page stays out of search
  Given the page /dashboard/check/
  Then its metadata is noindex, nofollow, robots.txt disallows it, it is not in the sitemap,
    and a logged-out visitor is redirected away
```
```gherkin
Scenario: llms.txt describes exam practice and grammar programs from live data
  When /llms.txt is requested
  Then it lists the practice categories a guest can see and the public grammar programs
```

### specs/knowledge-check.md (#62b–#62h)
**New**
```gherkin
Scenario: new content joins the knowledge check
  Given a new Practice category from #62b–#62e has a free published test (the pool is every such
    category except Конституция — no code change when a category is added),
    or a #62f–#62h grammar lesson is published
  Then knowledge checks, "Close the gaps" runs and Recommendations can include that topic
```

## Scope
- In: the placement map above; the home widget (3 states); the knowledge check built from existing
  content; gap analysis; "Close the gaps" generated lessons; "Recommendations" (grammar + practice);
  Premium gating on retake and on both tabs; RU + EN; mobile 375px.
- In, as later plans of this idea: the 4 new Practice categories (#62b–#62e) and the 3 new grammar
  programs (#62f–#62h).
- Out (non-goals): describe-a-picture writing; nasal vowels; recommending
  Phrases/Words; adding individual missed words to review; a public no-login entry or landing link;
  a Practice-page entry to the check; new analytics tracking.

## Decisions
- **What is #62** — the map + the widget idea; formats are built later as separate numbers.
- **One idea, eight plans (2026-10-08)** — like #48a–c: `plan_62a_knowledge-check-gap-widget` →
  `plan_62b_practice-true-false-not-stated` → `plan_62c_practice-dialogues` →
  `plan_62d_practice-gap-text` → `plan_62e_practice-signs-notices` → `plan_62f_grammar-adjectives`
  → `plan_62g_grammar-motion-prefixes` → `plan_62h_grammar-time-quantity`, each on its own
  `feat/62x-…` branch, merged in order.
- **Content** — Claude drafts every new text, statement, dialogue and sentence as a seed data file
  plus a validator; the user reviews the data and runs the seed (writing to prod is the user's step).
- **SEO (2026-10-08 review)** — no plan changes an indexed page's title, description or canonical
  (each plan diffs `seo-snapshot` against a baseline). `/dashboard/check/` is noindex + disallowed.
  Practice stays out of search, as today. Search value comes from **existing** articles, linked both
  ways: `prepare-for-lithuanian-a2` (exam formats, #62e), `būdvardžiai-linksniavimas` (#62f),
  `verb-governance` (#62g), `numbers-03-time` (#62h). Article edits keep the first 160 chars (the meta
  description), are the user's step in the admin editor, and wait for the #48c RU-traffic check
  (~2026-10-24). llms.txt lists practice categories and grammar programs from live data.
- **Cold-review fixes (2026-10-08)** — practice tasks of one topic stay an ordered block in the check
  and the gaps run (no leaking later dialogue turns or gaps); one generic, insert-only practice seed
  (no `--reset`: practice results reference tests) and one generic grammar seed (program upserted,
  never deleted); admins can preview hidden grammar programs; the substring duplicate-word cleanup in
  `_generate_sentence_tasks` is removed (no current row uses it, it corrupts adjective rows);
  motion prefixes drop pa- and never offer at-/nu- next to į/iš/pri.
- **Content sources (2026-10-08, user's choice "Tatoeba + real photos")** — sentences and dialogue
  lines start from Tatoeba (CC BY 2.0 FR, RU/EN translations included) and Mozilla Common Voice (CC0),
  adapted to A2 and reviewed by the user; seed data keeps each item's `source` (`tatoeba:<id>`,
  `commonvoice`, `own`); Tatoeba is credited in a «Источники» / "Sources" section of the `about-team`
  article. Signs and notices are **real photos** — the user's own first, Wikimedia Commons (CC BY /
  BY-SA) where needed with a credit line under each photo, public-domain official road signs from
  Commons. Texts for True/False/Not stated and gap texts are written for Fluent (no open A2 texts
  exist). NŠA exam samples are a format reference only. Details: `documentation/content-sources.md`.
- **Staged rollout** — new content is seeded hidden: practice tests as `testing`, grammar case rules
  as `testing`, grammar programs with `is_public = false`. Only admins see it until the user
  publishes it in the admin panel.
- **Prototype gate (2026-10-08, user)** — every plan starts with step 0: a static mock in
  `temp_files/prototypes/plan_62x_<slug>.html` (real surrounding UI copied from the components, only
  the new part invented, state switcher, RU/EN toggle), screenshots at 1280 / 375 in RU and EN, a
  private artifact link; **no product code until the user approves the visuals**. Approved changes are
  written back into the plan's Requirements, and Validation checks the build against the prototype.
- **Atomic slices (2026-10-08 review)** — every plan leaves prod consistent for users at every moment:
  build → seed hidden (allowed before the plan's own deploy, because users can't see it) → merge +
  deploy → **Release** (user publishes, after the deploy only) → news post. To make that hold:
  #62a carries the empty-category rule (live before any later seed) and the check's practice pool is
  "every category with a free published test except Конституция" (no code change after a seed); each
  plan has a `## Release` section with preconditions, verification and rollback, and a dated line in
  `plans/reminders.md` until released; grammar programs and their rules are released in one pass;
  the Tatoeba credit goes live before or with the first Tatoeba-derived content; article edits link
  only to released content. Between a seed and the deploy, admins must not open or edit the new
  content on fluent.lt (old code renders it wrongly) — users never see it.
- **Mock exam placement** — first "Practice category", then replaced: **home widget only**.
- **Reading formats** — separate new Practice categories, one per format (Signs; T/F/NS).
- **Dialogue** — new Practice category "Диалоги" (exam format, not phrase SRS).
- **Long gap-fill** — new Practice category "Текст с пропусками" (not inside Articles).
- **Describe a picture** — parked, no grading possible without AI.
- **Grammar topics** — 3 new programs (Adjectives; Motion prefixes; Time & quantity); nasals parked.
- **Purpose of the check** — gap analysis with advice, not a score.
- **Free vs Premium** — check is free (first run); "Work on mistakes" tabs and retakes are Premium;
  free users get an upsell after the check. Practice categories stay free; grammar keeps its rules.
- **Check content** — auto-assembled, ~15 tasks, different each run, every task tagged with a topic.
- **Close the gaps** — generated fresh tasks for weak topics, no enrollment needed.
- **Recommendations** — grammar programs and Practice categories only.
- **Retake** — Premium only.
- **Build order** — widget + check from existing content first; formats after.
- **Success** — conversion and engagement, both measured by SQL on existing tables.

## Precedents
- `plans/improvements/implemented/IMPLEMENTED-plan_55-56_bento-effort-radar.md` — the effort radar
  on home; the widget sits directly above it (moved from "under" at the #62a prototype review, 2026-10-09) and follows its card style and mobile stacking.
- `plans/improvements/implemented/IMPLEMENTED-plan_60_grammar-choice-and-retry.md` — grammar task
  generation (`grammar_service.get_lesson_tasks`, multiple choice on Basic); reused to generate
  check tasks and "Close the gaps" lessons.
- `plans/improvements/implemented/IMPLEMENTED-phrase-assembly-both-directions.md` — the sentence
  builder already exists in Phrases, so it is not a new format here.

## Success check
- **Conversion:** share of free users who complete a knowledge check and buy Premium within 7 days
  (SQL over the check results + subscriptions).
- **Engagement:** share of new users who complete a check; number of "Close the gaps" lessons
  completed by Premium users.
- Screenshots of all 3 widget states, RU + EN, desktop + 375px.

## Open questions
Settled in `plan_62a`: topic tagging, "weak" (not > 75%, 2 tasks per topic), the 16-task mix, the
latest check drives the tabs, "Close the gaps" saves like remind (streak yes, quota no — Premium only),
and the widget shows for brand-new users too.

Still open:
- **Photos for #62e** — how many of the ~30 the user can take; the rest come from Commons with credits.
- **`numbers-03-time` table cell** «dvylikta → dvylikos» looks like a typo for «dvyliktos» — the user
  decides during #62h's article update.
