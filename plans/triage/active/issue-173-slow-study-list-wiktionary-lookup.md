---
kind: bugfix
status: done
iteration: 1
max_iterations: 16
suggested_model: sonnet
suggested_effort: medium
confirmed_model: sonnet
confirmed_effort: medium
---

# Issue #173 — /dashboard/lists/316/study

**Reported:** 2026-09-11 09:42:15
**Status:** open
**Description:** На открытие своего списка слов уходит около 20 секунд. Это много

## Root cause

> **CORRECTION (2026-09-11, during implementation).** The Wiktionary diagnosis below is
> **wrong** — it was the plausible-looking suspect, not the actual cost. Measured against the
> real database, Wiktionary responds in 0.7–1.3s and contributes almost nothing. The ~20s is
> **N+1 round trips to the remote Neon database**, and there were two independent ones:
>
> 1. **Two DB queries per word in `match_curated_verb()`** (`verb_lookup.py:133`) — an exact
>    `SELECT` on `Verb.infinitive` plus, inside `_curated_index()`, a `SELECT COUNT(*)` to
>    validate the cache, *on every single lookup*. The curated table is 358 static rows that
>    were already fully cached in memory; only the freshness poll wasn't. Measured on list 316
>    (56 words): 9.94s of exact queries + 10.00s of COUNT queries ≈ **20s, exactly the number
>    the user reported**.
> 2. **`expire_on_commit` after the enrichment commit** — `lazy_enrich_words()` commits, which
>    expires every `Word` object the caller just loaded; the very next statement serializes
>    those same rows, so SQLAlchemy silently re-SELECTs each one individually. Measured on list
>    178 (241 words): **42.98s** in the serialization loop alone. This one is *worse* than the
>    bug as originally reported and got worse still once fix #1 below started committing a
>    sentinel on every visit.
>
> Both are invisible in the source — no loop looks like it does I/O — which is why the triage
> pass blamed the one call that obviously does. Fixes and measurements are in
> `documentation/verb-principal-forms.md`. Original (incorrect) analysis kept below for the
> record.

`GET /api/lists/{id}/study` (`backend/routers/words.py:409`) calls `_list_words()`
(`words.py:187`), which unconditionally runs `verb_lookup.lazy_enrich_words()`
(`backend/verb_lookup.py:421`) over every word in the list on **every request**. List
316 is a personal list whose 56 words carry no `Word.hint` POS tag and don't match the
curated verb table, so every word looks "unenriched" to `lazy_enrich_word()`
(`verb_lookup.py:374`). Up to `wiktionary_budget` (default 3, `verb_lookup.py:429`) of
those words each trigger **two sequential** live HTTP calls to `en.wiktionary.org`
(`_wiktionary_pos_set()` + `wiktionary_verb_forms()`), each with a 4s timeout
(`_WIKTIONARY_TIMEOUT`, `verb_lookup.py:40`) — worst case 3 × 2 × 4s ≈ 24s of blocking
network I/O in the request path, matching the reported ~20s. Because a failed lookup
leaves `word.part_of_speech` as `NULL` forever (`lazy_enrich_word`'s only skip
condition is `part_of_speech is not None`, `verb_lookup.py:395`), this cost repeats on
**every single visit** to the list, indefinitely, for legal/constitutional vocabulary
that will never resolve on Wiktionary. This is a real, still-open regression from
commit `50d578a`'s lazy-enrichment design (it assumed most words would resolve quickly
or be hint-tagged; personal/non-curriculum lists defeat both assumptions).

`suggested_effort: medium` — root cause is precisely identified and the fix is a small,
well-contained change in one shared function (`verb_lookup.py`), but it touches a
network-timeout-sensitive code path used by 7 call sites and needs a careful
non-network-hitting regression test, so it's more than a one-line eager-load fix.

## Fix plan
- [x] 1. In `backend/verb_lookup.py`'s `lazy_enrich_word()`, when a live Wiktionary
      attempt is actually made (budget available, network path taken) and still
      resolves to no verb forms, persist a sentinel non-verb value (e.g.
      `word.part_of_speech = "unknown"`) instead of leaving it `NULL`, and return
      `True` so it's committed. This makes the existing `part_of_speech is not None`
      skip-gate correctly stop retrying a permanently-unresolvable word — the eternal
      per-visit cost is the primary bug.
- [x] 2. Bound worst-case latency added to a single request regardless of how many
      never-enriched words a list contains: lower the default `wiktionary_budget` in
      `lazy_enrich_words()` (currently 3) and/or add a wall-clock cutoff (e.g. stop
      attempting further Wiktionary lookups once ~3-4s have been spent in this call).
      Goal: cap one request's added latency to roughly one timeout window, not
      `budget × 2 calls × timeout`.
- [x] 3. Verify the shared fix covers all 7 call sites without per-caller changes:
      `backend/routers/words.py` (`_list_words`, and the review-queue builders around
      lines 804/858/900/942/1286) and `backend/routers/word_lists.py:262`
      (`/api/me/word-lists/{id}`) — all route through `lazy_enrich_word`/
      `lazy_enrich_words`.
- [x] 4. Confirm the sentinel value is safe everywhere `part_of_speech` is read:
      frontend `getVerbForms()` (`QuizSession.tsx:103`) only checks
      `verb_present_3p`/`verb_past_3p`; `_looks_like_verb()` (`verb_lookup.py:218`)
      checks substring `"verb"`; any exact `part_of_speech == 'verb'` filter (verb
      counts, etc.) is unaffected by a non-`"verb"` sentinel.
- [x] 5. Update `documentation/verb-principal-forms.md`'s "accepted tradeoff" paragraph
      (the one admitting a permanently-unresolvable word "costs one skipped/attempted
      lookup per view forever") to describe the corrected, bounded behavior.
- [ ] 6. (Optional follow-up, not required to close this ticket) Apply the same
      "stop retrying a permanent failure" fix to `backend/scripts/backfill_verb_forms.py`'s
      `part_of_speech IS NULL` filter for consistency — it's not in the hot request
      path so it's lower priority than the `/study` regression.

Added during implementation, once measurement showed the real root cause (see the correction
note above). These are what actually fixed the reported slowness:

- [x] 7. Kill the per-word DB round trips in `match_curated_verb()`: build both an exact
      lowercase-infinitive index and the accent-stripped one from the single cached table
      scan, and validate the cache's row count **once per `Session`** (via `session.info`)
      instead of once per lookup. A request is one session, so a 56-word list now costs one
      `COUNT` instead of 56 exact queries + 56 `COUNT`s. Tests that seed extra verbs still
      revalidate, because they open a fresh `Session` after seeding.
- [x] 8. Stop `lazy_enrich_words()`'s commit from expiring the caller's `Word` objects
      (`expire_on_commit` toggled off around that one commit). Every caller serializes those
      same rows immediately afterwards; the rows were just written from these very objects, so
      the in-memory state already matches the DB.

Measured effect (real database, `_list_words`): list 178 (241 words) **45.2s → 1.7s**; list
316, the list in the report (56 words) **21.3s → 1.7s**. Over HTTP, `GET /api/lists/178` went
from timing out past 60s to 1.8–4.0s.

## Tests
- [x] Add a backend regression test to `backend/tests/test_verb_lookup.py` (following
      its existing `real_wiktionary_verb_forms`/mocking conventions — never hits real
      Wiktionary, per that file's own header comment) that: seeds several `Word` rows
      with no `hint` and no curated match, monkeypatches `wiktionary_verb_forms`/
      `_wiktionary_pos_set` with call-counting mocks that always miss, runs
      `lazy_enrich_words()` once and asserts the call count is bounded (proves fix #2),
      then runs it again over the same words and asserts **zero** additional calls
      (proves fix #1 — the eternal-retry bug is gone).
- [x] Add a lightweight Playwright test `frontend/tests/issue-173-study-list-load.spec.ts`
      using the existing `mockStudy` helper (`frontend/tests/helpers/studyFlow.ts`) to
      confirm `/dashboard/lists/[id]/study` still renders correctly for a list of
      plain (non-verb) words with no `verb_present_3p`/`verb_past_3p` — a UI regression
      guard, since the real timing proof lives in the backend test above (a live
      Playwright hit against real Wiktionary would be slow/flaky and violates this
      repo's explicit "tests must never hit Wiktionary" convention).
- [x] Run: `cd backend && python -m pytest tests/test_verb_lookup.py -v`
- [x] Run: `cd frontend && npx playwright test tests/issue-173-study-list-load.spec.ts --reporter=list`

## Definition of Done

```bash
cd backend && python -m pytest tests/test_verb_lookup.py -v
cd frontend && npx playwright test --reporter=list
```

## Confirm resolution
Ask the user: "Issue #173 — На открытие своего списка слов уходит около 20 секунд. Это много. Mark as resolved?"
Only if the user confirms:
1. Run `UPDATE mistake_report SET status = 'resolved' WHERE id = 173;` and report success.
2. Move the plan file to `plans/triage/implemented/` and add the `IMPLEMENTED-` prefix.
