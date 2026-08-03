# Plan: Bidirectional word-tile phrase assembly (stage-1 sub-steps)

> After approval this plan is copied to `plans/plan_phrase-assembly-both-directions.md` and checkboxes are updated live during implementation.

## Context

The user wants a Duolingo-style word-tile exercise (assemble a sentence from shuffled tiles) in the phrase-learning flow, in **both directions** — assemble the Lithuanian phrase from its translation, and assemble the translation (in the user's UI language) from the Lithuanian phrase — positioned **between "show phrase" (stage 0) and "fill-word" (stage 1)**, for both admin phrase programs and user custom lists. Tile pool = only the answer's words, shuffled (no decoys).

Exploration findings that shape the design:

- A one-direction (to-Lithuanian) assemble step **already exists** (issue #145) as a client-side sub-step of stage 2, in the shared component `frontend/app/dashboard/components/PhraseSession.tsx:989-1084`, with server-side tile generation `_word_tiles()` in `backend/routers/phrases.py:82-98` (returns `null` for ≤3-word phrases).
- DB `lesson_stage` integers (0=new, 1=fill-word, 2=type-full) are hardcoded in ~20 backend sites (stage_distribution keys, leaderboard SQL, learned filters, validation tuples, tests). **Renumbering stages is not worth the risk.**

**Design:** keep DB stages 0/1/2 untouched. Implement both assembly directions as client-side sub-steps at the **start of stage 1** (exact UX the user chose), and **move** the existing stage-2 assemble there so it isn't duplicated. Stage 1 becomes: assemble-from-LT → assemble-to-LT → MCQ → type-word; stage 2 returns to pure typed recall. All three study surfaces (programs, custom lists, review) share `PhraseSession`, so one component change covers everything. No audio/TTS work (none exists in the app; the screenshot's speaker buttons are from another app).

Direction rules:
- **from-LT**: prompt = Lithuanian text; tiles = translation words in user's lang (`translation_en` for EN users, falling back to RU — same rule as existing `getTranslation`). Wrong answer sends no `mistake_word` (RU/EN words would pollute `mistake_words_json`, which feeds Lithuanian blank-word selection).
- **to-LT**: prompt = translation; tiles = Lithuanian `word_tiles` (existing mechanic, incl. `firstMisplacedWord` mistake reporting).
- A direction is skipped when its tiles are `null` (≤3 words); both null → straight to MCQ (today's behavior).

Grading stays client-side with server-recorded quality/SM-2 — the existing pattern for all phrase exercises; progress API is unchanged.

## Implementation

- [x] 1. `backend/routers/phrases.py` — add `"translation_tiles": _word_tiles(p.translation)` and `"translation_en_tiles": _word_tiles(p.translation_en) if p.translation_en else None` to the study payload dicts at :725-736 (program study) and :832-843 (review); update `_word_tiles` docstring (now serves stage-1 assembly, both directions).
- [x] 2. `backend/routers/phrase_lists.py` — same two fields in the custom-list study payload at :508-519 (`_word_tiles` already imported).
- [x] 3. `frontend/lib/api.ts` — add `translation_tiles: string[] | null` and `translation_en_tiles: string[] | null` to `PhraseStudyItem` (:499-510); refresh the `word_tiles` comment.
- [x] 4. `frontend/lib/i18n/types.ts` + `ru.ts` + `en.ts` — add to `phraseSession`: `assembleTranslationLabel` (RU «Соберите перевод из слов» / EN "Assemble the translation from the words") and `assembleCorrect` (RU «Правильно! ✓» / EN "Correct! ✓"). Keep `assembleLabel` (to-LT header) and `correctNowWrite` (still used by syllable drill).
- [x] 5. `PhraseSession.tsx` — types & state: `Stage1Step = 'assemble_from_lt' | 'assemble_to_lt' | 'mcq' | 'type'` (:153); delete `Stage2Step` (:155-158) and the `stage2Step` state (:224). Add component-level helpers `translationTiles(p)` (lang-aware, mirrors `getTranslation`, `?? null` guard) and `firstStage1Step(p)` (`assemble_from_lt` if translation tiles, else `assemble_to_lt` if `word_tiles`, else `mcq`); use it in the `stage1Step` initializer for `phrases[0]`.
- [x] 6. `PhraseSession.tsx` — reset effect (:286-300): `setStage1Step(mode === 'gap_retry' ? 'type' : firstStage1Step(phrase))`; drop the `setStage2Step` line.
- [x] 7. `PhraseSession.tsx` — timer: drop `stage2Step` from start/reset deps (:275); in timeout effect (:315-337) stage-1 branch mark `assembleResult('wrong')` for the two assemble sub-steps, stage-2 falls through to `setTypeResult('wrong')`; fix deps.
- [x] 8. `PhraseSession.tsx` — Enter/Space handler (:340-406): delete the stage-2 assemble branch (:380-387); add stage-1 assemble-wrong branch — to-LT: `advanceQueue(1, firstMisplacedWord(...))`; from-LT: `advanceQueue(1)` (no mistake_word, no syllable drill); remove `stage2Step` from deps.
- [x] 9. `PhraseSession.tsx` — move the assemble UI (:989-1084) into the stage-1 branch (before MCQ), parameterized per direction: to-LT `{tiles: word_tiles, prompt: getTranslation, target: text, altTexts: alt_texts, label: assembleLabel, testid: phrase-session-stage1-assemble-to-lt}`; from-LT `{tiles: translationTiles(p), prompt: text, target: getTranslation, altTexts: null, label: assembleTranslationLabel, testid: phrase-session-stage1-assemble-from-lt}`. Keep `assembled-row`/`tile-pool` testids and index-based `assembled: number[]` (duplicate words). Correct path: clear assembled/result, advance `assemble_from_lt` → (`assemble_to_lt` | `mcq`), `assemble_to_lt` → `mcq` (no progress POST between sub-steps). Correct feedback uses `assembleCorrect`; wrong feedback shows the direction's `target`, not hardcoded `phrase.text`. Render only when `tiles.length > 0`, else fall through to MCQ.
- [x] 10. `PhraseSession.tsx` — stage-2 cleanup: remove leftover assemble rendering/`tiles` const; textarea focus effect (:306-308) no longer checks `stage2Step`; update header/stage comments to describe the new flow.
- [x] 11. `backend/tests/test_phrase_lists.py` — extend the word-tiles test (:231-249): long phrase → `translation_tiles` is a permutation of the RU translation's words; 2-word translation → `None`; no EN translation → `translation_en_tiles is None`.
- [x] 12. `backend/tests/test_phrase_content_i18n.py` — new test: program phrase with `translation_en` → study payload has both tile fields shuffled-complete; also assert on `GET /api/phrases/review` payload (covers all 3 endpoints).
- [x] 13. `frontend/tests/issue-145-assemble-phrase.spec.ts` — rewrite in place against stage 1 (keep #145 traceability note): RU user sees from-LT first → correct → to-LT → correct → MCQ; wrong to-LT POSTs `mistake_word`, wrong from-LT POSTs none (capture via `page.route`); tile return-to-pool; asymmetric tiles (`word_tiles: null` → from-LT only → MCQ; both null → MCQ); regression: `lesson_stage: 2` phrase goes straight to the textarea (no assemble).

## Validation

- [x] Backend unit: `cd backend && .venv/bin/python -m pytest tests/ -q` — 140 passed
- [x] Frontend: `cd frontend && npm run build` (typecheck via `npx tsc --noEmit` — no new errors; `npm run lint` prompted an interactive ESLint setup wizard in this env, skipped)
- [x] Restart local server (backend serves fresh static export on :8000 with `DEV=false`), verified login + navigation/header/footer intact
- [x] Playwright full suite: `cd frontend && npx playwright test` — 344 passed; the same 5 tests fail both before and after this change (confirmed against a stashed baseline build) — pre-existing, unrelated
- [x] Manual smoke (real browser, disposable throwaway account, cleaned up after): from-LT assembly shown first with LT prompt + RU tiles → correct → to-LT assembly with RU prompt + LT tiles → correct → MCQ. Nav/header/footer intact.
- [x] Edge cases: covered by Playwright spec (≤3-word direction skipped, both-null → straight to MCQ, duplicate words via index-based state)
- [ ] News post written and published via /news-writer

## Notes / risks checked

- Review page and custom-list study use the same component + updated endpoints — no page changes.
- `MatchRound`, quick-lesson early stop, requeue policy (`gap_retry` ×2 + `full_retake` on stage-1 mistakes) all unchanged; `full_retake` renders as stage 2 (now pure typing).
- Old mocks/payloads without the new fields → `undefined ?? null` → assembly skipped gracefully.
- `checkPhrase(..., 'hard')` on Cyrillic/English tile joins is safe (normalizeLt is a no-op there; no decoys → exact join).

## Follow-up: gap_retry now re-runs assembly (requested after initial ship)

Per explicit follow-up request: on a stage-1 mistake, the `gap_retry` re-queue previously skipped straight to typing the blanked word, bypassing assembly and MCQ entirely. Changed so `gap_retry` now re-runs the assembly sub-step(s) first (still always skipping MCQ), landing on typing last — so getting a stage-1 question wrong shows the tile exercise again on the retry instead of hiding it.

- [x] `PhraseSession.tsx` — added `firstGapRetryStep(p)` (mirrors `firstStage1Step` but falls back to `'type'`, not `'mcq'`, when a phrase has no tiles in either direction — preserves "gap_retry never shows MCQ").
- [x] Reset effect: `gap_retry` now initializes via `firstGapRetryStep(phrase)` instead of hardcoded `'type'`.
- [x] Assembly correct-transition: the terminal fallback after finishing assembly is now `current.mode === 'gap_retry' ? 'type' : 'mcq'` (was unconditionally `'mcq'`).
- [x] Playwright: updated "wrong to-LT assembly" test to drive through the re-shown assembly steps before asserting the typing step; added a new test confirming a no-tiles phrase's `gap_retry` still skips straight to typing (regression guard for the fallback).
- [x] Full validation re-run: backend 140 passed; Playwright 344 passed (same 5 pre-existing unrelated failures, one additional flaky-under-load test in `navigation.spec.ts` confirmed to pass in isolation); frontend rebuilt and local server restarted.

## Follow-up 2: extend the drill to stage-2 (already-learned) mistakes too

User clarified after testing: they expected this on mistakes on phrases they've already learned (stage 2), not just stage-1. Stage 2 mistakes previously used a plain "retype the full phrase again" retry with no assembly at all — by original design, since assembly was scoped to stage 1. Extended so a stage-2 mistake also re-drills via assembly first, then falls through to the real stage-2 full-phrase retype (not stage-1's blanked-word typing).

- [x] New `QueueMode` value `'stage2_retry'`, created by the stage-2-specific mistake branch in `advanceQueue` (previously stage 0 and 2 mistakes shared one generic "normal retry" branch; split so stage 2 gets `stage2_retry` and stage 0 keeps the old simple retry).
- [x] `isDone` fixed to also finish the phrase when a `stage2_retry` exhausts its retry cap (previously only checked for `mode === 'normal'`).
- [x] Reset effect: `stage2_retry` initializes via the same `firstGapRetryStep(phrase)` helper as `gap_retry` (assemble → assemble → type, never MCQ).
- [x] The assembly sub-step block was extracted out of the `if (s === 1)` wrapper into its own top-level gate — `(s === 1 || current.mode === 'stage2_retry')` — so it also runs ahead of the stage-2 render (`s` stays 2 for `stage2_retry`, nothing is faked; once assembly finishes and `stage1Step` becomes `'type'`, execution falls through past the untouched `if (s === 1)` block straight to the existing stage-2 typing UI).
- [x] Fixed two latent bugs this surfaced: the timer-timeout "mark wrong" effect and the Enter/Space handler's assembly-wrong branch were both gated on `stage === 1` / local `s === 1`, which is false for `stage2_retry` (whose real `lesson_stage` is 2) — both now check `stage1Step` directly instead.
- [x] Playwright: new test driving a stage-2 phrase through "Forgot" → continue → assemble-from-LT → assemble-to-LT → back to the stage-2 textarea (not MCQ, not stage-1's blank-word UI).
- [x] Full validation re-run: backend 140 passed; Playwright 345 passed (same pre-existing failures); reproduced live in the real running app with a disposable throwaway account (created, tested, then fully deleted) — confirmed the exact flow: stage-2 phrase → "Забыл" → wrong feedback → continue → assemble-from-LT → assemble-to-LT → back to full-phrase retype.

## Follow-up 3: redesign the stage2_retry sequence per explicit spec

User corrected the desired sequence (in Russian): after a mistake in the full-phrase typing, they want (1) assemble the Lithuanian phrase from fragments — **only this direction, not the translation**, (2) fill the blank (MCQ + type — not skipped), (3) repeat of the final phrase typing. Follow-up 2's version (assemble both directions, skip straight to retype) didn't match this — redesigned:

- [x] `firstStage2RetryStep(p)`: starts at `'assemble_to_lt'` (only, when `word_tiles` exist) or `'mcq'` — never `'assemble_from_lt'`, never skips MCQ.
- [x] New `Stage1Step` value `'final_retype'`: reached only by `stage2_retry` after successfully typing the blanked word; signals "now fall through to the real stage-2 full-phrase retype" rather than ending the card.
- [x] The `if (s === 1)` gate extended to `s === 1 || (current.mode === 'stage2_retry' && stage1Step !== 'final_retype')` — runs the assemble/MCQ/type-blank-word UI for `stage2_retry` too, but excludes `'final_retype'` so it falls through to the untouched stage-2 typing block below.
- [x] `mcqOptions` memo extended to compute for `current.mode === 'stage2_retry'` too (was gated on `lesson_stage === 1` only, which is false for stage2_retry — would have rendered an empty options grid).
- [x] The blank-word-type "correct" handler (button click and Enter key) now branches: `stage2_retry` → clear `typeResult`/`typeInput`, set `stage1Step('final_retype')`; everything else → `advanceQueue(5)` as before (gap_retry unchanged — still skips straight to typing, never shows MCQ, per original follow-up 1 design).
- [x] Simplified the timer "mark wrong" and Enter/Space handler's full-phrase-typing branch, which had been implicitly relying on `stage === 1`/`s === 1` to disambiguate blank-word-typing from full-phrase-typing — both now key off `stage1Step` (`'mcq'` / `'type'` vs `'final_retype'`) directly, since `stage2_retry` breaks the old assumption that `lesson_stage` alone identifies which UI is showing.
- [x] Playwright: rewrote the stage2_retry test for the new sequence (to-LT assembly only, asserts no from-LT step → MCQ shown and answered → type the blanked word → falls through to the real stage-2 textarea). Also had to update `issue-144-forgot-button.spec.ts`'s stage-2 test, whose old expectation ("mistake goes straight back to plain typing") no longer holds now that *every* stage-2 mistake drills through this sequence — updated to walk through MCQ → type → retype.
- [x] Full validation re-run: backend 140 passed; Playwright 346 passed (same 5 pre-existing unrelated failures). Reproduced live with a disposable throwaway account (created, tested, then fully deleted): confirmed visually that the retry now shows only the to-LT assembly step, followed by the MCQ step (previously skipped) and the type-the-word step — matching the requested sequence exactly. (Typing the blank word correctly to confirm the final fall-through to the retype screen was verified via the automated Playwright test rather than the live manual session, after an input-injection quirk in the manual browser tool session made further live typing unreliable — the automated test exercises the identical code path.)

## Follow-up 4: remove the >3-word threshold — assembly on any length

User reported not seeing assembly after a mistake on "Ten gyvena draugai." / "Там живут друзья." — both exactly 3 words, so `_word_tiles()` correctly (by the original design) returned `None` for both directions, skipping assembly by design. User then explicitly said assembly should apply at any length, including 1-3 word phrases.

- [x] `backend/routers/phrases.py` — `_word_tiles()`: removed the `len(words) <= 3: return None` gate entirely; now only returns `None` for genuinely empty text (`not words`). A 1-word phrase yields a trivial single-tile "arrangement" (shuffle of one element is always itself — harmless, just a one-click confirm).
- [x] No frontend changes needed — `PhraseSession.tsx` already only checks tile-field truthiness (`tiles.length > 0`), with no independent word-count gate of its own; removing the backend threshold is sufficient to surface assembly everywhere.
- [x] Updated the two backend tests that had asserted `None` for 2-word phrases (`test_phrase_lists.py::test_study_word_tiles_for_any_length` — renamed from `..._for_long_phrases`; `test_phrase_content_i18n.py::test_study_payload_includes_translation_tiles_for_both_languages`) to instead assert shuffled tiles are returned for a 2-word phrase in both directions. `translation_en_tiles is None` assertions kept as-is where they test the *absence of an EN translation entirely* (a different, still-valid reason for `None`, unrelated to word count).
- [x] Backend suite: 140 passed. No frontend test changes needed — Playwright's existing `word_tiles: null` mock fixtures (`SHORT_PHRASE`, etc.) remain valid as defensive/graceful-degradation tests for a payload that lacks tiles for any reason, they just no longer reflect what the *live backend* would send for a 2-3 word phrase.
- [x] Restarted the backend to pick up the change (frontend was untouched, no rebuild needed). Verified live with a disposable throwaway account and a phrase list containing the user's exact reported phrase ("Ten gyvena draugai." = "Там живут друзья.") — confirmed via API the study payload now returns 3-element `word_tiles`/`translation_tiles` (previously `null`), and confirmed in the browser that the assemble screen ("Соберите перевод из слов") now renders for it.
