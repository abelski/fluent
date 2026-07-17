# Issue #125 — /dashboard/settings/

**Reported:** 2026-06-10 22:35:06
**Status:** open
**Description:** In https://fluent.lt/dashboard/settings/ Phrases, both the top lines show Russian when in EN. Also I saw some other places in the flash cards when in EN mode it shows some Russian words still.

## Root cause

Three distinct layers of hardcoded Russian strings that bypass the i18n system:

**Layer 1 — Settings page Phrases tab (the specific issue reported):**
In `frontend/app/dashboard/settings/page.tsx` ~lines 320–322, the first control in the Phrases tab uses hardcoded Russian strings ("Фраз за сессию", "Сколько фраз показывать в одной сессии изучения") instead of `tr.settings.*` keys. All other controls in the same tab correctly use the translation system.

**Layer 2 — Settings page error messages and timer unit:**
Error messages (~lines 39, 55, 76) are hardcoded Russian. The timer seconds unit `с` (~lines 277, 290, 291, 464, 476, 477) is the Russian abbreviation — should be `s` in EN.

**Layer 3 — PhraseSession flashcard component:**
`frontend/app/dashboard/components/PhraseSession.tsx` has ~29 hardcoded Russian strings for all UI labels (stage headers, buttons, feedback messages, placeholders). The component imports `useT` and uses `lang` for phrase translation direction, but never uses `tr.*` for its own UI text.

## Fix plan

1. **Add new i18n keys to `frontend/lib/i18n/types.ts`:**
   - In the `settings` block: `phrasesSessionSizeLabel`, `phrasesSessionSizeHint`, `loadError`, `saveError`, `phrasesSaveError`, `timerSecondsUnit`
   - Add a new top-level `phraseSession` block with keys: `sessionDone`, `correctLabel`, `errorsLabel`, `repeatBtn`, `backToPrograms`, `practiceWord`, `checkBtn`, `correctNowWrite`, `tryAgainBtn`, `notQuiteTryAgain`, `newPhrase`, `hardBtn`, `gotItBtn`, `selectWordLabel`, `typeWordLabel`, `typePhraseLabel`, `wordPlaceholder`, `phrasePlaceholder`, `showAnswer`, `hideAnswer`, `checkPhraseBtn`, `correctPhrase`, `gotItNextBtn`, `nextBtn`, `notQuite`

2. **Add English values to `frontend/lib/i18n/en.ts`:**
   - `settings.phrasesSessionSizeLabel`: `'Phrases per session'`
   - `settings.phrasesSessionSizeHint`: `'How many phrases to show in one study session'`
   - `settings.loadError`: `'Failed to load settings'`
   - `settings.saveError`: `'Failed to save settings'`
   - `settings.phrasesSaveError`: `'Failed to save phrase settings'`
   - `settings.timerSecondsUnit`: `'s'`
   - Full `phraseSession` block with English labels

3. **Add Russian values to `frontend/lib/i18n/ru.ts`:**
   - `settings.phrasesSessionSizeLabel`: `'Фраз за сессию'`
   - `settings.phrasesSessionSizeHint`: `'Сколько фраз показывать в одной сессии изучения'`
   - `settings.loadError`: `'Не удалось загрузить настройки'`
   - `settings.saveError`: `'Не удалось сохранить настройки'`
   - `settings.phrasesSaveError`: `'Не удалось сохранить настройки фраз'`
   - `settings.timerSecondsUnit`: `'с'`
   - Full `phraseSession` block with Russian labels

4. **Fix `frontend/app/dashboard/settings/page.tsx`:**
   - Replace the two hardcoded Russian label strings (~lines 320–322) with `tr.settings.phrasesSessionSizeLabel` and `tr.settings.phrasesSessionSizeHint`
   - Replace error message strings (~lines 39, 55, 76) with `tr.settings.loadError`, `tr.settings.phrasesSaveError`, `tr.settings.saveError`
   - Replace `'с'` timer unit (~lines 277, 290, 291, 464, 476, 477) with `tr.settings.timerSecondsUnit`

5. **Fix `frontend/app/dashboard/components/PhraseSession.tsx`:**
   - Replace all ~29 hardcoded Russian strings with `tr.phraseSession.*` equivalents:
     - `'Сессия завершена!'` → `tr.phraseSession.sessionDone`
     - `'Правильно'` → `tr.phraseSession.correctLabel`
     - `'Ошибки'` → `tr.phraseSession.errorsLabel`
     - `'Ещё раз'` → `tr.phraseSession.repeatBtn`
     - `'← Назад к программам'` → `tr.phraseSession.backToPrograms`
     - `'Отработайте слово'` → `tr.phraseSession.practiceWord`
     - `'Проверить →'` → `tr.phraseSession.checkBtn`
     - `'Правильно! ✓ Теперь напишите всю фразу.'` → `tr.phraseSession.correctNowWrite`
     - `'Не совсем — попробуйте ещё раз'` → `tr.phraseSession.notQuiteTryAgain`
     - `'Новая фраза'` → `tr.phraseSession.newPhrase`
     - `'Сложно'` → `tr.phraseSession.hardBtn`
     - `'Запомнил →'` → `tr.phraseSession.gotItBtn`
     - `'Выберите слово'` → `tr.phraseSession.selectWordLabel`
     - `'Не совсем. Правильный ответ:'` → `tr.phraseSession.notQuite`
     - `'Понял, дальше →'` → `tr.phraseSession.gotItNextBtn`
     - `'Напишите слово'` → `tr.phraseSession.typeWordLabel`
     - `placeholder="Введите пропущенное слово..."` → `placeholder={tr.phraseSession.wordPlaceholder}`
     - `'Правильно! ✓'` → `tr.phraseSession.correctPhrase`
     - `'Дальше →'` → `tr.phraseSession.nextBtn`
     - `'Напишите фразу'` → `tr.phraseSession.typePhraseLabel`
     - `placeholder="Напишите фразу по-литовски..."` → `placeholder={tr.phraseSession.phrasePlaceholder}`
     - `'Скрыть'` / `'Показать ответ'` → `tr.phraseSession.hideAnswer` / `tr.phraseSession.showAnswer`
     - `'Проверить →'` (phrase check) → `tr.phraseSession.checkPhraseBtn`

## Tests
1. Write a Playwright test in `frontend/tests/` that reproduces and verifies the fix for this issue:
   - Switch language to EN
   - Navigate to `/dashboard/settings/`
   - Click the Phrases tab
   - Assert the first two labels are in English (not Russian)
2. Rebuild the frontend and restart the local server.
3. Run the new Playwright test and confirm it passes.
4. Leave the local server running so the user can manually verify the fix in the browser.

## Confirm resolution
Ask the user: "Issue #125 — Settings page Phrases tab shows Russian labels in EN mode, and flash cards have untranslated Russian strings. Mark as resolved?"
Only if the user confirms:
1. Run `UPDATE mistake_report SET status = 'resolved' WHERE id = 125;` and report success.
2. Move the plan file to `plans/triage/implemented/` and add the `IMPLEMENTED-` prefix (e.g. `issue-125-settings-phrases-russian-in-en.md` → `plans/triage/implemented/IMPLEMENTED-issue-125-settings-phrases-russian-in-en.md`).
