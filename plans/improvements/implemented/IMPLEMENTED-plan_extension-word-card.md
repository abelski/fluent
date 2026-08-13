# Plan: Extension card enrichment — base form, transcription, grammar, senses

## Execution model (user directive)

**Implementation: Sonnet subagent** (works through the checklist, flips checkboxes in `plans/improvements/implemented/IMPLEMENTED-plan_extension-word-card.md`).
**Code review: Fable** (this session) — reviews the full diff for correctness, parsing robustness, backward compatibility, and simplicity; applies fixes; runs validation.

> On approval this plan is copied to `plans/improvements/implemented/IMPLEMENTED-plan_extension-word-card.md` for live checkbox tracking.

## Context

The extension card currently shows only the selected string and its translation. For inflected Lithuanian words (most words on real pages) learners want the dictionary form: select "namuose" → see **nãmas** (noun), "locative plural of namas", numbered sense translations — like a Wiktionary entry — and add the base form to learning. User confirmed: Wiktionary REST + simplemma fallback; stress-accent transcription (not IPA); Add defaults to base form with a toggle for the selected form; card = headword + italic grammar line + up to 3 numbered senses (no synonyms in v1).

## Architecture

- All parsing server-side in `backend/routers/extension.py`, module-level functions matching the existing `_mymemory_translate`/`_mymemory_cached` pattern (monkeypatch-able, success-only caches).
- **Two Wiktionary fetches max**: definition of the selected word; if it's a form-of entry ("locative plural of <a>nãmas</a>"), a second fetch for the lemma's senses. Both cached, so any other inflection of the same lemma later costs ≤1 call.
- **Response stays backward-compatible** (old installed zips keep working): existing fields `word/translation_en/translation_ru/source` unchanged; new nullable fields added: `base_form`, `base_form_accented`, `part_of_speech`, `grammar_note`, `senses` (≤3), `base_translation_en`, `base_translation_ru`. One improvement: if the selected form is untranslatable but the lemma is, return 200 with lemma translations mirrored in instead of 404.
- `base_form_accented` prefers DB `Word.accented` (`*syllable*` format, models.py:83) when the lemma is in DB, else the accented anchor text from Wiktionary (Unicode accents). Content script renders both formats (vanilla-JS port of `frontend/lib/renderAccented.tsx` semantics).
- Enrichment only for single-token selections; every failure degrades silently to today's card.
- simplemma (new pip dep, lazy-imported in `_simplemma_lemma`) used only when Wiktionary has nothing: fills `base_form` + base translations (via existing `_db_lookup`/`_mymemory_cached` on the lemma), no POS/senses.

## Implementation

- [x] 0. **Live API verification FIRST** (network was blocked during planning): curl `https://en.wiktionary.org/api/rest_v1/page/definition/namuose` and `/namas` with a User-Agent header — confirm the Lithuanian entries' location (assumed key "lt"; select by per-entry `language == "Lithuanian"` to be safe), the `form-of-definition` HTML shape, accented anchor text, 404 behavior. `pip install simplemma`, verify `lemmatize("namuose", lang="lt") == "namas"` and the lt data-pack size (drop the dep if huge). Adapt parsing below to reality.
- [x] 1. `backend/requirements.txt` — add `simplemma`.
- [x] 2. `backend/routers/extension.py` — extract `_db_lookup(word, session)` from the endpoint; add `_WIKTIONARY_CACHE` (success-only, clear >500), `_wiktionary_lookup(word)` (single HTTP fn, UA header, timeout 3.5s, None on any error; returns `{part_of_speech, senses[], form_of: {lemma, lemma_accented, description}|None}` — regex tag-strip + html.unescape), `_wiktionary_cached`, `_simplemma_lemma(word)` (lazy import, None on error/no-change), `_enrich(word, lang, session)` orchestrator per Architecture. Endpoint: run enrichment on both DB-hit and fallback paths (single-token only), merge fields, 404-softening.
- [x] 3. `extension/content.js` — `renderAccentedInto(el, text)` helper (`*syllable*` → highlighted span; plain text otherwise); headword uses `base_form_accented || base_form` when present; italic grammar line (`part_of_speech · grammar_note`); numbered sense lines when `senses` non-empty (plain divs, not `<ol>`); clamp height estimate ~200. Footer: Add button defaults to base payload (`Add "namas"`) when base_form differs from selection and has a translation; small toggle link `add "namuose" instead` swaps payloads. background.js/options.js unchanged.
- [x] 4. `extension/manifest.json` — bump version to 1.1.0 (read live by /extension page + zip filename — project convention).
- [x] 5. `backend/tests/test_extension.py` — extend with `patch.object(extension, "_wiktionary_lookup", ...)` fixtures (unique words per test — caches persist): inflected→full enrichment + 2 lookup calls; lemma word→senses, no grammar_note, 1 call; DB `accented` preferred over Wiktionary text; Wiktionary down + simplemma None→exact old behavior (nulls); simplemma fallback path→lemma MyMemory call, no senses; cache hit→no extra call, failure not cached; lemma-not-in-DB→MyMemory respects `lang`; 404-softening case; add-base-form is plain existing POST (one smoke assertion).
- [x] 6. Run `pytest tests/test_extension.py` then the full suite.

## Validation

- [x] Backend unit + full suite green (`backend/.venv/bin/python -m pytest -q`) — 37/37 in test_extension.py, 177/177 full suite
- [x] Live end-to-end: restart server, `curl /api/extension/translate?word=namuose` with a real token against real Wiktionary — verify base_form/grammar/senses in the payload — confirmed: `base_form:"namas"`, `base_form_accented:"*nam*as"` (from production DB), `part_of_speech:"Noun"`, `grammar_note:"locative plural of namas"`, 3 real senses, `base_translation_en:"house"`, `base_translation_ru:"дом"`
- [x] Old-client compatibility: plain DB-hit word (`namas`) returns identical `word/translation_en/translation_ru/source` values (`"namas"/"house"/"дом"/"db"`) as before, enrichment fields merged in alongside
- [x] Fable review pass (2026-08-04): no fixes required — parsing defensively selects by `language=="Lithuanian"`, caches success-only, card renders Wiktionary-derived text via textContent only (no innerHTML), toggle payload logic correct. Independent live check with a second inflected word (`kalbėjo` → `kalbėti`, "Verb · third-person singular past of kalbėti", DB accents `ka*lbėt*i`) confirmed end-to-end
- [x] Server restart done exactly per the given command; `/health` → 200; landing page → 200. Frontend genuinely untouched this round (`git status` shows only the 5 backend/extension files below) — no rebuild needed or performed. (Existing Playwright suite not re-run this round — no frontend/UI code changed, so nothing in scope could have regressed it; skipped per the plan's own note that no frontend changes were needed.)
- [ ] Manual extension smoke (user, real Chrome): reload unpacked → select inflected word on a Lithuanian page → accented headword, italic grammar line, numbered senses, `Add "lemma"` + toggle link; verify added Word rows for both toggle states; unknown word degrades to old card — **left for the user**, requires a real Chrome profile with the unpacked extension loaded
- [x] News post — skipped per user decision (2026-08-04)

## Follow-up: MyMemory retry + free Google fallback (2026-08-04)

Real-world smoke test found `nepavykti` (lt→ru) returning the English word "fail" via MyMemory instead of Russian text — a wrong-script data-quality bug, not a card-logic bug. Fixed with a user-approved "retry + free fallback" approach, no paid API keys:

- [x] `_mymemory_translate` retries once on genuine `httpx.RequestError` (network/timeout); HTTP-error responses and malformed JSON still fail immediately, as before.
- [x] New `_google_free_translate(word, langpair)` — Google Translate's free, keyless, unofficial endpoint (same one `googletrans` and similar tools use), used only as a fallback.
- [x] New `_is_valid_translation` — requires actual Cyrillic characters for `|ru` results (no equivalent check possible for `|en`, since Lithuanian/English share Latin script).
- [x] New `_translate_with_fallback` orchestrator: MyMemory first; Google fallback only if MyMemory's result is missing or fails the script check; returns `None` (not a wrong-script value) if both fail.
- [x] Renamed `_mymemory_cached` → `_translate_cached`, updated all 4 call sites (2 in `translate_word`, 2 in `_lemma_translations` — the actual path the bug was found through).
- [x] Tests: autouse fixture stubs `_google_free_translate` to `None` by default (existing 43 tests unaffected); 6 new tests including a direct regression test for the `nepavykti`/"fail" bug and a retry-vs-no-retry pair mocking `httpx.get` directly. 4 pre-existing tests had non-Cyrillic placeholder strings corrected to Cyrillic (legitimate fixture fix given the new script-validity check — verified by Fable review, no assertions weakened).
- [x] Fable review: code matches spec exactly, no fixes needed. Independently re-verified live (separate from the implementing agent's own report): `GET /api/extension/translate?word=nepavykti&lang=both` → `translation_ru: "потерпеть неудачу"` (was `"fail"`); inflected form `Nepavyko` → same fix via `base_translation_ru`; old DB-hit word (`namas`) unchanged.
- [x] Full suite: 183 passed (177 + 6 new), no regressions.

## Follow-up: gloss/headword grammatical mismatch fix (2026-08-05)

Real-world screenshot showed selecting "saugo" (3rd-person present, "guards/protects") upgrading the headword to base form "saugoti" but leaving the gloss line as "guards / protects · охраняет" (the inflected form's own translation) — grammatically mismatched with the infinitive headword. Investigated first (not assumed): queried the production DB directly and confirmed `base_translation_ru: "охранять/защищать"` was already correct — this was a pure card display bug, not a translation-quality or data bug.

- [x] `extension/content.js` — `hasBaseForm` predicate computed once in `showCard` (previously duplicated independently inside `renderFooter`), used both to pick the gloss line's source (`base_translation_*` vs `translation_*`) and passed into `renderFooter` for the Add-button default, so the two can never disagree about which form is "primary" for a card.
- [x] Fable review: diff matches spec exactly, single source of truth confirmed via grep (no duplicate `hasBaseForm` computation left in `renderFooter`). Mechanically simulated the exact fixed logic against the real live API response for `word=saugo` (not just read the diff) — confirms `body.textContent` now computes to `"to protect · охранять/защищать"` (was `"guards / protects · охраняет"`). `node --check` clean. No backend changes, no manifest bump (judged unnecessary for a display-only fix of this size).

## Risks

- Wiktionary REST shape assumptions — mitigated by step 0 and selecting by `language` field.
- Latency worst case (DB miss + 2 Wiktionary + MyMemory): 3.5s Wiktionary timeout keeps it tolerable; 4 caches make repeats fast; sync calls match existing style.
- Regex HTML parsing is brittle → every failure silently degrades to the current card.
- simplemma deploy size — checked in step 0, droppable.
- Multi-POS words: v1 takes the first Lithuanian entry only (commented).
# Plan: Cross-scope duplicate check, concurrent translate I/O, editable translation

## Execution model (user directive)

**Implementation: Sonnet subagent** (works through the checklist, flips checkboxes in `plans/improvements/implemented/IMPLEMENTED-plan_extension-word-card.md` under a new follow-up section).
**Code review: Opus subagent** — reviews the diff, independently re-measures performance and re-verifies duplicate detection live, applies fixes.

## Context

Real-world use of the extension surfaced three issues:
1. Adding a word only dedupes within the single target list — the same word can end up duplicated across the user's other personal lists, or added again even though they already have progress on it via a public curriculum list.
2. Translations are sometimes wrong (e.g. "Pundelis" → "Дюбель"/dowel instead of "bundle") in ways no automated sanity check can catch (valid script, wrong meaning) — the user needs to be able to correct it before saving.
3. The card is slow: measured live — a DB-hit word takes ~800ms (from an *unconditional* Wiktionary call even when the DB already has a clean answer), an inflected/uncached word takes ~2.9s (sequential Wiktionary → Wiktionary → MyMemory/Google calls), and every Add flow tacks on another ~880ms *after* translation finishes because the list-picker (`getLists`) is fetched sequentially, not in parallel.

User confirmed (AskUserQuestion): duplicate check should cover **personal lists AND public curriculum progress**; performance fix should include the **deeper concurrency rework**, not just the cheap wins.

## Design

### 1. Cross-scope duplicate check (`backend/routers/extension.py`)
New helper `_already_known(lithuanian, user, session) -> Optional[str]` (returns a human-readable location or `None`):
- Reuse `_personal_list_ids(user, session)` from `routers/word_lists.py:104-122` (already cross-imported in this file, e.g. `_next_position`, `_get_owned_list` at line 29) — query `WordList.title` joined through `WordListItem`→`Word` where `WordList.id IN personal_ids` and `lower(lithuanian)` matches.
- If no personal-list hit, check `UserWordProgress` (`models.py:97-123`) joined to `Word` where `user_id == user.id` and `lower(lithuanian)` matches (any status — having a progress row at all means they've already encountered it via some list they had access to).
- `add_extension_word` calls this **before** creating a new `Word` row, replacing the current single-target-list-only check (`extension.py:523-532`) — a broader hit always short-circuits to `{"already_added": True, "location": <str>}` without creating a duplicate, regardless of which `list_id` was requested. Response gains an optional `location` field (extension shows it in the button text, e.g. "Already in 'Pakuotės'"); old clients that ignore the field are unaffected.

### 2. Editable translation before adding (`extension/content.js`)
The gloss line (currently a read-only `<div>`) becomes small editable `<input>`s — one per active language (respecting the existing `lang` setting / whichever of `translation_en`/`translation_ru` is non-null), pre-filled with the current suggested text (same value the gloss shows today, already correctly base-vs-selected-aware after the prior gloss-mismatch fix). Senses stay read-only reference text, untouched.
- Inputs are created where the gloss currently renders in `showCard`, then passed into `renderFooter` (new parameter) so both the toggle-link handler (resets inputs to the newly-active form's defaults when switching base/selected) and the Add-button click handler (reads `.value` at click time instead of the static payload string) share the same elements.
- Only the translation is editable — the Lithuanian headword/lemma being added is not (out of scope; not requested).

### 3. Concurrent I/O in the translate endpoint (`backend/routers/extension.py`)
Key correctness constraint (verified via exploration): **the SQLModel `Session` is not thread-safe** — at most one concurrent branch may touch `session` at any parallelization point. Every other call in this file (`_mymemory_translate`, `_google_free_translate`, `_wiktionary_lookup`, the module-level dict caches) is either a pure HTTP call or a simple dict check-then-set (safe under the GIL for this use case — worst case on a race is one wasted duplicate external call, not corruption).

Small helper:
```python
def _run_parallel(*calls):
    """Run zero-arg callables concurrently (ThreadPoolExecutor), same-order results.
    Only for independent I/O with at most one call touching `session` — see module note."""
```
Applied at three points:
- **Skip enrichment entirely when already cheap**: in `_enrich`, when `db_word` exists, matches the word exactly, and `db_word.star == 1` (already the clean dictionary base form in Fluent's own DB — the common case for curriculum words), populate `base_form`/`base_form_accented` directly from `db_word` with **zero network calls**, instead of the current unconditional `_wiktionary_cached(word)` (line 356) that this measured at ~800ms.
- In `_enrich`'s form_of branch (`extension.py:383-396`): `_wiktionary_cached(lemma)` (senses, no session) and `_lemma_translations(lemma, lang, session)` (uses session) run via `_run_parallel` — safe, only one branch touches session.
- In `translate_word`'s no-`db_word` path (`extension.py:432-434`) and in `_lemma_translations`'s no-DB-hit path (`extension.py:326-329`): the independent EN/RU `_translate_cached` calls run via `_run_parallel` instead of sequentially.
- `_enrich(...)` itself (line 420) and the top-level EN/RU `_translate_cached` calls (lines 433-434) become one more `_run_parallel` group **only on the no-`db_word` path** (when `db_word` is found, `translate_word` returns immediately without calling `_translate_cached` at all — nothing to parallelize there) — this is the change that targets the measured ~2.9s inflected-word case, since today `_enrich` fully completes before the top-level translation even starts.

## Implementation

- [x] 1. `backend/routers/extension.py` — `_already_known` helper + wire into `add_extension_word`, replacing the single-list dedupe check; response gains `location`.
- [x] 2. `backend/routers/extension.py` — `_run_parallel` helper; apply at the three points in Design §3 (skip-when-cheap in `_enrich`, form_of branch, and the `_enrich`-vs-top-level-translation split in `translate_word` + `_lemma_translations`'s own EN/RU split). Explicit comment at each call site confirming which branch (if any) touches `session`.
- [x] 3. `extension/content.js` — editable translation inputs per Design §2; Add payload reads current input values; toggle handler resets them; `location` shown in the "already added" button state.
- [x] 4. `backend/tests/test_extension.py` — new tests: personal-other-list duplicate detected (no new Word created); public-progress duplicate detected (seed a `UserWordProgress` row); no match still creates normally; `location` present in the duplicate response. Re-verify all existing tests still pass unmodified (exploration confirmed none assert call order/threading, only counts/values — should be safe under the `_run_parallel` refactor, but must actually run, not just be assumed).
- [x] 5. `node --check extension/content.js`.
- [x] 6. Run `pytest tests/test_extension.py` then the full suite.

## Validation

- [x] Full backend suite green, no regressions from the concurrency refactor — 189 passed (183 + 6 net new), re-run 3x to rule out thread-timing flakiness, stable every time. Implementer's own live timing (not a substitute for the independent Opus re-time below): DB-hit word ~800ms → ~16ms (fast-path skip); inflected/uncached word (`kalbėjo`) sequential baseline reproduced at ~3.9s → 0.86s with the parallel `_enrich`-vs-translation split.
- [x] Opus thread-safety audit: no violations at any `_run_parallel` site — verified by call-chain trace AND an empirical lock-based probe (0.92s concurrent vs 2.05s sequential-equivalent with controlled stub delays, zero overlapping-session-access violations recorded). Also fixed 2 real bugs found during review: (1) `_already_known` was missing `Word.archived == False`, making archived words permanently un-re-addable; (2) the progress-branch fallback could leak another user's private list title into the API response — restricted to public-or-owned lists. Both covered by new regression tests. Manifest bumped 1.1.0→1.2.0.
- [x] Fable independently re-verified duplicate detection live against the real Neon DB (not pytest, not trusting Opus's own report at face value): cross-list dedupe confirmed — added a word via the default list, blocked when targeting a second personal list, `location: "From internet"`; `UserWordProgress`-only dedupe confirmed with "medis" (a public word never in any personal list) — `location` correctly showed the real public list title, no duplicate row created. First attempt at the progress test used a stale word_id from earlier in this conversation and gave a false negative — caught and corrected before drawing conclusions. Test artifacts and the temporary premium flag cleaned up afterward.
- [x] Fable independently re-timed live: found local Neon DB round-trip latency (~800-900ms per request just for auth+lookup, confirmed via `/api/me/quota` alone — an endpoint touching none of this round's code) dominates and masks the Wiktionary-skip win in THIS environment. This is an environment characteristic (this machine's network path to Neon), not a regression — `/health` (no DB) returns in 3ms, proving the app itself isn't slow. Opus's controlled synthetic benchmark is the reliable proof the concurrency mechanism works; production (Render↔Neon, presumably much lower latency) should show the real win more clearly than noisy local testing can. The `getLists` tail-latency fix (third original complaint) was never implemented this round — an omission in the approved plan's Implementation checklist, not the implementer's fault — flagged for the user to decide on.
- [ ] Manual extension smoke (user): edit a wrong suggested translation before clicking Add, confirm the corrected text is what gets saved (check the DB row or the list view) — left for the user, requires the unpacked extension in a real browser.
- [x] No git commits (per standing project rule).

## Follow-up: getLists sequential tail-latency fix (2026-08-05)

Third original performance complaint, missed from the prior round's Implementation checklist (a planning omission, not the implementer's) — user confirmed after review they wanted it fixed. `getLists` was fetched inside `renderFooter`, sequentially AFTER `Promise.all([getStatus, translate])` already resolved, adding the full ~880ms round trip as tail latency on every Add flow.

- [x] `extension/content.js` — `getLists` now fires in the same `Promise.all` as `getStatus`/`translate` (three-way concurrent start in `showCard`); resolved `listsResp` passed into `renderFooter` as a new parameter instead of being awaited there. Accepted tradeoff: non-premium/disconnected users now also fire a cheap `getLists` call they didn't before (unavoidable — premium status isn't known until `getStatus` resolves, and all three start together).
- [x] Opus review: correct, no bugs. Confirmed the old fetch-inside-renderFooter is fully deleted (not shadowed); graceful degradation intact (`sendMessage` never rejects, so a failed/malformed `listsResp` degrades exactly as before — the picker is just skipped); the extra call for disconnected users costs zero network (early `apiFetch` short-circuit on missing token) and for non-premium users is a cheap unguarded read returning `[]`; previously-reviewed editable-input logic (`glossInputs`, toggle, Add-button) untouched; genuinely concurrent (no `await` between `showCard` entry and the `Promise.all`). `node --check` clean.
- [x] Fable independently re-verified live: measured the same two calls (translate + getLists) run sequentially (3285ms) vs concurrently via `Promise.all` (1383ms) against the real server — ~2.4x reduction, confirming the fix is bounded by the slower call rather than the sum, as designed.
