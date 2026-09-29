---
number: 55
slug: practice-articles-bento
status: confirmed
---

# Idea #55 — Practice and Articles in the grammar bento layout

## Problem
#53 moved `/dashboard/grammar` to hero → chips → bento → topic cards. The other top-nav pages
still use the old layouts, so the product surface no longer reads as one (CLAUDE.md: the 5
top-nav pages are one surface). Practice has its own problems: guests are bounced to `/login`
without seeing what's there, a test takes two screens to start (category page → list → test),
the 33 Constitution tests are one long list, and Premium on a test is enforced only by the
frontend (`specs/practice.md`: "premium gating on a test is enforced only by the frontend"),
which breaks the repo rule that all validation is server-side. Articles is a flat card grid
with no way to browse by subject.

A static prototype was built first: `temp_files/prototypes/plan_55_practice-articles-bento.html`
(artifact https://claude.ai/artifact/PnLVeczEA9xhAtV6AXodFu), plan
`plans/improvements/active/plan_55_practice-articles-bento-prototype.md`.

## Desired outcome
**Practice** (`/dashboard/practice`): hero («Практика», "N из M тестов сдано" + bar,
«Продолжить ›», a static sample exam question, TAK «Pasirinkime!») → chips (Все + one per
category with test count, dot on enrolled, «Все программы ›») → bento (featured = next test with
LT title, RU/EN title, question count, pass mark, best score, «Начать тест ›»; stack = other
categories with progress or «Добавить», plus a «Итоговый экзамен» card) → section cards (tests
grouped by an admin-set section; each test is a button that opens the test directly).
Guests see the same page as "no programs". Premium tests are refused by the server.

**Articles** (`/dashboard/articles`): hero («Статьи», "30 статей · 23 учебных", «Читать новую ›»,
a "Популярные темы" card with counts, TAK «Paskaitykime!») → category chips → bento (featured =
newest article, stack = next 3) → theme cards (articles grouped by an admin-set theme). Still
pre-rendered for SEO. No reading tracking.

## Proposed spec

### specs/practice.md
**Changed** — replaces "student lists practice categories"
```gherkin
Scenario: anyone lists practice categories
  Given any caller, authenticated or not
  When GET /practice/categories is called
  Then every category is returned with a published-test count
  And "enrolled" is false for an anonymous caller
  And tests with status "testing" or "draft" are not counted unless the caller is an admin
```

**Changed** — replaces "listing tests within a category with sequential lock"
```gherkin
Scenario: listing tests within a category with sequential lock
  Given any caller viewing a category's test list
  When GET /practice/categories/{category_id}/tests is called
  Then each test carries section_ru, section_en and is_final
  And for an authenticated user the sequential lock applies as before
    (first test unlocked; each later test locked until the previous one's best score
    meets that test's own pass_threshold) and best_score_pct is filled
  And for an anonymous caller only published tests are returned, all unlocked,
    best_score_pct null
  And a non-existent category_id returns 404
```

**Changed** — replaces "premium gating on a test is enforced only by the frontend"
```gherkin
Scenario: premium gating on a test is enforced by the server
  Given a test flagged is_premium = true and an authenticated user without active premium
    who is not an admin
  When GET /practice/tests/{test_id}/exam is called
  Then the response is 403 and no questions are returned
  And the dashboard shows the Premium screen with a /pricing link
  And a premium or admin user gets the exam as before
```

**New**
```gherkin
Scenario: practice page doubles as onboarding
  Given a user (logged in or anonymous) enrolled in no practice category
  When they open /dashboard/practice
  Then they are not redirected to /login
  And the hero shows "0" tests passed with an empty bar and «Начать с Конституции»
  And the featured card previews the first category (description, test count)
  And the other categories are stacked with a description and «Добавить»
  And the section cards show "what's inside" with test buttons disabled
  When an anonymous visitor presses «Начать с Конституции» or «Добавить»
  Then they are sent to /login
```

```gherkin
Scenario: practice featured card shows the next test
  Given the user is enrolled in at least one category and chip «Все» is selected
  Then the featured card shows the first test (in sort order) of the first enrolled category
    that is unlocked and not yet passed
  And its heading is the test title (LT), with the RU/EN title below it, the question
    count, the pass mark, the best score if attempted, and «Начать тест ›»
  And the hero «Продолжить ›» starts the same test
  And when nothing is left to continue, the featured card previews a category the user
    is not enrolled in, or a completion summary if every category is enrolled
```

```gherkin
Scenario: practice tests grouped into section cards
  Given a category's tests
  Then tests with the same section form one card, in test sort order, titled with the
    section (RU/EN, RU fallback)
  And a test with no section gets its own card
  And each test is a button showing ✓ when passed, the best % when attempted, a lock
    when locked, and "Premium" when premium and the user has no premium
  When an unlocked test button is pressed
  Then /dashboard/practice/{category_id}?test={test_id} opens and the test starts
    immediately (reading text first if the test has one)
  And after the result, «Назад» returns to /dashboard/practice
```

```gherkin
Scenario: final exam card
  Given an enrolled category has a test flagged is_final
  Then the stack shows a «Итоговый экзамен» card for it (title, question count, pass mark)
    that starts that test
```

```gherkin
Scenario: admin sets test section and final flag
  Given an admin editing a practice test
  Then they can set section_ru, section_en (optional text) and is_final (checkbox)
  And the values are validated server-side (section max 120 chars)
```

```gherkin
Scenario: removing a practice category from the page
  Given the user has selected a category they are enrolled in
  Then «Убрать» appears next to the sections heading
  When they press it and confirm
  Then DELETE /me/practice-categories/{id} is called and the category shows as not enrolled
```

### specs/articles.md
**Changed** — replaces "dashboard article list renders with SEO-friendly initial content"
```gherkin
Scenario: dashboard article list renders with SEO-friendly initial content
  Given a visitor loads /dashboard/articles
  When the static-exported page is served
  Then the hero, featured card, stack and theme cards are rendered from the article list
    embedded at build time (real links for crawlers), then refreshed client-side
  And the category chips (Все, learning_materials, adaptation, blog) with counts filter the
    loaded list client-side via ?category=, with no extra request per chip
```

**New**
```gherkin
Scenario: articles layout
  Given the article list is loaded
  Then the hero shows the total count, the learning-materials count and «Читать новую ›»
    linking to the newest article
  And the featured card is the newest article in the selected category, the stack the
    next three
  And the theme cards group the selected category's articles by theme, in a fixed theme
    order, with articles without a theme under «Другое»
  And the hero's "Популярные темы" card lists themes with counts and scrolls to that card
```

```gherkin
Scenario: admin sets an article theme
  Given an admin editing an article
  Then they can pick one theme from a fixed list (verbs, numbers, cases, words, life, start)
    or none
  And GET /articles returns the theme on each summary
  And a theme outside the list is rejected with 422
```

## Scope
- In: `/dashboard/practice` lesson list in the bento layout (all enrollment states + guest),
  direct test start via `?test=`, server-side Premium check on the exam endpoint, anonymous
  read of categories/tests, `section_ru/en` + `is_final` on practice tests, `theme` on
  articles (migrations + admin inputs + one-off fill script for current content),
  `/dashboard/articles` in the bento layout keeping build-time rendering, RU + EN, 375px,
  component library + parity spec, one change on one branch.
- Out (non-goals): reading tracking for articles; `/dashboard/practice/programs`; the
  category page's own test list (kept as is for old links); the exam/reading/result screens'
  look; Слова and Фразы pages; success metrics.

## Decisions
- **One change** — Practice and Articles in one plan and one branch (user chose over 55a/55b).
- **Practice guests** — preview like grammar: categories + tests readable without a token; enroll → `/login`.
- **Test grouping** — admin field "section" (RU/EN) on practice tests; filled for the Constitution by script; no section = own card.
- **Article grouping** — admin field "theme" from a fixed list; filled for the 30 articles by script; none → «Другое».
- **Articles hero** — counter + «Читать новую», no bar; reading is not tracked at all.
- **Practice hero sample** — static question («Kokia yra Lietuvos sostinė?»), hidden on mobile, like grammar's declension table.
- **Premium** — fixed server-side in this change: exam endpoint returns 403 for premium tests without premium (admins pass).
- **Final exam card** — kept; new admin flag `is_final` on the test.
- **Test start** — button opens `/dashboard/practice/{id}?test={testId}` and starts at once; back goes to `/dashboard/practice`.
- **Unenroll** — «Убрать» next to the sections heading with a confirm dialog (same as #53).
- **Look** — exactly #53's: tokens, 32px/700 headings, hero is the recorded deliberate deviation, now shared by 3 pages.
- **Metric** — not measured.

## Precedents
- `plans/improvements/implemented/IMPLEMENTED-plan_53_grammar-bento.md` — the layout, states, confirm dialog, mocked-API tests and screenshot spec; reuse `GrammarOverview.tsx` patterns (extract shared pieces where two pages need the same thing).
- `plans/improvements/implemented/IMPLEMENTED-plan_10_premium-grammar-lesson-order.md` — server-side lock/premium bypass for grammar; same shape for the practice exam 403.
- `plans/improvements/implemented/IMPLEMENTED-plan_48b_en-db-content.md` (#48b) — additive nullable columns applied to prod first (local runs share the prod DB), content filled by a script that only fills empty fields, with a dry run.

## Success check
Not measured (user decision). Done means the Proposed spec scenarios pass as tests.

## Open questions
- Whether to extract shared bento components from `GrammarOverview.tsx` or copy — for sdlc-feature-analyst.
