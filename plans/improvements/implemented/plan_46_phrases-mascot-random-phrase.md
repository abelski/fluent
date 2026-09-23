---
kind: feature
status: done
iteration: 1
max_iterations: 30
---

# Plan #46 — Phrases-page mascot says a random phrase

## Context

#44/#45 made TAK on `/dashboard/lists` say `<lithuanian> = <translation>` for a random word from
a predefined list. `/dashboard/phrases` (`frontend/app/dashboard/phrases/page.tsx`) still shows the
fixed «Sveikas!». Same idea for phrases.

Predefined phrases = `Phrase` rows whose `PhraseProgram.is_public`. Phrase programs are admin-only
(no owner column); users' own phrases live in `CustomPhrase`, which is never touched here. Prod:
558 candidates, all with `translation_en`, none with Cyrillic in it, longest `text` 62 chars.

## Goals

- Each load of `/dashboard/phrases`, TAK's bubble shows `<text> = <translation>` in the UI
  language (RU → `translation`, EN → `translation_en`, falling back to `translation`).

## Non-Goals

- Filtering by difficulty (both prod programs are difficulty 1).
- Other phrase pages keep their fixed mascot text.

## Requirements

- New public `GET /api/phrases/random` → `{text, translation, translation_en}` or `null`. Not
  cached (random by design). Only phrases in a public program.
- Frontend fetches once on mount; «Sveikas!» while loading and on error.
- Mascot capped at `max-w-[200px]` like #44, so long phrases wrap.

## Implementation

- [x] `backend/routers/phrases.py` — `get_random_phrase`.
- [x] `frontend/app/dashboard/phrases/page.tsx` — `greeting` state, fetch on mount,
      `phraseTestId="mascot-greeting"`, `max-w-[200px]`.
- [x] `documentation/CHANGELOG.md` — entry #46.

## Validation

- [x] `cd backend && .venv/bin/python -m pytest tests/test_random_phrase.py`
- [x] `cd frontend && npx playwright test tests/mascot-random-phrase.spec.ts`
- [x] `cd frontend && npx playwright test tests/design-system-parity.spec.ts`

## Definition of Done

- [x] Both languages: RU shows `Labas rytas! = Доброе утро!`, EN shows `Labas rytas! = Good morning!`.
- [x] Mobile at 375px: long phrase wraps inside the bubble, card layout intact.
- [x] Screenshots proving each: `temp_files/screenshots/plan_46_phrases-mascot-random-phrase/`
      — RU/EN × desktop/mobile × short/long phrase.
- [x] Error state: endpoint failure falls back to «Sveikas!» (spec).
