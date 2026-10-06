---
kind: bugfix
status: done
iteration: 1
max_iterations: 20
suggested_model: sonnet
suggested_effort: low
confirmed_model: sonnet
confirmed_effort: low
---

# Issue #183 — /dashboard/lists/

**Reported:** 2026-10-06 12:39:29
**Status:** open
**Description:** Можно ли сделать на страницах со списками слово "Готово" другим цветом? например синим

## Root cause
There is no shared "done" badge component. Every badge is inline Tailwind classes:

| File:line | Card | Text | Classes now |
|---|---|---|---|
| `frontend/app/dashboard/lists/page.tsx:579` | Program list card, corner tab | `tr.lists.doneBadge` "✓ Готово" | `bg-emerald-500 text-white` |
| `lists/page.tsx:720` | Custom-program card, corner tab | same | same |
| `lists/page.tsx:584`, `:725` | Star-level done tab | "★ Готово" | `bg-blue-500 text-white` (already blue) |
| `lists/page.tsx:367` | "Мои списки" card pill | **hardcoded `✓ Done`** | `bg-emerald-500 text-white` |
| `frontend/app/dashboard/phrases/page.tsx:427` | My phrase list pill | **hardcoded `✓ Done`** | same |
| `phrases/page.tsx:576` | Phrase chapter card tab | **hardcoded `✓ Done`** | same |

Why the user notices it:
1. White 12px text on stock `emerald-500` is about 2.5:1 contrast, so it fails WCAG AA. It also isn't the design-system green (`emerald-600` #0f9d68).
2. It blends into the green progress bar (`emerald-500`) and the green "Учить" button on the same card.
3. "★ Готово" is already blue, so the same word shows in two colours on one page.
4. Side bug: badges at :367, phrases :427 and :576 are hardcoded English, so RU users see "✓ Done".

Grammar, practice and articles have no done badge. `design-system-parity.spec.ts` doesn't cover badges.

Suggested model/effort: sonnet / low. Reason: class swaps plus i18n in 2 files, plus doc, spec and test edits. The colour choice is made in this plan.

## Spec impact
Not described yet. Add to `specs/lists.md` under a new `### Dashboard list cards` heading:

```gherkin
Scenario: A fully learned list shows a blue, localised "Done" badge
  Given a student has "known" status on every word in a list
  When they open /dashboard/lists
  Then the list card shows "✓ Готово" (RU) / "✓ Done" (EN)
  And the badge is solid blue (blue-600) with white text, distinct from the green progress bar
  And a list complete only at the current star level shows a light-blue "★ Готово" badge instead

Scenario: A fully learned personal list shows the same localised badge
  Given a student's own word list has every word known
  When they view "Мои списки" in Russian
  Then the card shows "✓ Готово" (not "✓ Done") in the same blue badge
```

Add the matching scenario to `specs/phrases.md`: a fully mastered chapter card or My phrase list card shows a blue "✓ Готово" / "✓ Done".

## Fix plan
- [x] 1. `lists/page.tsx:579`, `:720`, `:367`: change `bg-emerald-500` to `bg-blue-600`. At `:367`, replace the literal `✓ Done` with `{tr.lists.doneBadge}`.
- [x] 2. `lists/page.tsx:584`, `:725`: change `bg-blue-500 text-white` to `bg-blue-50 text-blue-700`. The tint reads as "partial" and the solid badge as "complete". Both pass AA.
- [x] 3. `phrases/page.tsx:427`, `:576`: change `bg-emerald-500` to `bg-blue-600`, and replace `✓ Done` with `{tr.lists.doneBadge}`.
- [x] 4. Add `data-testid="done-badge"` / `data-testid="star-done-badge"` to these badges.
- [x] 5. `documentation/design system/Component Library (as-built).html`: add a "Deliberate deviations" row. Text: done badges use stock blue so they don't merge with the green progress bar and Study button (#183), and they pass AA where white on emerald-500 didn't. Also add a short "Done badges" note near the card tokens section.
- [x] 6. Add the scenarios above to `specs/lists.md` and `specs/phrases.md`.
- [x] 7. Run `cd frontend && npx playwright test tests/design-system-parity.spec.ts --reporter=list`.

## Review
- [x] Code review passed (round 1)
- note: reviewer flagged the missing Playwright spec; that is the ## Tests step below, not a code defect.

## Tests
- [x] Write `frontend/tests/issue-183-done-badge-color.spec.ts`. Follow the issue-171 spec pattern: a fake JWT plus `page.route` mocks. Mock lists that are fully known, star-level done, and a fully known personal list, plus one fully mastered phrase chapter. At 375px and 1280px, in RU and EN, check:
  - badge text is `✓ Готово` / `✓ Done`
  - full done background is `rgb(37, 99, 235)`
  - star-done background is `rgb(239, 246, 255)`
  - the personal list pill shows `✓ Готово` in RU

  Save screenshots to `temp_files/screenshots/issue-183-done-badge-blue-color/`.
- [x] Run it: `cd frontend && npx playwright test tests/issue-183-done-badge-color.spec.ts --reporter=list`

## Definition of Done

```bash
cd frontend && npx playwright test --reporter=list
```

- Both languages (RU + EN) checked
- Mobile at 375px checked
- Screenshots of each in `temp_files/screenshots/issue-183-done-badge-blue-color/`

## Confirm resolution
Ask the user: "Issue #183 — make 'Готово' on list pages blue. Mark as resolved?"
Only if the user confirms:
1. Run `UPDATE mistake_report SET status = 'resolved' WHERE id = 183;` and report success.
2. Move this file to `plans/triage/implemented/IMPLEMENTED-issue-183-done-badge-blue-color.md`.
