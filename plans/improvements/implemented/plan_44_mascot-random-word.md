---
kind: feature
status: done
iteration: 1
max_iterations: 30
---

# Plan #44 — Lists-page mascot says a random word

> Written retroactively: the design was agreed in chat (brainstorming, "bounded" path) and
> implemented before this file existed. Recorded here so the changelog, screenshots folder and
> future sessions have a plan to point to. Going forward, branch + plan come first (CLAUDE.md).

## Context

TAK on `/dashboard/lists` (`frontend/app/dashboard/components/StatsBar.tsx`) always said the
hardcoded «Sveikas!». `Word` rows carry `lithuanian`, `translation_en`, `translation_ru` and a
`star` complexity (1 = easy base form).

## Goals

- Each load of `/dashboard/lists`, TAK's bubble shows `<lithuanian> = <translation>` in the UI
  language (RU → `translation_ru`, EN → `translation_en`).
- Words come from the whole catalogue, `star == 1`, not archived (user's choice over "own known
  words" and "any word").

## Non-Goals

- Other pages' mascots keep «Sveikas!».
- Fixing star-1 rows whose `translation_en` holds Russian text (existing data bug).

## Requirements

- New public `GET /api/words/random-easy` → `{lithuanian, translation_en, translation_ru}` or
  `null`. Not cached (random by design).
- Separate endpoint, not a field on `/me/stats`: StatsBar refetches stats on every
  `visibilitychange`, so the word would flip each tab focus, and `/me/stats` is query-tuned (#15).
- Frontend fetches once on mount; «Sveikas!» while loading and on error.
- Long entries (up to 61 chars in prod) must wrap, not stretch the card: mascot capped at
  `max-w-[200px]`.

## Implementation

- [x] `backend/routers/words.py` — `get_random_easy_word` (`ORDER BY random() LIMIT 1`).
- [x] `frontend/app/dashboard/components/StatsBar.tsx` — `greeting` state, fetch on mount,
      `phraseTestId="mascot-greeting"`, `max-w-[200px]`.
- [x] `documentation/CHANGELOG.md` — entry #44.

## Validation

- [x] `cd backend && python -m pytest tests/test_random_easy_word.py`
- [x] `cd frontend && npx playwright test tests/mascot-random-word.spec.ts`
- [x] `cd frontend && npx playwright test tests/design-system-parity.spec.ts`
- [x] Full suites: backend 623 passed, Playwright 728 passed.

## Definition of Done

- [x] Both languages: RU shows `Labas = привет`, EN shows `Labas = hello` (spec asserts both).
- [x] Mobile at 375px: long word wraps inside the bubble, card layout intact.
- [x] Screenshots proving each: `temp_files/screenshots/plan_44_mascot-random-word/`
      — RU/EN × desktop/mobile × short/long word (8 shots), reviewed.
- [x] Error state: endpoint failure falls back to «Sveikas!» (spec).
