# Issue #59 — /dashboard/lists/208/study

**Reported:** 2026-04-20 18:40:46
**Status:** open
**Description:** Ученица-mokinė

## Root cause

Semantic twin collision in the quiz distractor pool.

List 208 ("Susipažinkime!") contains `mokininė` (id=5993, translation_ru="ученица"). The quiz backend (`GET /api/lists/208/study`) correctly returns only list-208 words as the session. However, the distractor query in `backend/routers/words.py` (lines 327–337) fetches up to 12 random words from **other** lists, filtered only by word id — not by translation. This means `mokinė` (id=4025, list 67, translation_ru="ученица") can enter the distractor pool.

On Stage 2r (reverse MC: shown Russian "ученица", pick the correct Lithuanian word), the user sees both `mokininė` (correct) and `mokinė` (distractor) on screen — both meaning "ученица". One is marked correct and the other wrong, which looks like a data error.

## Fix plan

### Step 1 — Backend: filter semantically identical distractors
In `backend/routers/words.py` in the distractor query, exclude any distractor whose `translation_ru` matches a translation already in the session words:

```python
session_translations_ru = {w.translation_ru for w in session_words}

distractor_rows = session.exec(
    select(Word)
    .join(WordListItem, WordListItem.word_id == Word.id)
    .where(
        WordListItem.word_list_id != list_id,
        Word.archived == False,
        col(Word.id).not_in(list(session_word_ids)),
        col(Word.translation_ru).not_in(list(session_translations_ru)),  # ← add this
    )
    .order_by(func.random())
    .limit(12)
).all()
```

### Step 2 — Frontend: defensive filter in pickDistractors
In `frontend/app/dashboard/components/QuizSession.tsx`, update `pickDistractors` to also exclude words whose `translation_ru` matches the target word:

```ts
function pickDistractors(word: Word, allWords: Word[], distractorPool: Word[]): Word[] {
  const combined = [...allWords, ...distractorPool].filter(
    (w) => w.id !== word.id && w.translation_ru !== word.translation_ru,
  );
  const seen = new Set<number>();
  const pool = combined.filter((w) => { if (seen.has(w.id)) return false; seen.add(w.id); return true; });
  return [...pool].sort(() => Math.random() - 0.5).slice(0, 3);
}
```

### Step 3 — Data audit (optional, low priority)
Check whether `mokinė` (id=4025) and `mokininė` (id=5993) should both exist or whether one should be archived:
```sql
SELECT id, lithuanian, translation_ru, translation_en FROM word WHERE id IN (4025, 5993);
```
If both are legitimate words with distinct meanings, keep both. The backend fix (Step 1) is sufficient to prevent the collision.

## Tests
1. Write a Playwright test in `frontend/tests/` that loads list 208 study session and confirms no distractor option shares a translation with the correct answer.
2. Rebuild the frontend and restart the local server.
3. Run the new Playwright test and confirm it passes.
4. Leave the local server running so the user can manually verify the fix in the browser.

## Confirm resolution
Ask the user: "Issue #59 — mokinė appeared as a distractor alongside mokininė (both translate to 'ученица'), causing a confusing quiz screen. Mark as resolved?"
Only if the user confirms:
1. Run `UPDATE mistake_report SET status = 'resolved' WHERE id = 59;` and report success.
2. Move the plan file to `plans/triage/implemented/` and add the `IMPLEMENTED-` prefix.
