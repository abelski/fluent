---
name: sql
description: Run SQL against the Fluent Neon database. Pass a query as $ARGUMENTS or be prompted for one.
---

Run SQL against the Fluent production database.

## How to get the connection string

Read `backend/.env` from the project root and extract `DATABASE_URL`.

## Run the query

If `$ARGUMENTS` is non-empty, treat it as the SQL to run.

Otherwise use `AskUserQuestion` to ask:
- Question: "Enter the SQL to run:"
- Type: free text input

Execute with:

```bash
psql "<DATABASE_URL>" -c "<SQL>"
```

For multi-statement SQL (semicolon-separated), use `psql "<DATABASE_URL>" <<'EOF'\n<SQL>\nEOF` via bash heredoc so all statements run in one session.

## Output

- Print the full psql output (rows returned, UPDATE/INSERT counts, errors).
- If the query returns rows, display them as a markdown table.
- If it fails, show the error and suggest a fix.

## Database schema (as of 2026-03-27)

All tables are in the Neon PostgreSQL instance. Defined in `backend/models.py`.

| Table | PK | Key columns |
|---|---|---|
| `user` | `id` (uuid str) | `email`, `name`, `is_premium`, `is_admin`, `is_superadmin`, `lang`, `words_per_session`, `new_words_ratio` |
| `word_list` | `id` (int) | `title`, `title_en`, `subcategory`, `is_public`, `archived`, `cefr_level`, `difficulty`, `sort_order` |
| `word` | `id` (int) | `lithuanian`, `translation_en`, `translation_ru`, `hint`, `archived`, `star` (1–3 complexity) |
| `word_list_item` | `id` (int) | `word_list_id` → `word_list.id`, `word_id` → `word.id`, `position` |
| `user_word_progress` | `id` (int) | `user_id`, `word_id`, `status` (new/learning/known), `review_count`, `mistake_count`, `last_seen` |
| `daily_study_session` | `id` (int) | `user_id`, `study_date`, `session_count` |
| `mistake_report` | `id` (int) | `user_id`, `context` (e.g. 'word:42'), `description`, `status` (open/onhold/resolved), `created_at` |
| `subcategory_meta` | `id` (int) | `key` (unique, matches `word_list.subcategory`), `cefr_level`, `difficulty`, `name_ru`, `name_en`, `status` (draft/testing/published), `sort_order` |
| `grammar_sentence` | `id` (int) | `case_index` (1–14), `display`, `answer_ending`, `full_word`, `russian`, `archived`, `use_in_basic`, `use_in_advanced`, `use_in_practice` |
| `grammar_case_rule` | `id` (int) | `case_index` (1–14, unique), `name_ru`, `question`, `usage`, `endings_sg`, `endings_pl`, `transform`, `status` |
| `grammar_lesson_result` | `id` (int) | `user_id`, `lesson_id`, `score`, `total`, `passed` (score/total > 0.75) |
| `article` | `id` (int) | `slug` (unique), `title_ru`, `title_en`, `body_ru`, `body_en` (Markdown), `tags`, `published`, `show_in_footer` |
| `practice_category` | `id` (int) | `name_ru`, `name_en`, `sort_order` |
| `practice_test` | `id` (int) | `category_id`, `title_ru`, `title_en`, `question_count`, `pass_threshold`, `status`, `is_premium` |
| `practice_question` | `id` (int) | `test_id`, `question_ru`, `option_a`–`d`, `correct_option` (a/b/c/d), `is_active` |
| `practice_exam_result` | `id` (int) | `user_id`, `test_id`, `score`, `total` |
| `constitution_question` | `id` (int) | `question_ru`, `option_a`–`d`, `correct_option`, `category`, `is_active` |
| `constitution_exam_result` | `id` (int) | `user_id`, `score`, `total` |
| `user_program` | `id` (int) | `user_id`, `subcategory_key` → `subcategory_meta.key`, `enrolled_at` |

**Update this schema** when tables or columns are added/changed (i.e. when `backend/models.py` is modified).

## Notes

- DATABASE_URL is in `backend/.env` — never hard-code it, always read the file fresh.
- Do not push any changes to git.
- For destructive queries (DROP, DELETE without WHERE, TRUNCATE) ask the user to confirm before running.
