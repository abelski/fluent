# Feature / Change Log

Sequential log of features and notable changes, so change order is legible across sessions.
Append one entry per feature/change (highest number = most recent). Reuse the number when
naming the corresponding plan file, e.g. `plans/improvements/active/plan_<N>_<slug>.md`.

| # | Date | Description |
| --- | --- | --- |
| 1 | 2026-08-14 | Mobile usability fixes: nested `<button>`-in-`<button>` accordion headers converted to `role="button"` divs (lists/phrases/grammar), icon-only touch targets bumped to 44×44px, `ProgressStatCard` hero stacks on mobile, grammar subcategory stat text no longer wraps, articles category pills scroll instead of wrapping into a stadium shape, star-level tooltip now flashes on tap. |
| 2 | 2026-08-18 | Fix #156: grammar instrumental of *duktė* graded against a wrong ending (`eria`) but displayed a different wrong "correct answer" (`dukteri`); both were also linguistically wrong (`dukterimi`). Fixed `words.txt` (`ses`/`dukt` case_index 5), production row 204, and one Cyrillic/Czech-glyph-corrupted row (id 73, `agurků`→`agurkų`) found via a full `grammar_sentence` invariant audit. Added a `stem(display)+answer_ending == full_word` invariant guard: filters bad rows out of served sentence tasks (`_sentence_invariant_holds` in `grammar_service.py`) and rejects violating writes with a 400 in the admin create/update endpoints. See `documentation/grammar-sentence-data-integrity.md`. |
