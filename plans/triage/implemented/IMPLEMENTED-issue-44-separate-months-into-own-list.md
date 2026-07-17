# Issue #44 — /dashboard/lists/202

**Reported:** 2026-04-13 12:39:53
**Status:** open
**Description:** Надо выделить месеца в отдельный стек (Months mixed into word list 202 "Kada dirba šeimos gydytojas?" should be separated into their own list)

## Root cause

Word list 202 ("Kada dirba šeimos gydytojas?") contains month vocabulary mixed with other content. The months should live in a dedicated list for better thematic grouping.

## Fix plan

1. Audit list 202 and identify month words:
   ```sql
   SELECT w.id, w.lithuanian, w.translation_ru, wli.sort_order
   FROM word w
   JOIN word_list_item wli ON wli.word_id = w.id
   WHERE wli.word_list_id = 202
   ORDER BY wli.sort_order;
   ```
   Months to look for: sausis, vasaris, kovas, balandis, gegužė, birželis, liepa, rugpjūtis, rugsėjis, spalis, lapkritis, gruodis

2. Check if a months list already exists:
   ```sql
   SELECT id, title, title_en, subcategory, is_public, archived
   FROM word_list
   WHERE LOWER(title) LIKE '%mėnuo%'
      OR LOWER(title) LIKE '%mėnesiai%'
      OR LOWER(title_en) LIKE '%month%'
   ORDER BY id;
   ```

3a. **If an existing months list is found (id = X):** Add the month words from list 202 (if not already present), then remove them from list 202:
   ```sql
   INSERT INTO word_list_item (word_list_id, word_id, sort_order)
   SELECT X, w.id, (SELECT COALESCE(MAX(sort_order), 0) FROM word_list_item WHERE word_list_id = X) + ROW_NUMBER() OVER (ORDER BY w.lithuanian)
   FROM word w
   JOIN word_list_item wli ON wli.word_id = w.id
   WHERE wli.word_list_id = 202
     AND LOWER(w.lithuanian) = ANY(ARRAY['sausis','vasaris','kovas','balandis','gegužė','birželis','liepa','rugpjūtis','rugsėjis','spalis','lapkritis','gruodis'])
     AND w.id NOT IN (SELECT word_id FROM word_list_item WHERE word_list_id = X);

   DELETE FROM word_list_item
   WHERE word_list_id = 202
     AND word_id IN (
       SELECT w.id FROM word w
       WHERE LOWER(w.lithuanian) = ANY(ARRAY['sausis','vasaris','kovas','balandis','gegužė','birželis','liepa','rugpjūtis','rugsėjis','spalis','lapkritis','gruodis'])
     );
   ```

3b. **If no months list exists:** Create a new one and move the months:
   ```sql
   -- 1. Create new list (note the returned id)
   INSERT INTO word_list (title, title_en, subcategory, is_public, archived, cefr_level, difficulty, sort_order, created_at)
   VALUES ('Mėnesiai', 'Months', 'time', true, false, 'A1', 1,
           (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM word_list), NOW())
   RETURNING id;

   -- 2. Move month words from list 202 (replace NEW_LIST_ID)
   INSERT INTO word_list_item (word_list_id, word_id, sort_order)
   SELECT NEW_LIST_ID, w.id,
     CASE LOWER(w.lithuanian)
       WHEN 'sausis' THEN 1 WHEN 'vasaris' THEN 2 WHEN 'kovas' THEN 3
       WHEN 'balandis' THEN 4 WHEN 'gegužė' THEN 5 WHEN 'birželis' THEN 6
       WHEN 'liepa' THEN 7 WHEN 'rugpjūtis' THEN 8 WHEN 'rugsėjis' THEN 9
       WHEN 'spalis' THEN 10 WHEN 'lapkritis' THEN 11 WHEN 'gruodis' THEN 12
       ELSE 99
     END
   FROM word w
   JOIN word_list_item wli ON wli.word_id = w.id
   WHERE wli.word_list_id = 202
     AND LOWER(w.lithuanian) = ANY(ARRAY['sausis','vasaris','kovas','balandis','gegužė','birželis','liepa','rugpjūtis','rugsėjis','spalis','lapkritis','gruodis']);

   -- 3. Remove months from list 202
   DELETE FROM word_list_item
   WHERE word_list_id = 202
     AND word_id IN (
       SELECT w.id FROM word w
       WHERE LOWER(w.lithuanian) = ANY(ARRAY['sausis','vasaris','kovas','balandis','gegužė','birželis','liepa','rugpjūtis','rugsėjis','spalis','lapkritis','gruodis'])
     );
   ```

4. Verify: confirm list 202 has no months and the months list has all moved words.

Wrap all INSERT/DELETE in a single transaction (`BEGIN` / `COMMIT`).

## Tests

1. Write a Playwright test in `frontend/tests/` that reproduces and verifies the fix for this issue.
2. Rebuild the frontend and restart the local server.
3. Run the new Playwright test and confirm it passes.
4. Leave the local server running so the user can manually verify the fix in the browser.

## Confirm resolution

Ask the user: "Issue #44 — months mixed into list 202 ('Kada dirba šeimos gydytojas?'). Mark as resolved?"
Only if the user confirms:
1. Run `UPDATE mistake_report SET status = 'resolved' WHERE id = 44;` and report success.
2. Move the plan file to `plans/triage/implemented/` and add the `IMPLEMENTED-` prefix.
