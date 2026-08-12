# Issue #152 — /dashboard/lists/172/study

**Reported:** 2026-08-11 06:57:49.984029
**Status:** open
**Description:** bendradarbis и kolega переводятся одним и тем же словом "коллега" - никогда не знаешь, какое из них имеет в виду программа :) может, bendradarbis переводить "коллега по работе", чтобы была разница? Labai ačiū.

## Root cause

**Endpoint:** `GET /api/lists/{list_id}/study` → `get_study_words()` in `backend/routers/words.py:299-439`.
**Page:** `frontend/app/dashboard/lists/[id]/study/page.tsx` → `frontend/app/dashboard/components/QuizSession.tsx`.

**This exact pair is already known to the codebase.** `words.py:402-406`:

> `# NB: words that share the same translation_ru (synonyms in one list, e.g.`
> `# "kolega"/"bendradarbis" → "коллега") are NOT disambiguated by appending the`
> `# Lithuanian word here — that revealed the answer in the produce-Lithuanian`
> `# stages (reverse MC / type-it). The frontend instead accepts any synonym form`
> `# as correct, so no answer is leaked into the prompt.`

That is the residue of #118 (same list 172, same pair, different user) and #120. Those fixes removed the disambiguating parenthetical to stop leaking the answer and compensated by making the quiz *tolerant* instead of *clear*. #152 is the predictable follow-on: the tolerance is invisible to the learner.

**Severity: mostly a UX/clarity bug, with one real scoring caveat.** Stages 2/2r/2a and MatchRound all exclude or dedup the twin (`pickDistractors` `QuizSession.tsx:118-125`, `buildOptions` `:127-142`, `dedupedWords` `MatchRound.tsx:38-51`), so no wrong marks there. But the type-it synonym acceptance at `:681-686` only scans the `words` prop (the ≤10-word session queue), not the whole list. List 172 has **44 live words**, `bendradarbis` at position 36 and `kolega` at position 3, so the two are frequently *not* sampled together — in those sessions the «коллега» prompt accepts only one form and rejects the other correct answer. Intermittent, which matches "you never know which one the program means".

### Established convention (precedent)

| Precedent | Mechanism | Status |
| --- | --- | --- |
| #76 kuras/degalai | `hint` column, translations identical | **Superseded** |
| #92 degalai/kuras | Reverted #76 — distinct `translation_ru` (`горючее`/`топливо`), `hint = NULL`. States hint is reserved for grammatical notes | **Current** |
| #110 užimtas/užsiėmęs | **Parenthetical qualifier inside `translation_ru`** — `занятый (место занято)` / `занятый (делом)` | **Current** |
| #59 mokinė/mokininė | Distractor-pool filter (code), no data change | Complementary, shipped |
| existing data: `bendradarbė` id 4023 | `коллега (ж.)` | Same convention, this very lemma |

**Follow: qualifier in `translation_ru`/`translation_en`, leave `hint` alone** (it is the POS tag `daiktavardis` here). Do **not** revive #118's `hint = 'международное слово'` idea — never applied to the DB, and #92 explicitly rejected `hint` as the vehicle. A Russian-language parenthetical does not re-open the #118/#120 leak because it never names the Lithuanian word — exactly why `занятый (делом)` shipped.

### Live state (note `archived`, which the report doesn't reflect)

| id | lithuanian | `word.archived` | live (non-archived) lists |
| --- | --- | --- | --- |
| 3148 | bendradarbis | false | **172** |
| 4976 | bendradarbis | **true** | (172, archived → invisible) |
| 4977 | bendradarbis | false | none (only archived list 146) |
| 4023 | bendradarbė | false | none (only archived list 67) |
| 4999 | kolega | **true** | (172, archived → invisible) |
| 5001 | kolega | false | none (only archived list 146) |
| 5472 | kolega | false | **172**, **204** |

`_list_words()` (`words.py:90-98`) filters `Word.archived == False`, so list 172's study session contains exactly two «коллега» words: **3148 and 5472**. But 4977/5001/4023 are not dormant for *distractors*: the distractor query (`:412-425`) filters `WordList.is_public == True` and `Word.archived == False` but **not** `WordList.archived`, and those archived lists are still public.

### Secondary finding — duplicate word rows (not reported)

Root cause: `scripts/seed.py:52-67` creates one `Word` row per (list, word) pair with no lookup — every lemma in N lists produced N rows. Lists 67/106/107 and 146/172 are re-seeds of the same content under new ids, giving the 3-rows-per-lemma pattern. Later seeders learned this (`backend/seed_ne_dienos.py:383-407` keeps a `word_cache` and re-queries before inserting).

**Scale:** 3 779 word rows / 2 785 distinct lemmas; 541 duplicate groups (568 surplus rows); 293 cases of a lemma twice in one list; 1 373 non-archived words reachable only through archived-but-public lists. **71 lemmas already have diverged `translation_ru` across duplicate rows** — e.g. #92's fix hit `degalai` id 4140 but id 7214 (list 288) still reads `топливо`, identical to `kuras` id 4145.

Unique constraint on `lithuanian` is **not feasible** (no unique indexes on `word` beyond the PK): it would fail until 994 duplicates are merged, break legitimate homographs, and break personal lists where two users must save the same word with their own translations. A partial index scoped to public content needs an ownership column `word` doesn't have.

## Fix plan

### A. Translation collision — DB-data-only, no migration

Both words get a qualifier, not just `bendradarbis`. Qualifying only one leaves a bare «коллега» prompt with no principled reading — the mirror complaint would follow. This is what #110 did for `занятый`.

| Word | `translation_ru` | `translation_en` | `hint` |
| --- | --- | --- | --- |
| `bendradarbis` | `коллега (по работе)` | `co-worker` | `daiktavardis` (unchanged) |
| `kolega` | `коллега (по профессии)` | `colleague` | `daiktavardis` (unchanged) |
| `bendradarbė` (4023) | `коллега (ж., по работе)` | `co-worker (f.)` | `daiktavardis` (unchanged) |

Parentheses over the reporter's literal `коллега по работе`, for consistency with `коллега (ж.)` on the same lemma and with `занятый (делом)`; their wording is preserved inside. If the user prefers their exact phrasing, `коллега по работе` / `коллега (по профессии)` is acceptable — just don't leave `kolega` bare.

1. Apply, **by lemma, not by id**:
   ```sql
   BEGIN;
   UPDATE word SET translation_ru = 'коллега (по работе)',    translation_en = 'co-worker'
   WHERE lower(lithuanian) = 'bendradarbis';          -- ids 3148, 4976, 4977
   UPDATE word SET translation_ru = 'коллега (по профессии)', translation_en = 'colleague'
   WHERE lower(lithuanian) = 'kolega';                -- ids 4999, 5001, 5472
   UPDATE word SET translation_ru = 'коллега (ж., по работе)', translation_en = 'co-worker (f.)'
   WHERE id = 4023;                                   -- bendradarbė
   COMMIT;
   ```
   **By-lemma is mandatory, not stylistic:** `buildOptions2r` (`QuizSession.tsx:144-150`) builds reverse-MC buttons from `word.lithuanian` and, unlike `buildOptions`, does **not** dedup by displayed text. Two rows of the same lemma never collide today only because their identical `translation_ru` gets them excluded by `pickDistractors`. Change 5472 and leave 5001 at `коллега` and a session can render two buttons both reading **"kolega"**, one scored correct and one wrong.

2. Archive the two dormant same-lemma rows so they can't leak into a distractor pool. Both have zero `user_word_progress` rows and zero live-list memberships (verified) — guard first, both counts must be 0:
   ```sql
   SELECT (SELECT count(*) FROM user_word_progress WHERE word_id IN (4977, 5001)) AS progress_rows,
          (SELECT count(*) FROM word_list_item wli JOIN word_list wl ON wl.id = wli.word_list_id
           WHERE wli.word_id IN (4977, 5001) AND wl.archived = false)             AS live_memberships;
   UPDATE word SET archived = true WHERE id IN (4977, 5001);
   ```

3. Verify:
   ```sql
   SELECT w.id, w.lithuanian, w.translation_ru
   FROM word_list_item wli JOIN word w ON w.id = wli.word_id
   WHERE wli.word_list_id = 172 AND w.archived = false AND w.translation_ru ILIKE 'коллега%';
   -- Expect exactly: 3148 | bendradarbis | коллега (по работе)
   --                 5472 | kolega       | коллега (по профессии)
   ```

   No rebuild/deploy needed for the data change alone — every consumer fetches at runtime, and nothing parses or splits `translation_ru`; it is only displayed and compared for equality.

4. **Ship one defensive code change:** harden `buildOptions2r` (`QuizSession.tsx:144-150`) so identical Lithuanian buttons can never appear, mirroring `buildOptions` (`:127-142`):
   ```ts
   function buildOptions2r(word: Word, allWords: Word[], distractorPool: Word[]) {
     const distractors = pickDistractors(word, allWords, distractorPool);
     const seen = new Set([normalizeLt(word.lithuanian)]);
     const opts = [{ text: word.lithuanian, correct: true }];
     for (const d of distractors) {
       const key = normalizeLt(d.lithuanian);
       if (seen.has(key)) continue;
       seen.add(key);
       opts.push({ text: d.lithuanian, correct: false });
     }
     return opts.sort(() => Math.random() - 0.5);
   }
   ```
   This protects the data fix from the 568 duplicate rows and independently fixes the 71 already-diverged lemmas. Requires a frontend rebuild.

5. **Do not** re-add any backend mutation of `translation_ru` — `backend/tests/test_study_session.py:68-97` asserts `"(" not in translation_ru` on the *returned session payload*, guarding the #118/#120 fix. It seeds its own fixture rows (901/902), so the production data change doesn't affect it.

### B. Duplicate word rows — recommend a SEPARATE follow-up issue

Not bundled here: it touches ~568 rows across 541 groups and mutates live user progress, while #152 needs 4 rows and zero progress mutation. The reported symptom is fully fixed by A alone, and step A2 already neutralises these two lemmas' duplicates. A botched merge silently corrupts spaced-repetition state — it deserves its own plan, dry-run and backup.

FKs referencing `word.id` (verified) — exactly two, no `ON DELETE CASCADE`: `word_list_item.word_id`, `user_word_progress.word_id`.

**The trap:** `user_word_progress` has only a *non-unique* index on `(user_id, word_id)` (`models.py:111`). A naive repoint succeeds silently and leaves a user with two progress rows for one word; `get_study_words` collapses them via `progress_map = {p.word_id: p for p in progress_records}` (`words.py:347`) — last row wins, non-deterministically — so a word could flip between `known` and `learning` between sessions. Progress must be **merged**, never blindly repointed.

Merge order per group (survivor `:keep`, duplicate `:dup`): choose survivor (most progress rows → most live-list memberships → richest data → lowest id) → merge `user_word_progress` (keep the more advanced row: `known > learning > new`, then higher `sm2_reps`, then later `last_seen`; fold in `review_count`/`mistake_count`) → then repoint the remainder → merge `word_list_item` (drop collisions, repoint rest, preserve survivor's `position`) → **`UPDATE word SET archived = true`, not `DELETE`** (`models.py:81` documents `archived` as "soft-delete: hide but preserve FK integrity"; precedent #100 deleted only the `word_list_item`).

```sql
BEGIN;
DELETE FROM user_word_progress d USING user_word_progress k
WHERE d.word_id = :dup AND k.word_id = :keep AND k.user_id = d.user_id;   -- needs the ranking predicate
UPDATE user_word_progress SET word_id = :keep WHERE word_id = :dup;
DELETE FROM word_list_item d USING word_list_item k
WHERE d.word_id = :dup AND k.word_id = :keep AND k.word_list_id = d.word_list_id;
UPDATE word_list_item SET word_id = :keep WHERE word_id = :dup;
UPDATE word SET archived = true WHERE id = :dup;
COMMIT;
-- post-check must return zero rows:
SELECT user_id, word_id, count(*) FROM user_word_progress GROUP BY 1,2 HAVING count(*) > 1;
```

Suggested follow-up scope: (1) the merge script with explicit survivor ranking and `--dry-run`; (2) add `WordList.archived == False` to the distractor query (`words.py:416-422`) so the 1 373 archived-list-only words stop leaking into quizzes; (3) an audit query in CI/cron that fails when a new duplicate group appears.

## Tests
1. Write a Playwright test in `frontend/tests/` that reproduces and verifies the fix for this issue.
   - `frontend/tests/issue-152-bendradarbis-kolega-distinct.spec.ts`, route-mock pattern from `issue-121-rezervuoti-translation.spec.ts:29-44`: mock `**/api/lists/*/study**` with `bendradarbis → коллега (по работе)`, `kolega → коллега (по профессии)`, plus a duplicate-lemma distractor `{ lithuanian: 'kolega', translation_ru: 'коллега' }`. Assert (a) flashcards show two different meaning lines, (b) a Stage-2r screen never renders two buttons with the same text.
   - Update `frontend/tests/issue-118-120-synonym-answer-not-leaked.spec.ts` — it hard-codes `коллега` for both words at `:37-38` and `:83-84`. Keep the "no answer leaked in the prompt" invariant but drop the stale shared-translation fixture (the spec passes either way; leaving it is misleading).
   - `backend/tests/test_study_session.py:68-97` needs no change.
2. Rebuild the frontend and restart the local server.
3. Run the new Playwright test and confirm it passes.
4. Leave the local server running so the user can manually verify the fix in the browser.

## Confirm resolution
Ask the user: "Issue #152 — bendradarbis и kolega переводятся одним и тем же словом "коллега". Mark as resolved?"
Only if the user confirms:
1. Run `UPDATE mistake_report SET status = 'resolved' WHERE id = 152;` and report success.
2. Move the plan file to `plans/triage/implemented/` and add the `IMPLEMENTED-` prefix (`issue-152-bendradarbis-kolega-disambiguation.md` → `plans/triage/implemented/IMPLEMENTED-issue-152-bendradarbis-kolega-disambiguation.md`).

---

## Outcome (implemented 2026-08-12)

**Resolved.** `mistake_report.status = 'resolved'`.

Applied as planned, part A only:

- Qualifiers set **by lemma** (not by id) on all rows: `bendradarbis` → `коллега (по работе)` /
  `co-worker`, `kolega` → `коллега (по профессии)` / `colleague`, `bendradarbė` →
  `коллега (ж., по работе)` / `co-worker (f.)`. `hint` left as `daiktavardis` throughout,
  per the #92 convention.
- Dormant duplicate rows 4977 and 5001 archived after the guard query confirmed 0
  `user_word_progress` rows and 0 live-list memberships.
- `buildOptions2r` in `frontend/app/dashboard/components/QuizSession.tsx` now dedups by
  Lithuanian text, mirroring `buildOptions`. This is what stops the data fix being undone by
  the 71 lemmas whose translations have already diverged across duplicate rows.

**Verified:** list 172's live study payload now contains exactly two «коллега» words with
distinct translations (3148 `bendradarbis`, 5472 `kolega`).

**Part B (duplicate word rows) was deliberately NOT done** — still open as a follow-up.
541 duplicate groups / 568 surplus rows table-wide, and merging them mutates live
spaced-repetition state, so it needs its own plan, dry-run and backup. Scope carried forward:
(1) merge script with explicit survivor ranking and `--dry-run`; (2) add
`WordList.archived == False` to the distractor query (`backend/routers/words.py:416-422`) so
the 1 373 words reachable only through archived-but-public lists stop leaking into quizzes;
(3) an audit query that fails when a new duplicate group appears.

**Tests:** `frontend/tests/issue-152-bendradarbis-kolega-distinct.spec.ts` — asserts the two
meanings render distinctly, that no screen renders two identical Lithuanian options, and that
the #118/#120 invariant (no Lithuanian answer leaked into the prompt) still holds.
