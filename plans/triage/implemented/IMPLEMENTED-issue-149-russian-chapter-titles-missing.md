# Issue #149 — /dashboard/phrases/

**Reported:** 2026-07-23 (opened as a follow-up split out of issue #148)
**Status:** open
**Description:** Chapter titles are stored English-only for both phrase programs, so Russian-language users see English chapter headers (e.g. "Chapter 1: What is your name?") on `/dashboard/phrases` and `/dashboard/phrases/[id]`. `seed_phrases.py` writes `chapter.title_en` into `chapter_title` and discards the Russian `title`; there is no `chapter_title_en` column.

## Root cause

[seed_phrases.py:320](backend/seed_phrases.py#L320) does:

```python
chapter_title = chapter.get("title_en", f"Chapter {chapter_num}")
```

The `CHAPTERS` data carries **both** a Russian `title` and an English `title_en` per chapter, but only the English one is persisted — into the single `chapter_title` column on `Phrase` ([models.py:431](backend/models.py#L431)). The Russian title is discarded at insert.

Confirmed in production: chapters 1–21 across both programs are stored as `"Chapter 1: What is your name?"`, `"Chapter 2: This is my friend"`, and so on. There is no `chapter_title_en` column, so there is nowhere to put the second variant and no way for the frontend to choose.

This is the mirror image of issue #148: there, English users saw Russian phrase translations; here, Russian users see English chapter headers. #148 fixed the translation column and internationalized the page chrome, but deliberately left this alone because it needs a schema change.

Affected render sites (both now correctly language-aware for *everything except* chapter titles, which have only one stored value to show):
- [phrases/[id]/page.tsx](frontend/app/dashboard/phrases/[id]/page.tsx) — chapter header
- [phrases/page.tsx](frontend/app/dashboard/phrases/page.tsx) — chapter rows in the expanded program card
- [phrases/vocabulary/page.tsx](frontend/app/dashboard/phrases/vocabulary/page.tsx) — `chapter_title` shown beside the program name

Note the fallback in `phrases/[id]/page.tsx` (`ch.title ?? tr.phraseLists.chapter.replace('{n}', …)`) only fires when `chapter_title` is NULL — it does not help here, because the column is populated, just always in English.

## Fix plan

1. **Add the column.** `chapter_title_en: Optional[str] = None` on `Phrase` ([models.py:431](backend/models.py#L431)), nullable so existing rows stay valid.
2. **Write an alembic revision** in `backend/migrations/versions/`, following the shape of `d4e5f6a7b8c9_add_freq_rank_theme_to_verb.py`. Schema change only — no data movement in the migration itself.
3. **Backfill, as a separate UPDATE-only script** (same pattern as [backfill_phrase_translation_en.py](backend/scripts/backfill_phrase_translation_en.py), which is the model to copy — idempotent, refuses to write on an unmapped row, `--dry-run` supported):
   - Copy the current `chapter_title` value into `chapter_title_en` for every row.
   - Overwrite `chapter_title` with the Russian `title` from `CHAPTERS` (program 11, keyed by chapter number).
   - Program 12's chapter titles are **not** in the repo — its seed script was never committed (see the #148 root cause). Its Russian chapter titles will have to be authored by hand into a small data module, or the script must leave program 12's `chapter_title` as-is and only populate `chapter_title_en`. Decide this before writing the script; do not guess translations for a textbook's chapter names.
   - Never re-run `seed_phrases.py` against production — its `main()` ([seed_phrases.py:288-301](backend/seed_phrases.py#L288-L301)) deletes every program plus all user progress.
4. **Fix the seed source** so the gap cannot reappear: pass both `chapter_title=chapter["title"]` and `chapter_title_en=chapter["title_en"]` at [seed_phrases.py:322-329](backend/seed_phrases.py#L322-L329).
5. **Expose it in the router payloads** — [phrases.py:539](backend/routers/phrases.py#L539) (program detail), [phrases.py:942](backend/routers/phrases.py#L942) (learned-phrases), and the study endpoint. Follow the `program_title_en` field added for #148.
6. **Select by language in the frontend**, using the same `lang === 'en' ? (x_en || x) : x` idiom established by #117/#148 — keep the fallback so a missing value shows the other language rather than a blank header.

## Tests
1. Write a Playwright test in `frontend/tests/` — suggested `issue-149-chapter-titles-i18n.spec.ts`, following [issue-148-phrases-en-translation.spec.ts](frontend/tests/issue-148-phrases-en-translation.spec.ts): mock the program payload with both title variants, assert RU mode shows the Russian chapter header and EN mode the English one, and that the fallback holds when `chapter_title_en` is null.
2. Extend `backend/tests/test_phrase_translations_en.py` (or add a sibling) with a data check that every chapter in `CHAPTERS` has both `title` and `title_en`.
3. Rebuild the frontend and restart the local server.
4. Run the new tests and confirm they pass.
5. Leave the local server running so the user can manually verify in the browser.

## Deploy note
This is the only queued change that requires a **schema migration**, so it is a different class of release than #147/#148. Ship it separately and run the alembic upgrade as part of that deploy.

## Confirm resolution
Ask the user: "Issue #149 — Russian users see English chapter titles on the phrases pages. Mark as resolved?"
Only if the user confirms:
1. Run `UPDATE mistake_report SET status = 'resolved' WHERE id = 149;` and report success.
2. Move the plan file to `plans/triage/implemented/IMPLEMENTED-issue-149-russian-chapter-titles-missing.md`.
