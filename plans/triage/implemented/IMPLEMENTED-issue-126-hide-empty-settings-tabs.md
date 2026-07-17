# Issue #126 — /dashboard/settings/

**Reported:** 2026-06-16 16:20:02
**Status:** open
**Description:** надо скрыть табы сетингов где ничего нет. а то чтото не очень выглядит (hide settings tabs that have no content — looks bad)

## Root cause

The `tabs` array in `frontend/app/dashboard/settings/page.tsx` (lines 87-93) unconditionally includes all 5 tabs: vocabulary, grammar, practice, phrases, other. However the render logic only has actual UI for `vocabulary`, `phrases`, and `other`. The `grammar` and `practice` tabs fall through to an empty placeholder branch (`tabEmptyPlaceholder` string). There is no grammar/practice settings content anywhere in the codebase.

## Fix plan

1. Open `frontend/app/dashboard/settings/page.tsx`.
2. On lines 87-93, remove the two entries for `grammar` and `practice` from the `tabs` array:

**Change from:**
```typescript
const tabs: { key: Tab; label: string }[] = [
  { key: 'vocabulary', label: tr.settings.tabVocabulary },
  { key: 'grammar', label: tr.settings.tabGrammar },
  { key: 'practice', label: tr.settings.tabPractice },
  { key: 'phrases', label: tr.settings.tabPhrases },
  { key: 'other', label: tr.settings.tabOther },
];
```

**Change to:**
```typescript
const tabs: { key: Tab; label: string }[] = [
  { key: 'vocabulary', label: tr.settings.tabVocabulary },
  { key: 'phrases', label: tr.settings.tabPhrases },
  { key: 'other', label: tr.settings.tabOther },
];
```

3. Keep the `Tab` type union (line 9) intact — no removal needed.
4. Leave translation keys `tabGrammar`, `tabPractice`, `tabEmptyPlaceholder` in i18n files for future use.

## Tests

1. Write a Playwright test in `frontend/tests/` that reproduces and verifies the fix for this issue.
2. Rebuild the frontend and restart the local server.
3. Run the new Playwright test and confirm it passes.
4. Leave the local server running so the user can manually verify the fix in the browser.

## Confirm resolution

Ask the user: "Issue #126 — hide settings tabs where there is nothing (grammar, practice). Mark as resolved?"
Only if the user confirms:
1. Run `UPDATE mistake_report SET status = 'resolved' WHERE id = 126;` and report success.
2. Move the plan file to `plans/triage/implemented/` and add the `IMPLEMENTED-` prefix (e.g. `issue-126-hide-empty-settings-tabs.md` → `plans/triage/implemented/IMPLEMENTED-issue-126-hide-empty-settings-tabs.md`).
