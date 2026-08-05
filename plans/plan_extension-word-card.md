# Plan: Extension card enrichment — base form, transcription, grammar, senses

## Execution model (user directive)

**Implementation: Sonnet subagent** (works through the checklist, flips checkboxes in `plans/plan_extension-word-card.md`).
**Code review: Fable** (this session) — reviews the full diff for correctness, parsing robustness, backward compatibility, and simplicity; applies fixes; runs validation.

> On approval this plan is copied to `plans/plan_extension-word-card.md` for live checkbox tracking.

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
