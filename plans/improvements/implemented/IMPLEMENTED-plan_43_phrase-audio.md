---
kind: feature
status: done
iteration: 1
max_iterations: 30
suggested_model: sonnet
suggested_effort: medium
confirmed_model: sonnet
confirmed_effort: medium
---

# Plan #43 — Phrase audio (production)

## Context

Words already have TTS playback (`SpeakButton` → `GET /api/audio` → Azure `lt-LT-LeonasNeural`,
cached forever in Postgres `AudioClip`, gated Premium/admin — see `documentation/audio.md`).
Phrases had none. A prototype (this same plan file, `plan_43_phrase-audio.md`, prototype revision)
already built and hand-verified the feature end-to-end against the local dev server: it works.
**Most of the code below already exists, uncommitted, in the working tree** — this plan's job is
to production-harden it (tests, docs, changelog, one real pronunciation bug), not re-derive it.

What the prototype already did (verify, don't redo):
- `backend/routers/audio.py`: `max_length` raised 60→200; the word-only existence guard on cache
  miss now also accepts `Phrase.text` and `CustomPhrase.text` (`backend/models.py`), preserving the
  original anti-abuse intent (only synthesize text the app actually owns).
- `_respell()`/`_respell_map()` merge fixes from the existing `backend/data/pronunciation.json`
  (words) and a new, still-empty `backend/data/phrase_pronunciation.json` (phrases) — separate
  files per the user's explicit instruction, since this is a new feature with its own data that's
  expected to diverge from word-level fixes over time.
- `frontend/app/dashboard/phrases/[id]/page.tsx`: `SpeakButton`/`LockedSpeakButton` on each phrase
  row, gated by `useAudioState()`, exact pattern copied from
  `frontend/app/dashboard/lists/[id]/page.tsx:127-131`.
- `frontend/app/dashboard/components/PhraseSession.tsx` (shared by both
  `/dashboard/phrases/[id]/study` and `/dashboard/phrases/review`): the intro card (stage 0) gets
  the manual `SpeakButton`/`LockedSpeakButton` + `AudioPremiumPill` (locked upsell) +
  `AutoplayToggle`; all other stages (tile-assembly, MCQ, type-word, type-full-phrase) show the same
  `AutoplayToggle` (confirmed: **user wants it on every stage**, matching the word lesson's
  `QuizSession.tsx` UX, not simplified). Autoplay only fires once an answer/attempt is revealed
  (on `setMcqResult`/`setTypeResult`/`setAssembleResult`/"show answer"), never before — verified
  this doesn't spoil fill-in-the-blank exercises.
- Manually verified: real Azure clips generated and served for real DB phrases (seed programs,
  ~558 phrases, ~25k chars total — a one-time ~12% dent in the existing 200k/mo char cap, then
  served from `AudioClip` forever, same economics as words); anti-abuse 404 still rejects
  unrecognized text; RU/EN + 375px layouts checked for overlap across all 5 render paths — none
  found.

What's genuinely new in this plan (not in the prototype):
- **The "sumuštinio" stress fix, solved this session.** Stress diacritics (acute/grave/macron) do
  **not** affect this Azure voice's pronunciation at all — confirmed by A/B testing against the
  unmodified baseline, they sounded identical. The fix that worked is a real respelling: splitting
  the word after the stressed syllable, `"sumuštin"` → `"sumu štin"` (keyed on the root, not the
  full inflected form, so it also fixes `sumuštinis`/`sumuštinį`/etc. — same "root, not bare
  letter pair" rule used by the existing `siųsti` fix in `pronunciation.json`).
- Autotests (none exist yet for any of this).
- Docs (`documentation/audio.md`) and CHANGELOG entry.
- `design-system-parity.spec.ts` run (no shared-shell changes were made, but this is the explicit
  gate the repo's rules require after any change touching a shared component).

`suggested_model`/`suggested_effort`: **sonnet / medium** — almost all of the risky design
decisions (anti-abuse guard shape, autoplay-spoiler timing, separate pronunciation files) were
already made and hand-verified in the prototype; what's left is mechanical (tests mirroring
existing patterns, one JSON entry, doc/changelog prose). Nothing here touches auth, payments, or a
schema migration.

## Goals

- Any Premium/admin user can play audio for a phrase, either as a whole sentence with correct
  punctuation-driven intonation, from the phrase list page or any stage of a study/review session.
- Free users see the same locked-speaker + upsell-pill pattern already used for words, not a
  silently missing feature.
- Autoplay (existing `fluent_audio_autoplay` preference) works identically for phrases and words:
  visible everywhere, fires only once an answer is revealed.
- "sumuštinio" and its inflected forms pronounce correctly.
- **A `/tune-pronunciation` skill exists** so the next mispronunciation takes minutes, not a full
  session: it generates candidate respellings, plays them, asks which one is right, and writes the
  winning entry to the correct JSON file. The manual version of this loop took most of this
  session and re-derived the same dead ends (diacritics don't work) from scratch.
- The feature has the same test/doc/changelog coverage every other shipped feature in this repo has.

## Non-Goals

- No end-user-facing or admin UI for pronunciation fixes — the tuning skill is a developer tool
  run from Claude Code, and the fixes stay hand-reviewed JSON in the repo.
- The skill does not auto-decide which candidate is correct. Claude cannot hear audio; a human
  always picks. Any design that skips that is wrong.
- No batch/"play all phrases in a list" control — out of scope, not requested.
- No changes to the Azure voice, caching architecture, monthly caps, or locking — a phrase is just
  a longer string through the exact same pipeline as a word.
- No retroactive fix for other undiscovered mispronunciations — only "sumuštinio" is fixed here;
  future reports get their own `phrase_pronunciation.json` entries, no code change needed.

## Requirements

- `/api/audio` must accept any real `Phrase.text` or `CustomPhrase.text` (in addition to `Word`),
  reject anything else with 404, and keep `max_length=200`.
- `phrase_pronunciation.json` fixes must apply identically whether the matched text came from a
  seeded `Phrase` or a user's `CustomPhrase` (the respell step doesn't know or care which table
  matched — same as it doesn't distinguish word sources today).
- Autoplay must never play audio before an answer is revealed, on any of the 5 `PhraseSession`
  render paths.

### Standing constraints
- All validation must be server-side (never frontend-only) — already true: the `/api/audio` guard
  is the server-side check; the frontend only decides whether to *show* a button via
  `useAudioState()`, which is itself just UI polish, not the security boundary.
- If this plan touches markup, styling, or a component: read
  `documentation/design system/Component Library (as-built).html` and
  `documentation/IMPLEMENTATION.md` first, use named design tokens, and run
  `frontend/tests/design-system-parity.spec.ts` after any shared-shell/token change. This plan
  reuses `SpeakButton`/`LockedSpeakButton`/`AutoplayToggle`/`AudioPremiumPill` exactly as already
  specced for words — no new pattern, no design-system doc update needed, but the parity test
  still runs as the required gate.
- Add autotest coverage for the new feature and run the relevant suite(s) as part of Validation.

## Implementation

- [x] 1. `backend/routers/audio.py` — confirm/finish: `max_length=200`; cache-miss guard checks
      `Word.lithuanian` OR `Phrase.text` OR `CustomPhrase.text`, 404 `"Not recognized text."`
      otherwise; `_respell_map()` merges `pronunciation.json` + `phrase_pronunciation.json` by
      mtime-cached dict union.
- [x] 2. `backend/data/phrase_pronunciation.json` — create with one entry:
      `{"from": "sumuštin", "to": "sumu štin", "note": "Leonas misreads it; split after the
      stressed syllable fixes it — verified against sumuštinis/-io/-į"}`, same file shape as
      `pronunciation.json` (`about` + `fixes` array).
- [x] 3. `frontend/app/dashboard/phrases/[id]/page.tsx` — confirm the `SpeakButton`/
      `LockedSpeakButton` wiring on each phrase row (already present from the prototype).
- [x] 4. `frontend/app/dashboard/components/PhraseSession.tsx` — confirm `AutoplayToggle` on all
      5 render paths (stage 0 intro, assemble-tiles, MCQ, type-word, stage 2 type-phrase),
      `AudioPremiumPill`+manual `SpeakButton` on stage 0 only, and that every `playAudio()` call
      site fires only after `setMcqResult`/`setTypeResult`/`setAssembleResult`/show-answer, never
      before (already present from the prototype — this is a verification pass, not new code).
- [x] 5. `backend/tests/test_audio.py` — add cases: a real `Phrase.text` → 200 audio/mpeg; a real
      `CustomPhrase.text` → 200; unrecognized text → 404; a phrase longer than 60 but ≤200 chars is
      accepted (regression guard against the old limit). Follow existing fixtures/mocking pattern
      in this file (Azure call must be mocked — conftest already guards against real billing calls).
- [x] 6. New `frontend/tests/phrase-audio.spec.ts` — mirror the existing word-audio button spec:
      speaker button visible for a mocked-premium user on the phrase list page and on the
      `PhraseSession` intro card; locked icon + upsell pill for a mocked-free user; autoplay
      toggle present on at least one drill stage (assemble or MCQ). RU/EN × desktop/375px
      screenshots into `temp_files/screenshots/plan_43_phrase-audio/`, mocking `/api/me/quota` and
      `/api/audio` so no real Azure calls happen in CI.
- [x] 7. `documentation/audio.md` — add a section noting phrases now share `/api/audio` and the
      respell mechanism with words, with their own `phrase_pronunciation.json`; document the
      "sumuštinio" fix and the finding that stress diacritics don't affect this voice (so future
      fixes must be real respellings, not accent marks); point at the `/tune-pronunciation` skill
      as the way to produce a new fix.
- [x] 8. **New skill `.claude/skills/tune-pronunciation/SKILL.md`** — a guided loop for fixing any
      word or phrase that the TTS voice reads wrong. Format follows the existing project skills
      (`.claude/skills/sql/SKILL.md`): YAML frontmatter with `name` + `description`, then prose
      instructions. It must specify:
      - **Input**: `$ARGUMENTS` is the misread word or phrase; if empty, ask for it. Then look it
        up to decide the target file — a `Word.lithuanian` match → `backend/data/pronunciation.json`,
        a `Phrase.text`/`CustomPhrase.text` match → `backend/data/phrase_pronunciation.json`.
        If it matches neither, say so and stop (the endpoint would 404 on it anyway).
      - **Credentials**: read `AZURE_SPEECH_KEY`/`AZURE_SPEECH_REGION` out of `backend/.env` *with
        Python*, never `source`/`set -a` — that file contains characters that break shell parsing
        (`parse error near '&'`). Never echo the key.
      - **Generate candidates**: POST SSML to
        `https://{region}.tts.speech.microsoft.com/cognitiveservices/v1` with voice
        `lt-LT-LeonasNeural` (same voice `backend/routers/audio.py` uses, so the test matches
        production), 3–4 candidates per round plus the **unmodified baseline** so the user can A/B.
        Save the mp3s to the session scratchpad, not the repo.
      - **What actually works** (learned the hard way; the skill must say this so nobody re-derives
        it): stress diacritics — acute `ú`, grave `ù`, tilde, macron `ū` — have **no audible effect
        on this voice**; do not waste rounds on them. Real respellings do work: inserting a space to
        split the word after the stressed syllable (`sumuštin` → `sumu štin`), and substituting
        letters to force a different grapheme-to-phoneme path (`siųsti` → `sjūsti`).
      - **Play and choose**: play each candidate with `afplay`, labelled, then use
        `AskUserQuestion` to have the *user* pick the winner. Claude cannot hear audio and must
        never guess. If none work, generate another round with different techniques.
      - **Write the fix**: append `{"from", "to", "note"}` to the chosen file. Key on the **root**,
        not the inflected form (`sumuštin`, not `sumuštinio`), so every case form is fixed at once —
        but never a bare letter pair, which would corrupt unrelated words. Verify the root choice by
        synthesizing one other inflected form before writing.
      - **Aftermath**: no restart and no cache purge needed — `_respell_map()` re-reads on mtime
        change, and the `AudioClip` cache key is a sha1 of the *spoken* text, so a changed
        respelling simply misses the old clip and regenerates. Say this in the skill so nobody goes
        looking for a purge step.
- [x] 9. `documentation/CHANGELOG.md` — append entry `#43` summarizing the feature per existing
      entry style (see `#39` for the original word-audio entry as a model); mention the new skill.
- [x] 10. Move `plans/improvements/active/plan_43_phrase-audio.md` content to reflect the final
      (production) plan — this file itself is both the plan and, once implemented, the historical
      record; no separate write needed beyond what `ralph-implement` already does.

## Validation

- [x] Backend: `cd backend && .venv/bin/python -m pytest -q tests/test_audio.py`
- [x] Backend full suite: `cd backend && .venv/bin/python -m pytest -q`
- [x] Frontend types: `cd frontend && npx tsc --noEmit`
- [x] Frontend new spec: `cd frontend && npx playwright test phrase-audio.spec.ts --reporter=list`
- [x] Design-system parity: `cd frontend && npx playwright test design-system-parity.spec.ts --reporter=list`
- [x] Full frontend suite: `cd frontend && npx playwright test --reporter=list`
- [x] Manual smoke: restart local `uvicorn`/`next dev` (reuse existing processes, don't spawn
      duplicates), log in as the existing premium test account, play a phrase from
      `/dashboard/phrases/<id>` and from a study session — confirm real audio, confirm
      "sumuštinio" now sounds right.
- [x] Screenshots present in `temp_files/screenshots/plan_43_phrase-audio/` covering premium/free ×
      RU/EN × desktop/375px.
- [ ] Manual: run `/tune-pronunciation` once end-to-end on a real word or phrase — confirm it
      resolves the target file correctly, generates and plays candidates including the baseline,
      asks the user to pick, and writes a valid entry that both JSON files' loaders still parse
      (`cd backend && .venv/bin/python -c "import json; json.load(open('data/pronunciation.json')); json.load(open('data/phrase_pronunciation.json'))"`).
      Revert the test entry afterwards if it wasn't a real fix.
- [ ] News post written and published via `/news-writer`.

## Definition of Done

```bash
cd backend && .venv/bin/python -m pytest -q
cd frontend && npx tsc --noEmit
cd frontend && npx playwright test --reporter=list
```

## Definition-of-Done run (2026-09-23)

All three gate commands pass:

- `cd backend && .venv/bin/python -m pytest -q` → **622 passed**, 0 failed.
- `cd frontend && npx tsc --noEmit` → **clean**.
- `cd frontend && npx playwright test --reporter=list` → **717 passed, 0 failed.**

A first attempt at that last command reported 9 failures, which cost a detour worth recording: the
backend was running with `DEV=true` (from `backend/.env`), so `:8000` 307-redirects every frontend
route to `next dev` on `:3000`. The redirects under test worked correctly, but the final URL carried
the `:3000` origin and specs asserting `toHaveURL(/localhost:8000/)` failed — looking like a batch of
broken auth guards. `git stash -u` confirmed they reproduced on an untouched tree, i.e. nothing in
this plan caused them. Rebuilding the frontend and restarting uvicorn with `DEV=false` (env var, not
an `.env` edit) took the suite to 717/717. Written up in `documentation/local-dev-gotchas.md` under
"In DEV mode the Playwright suite fails ~9 tests that look like real bugs".

Feature-owned coverage, all green: `frontend/tests/phrase-audio.spec.ts` (23 tests),
`frontend/tests/design-system-parity.spec.ts`, and the new phrase cases in
`backend/tests/test_audio.py`.

Also fixed along the way: `backend/tests/test_audio.py::test_text_longer_than_60_chars_is_422` was
asserting the old 60-char cap this plan deliberately raised. Renamed to
`test_text_longer_than_200_chars_is_422` and now guards the real boundary (201 → 422).
