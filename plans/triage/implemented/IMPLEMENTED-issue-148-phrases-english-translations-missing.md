# Issue #148 — /dashboard/phrases/11

**Reported:** 2026-07-22 10:33:44
**Status:** open
**Description:** Website is in English but I see phrases only in Russian translation

## Root cause

Two independent defects compound on `/dashboard/phrases/11`.

**1. Data — program 11 was seeded without English at all.**
[seed_phrases.py](backend/seed_phrases.py) created program 11 (`title="Sékmės! A1.1 — Фразы"`, [seed_phrases.py:305](backend/seed_phrases.py#L305)). Its `CHAPTERS` data holds **2-tuples** `(lithuanian, russian)` only, and the insert loop at [seed_phrases.py:321-329](backend/seed_phrases.py#L321-L329) never sets `translation_en`. Program 12 ("Sékmės! A1.2") was created by a script **not in the repo** — no file contains its chapter titles and nothing in git history does either; it was seeded ad hoc, which is why only it has full coverage.

Verified against production: program 11 = 181 phrases, **0** with `translation_en`; program 12 = 377 / 377.

**2. Code — the phrase-program detail page has no language support whatsoever.**
[frontend/app/dashboard/phrases/[id]/page.tsx](frontend/app/dashboard/phrases/[id]/page.tsx) never imports `useT`/`useLang`. It renders `{phrase.translation}` unconditionally at [:224](frontend/app/dashboard/phrases/[id]/page.tsx#L224), the Russian `{program.title}` at [:123](frontend/app/dashboard/phrases/[id]/page.tsx#L123)/[:179](frontend/app/dashboard/phrases/[id]/page.tsx#L179), `{program.description}` at [:125](frontend/app/dashboard/phrases/[id]/page.tsx#L125), and every label is a hardcoded Russian literal (`← Назад к программам` [:116](frontend/app/dashboard/phrases/[id]/page.tsx#L116), `фраз` [:127](frontend/app/dashboard/phrases/[id]/page.tsx#L127), `Учить всё` [:133](frontend/app/dashboard/phrases/[id]/page.tsx#L133), `освоено/изучается/новых` [:146-148](frontend/app/dashboard/phrases/[id]/page.tsx#L146-L148), `Глава` [:178](frontend/app/dashboard/phrases/[id]/page.tsx#L178), `Фраза/Перевод/Уровень` [:212-214](frontend/app/dashboard/phrases/[id]/page.tsx#L212-L214), `STAGE_LABELS` [:29](frontend/app/dashboard/phrases/[id]/page.tsx#L29)). So even on program 12, where `translation_en` exists, this page shows Russian to EN users. This is the page the user reported.

The backend is fine: `GET /api/phrase-programs/{id}` returns both variants ([phrases.py:536-539](backend/routers/phrases.py#L536-L539)), as does `GET /api/phrase-programs` ([phrases.py:161-164](backend/routers/phrases.py#L161-L164)).

**Secondary issues found while tracing:**

- [frontend/app/dashboard/phrases/page.tsx](frontend/app/dashboard/phrases/page.tsx) (list page) *does* use `useT` ([:76](frontend/app/dashboard/phrases/page.tsx#L76)) but still prints the Russian `program.title` at [:507](frontend/app/dashboard/phrases/page.tsx#L507) and [:550](frontend/app/dashboard/phrases/page.tsx#L550).
- `chapter_title` is **English-only for both programs, in both languages**. [seed_phrases.py:320](backend/seed_phrases.py#L320) does `chapter_title = chapter.get("title_en", ...)`, discarding the Russian title. Confirmed in prod: chapters 1–21 are stored as `"Chapter 1: What is your name?"` etc. RU users therefore see English chapter headers. There is no `chapter_title_en` column.
- `GET /api/me/learned-phrases` returns only the Russian `program_title` ([phrases.py:940-941](backend/routers/phrases.py#L940-L941)); [phrases/vocabulary/page.tsx:204](frontend/app/dashboard/phrases/vocabulary/page.tsx#L204) renders it verbatim, so "My phrases" shows a Russian program name in EN mode.
- The `||`-fallback convention elsewhere is **correct as-is — do not change it to render blank**: [PhraseSession.tsx:201-202](frontend/app/dashboard/components/PhraseSession.tsx#L201-L202), [phrases/vocabulary/page.tsx:194](frontend/app/dashboard/phrases/vocabulary/page.tsx#L194), [MatchRound.tsx:32](frontend/app/dashboard/components/MatchRound.tsx#L32), [lists/[id]/page.tsx:119](frontend/app/dashboard/lists/[id]/page.tsx#L119). It was introduced deliberately by issue #117 (`plans/triage/implemented/IMPLEMENTED-issue-117-missing-en-translations-verbs.md`) because blank cells were worse than Russian. The remedy is to close the data gap and add a guard that detects gaps, not to remove the fallback.

## Fix plan

1. **Author the 181 English translations as a committed data module.** Follow [backend/scripts/verb_translations_en.py](backend/scripts/verb_translations_en.py) — a plain `TRANSLATIONS = {...}` dict, no API calls (no `ANTHROPIC_API_KEY` is available, and none is needed). Create `backend/scripts/phrase_translations_en_a11.py` keyed by the exact Lithuanian `text` from `CHAPTERS` in [seed_phrases.py](backend/seed_phrases.py). Note: `"Dar ko nors?"` appears twice in program 11 (180 distinct texts for 181 rows) — keying by text is fine, both rows get the same English. Positions run 0–181 with one gap, so do **not** align by index.
2. **Write an idempotent backfill script** `backend/scripts/backfill_phrase_translation_en.py`: load the dict, `SELECT * FROM phrase WHERE program_id = 11 AND translation_en IS NULL`, set `translation_en` from the dict by `text`, commit, and report any unmatched texts (must be zero). UPDATE only — never DELETE. **Do not re-run [seed_phrases.py](backend/seed_phrases.py) against production**: its `main()` ([:288-301](backend/seed_phrases.py#L288-L301)) deletes every `PhraseProgram` plus all `Phrase`, `UserPhraseProgress` and `UserPhraseProgramEnrollment` rows, wiping all users' phrase progress.
3. **Fix the seed source of truth** so the gap cannot reappear: convert `CHAPTERS` entries in [seed_phrases.py](backend/seed_phrases.py) to 3-tuples `(lt, ru, en)` (or import the new dict in the loop) and pass `translation_en=` at [:322-329](backend/seed_phrases.py#L322-L329).
4. **Internationalize [frontend/app/dashboard/phrases/[id]/page.tsx](frontend/app/dashboard/phrases/[id]/page.tsx)** — the actual user-visible fix:
   - Import `useT`, destructure `{ tr, lang, plural }`, reuse the existing `tr.phraseLists` namespace (it already has `chapter`, `statusLearned`, `statusInProgress`, `statusNew`, `masteredWord`, `learningWord`, `phrasesPlural`, `removeProgram` — see [en.ts](frontend/lib/i18n/en.ts) around lines 658-690).
   - [:224](frontend/app/dashboard/phrases/[id]/page.tsx#L224) → `lang === 'en' ? (phrase.translation_en || phrase.translation) : phrase.translation` (use `||`, not `??`, per the issue-117 note about empty strings).
   - [:123](frontend/app/dashboard/phrases/[id]/page.tsx#L123)/[:179](frontend/app/dashboard/phrases/[id]/page.tsx#L179) → prefer `title_en`; [:125](frontend/app/dashboard/phrases/[id]/page.tsx#L125) likewise for `description_en`.
   - Replace `STAGE_LABELS` ([:29](frontend/app/dashboard/phrases/[id]/page.tsx#L29)) and every hardcoded Russian literal with `tr` lookups; add missing keys to all three of [en.ts](frontend/lib/i18n/en.ts), [ru.ts](frontend/lib/i18n/ru.ts) and [types.ts](frontend/lib/i18n/types.ts) (types.ts is the shared interface — omit it and the build fails).
5. **Fix the list page**: [phrases/page.tsx:507](frontend/app/dashboard/phrases/page.tsx#L507) and [:550](frontend/app/dashboard/phrases/page.tsx#L550) should prefer `title_en` in EN mode.
6. **Fix "My phrases"**: add `"program_title_en": program.title_en if program else None` to the payload in [phrases.py](backend/routers/phrases.py#L941) around line 941, and consume it at [phrases/vocabulary/page.tsx:204](frontend/app/dashboard/phrases/vocabulary/page.tsx#L204).
7. **Chapter titles — separate, larger change; recommend as a follow-up unless the user wants it now.** Add a nullable `chapter_title_en` column to `Phrase` ([models.py:431](backend/models.py#L431)) via an alembic revision in `backend/migrations/versions/` (follow e.g. `d4e5f6a7b8c9_add_freq_rank_theme_to_verb.py`); move the current English values into `chapter_title_en`, backfill `chapter_title` with the Russian titles from `CHAPTERS` (program 11) and equivalents for program 12; expose it in the three phrase router payloads ([phrases.py:539](backend/routers/phrases.py#L539), [:942](backend/routers/phrases.py#L942), and the study endpoint); select by `lang` in the two frontend chapter headers. Without this, RU users keep seeing English chapter labels.
8. **Add a regression guard.** A backend test asserting every phrase in every public program has a non-null, non-empty `translation_en`, alongside `backend/tests/test_phrase_lists.py` — this turns the next missing-data incident into a failing test instead of a user report.

Order matters: step 4 alone would still show Russian on program 11 (via the fallback), and steps 1–2 alone would still show Russian because the page ignores `translation_en`. Both halves are required.

## Tests
1. Write a Playwright test in `frontend/tests/` that reproduces and verifies the fix for this issue — suggested `frontend/tests/issue-148-phrases-en-translation.spec.ts`, following `frontend/tests/lang-switch.spec.ts` and `frontend/tests/phrases.spec.ts`. Switch to EN, open `/dashboard/phrases/11`, assert the translation column contains English (no Cyrillic) and that the page chrome ("Phrase" / "Translation" / "Learn all") is English.
2. Rebuild the frontend and restart the local server.
3. Run the new Playwright test and confirm it passes.
4. Leave the local server running so the user can manually verify the fix in the browser.

## Confirm resolution
Ask the user: "Issue #148 — Website is in English but phrases on /dashboard/phrases/11 show only Russian translations. Mark as resolved?"
Only if the user confirms:
1. Run `UPDATE mistake_report SET status = 'resolved' WHERE id = 148;` and report success.
2. Move the plan file to `plans/triage/implemented/IMPLEMENTED-issue-148-phrases-english-translations-missing.md`.
