-- Add subcategory column to word_list for grouping lists in the UI.
-- Safe to re-run: ADD COLUMN IF NOT EXISTS is idempotent.

ALTER TABLE word_list ADD COLUMN IF NOT EXISTS subcategory VARCHAR;
ALTER TABLE word_list ADD COLUMN IF NOT EXISTS archived BOOLEAN DEFAULT FALSE;
