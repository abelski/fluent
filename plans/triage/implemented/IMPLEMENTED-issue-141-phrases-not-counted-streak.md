# Issue #141 — /

**Reported:** 2026-07-16 14:32:29
**Status:** open
**Description:** когда я учу фразы это не защитывается в серию
(Translation: "when I study phrases, it doesn't count toward the streak" — защитывается is a likely typo for "засчитывается" = "is counted/credited")

## Root cause

The streak/activity-calendar logic in `backend/routers/words.py` computes "studied
dates" by unioning three sources:

```python
# get_stats() ~lines 868-871
studied_dates: set = {p.last_seen.date() for p in all_progress}       # UserWordProgress
studied_dates |= {r.created_at.date() for r in grammar_results}        # GrammarLessonResult
studied_dates |= {p.last_seen.date() for p in phrase_progress}         # UserPhraseProgress (curated programs)
```

The same pattern is duplicated in `get_activity_calendar()` (~lines 920-928) for
the 28-day calendar grid on the landing page.

**Admin-curated phrase programs already count** (via `UserPhraseProgress`,
studied through `/dashboard/phrases/[id]/study`). The gap is the newer
**personal phrase lists** feature: its progress table, `UserCustomPhraseProgress`
(`backend/models.py:521-535`), correctly records `last_seen` on every study
answer (`backend/routers/phrase_lists.py:539`), but `words.py` never imports or
queries it — only `UserPhraseProgress` is referenced (import list at
`words.py:14`). So studying via the custom lists at
`/dashboard/phrases/lists/[id]/study` silently does not count toward the streak
or activity calendar.

This is a straightforward oversight: the streak logic (`git` commit `286846b`
"calerndar") was written after the custom-phrase-lists feature already existed
(`d0c44de` "Personal phrase lists"), and the two tables were never unioned.

**Related gap, not in scope for this fix:** `PracticeExamResult` (practice
tests) is imported in `words.py` but also never included in either union — same
"doesn't count" problem, worth a quick follow-up but flagged separately rather
than bundled in silently, since the report was specifically about phrases.

## Fix plan

1. `backend/routers/words.py:14` — add `UserCustomPhraseProgress` to the
   `from models import ...` line.
2. `backend/routers/words.py` `get_stats()` (~858-871) — query
   `UserCustomPhraseProgress` for the user (mirror the existing `phrase_progress`
   query) and union `{p.last_seen.date() for p in custom_phrase_progress}` into
   `studied_dates`.
3. `backend/routers/words.py` `get_activity_calendar()` (~920-928) — add a
   `custom_phrase_dates` set built the same way as `phrase_dates` but from
   `UserCustomPhraseProgress`, filtered by `window_start`, unioned into
   `active_dates`.
4. No DB migration/backfill needed — read-side query fix only.
   `UserCustomPhraseProgress.last_seen` timestamps already exist, so past days
   will retroactively show correctly once deployed.
5. Optional follow-up (confirm with user before bundling): also add
   `PracticeExamResult` into both unions for full "any study activity counts"
   consistency.

## Tests
1. Write a Playwright test in `frontend/tests/` that reproduces and verifies the fix for this issue (extend `frontend/tests/streak-calendar.spec.ts` if it exists — confirm today's streak/calendar reflects a custom-list study answer via `POST /api/me/phrase-lists/phrases/{id}/progress`).
2. Rebuild the frontend and restart the local server.
3. Run the new Playwright test and confirm it passes.
4. Leave the local server running so the user can manually verify the fix in the browser.

## Confirm resolution
Ask the user: "Issue #141 — когда я учу фразы это не защитывается в серию. Mark as resolved?"
Only if the user confirms:
1. Run `UPDATE mistake_report SET status = 'resolved' WHERE id = 141;` and report success.
2. Move the plan file to `plans/triage/implemented/` and add the `IMPLEMENTED-` prefix (`issue-141-phrases-not-counted-streak.md` → `plans/triage/implemented/IMPLEMENTED-issue-141-phrases-not-counted-streak.md`).
