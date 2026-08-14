# Plan: Mobile usability fixes across the dashboard

## Context

Live-tested the app at a 375×812 mobile viewport (iPhone SE/mini width) using a real logged-in
account (real data, not empty/mock state) across the 5 top-nav pages (Слова, Фразы, Грамматика,
Практика, Статьи), the logged-in home page, the hamburger nav, a create-list modal, and an actual
quiz/study session. Found 5 concrete, reproducible mobile issues — two are outright bugs (invalid
HTML causing a React hydration warning, and touch targets roughly half the recommended minimum
size), three are layout/CSS issues that visibly break or cramp the UI at narrow widths. All were
confirmed either via console errors, `getBoundingClientRect()` measurements, or screenshots — not
guessed.

Not tested in this pass: the 640–1000px "orphan wrap" zone the design system doc already
documents as a known danger zone, tablet widths generally, and landscape orientation. Out of
scope here; flag as a follow-up if the user wants that covered too.

## Issues found (ranked by severity)

### 1. Nested `<button>` inside `<button>` in 4 accordion headers (bug, not just cosmetic)

Every "expand this group" header in Слова/Фразы/Грамматика is a clickable `<button
onClick={toggle} aria-expanded=...>` that also wraps a second, real `<button>` for a
delete/unenroll icon (with `onClick={(e) => { e.stopPropagation(); ... }}`). A `<button>` cannot
legally contain another `<button>` — this is invalid HTML, React logs "In HTML, `<button>` cannot
be a descendant of `<button>`. This will cause a hydration error" on every one of these pages, and
in real (non-React) DOM terms the nested interactive elements create an ambiguous/overlapping tap
target — exactly the kind of thing that misfires on touch.

Confirmed locations (outer header button → nested delete/unenroll button):
- `frontend/app/dashboard/lists/page.tsx:473-545` → nested delete at `527-537`
- `frontend/app/dashboard/lists/page.tsx:642-677` → nested delete at `659-669`
- `frontend/app/dashboard/phrases/page.tsx:492-526` → nested delete at `509-518`
- `frontend/app/dashboard/grammar/page.tsx:386-414` → nested unenroll at `399-406`

No shared "accordion row" component exists — `lists/page.tsx` and `phrases/page.tsx` duplicate
this JSX near-verbatim; `grammar/page.tsx` has its own parallel version. There's also no existing
"clickable div" idiom anywhere in the codebase (`grep -rn 'role="button"'` across `frontend/`
returns nothing) to copy from — the fix introduces that idiom for the first time.

**Fix**: at each of the 4 locations, change the outer element from `<button onClick={...}
aria-expanded={...} className="...">` to `<div role="button" tabIndex={0} onClick={...}
onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } }}
aria-expanded={...} className="...">` — keep every existing class and the `aria-expanded`
attribute unchanged, just the tag + the added `tabIndex`/`onKeyDown` for keyboard parity. The
nested delete/unenroll `<button>` stays exactly as-is (a real button is correct there — it's the
innermost interactive element).

### 2. Icon-only touch targets are ~half the recommended minimum (bug)

Measured live via `getBoundingClientRect()` on `/dashboard/lists` at 375px width:

| Element | Size | Recommended min |
| --- | --- | --- |
| "Удалить"/"Удалить список" delete icon buttons | **22×22px** | 44×44px |
| Accordion chevron "toggle" button | **22×22px** | 44×44px |
| "Учить"/"Открыть"/"Редактировать" link-buttons | 34px tall | 44px |

The delete/toggle icons render a 14px SVG with only `p-1` (4px) padding, landing at 22×22 — well
under Apple HIG / WCAG 2.5.5's 44×44 guidance, and small enough to mis-tap next to a real word/list
title on a phone. This affects the same delete/chevron buttons touched in fix #1, plus the "Мои
списки" toggle chevron at `lists/page.tsx:313` and phrases' equivalents.

**Fix**: give these icon-only buttons an explicit `min-w-11 min-h-11 flex items-center
justify-center` (44×44px hit area) instead of relying on `p-1` around the SVG — the icon itself
stays visually 14px, only the tappable area grows. Apply to the delete-icon buttons and the
chevron-toggle buttons identified above, in `lists/page.tsx`, `phrases/page.tsx`, and
`grammar/page.tsx`. The `sm`/`lg` "Учить"/"Открыть"/"Редактировать" pill buttons (34px tall) are
lower priority — flagging but not fixing in this pass, since bumping every pill button's height
site-wide is a bigger visual change than this plan's scope; can be a fast follow if the user wants
it.

### 3. `ProgressStatCard` hero doesn't stack on mobile → wrapped, cramped buttons

This is the shared hero-card component (`frontend/app/dashboard/components/ProgressStatCard.tsx`)
used at the top of **all four** of Слова, Фразы, Грамматика, Практика. It's `flex items-center
gap-4` (icon/mascot + content, side by side) with no mobile stacking. At 375px, the 128px mascot +
gap eats most of the width, leaving ~180-200px for the count/badge/buttons/`nextMilestone` block —
confirmed via screenshots on Слова and Фразы: button labels wrap mid-word ("Повторить" / "фразы"
on two lines; "Напомни что я" / "мог забыть" on two lines), and the "Далее / A2" next-milestone
label floats cramped in the top-right corner.

Because this is one shared component, fixing it once fixes the hero card on all 4 pages — this is
the highest-leverage fix in this plan.

**Fix**: `ProgressStatCard.tsx:64-65` — change the outer container from `flex items-center gap-4
sm:gap-6` to stack on mobile and go row-wise from `sm:` up: `flex flex-col sm:flex-row sm:items-center
gap-4 sm:gap-6`. The icon/mascot (currently first child, `items-center`-aligned) should sit above
the content on mobile; on mobile the `nextMilestone` block (currently `text-right shrink-0`,
last child of the flex row) needs to move out of the squeezed inline position — reposition it as
an `absolute top-4 right-4 sm:static sm:text-right sm:shrink-0` corner label on mobile (mirroring
the existing `absolute top-0 right-0` "Done" badge idiom already used elsewhere, e.g.
`lists/page.tsx:565`), reverting to its normal inline position at `sm:` and up. Verify against
real content on both Слова (short button labels) and Фразы (long button labels, the tightest
case) after the change.

### 4. Grammar subcategory row: stat text wraps into 3 stacked lines

`frontend/app/dashboard/grammar/page.tsx:109-120` — the subcategory accordion header is `flex
items-center justify-between` with the title on the left (`flex-wrap`, can grow) and a stat
`<span>` on the right holding `"{passedCount}/{total} {уровня} ▾"` with no `shrink-0` or
`whitespace-nowrap`. Screenshot at 375px shows this wrapping into 3 separate lines ("3/3" /
"уровня" / "▾") on several rows — reads as broken, not just tight.

**Fix**: add `shrink-0 whitespace-nowrap` to the stat `<span>` at line 110 so it never wraps
internally. If the title is long enough that the two blocks can't both fit on one line at 375px,
let the header row itself wrap (`flex-wrap` on the button's own className, `gap-y-1`) so the stat
block drops to its own line below the title instead of squeezing/wrapping inside itself. Since
this is the same `justify-between` two-block header shape used by the other accordion headers
touched in fix #1 (`lists/page.tsx`, `phrases/page.tsx`), apply the same `shrink-0
whitespace-nowrap` defensively to their stat spans too while in this code, in case a long custom
list/program title ever triggers the same wrap.

### 5. Articles category-pill track becomes a misshapen "stadium" when it wraps to 2 rows

`frontend/app/dashboard/articles/ArticlesList.tsx:78` — the category filter (`Все` / `Учебные
материалы` / `Адаптация в Литве` / `Блог`) uses the shared segmented-pill recipe: `flex flex-wrap
items-center gap-1 bg-[#f2f3f3] rounded-full p-1`. That recipe (documented in the component
library as the nav-tabs/RU-EN-switch pattern) assumes a single row — `rounded-full` on a
container is a clean pill only when it's one row tall. On mobile these 4 filters wrap to 2 rows,
and the `rounded-full` container becomes a tall, oddly-rounded stadium shape wrapping both rows —
confirmed via screenshot.

**Fix**: keep the pill look intact instead of letting it wrap: drop `flex-wrap`, add
`overflow-x-auto` (plus a scrollbar-hiding utility, matching common mobile filter-chip UX) so the
4 category pills become a horizontally-scrollable single-row strip on narrow screens instead of
wrapping. Each pill button gets `shrink-0 whitespace-nowrap` so it can't itself compress. This
preserves the shared `rounded-full` pill recipe everywhere it's used (nothing about the nav tabs
or language switch changes) rather than introducing a wrap-only variant of it.

### 6. (Minor, optional) Star-level difficulty tooltip is hover-only — invisible on touch

`frontend/app/dashboard/components/StarLevelToggle.tsx:77` — the tooltip explaining what the
current difficulty star level means (`★ — Простые слова (одна форма)`) only shows via
`group-hover:opacity-100`. Touch devices have no hover, so mobile users can change the difficulty
level but never see what it means. Low-effort fix: also show it on `active:opacity-100` (native
`:active` fires briefly on tap) so a tap gives a momentary flash of the explanation, same as a
hover would. Including this since it's a one-line change while already in this file's design
territory, but marking it optional — happy to drop it if the user wants a tighter scope.

## Implementation

- [x] 1. `lists/page.tsx:473-545` — convert outer accordion `<button>` to `<div role="button"
      tabIndex={0} onClick=... onKeyDown=...>`, keep nested delete button as-is.
- [x] 2. `lists/page.tsx:642-677` — same conversion for the custom-enrollment group header.
- [x] 3. `phrases/page.tsx:492-526` — same conversion for the enrolled-program accordion header.
- [x] 4. `grammar/page.tsx:386-414` — same conversion for the grammar category accordion header.
      Also converted the `SubcategoryGroup` header (`grammar/page.tsx:83-121`), same anti-pattern
      (nested `<a>` instead of `<button>`) found in the same file while implementing #7.
- [x] 5. Bumped delete-icon and chevron-toggle buttons touched above (plus
      `lists/page.tsx:313`/`369` and phrases' equivalents) to a `min-w-11 min-h-11 flex
      items-center justify-center` 44×44px hit area, icon glyph unchanged.
- [x] 6. `ProgressStatCard.tsx:64-136` — stacks icon-above-content below `sm:`, `nextMilestone`
      moved to an `absolute top-4 right-4` mobile corner label reverting to inline at `sm:` and
      up. Verified on Слова and Фразы (longest button labels) — no more mid-word wrapping.
- [x] 7. `grammar/page.tsx:109-120` — added `shrink-0 whitespace-nowrap` to the subcategory stat
      span and `flex-wrap gap-y-1` to the header so it drops to two lines instead of wrapping the
      stat text internally. Applied the same `whitespace-nowrap` defensively to the equivalent
      stat spans in `lists/page.tsx` (custom-enrollment header) and `phrases/page.tsx` (program
      header).
- [x] 8. `ArticlesList.tsx:78-89` — category pill track: dropped `flex-wrap`, added
      `overflow-x-auto no-scrollbar` (new utility in `globals.css`), `shrink-0 whitespace-nowrap`
      per pill. Verified scrollable (475px content in a 343px track) with the pill shape intact.
- [x] 9. `StarLevelToggle.tsx:77` — added `group-active:opacity-100` alongside the existing
      `group-hover:opacity-100` for a tap-flash on touch devices.
- [x] 10. Updated `documentation/design system/Component Library (as-built).html` — new Principles
      bullets for the 44×44 touch-target minimum and the accordion `role="button"` div pattern,
      a `ProgressStatCard` section note on mobile stacking, and a new Deliberate-deviations row
      for the articles pill scroll behavior.
- [x] 11. Logged the change in `documentation/CHANGELOG.md` as `#1`.

## Validation

- [x] `cd frontend && npx playwright test --reporter=list` — 393 passed, 25 failed. Verified via
      `git stash` that all 25 fail identically against the unmodified baseline (confirmed for the
      5 re-run in isolation: `stats-card-alignment.spec.ts` premium-banner tests and
      `seo-public-pages.spec.ts` redirect tests fail the same way with none of this plan's edits
      applied) — pre-existing, unrelated to this change. None of the 25 touch the accordion
      headers, `ProgressStatCard`, or the touch-target buttons this plan modified.
- [x] `cd frontend && npx playwright test design-system-parity.spec.ts` — 12/12 passed.
- [x] Manual: resized to 375×812 and re-visited Слова, Фразы, Грамматика, Статьи — confirmed: no
      hydration warning in the console on any of the 3 accordion pages (Слова/Фразы/Грамматика);
      delete/toggle icon buttons no longer appear in a `getBoundingClientRect()` sub-44px scan
      (only text/pill links remain under 44px, out of scope per item 5); hero card mascot stacks
      above content with no wrapped button text on both Слова and Фразы; grammar subcategory
      stat text ("3/3 уровня ‹") stays on one line on every row; articles category pills scroll
      horizontally (475px content in a 343px track) instead of wrapping into a stadium shape.
