# Issue #65 — /dashboard/lists/155/study

**Reported:** 2026-05-08 15:44:02
**Status:** open
**Description:** Выдано сопоставить кучу слов и фраз, которые ещё не читал и не писал

## Root cause
The MatchRound (matching exercise) appears at the end of every study session and shows ALL words from that session. List 155 ("Automobilis ir vairavimas") is a large list with many words. When the session pulls in up to 10 words, some may be words the user has never previously encountered in any session ("new" status in DB). While all words technically pass through stage 1 (flashcard self-assessment), if the user clicked through them quickly (e.g. "Easy" / quality=5), the MatchRound then presents all 10 words at once — including ones the user barely registered at stage 1. This creates the impression of being asked to match words they "haven't read or written."

Additionally, the default session mix is 70% new words (7 out of 10), making it likely that a large matching exercise would include many truly unfamiliar words.

## Fix plan
1. **Investigate session size and new-word ratio for list 155**: run `SELECT * FROM user_word_progress uwp JOIN word_list_item wli ON uwp.word_id = wli.word_id WHERE wli.word_list_id = 155 AND uwp.user_id = (SELECT id FROM "user" WHERE email = 'artyrbelski@gmail.com')` to see how many words are new vs learning vs known.
2. **Cap MatchRound to words the user showed understanding of**: in `frontend/app/dashboard/components/QuizSession.tsx`, track which words the user answered correctly at stage 3 (`correctWordIdsRef`). Pass only those word IDs to MatchRound, filtering `words` to `words.filter(w => correctWordIdsRef.current.has(w.id))`. If that set is empty, skip MatchRound entirely.
3. Alternatively (simpler): if the number of session words is ≥ 8, show MatchRound only for the first 6 correctly-learned words to avoid overwhelming matching grids.
4. Update `finishSession` in QuizSession.tsx to pass the filtered word list to `setMatchRoundWords` state, then pass it to `<MatchRound words={matchRoundWords} />`.

## Tests
1. Write a Playwright test in `frontend/tests/` that reproduces and verifies the fix for this issue.
2. Rebuild the frontend and restart the local server.
3. Run the new Playwright test and confirm it passes.
4. Leave the local server running so the user can manually verify the fix in the browser.

## Confirm resolution
Ask the user: "Issue #65 — Matching exercise shows unfamiliar words. Mark as resolved?"
Only if the user confirms:
1. Run `UPDATE mistake_report SET status = 'resolved' WHERE id = 65;` and report success.
2. Move the plan file to `plans/triage/implemented/` and add the `IMPLEMENTED-` prefix.
